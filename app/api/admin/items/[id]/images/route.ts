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
 *
 * Error contract: if ANY file fails (sharp can't decode it, Supabase rejects
 * the upload), the whole request returns a 500 with a JSON body that names
 * the specific file (1-based index, filename, mime) and the underlying
 * error. The earlier silent-500 path caused the "Photo upload failed" bug
 * Eli reported where AI-processed images sometimes came back as bytes
 * sharp couldn't parse and the route threw uncaught.
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
    const human = `photo ${i + 1} of ${files.length}${file.name ? ` ("${file.name}")` : ''}`;
    const probe = `${file.type || 'unknown'} · ${Math.round(file.size / 1024)} KB`;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(await file.arrayBuffer());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[upload] ${human} arrayBuffer failed:`, msg);
      return NextResponse.json(
        { error: `Could not read ${human}. ${probe}. ${msg}` },
        { status: 500 },
      );
    }

    let fullJpeg: Buffer;
    let thumbJpeg: Buffer;
    try {
      [fullJpeg, thumbJpeg] = await Promise.all([
        sharp(buffer)
          .resize(MAX_FULL_DIM, MAX_FULL_DIM, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: FULL_QUALITY, mozjpeg: true })
          .toBuffer(),
        sharp(buffer)
          .resize(MAX_THUMB_DIM, MAX_THUMB_DIM, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
          .toBuffer(),
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[upload] ${human} sharp resize failed:`, msg, probe);
      // The most common cause: AI returned bytes that aren't a valid image
      // (or an iPhone HEIC the server runtime can't decode). Tell the admin
      // something they can act on.
      return NextResponse.json(
        {
          error: `Could not process ${human} (${probe}). The image bytes may be corrupt or in an unsupported format (e.g. HEIC). Try removing and re-adding this photo; if it's the AI-processed one, click "Process with AI" again, or untick the star to keep the original.`,
        },
        { status: 500 },
      );
    }

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
      console.warn(`[upload] ${human} storage upload failed:`, fullRes.error.message);
      return NextResponse.json(
        { error: `Storage rejected ${human} (${probe}): ${fullRes.error.message}` },
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
