/**
 * POST /api/admin/gemini
 *   Body: { model: string, contents: object[], generationConfig?: object }
 *   Proxies the request to Google's Gemini API with the server-side key.
 *
 * The admin uses Gemini for: price tag detection, OCR, tape measure detection,
 * background removal, and AI text suggestions. Keeping the API key server-side
 * means no client can scrape it.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/guard';

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || !body.model || !Array.isArray(body.contents)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(body.model)}:generateContent?key=${apiKey}`;
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: body.contents,
      generationConfig: body.generationConfig ?? {},
    }),
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json' },
  });
}
