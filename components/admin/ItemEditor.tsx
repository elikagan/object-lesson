'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Item, Category, Condition } from '@/lib/types';
import { thumbUrl } from '@/lib/items';

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

type Mode = 'create' | 'edit';

type Photo = { remotePath: string } | { pendingFile: File; preview: string };

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
  const photoInputRef = useRef<HTMLInputElement>(null);

  function onAddPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setPhotos((p) => [
      ...p,
      ...files.map((file) => ({ pendingFile: file, preview: URL.createObjectURL(file) }) as Photo),
    ]);
    e.target.value = '';
  }

  function removePhoto(idx: number) {
    setPhotos((arr) => {
      const next = [...arr];
      const [removed] = next.splice(idx, 1);
      if (removed && 'preview' in removed) URL.revokeObjectURL(removed.preview);
      return next;
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

      if (mode === 'create') {
        // Create row first (no images yet)
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
      setStatus(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!item) return;
    if (saving) return;
    if (!confirm(`Delete ${item.title || 'this item'}?`)) return;
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

  return (
    <div id="view-editor" className="view">
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
        <section className="editor-section">
          <p className="section-label">Photos</p>
          <div className="photo-grid">
            {photos.map((p, i) => {
              const src = 'remotePath' in p ? thumbUrl(p.remotePath) : p.preview;
              return (
                <div key={i} className="photo-cell">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" />
                  <button
                    type="button"
                    className="photo-remove"
                    aria-label="Remove"
                    onClick={() => removePhoto(i)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          <label className="add-photo-btn" onClick={() => photoInputRef.current?.click()}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>Add Photos</span>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={onAddPhotos}
            />
          </label>
        </section>

        <section className="editor-section">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => alert('AI processing — coming in next update.')}
          >
            Process with AI
          </button>
          <div className="processing-status" />
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
    </div>
  );
}
