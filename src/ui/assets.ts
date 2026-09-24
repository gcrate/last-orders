// Asset manifest loader. Real art in assets/ wins; otherwise a generated placeholder PNG from
// assets/placeholders/ (npm run placeholders); otherwise the Sprite component draws a
// coloured block with a label. Development never blocks on art.

import manifest from '../../assets/manifest.json';

export interface AssetEntry {
  id: string;
  file: string;
  size: [number, number];
  usage: string;
  prompt: string;
}

const files = import.meta.glob('../../assets/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byId = new Map<string, AssetEntry>((manifest.assets as AssetEntry[]).map((a) => [a.id, a]));

export interface ResolvedAsset {
  id: string;
  url: string | null;
  size: [number, number];
  placeholder: boolean;
}

export function resolveAsset(id: string, fallbackSize: [number, number] = [32, 32]): ResolvedAsset {
  const entry = byId.get(id);
  if (!entry) return { id, url: null, size: fallbackSize, placeholder: true };
  const real = files[`../../assets/${entry.file}`];
  if (real) return { id, url: real, size: entry.size, placeholder: false };
  const ph = files[`../../assets/placeholders/${entry.file}`];
  return { id, url: ph ?? null, size: entry.size, placeholder: true };
}

/** Same hue scheme as tools/placeholders.ts, for the CSS fallback block. */
export function placeholderColour(id: string): string {
  let h = 2166136261;
  const key = id.split('_')[0];
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return `hsl(${(h >>> 0) % 360} 28% 32%)`;
}
