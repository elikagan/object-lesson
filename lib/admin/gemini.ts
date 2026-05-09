/**
 * Client-side Gemini helpers — call /api/admin/gemini (which proxies to
 * Google's API server-side, keeping the key off the wire).
 *
 * Ported verbatim from v1 admin/app.js. Same prompts, same models, same
 * response shapes. The only difference is the URL: v1 hit a Cloudflare
 * Worker, v2 hits a Next.js API route.
 */

const PROXY = '/api/admin/gemini';

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };
type GeminiContent = { parts: GeminiPart[] };
type GeminiConfig = {
  responseMimeType?: string;
  responseModalities?: string[];
};

type GeminiResponse = {
  candidates: Array<{
    content: { parts: GeminiPart[] };
  }>;
};

async function geminiCall(
  model: string,
  contents: GeminiContent[],
  config: GeminiConfig = {},
): Promise<GeminiResponse> {
  const res = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, contents, generationConfig: config }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(data.error ?? res.statusText);
  }
  return res.json();
}

export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1] ?? '';
}

/** Resize image to max dimension (longest side), return data URL JPEG. */
export function resizeImage(
  dataUrl: string,
  maxDim: number,
  quality = 0.82,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      if (!ctx) return reject(new Error('canvas 2d unavailable'));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = dataUrl;
  });
}

/** Convert a File to a data URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error ?? new Error('file read failed'));
    fr.readAsDataURL(file);
  });
}

/** Convert a data URL to a File (for re-uploading processed images). */
export function dataUrlToFile(dataUrl: string, name: string): File {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('not a data URL');
  const [, mime, b64] = match;
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── OCR a price tag/label ──────────────────────────────────────────
export type OCRResult = {
  price?: number | null;
  dealerCode?: string | null;
  itemName?: string | null;
  text?: string;
};

export async function geminiOCR(dataUrl: string): Promise<OCRResult> {
  const resized = await resizeImage(dataUrl, 1024);
  const result = await geminiCall(
    'gemini-2.5-flash',
    [
      {
        parts: [
          {
            text: 'Read all text on this price tag or label from an antique store. Extract: the price (number without $ symbol), the dealer code (alphanumeric, usually 2-5 characters like "14EK"), and the item name or description (e.g. "Lauterback Encaustic" or "Studio Vase"). Return ONLY valid JSON: {"price": number_or_null, "dealerCode": "string_or_null", "itemName": "string_or_null", "text": "all visible text"}',
          },
          { inlineData: { mimeType: 'image/jpeg', data: dataUrlToBase64(resized) } },
        ],
      },
    ],
    { responseMimeType: 'application/json' },
  );
  try {
    const text = (result.candidates[0].content.parts[0] as { text: string }).text;
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// ─── Detect which photo is the price tag ────────────────────────────
export async function geminiDetectTag(dataUrls: string[]): Promise<number> {
  const thumbs = await Promise.all(dataUrls.map((u) => resizeImage(u, 512)));
  const parts: GeminiPart[] = [
    {
      text: `I have ${thumbs.length} photos of an antique/vintage item for sale. One of them might be a photo of a price tag or label (handwritten or printed text on a small card/sticker). Which image index (0-based) is the price tag? If none is a price tag, return -1. Return ONLY valid JSON: {"tagIndex": number}`,
    },
  ];
  for (const url of thumbs) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: dataUrlToBase64(url) } });
  }
  const result = await geminiCall('gemini-2.5-flash', [{ parts }], {
    responseMimeType: 'application/json',
  });
  try {
    const text = (result.candidates[0].content.parts[0] as { text: string }).text;
    return JSON.parse(text).tagIndex ?? -1;
  } catch {
    return -1;
  }
}

// ─── Detect tape measure & extract dimensions ───────────────────────
export type TapeResult = { size: string; tapeIndex: number };

