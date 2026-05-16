/**
 * GET    /api/admin/items/[id] → read one
 * PATCH  /api/admin/items/[id] → update only the fields in the request body
 *                                ← this is the v2 architectural fix.
 * DELETE /api/admin/items/[id] → delete row + remove all images from Storage
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/guard';
import { createServiceClient } from '@/lib/supabase/server';
import { notifyIndexNow, itemUrl, pingGoogleSitemap } from '@/lib/indexnow';

const UPDATABLE_FIELDS = new Set([
  'title',
  'description',
  'price',
  'size',
  'category',
  'maker',
  'condition',
  'dealer_code',
  'posted_by',
  'is_new',
  'is_hold',
  'is_sold',
  'hero_image',
  'images',
  'display_order',
]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const supabase = createServiceClient();
  const { data, error } = await supabase.from('items').select('*').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ item: data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Whitelist: only allow known fields in the update payload.
  // CRITICAL: this is what prevents the v1 "stale state erases other items" bug class.
  // We touch only the fields the user actually changed; all other rows + columns are untouched.
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (UPDATABLE_FIELDS.has(k)) update[k] = v;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No updatable fields in body' }, { status: 400 });
  }

  // Convention: marking sold also clears is_new + is_hold. (Matches v1.)
  if (update.is_sold === true) {
    update.is_new = false;
    update.is_hold = false;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('items')
    .update(update)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Tell search engines this URL changed. Best-effort, fire-and-forget.
  void notifyIndexNow(itemUrl(id));
  void pingGoogleSitemap('https://objectlesson.la/sitemap.xml');

  return NextResponse.json({ item: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const supabase = createServiceClient();

  // Read item first so we know what images to clean up
  const { data: item, error: readErr } = await supabase
    .from('items')
    .select('images')
    .eq('id', id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Build the list of files to delete from Storage:
  // each image path PLUS its thumb_<filename>.jpg counterpart.
  const imagePaths: string[] = Array.isArray(item.images) ? item.images : [];
  const thumbPaths = imagePaths.map((p) => p.replace(/([^/]+)$/, 'thumb_$1'));
  const allPaths = [...imagePaths, ...thumbPaths];

  // Delete row first (so the public site stops showing it immediately)
  const { error: delErr } = await supabase.from('items').delete().eq('id', id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  // Then delete files from Storage. Failures here are non-fatal (orphan files
  // are recoverable later); the row deletion is the source of truth.
  if (allPaths.length > 0) {
    const { error: storageErr } = await supabase.storage.from('product-images').remove(allPaths);
    if (storageErr) {
      console.warn(`[delete ${id}] storage cleanup failed:`, storageErr.message);
    }
  }

  // Tell search engines the URL is gone (they'll 404 it on re-crawl, but a
  // ping speeds that up).
  void notifyIndexNow(itemUrl(id));

  return NextResponse.json({ ok: true, deletedFiles: allPaths.length });
}
