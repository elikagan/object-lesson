'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Item, Category, Condition } from '@/lib/types';
import { thumbUrl } from '@/lib/items';
import {
  fileToDataUrl,
  dataUrlToFile,
  geminiOCR,
  geminiDetectTag,
  geminiDetectTapeMeasure,
  geminiRemoveBackground,
  geminiReprocessPhoto,
  geminiSuggest,
  toTitleCase,
  type ReprocessMode,
} from '@/lib/admin/gemini';
import { useConfirmDialog } from './ConfirmDialog';

/**
 * Editor — matches v1 admin/index.html lines 87-185 verbatim.
 *
 * Behavior parity with v1:
 *   - topbar with back button + title + delete button (only on edit)
 *   - "Photos" section with photo grid + "Add Photos" button
 *   - "Process with AI" button (placeholder for now — Phase 4.6)
 *   - All fields: title, description, price, size, category, maker, condition,
 *     dealer code, posted by
 *   - Three .toggle-row toggles: Mark as New, Put on Hold, Mark as Sold
 *   - Save button at bottom
 *
 * The save flow uses v2's PATCH (single-row update) — the bug-class fix.
 */

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'wall-art', label: 'Wall Art' },
  { value: 'object', label: 'Object' },
  { value: 'ceramic', label: 'Ceramic' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'light', label: 'Light' },
  { value: 'sculpture', label: 'Sculpture' },
  { value: 'misc', label: 'Misc' },
];

const CONDITIONS: Condition[] = ['New', 'Like New', 'Good', 'Fair'];

/**
 * Translate raw API errors (Postgres CHECK constraint violations, Supabase
 * Storage errors, etc.) into a sentence an admin can act on. Falls back to
 * the original message if we don't recognize it.
 */
function humanizeSaveError(raw: string): string {
  // Postgres CHECK constraint violations look like:
  //   "new row for relation \"items\" violates check constraint \"items_condition_check\""
  // The constraint name tells us which field is bad.
  const checkMatch = raw.match(/violates check constraint "items_(\w+)_check"/);
  if (checkMatch) {
    const field = checkMatch[1];
    if (field === 'condition') {
      return 'Condition must be New, Like New, Good, or Fair (or left blank). Please pick a valid option and save again.';
    }
    if (field === 'category') {
      return 'Category is required and must be one of the listed options. Please pick a category and save again.';
    }
    return `The field "${field}" has an invalid value. Please correct it and save again.`;
  }
  if (raw.includes('duplicate key')) {
    return 'An item with this ID already exists. Refresh the page to pick a fresh ID.';
  }
  if (raw === 'Photo upload failed' || raw.includes('upload')) {
    return `Photo upload failed: ${raw}. Try removing and re-adding the photo, or save without it.`;
  }
  return raw;
}

type Mode = 'create' | 'edit';

/**
 * Photo state in the editor:
 *   - remotePath: already in Supabase Storage (an existing item being edited).
 *   - pendingFile: chosen via the file picker but not yet uploaded.
 *
 * Pending photos can be AI-processed (background removal, etc.) before save.
 * `processed` means the AI has already run on this photo (don't re-run).
 * `aiProcess` means "include in AI processing" — set false to skip a photo
 * (e.g. tape measure photos should not have their backgrounds removed).
 */
type Photo =
  | { remotePath: string }
  | { pendingFile: File; preview: string; processed?: boolean; aiProcess?: boolean };

