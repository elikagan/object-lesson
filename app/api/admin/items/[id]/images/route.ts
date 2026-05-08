/**
 * POST /api/admin/items/[id]/images
 *   Body: multipart/form-data with one or more files (field "files")
 *   Each file is uploaded twice: full-size (max 1200px, quality 82) and thumbnail
 *   (max 400px, quality 75), with paths images/products/<id>/<slug>_N.jpg and
 *   images/products/<id>/thumb_<slug>_N.jpg.
 *
 *   Returns: { uploaded: string[] } — the full-size image paths
 *
 * The client only needs to pass the raw image bytes and a slug; the server
 * handles all the resizing + thumbnailing in one place.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';
import sharp from 'sharp';

const MAX_FULL_DIM = 1200;
const FULL_QUALITY = 82;
const MAX_THUMB_DIM = 400;
const THUMB_QUALITY = 75;
const BUCKET = 'product-images';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const files = formData.getAll('files').filter((v): v is File => v instanceof File);
  const slug = (formData.get('slug') as string | null) ?? id;
  const startIndex = parseInt((formData.get('startIndex') as string | null) ?? '1', 10);
  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const uploaded: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const num = startIndex + i;
    const filename = `${slug}_${num}.jpg`;
    const fullPath = `images/products/${id}/${filename}`;
    const thumbPath = `images/products/${id}/thumb_${filename}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    // Resize full + thumbnail in parallel
    const [fullJpeg, thumbJpeg] = await Promise.all([
      sharp(buffer)
        .resize(MAX_FULL_DIM, MAX_FULL_DIM, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: FULL_QUALITY, mozjpeg: true })
        .toBuffer(),
      sharp(buffer)
        .resize(MAX_THUMB_DIM, MAX_THUMB_DIM, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
        .toBuffer(),
    ]);

    const [fullRes, thumbRes] = await Promise.all([
      supabase.storage.from(BUCKET).upload(fullPath, fullJpeg, {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '31536000',
      }),
      supabase.storage.from(BUCKET).upload(thumbPath, thumbJpeg, {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '31536000',
      }),
    ]);

    if (fullRes.error) {
      return NextResponse.json(
        { error: `Upload failed: ${fullRes.error.message}` },
        { status: 500 },
      );
    }
    if (thumbRes.error) {
      console.warn('[upload] thumbnail failed:', thumbRes.error.message);
    }

    uploaded.push(fullPath);
  }

  return NextResponse.json({ uploaded });
}