export async function geminiDetectTapeMeasure(dataUrls: string[]): Promise<TapeResult> {
  const imgs = await Promise.all(dataUrls.slice(0, 4).map((u) => resizeImage(u, 1536)));
  const parts: GeminiPart[] = [
    {
      text: `These are ${imgs.length} photos of an item for sale. Check if any photo contains a tape measure, ruler, or measuring tool. If yes, READ THE ACTUAL NUMBERS AND MARKINGS on the measuring tool — do NOT estimate or guess. Look at where the tape measure starts and ends against the object, read the inch/cm markings at those points, and calculate the exact measurement shown. Report the dimensions you READ from the tool. Format as a concise size string, e.g.: 9.5" L × 4" W or 14" H or 12" diameter. Also return the 0-based image index of the photo containing the measuring tool. If no measuring tool is visible, return empty string and -1. Return ONLY valid JSON: {"size": "string", "tapeIndex": number}`,
    },
  ];
  for (const url of imgs) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: dataUrlToBase64(url) } });
  }
  const result = await geminiCall('gemini-2.5-flash', [{ parts }], {
    responseMimeType: 'application/json',
  });
  try {
    const text = (result.candidates[0].content.parts[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    return { size: parsed.size || '', tapeIndex: parsed.tapeIndex ?? -1 };
  } catch {
    return { size: '', tapeIndex: -1 };
  }
}

// ─── Background removal (returns processed data URL or null) ────────
export async function geminiRemoveBackground(dataUrl: string): Promise<string | null> {
  const resized = await resizeImage(dataUrl, 1536);
  const base64 = dataUrlToBase64(resized);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await geminiCall(
        'gemini-2.5-flash-image',
        [
          {
            parts: [
              {
                text: 'Edit this photo. Output the edited image. Remove everything except the main object. Set the background to solid white. Keep the object in the same position and size. Improve the lighting on the object. Add a small soft shadow under the object.',
              },
              { inlineData: { mimeType: 'image/jpeg', data: base64 } },
            ],
          },
        ],
        { responseModalities: ['IMAGE', 'TEXT'] },
      );

      const parts = result.candidates[0].content.parts;
      const imgPart = parts.find(
        (p): p is { inlineData: { mimeType: string; data: string } } => 'inlineData' in p,
      );
      if (imgPart) {
        return `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
      }
    } catch (err) {
      console.warn(`[gemini] BG removal attempt ${attempt + 1} failed:`, err);
    }
  }
  return null;
}

// ─── AI suggestions for title/desc/category/maker/condition ─────────
export type Suggestions = {
  title?: string;
  description?: string;
  category?: string;
  maker?: string;
  condition?: string;
};

export async function geminiSuggest(dataUrls: string[]): Promise<Suggestions> {
  const thumbs = await Promise.all(dataUrls.slice(0, 4).map((u) => resizeImage(u, 768)));
  const parts: GeminiPart[] = [
    {
      text: 'You are cataloging items for a vintage/antique shop. Based on these photos, provide: a short title (2-5 words, title case, just what the object is), a description (one short factual sentence — material, color, era, style. Write it like a search-friendly label, e.g. "Small red ceramic vase" or "Mid-century walnut side table with tapered legs." Do NOT start with "This" or "A" or "An" or "Looks like" or "Features" or "Appears to be". No AI-sounding language. No marketing.), a category (exactly one of: wall-art, object, ceramic, furniture, light, sculpture, misc), a maker or brand if identifiable (empty string if unknown), and condition (brief description of visible wear — e.g. "Excellent", "Good, minor wear to edges" — empty string if can\'t tell). Return ONLY valid JSON: {"title": "string", "description": "string", "category": "string", "maker": "string", "condition": "string"}',
    },
  ];
  for (const url of thumbs) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: dataUrlToBase64(url) } });
  }
  const result = await geminiCall('gemini-2.5-flash', [{ parts }], {
    responseMimeType: 'application/json',
  });
  try {
    const text = (result.candidates[0].content.parts[0] as { text: string }).text;
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export { toTitleCase };