export function ItemEditor({
  mode,
  item,
  nextNumericId,
  defaultPostedBy,
}: {
  mode: Mode;
  item?: Item;
  nextNumericId?: number;
  defaultPostedBy?: string;
}) {
  const router = useRouter();
  const initialId = item?.id ?? (nextNumericId ? String(nextNumericId).padStart(6, '0') : '');

  // Existing photos (already in storage) sorted hero-first; pending files come after
  const initialPhotos: Photo[] = item?.images
    ? [...item.images]
        .sort((a, b) => (a === item.hero_image ? -1 : b === item.hero_image ? 1 : 0))
        .map((p) => ({ remotePath: p } as Photo))
    : [];

  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : '');
  const [size, setSize] = useState(item?.size ?? '');
  const [category, setCategory] = useState<string>(item?.category ?? '');
  const [maker, setMaker] = useState(item?.maker ?? '');
  const [condition, setCondition] = useState<string>(item?.condition ?? '');
  const [dealerCode, setDealerCode] = useState(item?.dealer_code ?? '');
  const [postedBy, setPostedBy] = useState(item?.posted_by ?? defaultPostedBy ?? '');
  const [isNew, setIsNew] = useState(item?.is_new ?? true);
  const [isHold, setIsHold] = useState(item?.is_hold ?? false);
  const [isSold, setIsSold] = useState(item?.is_sold ?? false);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  // Sticky error banner. The transient `status` text was too easy to miss when
  // a save failed — admins reasonably concluded "Save did nothing" because
  // the busy overlay disappeared on error and the error string lived in a
  // small <p> at the bottom of the form. Errors now also surface in a fixed
  // banner above the photo grid that stays until the admin dismisses it.
  const [saveError, setSaveError] = useState('');
  // Tracks whether the row was already POSTed in a prior save attempt. If
  // the first save succeeded at create but failed at upload, the second
  // click must SKIP the create POST (otherwise it 500s on duplicate id) and
  // jump straight to upload + PATCH. Once true for this editor session,
  // stays true.
  const [rowCreated, setRowCreated] = useState(mode === 'edit');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const { confirm: confirmAsync, dialog: confirmDialog } = useConfirmDialog();

  function onAddPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setPhotos((p) => [
      ...p,
      ...files.map(
        (file) =>
          ({
            pendingFile: file,
            preview: URL.createObjectURL(file),
            processed: false,
            aiProcess: true,
          }) as Photo,
      ),
    ]);
    e.target.value = '';
  }

  // ─── AI Processing ──────────────────────────────────────────────────
  // Runs the same 4-step pipeline as v1:
  //   1. Detect price tag photo → OCR → fill price/dealer/title; remove tag photo
  //   2. Detect tape measure photo → fill size; mark tape photo as ai-exempt
  //   3. Background-remove remaining product photos (3 retries each)
  //   4. AI-suggest title/desc/category/maker/condition for empty fields
  //
  // Only operates on pending (unsaved, un-uploaded) photos. Existing remote
  // photos are left alone — re-processing on edit isn't supported.
  const [aiBusy, setAiBusy] = useState(false);
  // Per-photo reprocess state (P1-15). reprocessingIdx is the photo index
  // currently being reprocessed (shows a spinner overlay); openMenuIdx is
  // the index whose Better-lighting/background/shadow menu is open.
  const [reprocessingIdx, setReprocessingIdx] = useState<number | null>(null);
  const [openReprocessMenuIdx, setOpenReprocessMenuIdx] = useState<number | null>(null);

  // Close the reprocess menu when the user clicks outside it (matches v1
  // admin/app.js:836-839 — a one-shot document listener that fires on the
  // next click anywhere).
  useEffect(() => {
    if (openReprocessMenuIdx === null) return;
    function onDocClick() {
      setOpenReprocessMenuIdx(null);
    }
    // setTimeout so the click that OPENED the menu doesn't immediately
    // close it via this same listener firing on the same tick.
    const t = setTimeout(() => {
      document.addEventListener('click', onDocClick, { once: true });
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onDocClick);
    };
  }, [openReprocessMenuIdx]);

  async function reprocessPhoto(idx: number, mode: ReprocessMode) {
    const photo = photos[idx];
    if (!photo || !('pendingFile' in photo)) return;
    setOpenReprocessMenuIdx(null);
    setReprocessingIdx(idx);
    try {
      const dataUrl = await fileToDataUrl(photo.pendingFile);
      const cleaned = await geminiReprocessPhoto(dataUrl, mode);
      if (!cleaned) {
        setStatus(`Reprocess (${mode}) failed — try again.`);
        setTimeout(() => setStatus(''), 3000);
        return;
      }
      // Replace the file + preview with the new bytes. Mirrors what
      // step 3 (background removal) does in processWithAI.
      const newFile = dataUrlToFile(
        cleaned,
        photo.pendingFile.name.replace(/\.\w+$/, '.jpg'),
      );
      const newPreview = URL.createObjectURL(newFile);
      setPhotos((arr) =>
        arr.map((p, i) => {
          if (i !== idx) return p;
          if (!('pendingFile' in p)) return p;
          if ('preview' in p) URL.revokeObjectURL(p.preview);
          return {
            pendingFile: newFile,
            preview: newPreview,
            processed: true,
            aiProcess: p.aiProcess ?? true,
          } as Photo;
        }),
      );
      setStatus(`Reprocessed (${mode}).`);
      setTimeout(() => setStatus(''), 2000);
    } finally {
      setReprocessingIdx(null);
    }
  }

  async function processWithAI() {
    if (aiBusy) return;
    const pendingIndices = photos
      .map((p, i) => ('pendingFile' in p ? i : -1))
      .filter((i) => i >= 0);
    // Diagnostic: when the click is a no-op, the console line below tells
    // us exactly why (added 2026-05-29 after a silent no-op shipped that
    // could not be diagnosed from server logs alone).
    console.info('[ai] processWithAI clicked', {
      totalPhotos: photos.length,
      pendingCount: pendingIndices.length,
      shapes: photos.map((p) =>
        'pendingFile' in p
          ? { kind: 'pending', name: p.pendingFile?.name, size: p.pendingFile?.size }
          : { kind: 'remote', remotePath: p.remotePath },
      ),
    });
    if (photos.length === 0) {
      setStatus('Add photos first.');
      return;
    }
    if (pendingIndices.length === 0) {
      // User sees photos on screen but they're all already-uploaded
      // (remote) — AI processing only runs on new pending photos. Most
      // commonly hit when re-opening an item in edit mode: the existing
      // photos are remote and can't be re-AI'd.
      setStatus(
        'These photos are already saved — AI processing only runs on newly added photos.',
      );
      return;
    }
    setAiBusy(true);
    setStatus('Reading photos…');

    try {
      // Snapshot the pending photos as data URLs once — Gemini calls below
      // operate on these copies, then we patch state at the end.
      let working = await Promise.all(
        photos.map(async (p) => {
          if ('pendingFile' in p) {
            return {
              kind: 'pending' as const,
              file: p.pendingFile,
              preview: p.preview,
              dataUrl: await fileToDataUrl(p.pendingFile),
              processed: p.processed ?? false,
              aiProcess: p.aiProcess ?? true,
            };
          }
          return { kind: 'remote' as const, remotePath: p.remotePath };
        }),
      );

      // Track the CURRENT title across AI steps. Step 1's price-tag OCR can
      // fill the title; Step 4's geminiSuggest can also fill it. The
      // function-level `title` (closure) doesn't reflect setTitle() calls
      // made inside this same async function — so without a local mirror,
      // step 4 always thinks the title is still empty and overwrites
      // whatever step 1 set. Match all the user-typed-vs-AI guards against
      // this local instead.
      let currentTitle = title;

      // ── Step 1: price tag detection + OCR ─────────────────────
      const unprocessedFor1 = working
        .map((w, i) => (w.kind === 'pending' && !w.processed ? i : -1))
        .filter((i) => i >= 0);

      if (unprocessedFor1.length > 0) {
        setStatus('Scanning for price tag…');
        const dataUrls = unprocessedFor1.map((i) => {
          const w = working[i];
          if (w.kind !== 'pending') throw new Error('unreachable');
          return w.dataUrl;
        });
        const tagIndexInSubset = await geminiDetectTag(dataUrls);
        if (tagIndexInSubset >= 0 && tagIndexInSubset < unprocessedFor1.length) {
          const tagPhotoIdx = unprocessedFor1[tagIndexInSubset];
          const tagPhoto = working[tagPhotoIdx];
          if (tagPhoto.kind === 'pending') {
            setStatus('Reading price tag…');
            const ocr = await geminiOCR(tagPhoto.dataUrl);
            if (ocr.price && !price) setPrice(String(ocr.price));
            if (ocr.dealerCode && !dealerCode) setDealerCode(ocr.dealerCode);
            if (ocr.itemName && !currentTitle) {
              const titled = toTitleCase(ocr.itemName);
              setTitle(titled);
              currentTitle = titled;
            }
            // Remove the tag photo
            URL.revokeObjectURL(tagPhoto.preview);
            working = working.filter((_, i) => i !== tagPhotoIdx);
          }
        }
      }

      // ── Step 2: tape measure → dimensions ─────────────────────
      const unprocessedFor2 = working
        .map((w, i) => (w.kind === 'pending' && !w.processed ? i : -1))
        .filter((i) => i >= 0);

      if (unprocessedFor2.length > 0 && !size) {
        setStatus('Checking for tape measure…');
        const dataUrls = unprocessedFor2.map((i) => {
          const w = working[i];
          if (w.kind !== 'pending') throw new Error('unreachable');
          return w.dataUrl;
        });
        const tape = await geminiDetectTapeMeasure(dataUrls);
        if (tape.size) setSize(tape.size);
        if (tape.tapeIndex >= 0 && tape.tapeIndex < unprocessedFor2.length) {
          const tapePhotoIdx = unprocessedFor2[tape.tapeIndex];
          const tapePhoto = working[tapePhotoIdx];
          if (tapePhoto.kind === 'pending') {
            tapePhoto.aiProcess = false;
          }
        }
      }

      // ── Step 3: background removal ────────────────────────────
      const toCleanIdx = working
        .map((w, i) => (w.kind === 'pending' && !w.processed && w.aiProcess ? i : -1))
        .filter((i) => i >= 0);

      let failed = 0;
      for (let n = 0; n < toCleanIdx.length; n++) {
        const idx = toCleanIdx[n];
        const w = working[idx];
        if (w.kind !== 'pending') continue;
        setStatus(`Processing image ${n + 1} of ${toCleanIdx.length}…`);
        const cleaned = await geminiRemoveBackground(w.dataUrl);
        if (cleaned) {
          // Replace the File + dataUrl + preview with the processed image
          URL.revokeObjectURL(w.preview);
          const newFile = dataUrlToFile(cleaned, w.file.name.replace(/\.\w+$/, '.jpg'));
          const newPreview = URL.createObjectURL(newFile);
          w.file = newFile;
          w.dataUrl = cleaned;
          w.preview = newPreview;
          w.processed = true;
        } else {
          failed++;
        }
      }

      // ── Step 4: text suggestions ──────────────────────────────
      const remainingDataUrls = working
        .filter((w): w is Extract<typeof w, { kind: 'pending' }> => w.kind === 'pending')
        .map((w) => w.dataUrl);
      if (remainingDataUrls.length > 0) {
        setStatus('Analyzing item…');
        const sugg = await geminiSuggest(remainingDataUrls);
        // Read against currentTitle (set by Step 1 if the price-tag OCR
        // pulled a title from the tag). Closure's `title` is stale here
        // because earlier setTitle() calls don't flush into the same
        // execution context — without this guard, Step 4 always overwrites
        // the OCR title with the generic AI suggestion.
        if (sugg.title && !currentTitle) {
          setTitle(sugg.title);
          currentTitle = sugg.title;
        }
        if (sugg.description && !description) setDescription(sugg.description);
        if (sugg.maker && !maker) setMaker(sugg.maker);
        // Condition has a DB CHECK constraint; AI freely returns prose like
        // "Excellent" or "Good, minor wear to edges" which fails save with a
        // 500. Only accept values in the enum, else leave the field empty
        // and let the admin pick.
        const allowedConditions: Condition[] = ['New', 'Like New', 'Good', 'Fair'];
        if (
          sugg.condition &&
          !condition &&
          (allowedConditions as string[]).includes(sugg.condition)
        ) {
          setCondition(sugg.condition);
        }
        if (sugg.category && !category) {
          const allowed = ['wall-art', 'object', 'ceramic', 'furniture', 'light', 'sculpture', 'misc'];
          if (allowed.includes(sugg.category)) setCategory(sugg.category);
        }
      }

      // Patch React state with the new pending photos
      setPhotos(
        working.map((w) =>
          w.kind === 'remote'
            ? ({ remotePath: w.remotePath } as Photo)
            : ({
                pendingFile: w.file,
                preview: w.preview,
                processed: w.processed,
                aiProcess: w.aiProcess,
              } as Photo),
        ),
      );

      setStatus(failed > 0 ? `Done — ${failed} image(s) failed processing.` : 'Done.');
      setTimeout(() => setStatus(''), 3000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error: ${msg}`);
    } finally {
      setAiBusy(false);
    }
  }

  /**
   * Flip the AI-include flag on a pending photo. Photos with aiProcess=false
   * are skipped by all four steps of the AI pipeline (price-tag OCR, tape
   * measure detection, background removal, text suggestion). Mirrors v1
   * admin/app.js:827-834 — the star button in the photo cell corner.
   */
  function toggleAiOnPhoto(idx: number) {
    setPhotos((arr) =>
      arr.map((p, i) => {
        if (i !== idx) return p;
        if (!('pendingFile' in p)) return p;
        // Default current value to true so the first click toggles to exempt.
        const current = p.aiProcess !== false;
        return { ...p, aiProcess: !current } as Photo;
      }),
    );
  }

  function removePhoto(idx: number) {
    setPhotos((arr) => {
      const next = [...arr];
      const [removed] = next.splice(idx, 1);
      if (removed && 'preview' in removed) URL.revokeObjectURL(removed.preview);
      return next;
    });
  }

  // ─── Drag-to-reorder photos (P1-16) ───────────────────────────
  // Long-press a photo (200ms / 5px tolerance on touch, or just start
  // dragging on mouse with 8px activation) → drag to new position →
  // photos array order updates → first photo is the new hero. Mirrors
  // v1 admin/app.js:845-857.
  const photoSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onPhotoDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setPhotos((arr) => {
      const oldIdx = arr.findIndex((p) => photoKey(p) === active.id);
      const newIdx = arr.findIndex((p) => photoKey(p) === over.id);
      if (oldIdx < 0 || newIdx < 0) return arr;
      return arrayMove(arr, oldIdx, newIdx);
    });
  }

  async function uploadPending(itemId: string): Promise<string[]> {
    const pending = photos.filter((p): p is { pendingFile: File; preview: string } => 'pendingFile' in p);
    if (pending.length === 0) return [];
    const slug = title.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const existingCount = photos.filter((p) => 'remotePath' in p).length;
    const fd = new FormData();
    for (const p of pending) fd.append('files', p.pendingFile);
    fd.append('slug', slug);
    fd.append('startIndex', String(existingCount + 1));
    const res = await fetch(`/api/admin/items/${itemId}/images`, { method: 'POST', body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? 'Photo upload failed');
    }
    const data = (await res.json()) as { uploaded: string[] };
    return data.uploaded;
  }

  async function onSave() {
    if (saving) return;
    setSaving(true);
    setStatus('');
    setSaveError('');
    try {
      if (!title.trim()) throw new Error('Title is required');
      if (!category) throw new Error('Category is required');
      const priceNum = price === '' ? 0 : parseFloat(price);
      if (Number.isNaN(priceNum) || priceNum < 0) throw new Error('Invalid price');

      // Persist posted-by initials to localStorage so they autofill next time
      if (postedBy.trim()) {
        try { localStorage.setItem('ol_posted_by', postedBy.trim()); } catch {}
      }

      const itemId = mode === 'create' ? initialId : item!.id;

      if (mode === 'create' && !rowCreated) {
        // Create row first (no images yet). The `rowCreated` guard makes
        // this idempotent — if a previous attempt got past create but
        // failed at upload, the retry skips this step. The subsequent
        // upload + PATCH below are themselves idempotent (upsert + PATCH).
        const createRes = await fetch('/api/admin/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: itemId,
            title: title.trim(),
            description: description.trim(),
            price: priceNum,
            size: size.trim(),
            category,
            maker: maker.trim(),
            condition,
            dealer_code: dealerCode.trim(),
            posted_by: postedBy.trim(),
            is_new: isSold ? false : isNew,
            is_hold: isSold ? false : isHold,
            is_sold: isSold,
          }),
        });
        if (!createRes.ok) {
          const d = await createRes.json().catch(() => ({}));
          throw new Error(d.error ?? 'Create failed');
        }
        setRowCreated(true);
      }

      // Upload any pending files
      setStatus('Uploading photos...');
      const uploadedPaths = await uploadPending(itemId);

      // Build final images array (existing remotePaths + new uploads)
      const allPaths = photos
        .filter((p): p is { remotePath: string } => 'remotePath' in p)
        .map((p) => p.remotePath)
        .concat(uploadedPaths);

      // PATCH: send all editable fields. The API route whitelists, so anything
      // off-limits (display_order, created_at) is ignored. PATCH does
      // UPDATE one row — the architectural fix.
      setStatus('Saving...');
      const patchRes = await fetch(`/api/admin/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          price: priceNum,
          size: size.trim(),
          category,
          maker: maker.trim(),
          condition,
          dealer_code: dealerCode.trim(),
          posted_by: postedBy.trim(),
          is_new: isSold ? false : isNew,
          is_hold: isSold ? false : isHold,
          is_sold: isSold,
          images: allPaths,
          hero_image: allPaths[0] ?? null,
        }),
      });
      if (!patchRes.ok) {
        const d = await patchRes.json().catch(() => ({}));
        throw new Error(d.error ?? 'Save failed');
      }

      router.push('/admin/items');
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(msg);
      setSaveError(humanizeSaveError(msg));
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!item) return;
    if (saving) return;
    const ok = await confirmAsync(`Delete ${item.title || 'this item'}?`, {
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setSaving(true);
    setStatus('Deleting...');
    try {
      const res = await fetch(`/api/admin/items/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Delete failed');
      }
      router.push('/admin/items');
      router.refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  // Show the busy overlay whenever a long operation is in flight. `status`
  // gives the user a per-stage message (AI substep names, "Saving…",
  // "Uploading photos…") so they know something specific is happening.
  const busy = saving || aiBusy;
  const busyLabel =
    status
    || (aiBusy ? 'Processing…' : '')
    || (saving ? 'Saving…' : '');

  return (
    <div id="view-editor" className="view">
      {busy && (
        <div className="busy-overlay" role="status" aria-live="polite">
          <div className="busy-card">
            <span className="busy-spinner" aria-hidden="true" />
            <p className="busy-label">{busyLabel || 'Working…'}</p>
          </div>
        </div>
      )}
      <header className="topbar">
        <button
          className="icon-btn"
          aria-label="Back"
          onClick={() => router.push('/admin/items')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <span className="topbar-title">{mode === 'create' ? 'New Item' : 'Edit Item'}</span>
        {mode === 'edit' ? (
          <button className="icon-btn" aria-label="Delete" onClick={onDelete}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        ) : (
          <div style={{ width: '20px' }} />
        )}
      </header>

      <div className="editor-body">
        {saveError && (
          <div className="save-error-banner" role="alert">
            <span className="save-error-text">{saveError}</span>
            <button
              type="button"
              className="save-error-dismiss"
              aria-label="Dismiss"
              onClick={() => setSaveError('')}
            >
              ×
            </button>
          </div>
        )}
        <section className="editor-section">
          <p className="section-label">Photos</p>
          <DndContext
            sensors={photoSensors}
            collisionDetection={closestCenter}
            onDragEnd={onPhotoDragEnd}
          >
            <SortableContext
              items={photos.map((p) => photoKey(p))}
              strategy={rectSortingStrategy}
            >
              <div className="photo-grid">
                {photos.map((p, i) => (
                  <SortablePhotoCell
                    key={photoKey(p)}
                    photo={p}
                    index={i}
                    onRemove={removePhoto}
                    onToggleAi={toggleAiOnPhoto}
                    onReprocess={reprocessPhoto}
                    reprocessing={reprocessingIdx === i}
                    menuOpen={openReprocessMenuIdx === i}
                    onMenuToggle={() =>
                      setOpenReprocessMenuIdx((cur) => (cur === i ? null : i))
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {/*
            v1 used <label> with the input as a child, no JS click handler — the
            browser triggers the input natively when the label is clicked.
            My v2 first attempt had BOTH a native label-trigger AND a programmatic
            .click() — that double-trigger silently cancels the file picker on
            some browsers (notably Chrome desktop when triggered by a synthetic
            click on the label of a hidden input). Restore v1's pattern.
          */}
          <label className="add-photo-btn" htmlFor="photo-input">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>Add Photos</span>
          </label>
          <input
            ref={photoInputRef}
            id="photo-input"
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={onAddPhotos}
          />
        </section>

        <section className="editor-section">
          <button
            type="button"
            className="btn-secondary"
            onClick={processWithAI}
            disabled={aiBusy}
          >
            {aiBusy ? 'Processing…' : 'Process with AI'}
          </button>
          {/* Always-visible status line for AI processing. Previously the
              busy-overlay was the only surface that showed status text, so
              early-returns (e.g. "Add photos first") that fired BEFORE
              setAiBusy(true) had no visible feedback at all — the click
              looked like a complete no-op. Keep this rendered whenever
              status is set, regardless of aiBusy. */}
          {status && !saving && (
            <div
              className="processing-status"
              role="status"
              aria-live="polite"
              style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary, #555)' }}
            >
              {status}
            </div>
          )}
        </section>

        <section className="editor-section">
          <label className="field-label">Title</label>
          <input
            type="text"
            className="field"
            placeholder="Item title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <label className="field-label">Description</label>
          <textarea
            className="field field-textarea"
            placeholder="Describe the item"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <label className="field-label">Price</label>
          <input
            type="number"
            className="field"
            placeholder="0"
            min={0}
            step="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />

          <label className="field-label">Size</label>
          <input
            type="text"
            className="field"
            placeholder='e.g. 24" × 18" or 12" H × 8" W × 8" D'
            value={size}
            onChange={(e) => setSize(e.target.value)}
          />

          <label className="field-label">Category</label>
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Select...</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <label className="field-label">Maker / Brand</label>
          <input
            type="text"
            className="field"
            placeholder="e.g. Herman Miller, Unknown"
            value={maker}
            onChange={(e) => setMaker(e.target.value)}
          />

          <label className="field-label">Condition</label>
          <select className="field" value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="">Select...</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label className="field-label">Dealer Code</label>
          <input
            type="text"
            className="field"
            placeholder="14EK"
            value={dealerCode}
            onChange={(e) => setDealerCode(e.target.value)}
          />

          <label className="field-label">Posted By</label>
          <input
            type="text"
            className="field"
            placeholder="Your initials (e.g. LL)"
            value={postedBy}
            onChange={(e) => setPostedBy(e.target.value)}
          />

          <label className="toggle-row">
            <span className="toggle-label">Mark as New</span>
            <input
              type="checkbox"
              className="toggle-input"
              checked={isNew}
              onChange={(e) => setIsNew(e.target.checked)}
              disabled={isSold}
            />
            <span className="toggle-switch" />
          </label>

          <label className="toggle-row">
            <span className="toggle-label">Put on Hold</span>
            <input
              type="checkbox"
              className="toggle-input"
              checked={isHold}
              onChange={(e) => setIsHold(e.target.checked)}
              disabled={isSold}
            />
            <span className="toggle-switch" />
          </label>

          <label className="toggle-row">
            <span className="toggle-label">Mark as Sold</span>
            <input
              type="checkbox"
              className="toggle-input"
              checked={isSold}
              onChange={(e) => setIsSold(e.target.checked)}
            />
            <span className="toggle-switch" />
          </label>
        </section>

        {status && (
          <section className="editor-section">
            <p style={{ color: status.includes('failed') || status.includes('Error') || status.includes('required') || status.includes('Invalid') ? '#c63131' : '#888', fontSize: 13 }}>
              {status}
            </p>
          </section>
        )}

        <section className="editor-section">
          <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </section>
      </div>
      {confirmDialog}
    </div>
  );
}

/**
 * Stable identifier for a photo across renders. Remote photos use the
 * storage path; pending photos use the blob preview URL (unique per
 * createObjectURL call). When AI processing replaces a pending file's
 * bytes, it generates a fresh preview URL — that's fine, dnd-kit just
 * sees it as a new id, which is correct since the photo IS a new file.
 */
function photoKey(p: Photo): string {
  return 'remotePath' in p ? `r:${p.remotePath}` : `p:${p.preview}`;
}

/**
 * One photo cell, sortable. Long-press anywhere on the photo (200ms on
 * touch) starts the drag. Buttons inside the cell (Remove, AI toggle)
 * stop event propagation on click so they don't accidentally trigger a
 * drag.
 */
function SortablePhotoCell({
  photo,
  index,
  onRemove,
  onToggleAi,
  onReprocess,
  reprocessing,
  menuOpen,
  onMenuToggle,
}: {
  photo: Photo;
  index: number;
  onRemove: (idx: number) => void;
  onToggleAi: (idx: number) => void;
  onReprocess: (idx: number, mode: ReprocessMode) => void;
  reprocessing: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
}) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photoKey(photo) });
  const src = 'remotePath' in photo ? thumbUrl(photo.remotePath) : photo.preview;
  const isPending = 'pendingFile' in photo;
  const alreadyProcessed = isPending && !!photo.processed;
  const aiOn = isPending ? photo.aiProcess !== false : false;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
    zIndex: isDragging ? 5 : undefined,
    touchAction: 'none',
    cursor: 'grab',
  };

  return (
    <div
      ref={setNodeRef}
      className="photo-cell"
      style={style}
      {...attributes}
      {...listeners}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} />
      {index === 0 && <span className="photo-hero-dot" aria-label="Hero image" />}
      <button
        type="button"
        className="photo-remove"
        aria-label="Remove"
        // PointerDown stop-propagation prevents dnd-kit from starting a
        // drag when the admin taps the remove button. Click still fires.
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(index);
        }}
      >
        ×
      </button>
      {isPending && !alreadyProcessed && (
        <button
          type="button"
          className={`photo-ai${aiOn ? ' active' : ''}`}
          aria-label={aiOn ? 'Exempt from AI processing' : 'Include in AI processing'}
          aria-pressed={aiOn}
          title={aiOn ? 'AI processing on — click to exempt this photo' : 'AI processing off — click to include this photo'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleAi(index);
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
          </svg>
        </button>
      )}
      {isPending && alreadyProcessed && (
        <>
          <button
            type="button"
            className="photo-reprocess"
            aria-label="Reprocess photo"
            title="Reprocess"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onMenuToggle();
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>
          <div
            className={`photo-reprocess-menu${menuOpen ? '' : ' hidden'}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="reprocess-opt"
              onClick={() => onReprocess(index, 'lighting')}
            >
              Better lighting
            </button>
            <button
              type="button"
              className="reprocess-opt"
              onClick={() => onReprocess(index, 'background')}
            >
              Better background removal
            </button>
            <button
              type="button"
              className="reprocess-opt"
              onClick={() => onReprocess(index, 'shadow')}
            >
              Better shadow
            </button>
          </div>
        </>
      )}
      {reprocessing && (
        <div className="photo-processing-overlay" aria-hidden="true">
          <span className="photo-spinner" />
        </div>
      )}
    </div>
  );
}
