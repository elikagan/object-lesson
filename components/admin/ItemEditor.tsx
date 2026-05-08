'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import Image from 'next/image';
import type { Item, Category, Condition } from '@/lib/types';
import { CATEGORY_LABELS } from '@/lib/types';
import { thumbUrl } from '@/lib/items';
import styles from '@/app/admin/admin.module.css';
import { Topbar } from '@/app/admin/Topbar';

const CATEGORIES: Category[] = ['wall-art', 'object', 'ceramic', 'furniture', 'light', 'sculpture', 'misc'];
const CONDITIONS: Condition[] = ['New', 'Like New', 'Good', 'Fair', ''];

type Mode = 'create' | 'edit';

/**
 * Single editor used for both /admin/items/new and /admin/items/[id].
 *
 * Save flow:
 *   - "create" mode: POST /api/admin/items, then upload photos under that id, then PATCH images.
 *   - "edit" mode: only fields that changed are sent in PATCH (PATCH endpoint also whitelists).
 *
 * Double-submit protection: `submitting` state disables the save button.
 */
export function ItemEditor({ mode, item, nextNumericId }: { mode: Mode; item?: Item; nextNumericId?: number }) {
  const router = useRouter();
  const initialId = item?.id ?? (nextNumericId ? String(nextNumericId).padStart(6, '0') : '');

  // Form state — initialized from item if editing, else blanks/defaults
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : '');
  const [size, setSize] = useState(item?.size ?? '');
  const [category, setCategory] = useState<Category>(item?.category ?? 'misc');
  const [maker, setMaker] = useState(item?.maker ?? '');
  const [condition, setCondition] = useState<Condition>(item?.condition ?? '');
  const [dealerCode, setDealerCode] = useState(item?.dealer_code ?? '');
  const [postedBy, setPostedBy] = useState(item?.posted_by ?? '');
  const [isNew, setIsNew] = useState(item?.is_new ?? true);
  const [isHold, setIsHold] = useState(item?.is_hold ?? false);
  const [isSold, setIsSold] = useState(item?.is_sold ?? false);

  const [images, setImages] = useState<string[]>(item?.images ?? []);
  const [pendingFiles, setPendingFiles] = useState<{ file: File; preview: string }[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const next = files.map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPendingFiles((p) => [...p, ...next]);
    e.target.value = '';
  }

  function removeImage(idx: number) {
    setImages((arr) => arr.filter((_, i) => i !== idx));
  }
  function removePendingFile(idx: number) {
    setPendingFiles((arr) => {
      URL.revokeObjectURL(arr[idx].preview);
      return arr.filter((_, i) => i !== idx);
    });
  }

  async function uploadPendingFiles(itemId: string, slug: string, startIndex: number): Promise<string[]> {
    if (pendingFiles.length === 0) return [];
    const fd = new FormData();
    for (const { file } of pendingFiles) fd.append('files', file);
    fd.append('slug', slug);
    fd.append('startIndex', String(startIndex));
    const res = await fetch(`/api/admin/items/${itemId}/images`, { method: 'POST', body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? 'Upload failed');
    }
    const data = (await res.json()) as { uploaded: string[] };
    return data.uploaded;
  }

  async function onSave() {
    if (submitting) return; // double-submit guard
    setSubmitting(true);
    setError(null);

    if (postedBy.trim()) {
      try { localStorage.setItem('ol_posted_by', postedBy.trim()); } catch {}
    }

    try {
      if (!title.trim()) throw new Error('Title is required');
      if (!category) throw new Error('Category is required');
      const priceNum = price === '' ? 0 : parseFloat(price);
      if (Number.isNaN(priceNum) || priceNum < 0) throw new Error('Invalid price');

      // Build slug from title for image filenames
      const slug = title.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

      if (mode === 'create') {
        // 1. Create the row first (without images yet)
        const createRes = await fetch('/api/admin/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: initialId,
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
            images: [],
            hero_image: null,
          }),
        });
        if (!createRes.ok) {
          const d = await createRes.json().catch(() => ({}));
          throw new Error(d.error ?? 'Create failed');
        }

        // 2. Upload pending photos under that id
        const uploaded = await uploadPendingFiles(initialId, slug, 1);
        const finalImages = [...images, ...uploaded];

        // 3. PATCH the images + hero_image fields
        if (finalImages.length > 0) {
          await fetch(`/api/admin/items/${initialId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ images: finalImages, hero_image: finalImages[0] }),
          });
        }

        router.push('/admin/items');
        router.refresh();
        return;
      }

      // Edit mode: PATCH with only the fields the user could change.
      // The API route whitelists, but we also keep the payload minimal here.
      const startIdx = (item?.images?.length ?? 0) + 1;
      const uploaded = await uploadPendingFiles(initialId, slug, startIdx);
      const finalImages = [...images, ...uploaded];
      const heroImage = finalImages[0] ?? null;

      const patchRes = await fetch(`/api/admin/items/${initialId}`, {
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
          images: finalImages,
          hero_image: heroImage,
        }),
      });
      if (!patchRes.ok) {
        const d = await patchRes.json().catch(() => ({}));
        throw new Error(d.error ?? 'Save failed');
      }

      router.push('/admin/items');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  async function onDelete() {
    if (!item) return;
    if (deleting || submitting) return;
    if (!confirm(`Delete "${item.title}"? This will also remove its images.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/items/${item.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? 'Delete failed');
      }
      router.push('/admin/items');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  return (
    <div className={styles.shell}>
      <Topbar title={mode === 'create' ? 'New item' : `Edit ${item?.title ?? ''}`} />
      <div className={styles.body}>
        {error && <div className={styles.errorBanner}>{error}</div>}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Photos ({images.length + pendingFiles.length})</span>
          <div className={styles.photoGrid}>
            {images.map((path, i) => (
              <div key={`saved-${path}`} className={styles.photoCell}>
                <Image src={thumbUrl(path)} alt="" width={120} height={120} unoptimized />
                <button type="button" className={styles.photoRemove} onClick={() => removeImage(i)}>×</button>
              </div>
            ))}
            {pendingFiles.map((p, i) => (
              <div key={`pending-${i}`} className={styles.photoCell}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.preview} alt="" />
                <button type="button" className={styles.photoRemove} onClick={() => removePendingFile(i)}>×</button>
              </div>
            ))}
            <button type="button" className={styles.photoUploadBtn} onClick={() => fileInputRef.current?.click()}>+</button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onFilesChange}
            style={{ display: 'none' }}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Title *</span>
          <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Description</span>
          <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Price ($)</span>
            <input
              type="number"
              step="any"
              min="0"
              className={styles.input}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Size</span>
            <input className={styles.input} value={size} onChange={(e) => setSize(e.target.value)} />
          </label>
        </div>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Category *</span>
            <select className={styles.select} value={category} onChange={(e) => setCategory(e.target.value as Category)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Condition</span>
            <select className={styles.select} value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
              {CONDITIONS.map((c) => (
                <option key={c || '_blank'} value={c}>{c || '—'}</option>
              ))}
            </select>
          </label>
        </div>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Maker</span>
            <input className={styles.input} value={maker} onChange={(e) => setMaker(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Dealer code</span>
            <input className={styles.input} value={dealerCode} onChange={(e) => setDealerCode(e.target.value)} />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Posted by</span>
          <input
            className={styles.input}
            value={postedBy}
            onChange={(e) => setPostedBy(e.target.value)}
            placeholder="Your initials"
          />
        </label>

        <label className={styles.toggle}>
          <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} disabled={isSold} />
          Mark as New
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" checked={isHold} onChange={(e) => setIsHold(e.target.checked)} disabled={isSold} />
          Put on Hold
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" checked={isSold} onChange={(e) => setIsSold(e.target.checked)} />
          Mark as Sold
        </label>

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={onSave}
            disabled={submitting || deleting}
          >
            {submitting ? <><span className={styles.spinner} /> Saving...</> : 'Save'}
          </button>
          <Link href="/admin/items" className={styles.btn}>Cancel</Link>
          {mode === 'edit' && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={onDelete}
              disabled={submitting || deleting}
              style={{ marginLeft: 'auto' }}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
