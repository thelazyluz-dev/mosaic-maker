import type { Mosaic, RGB } from './mosaic';

// A post-processing pass over a finished Mosaic (buildMosaic is untouched):
// collapse each colour "family" to at most N shades, so the sheet can be
// coloured with a normal pencil set instead of ten near-identical browns.

const luma = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

function toHsl(c: RGB): [number, number, number] {
  const r = c[0] / 255;
  const g = c[1] / 255;
  const b = c[2] / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const d = mx - mn;
  let h = 0;
  let s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

/**
 * Which "colour a person owns" a palette entry belongs to. Pale and neutral
 * colours get their own families first — otherwise a near-white highlight or
 * a hazy glow gets pulled into green/orange and merged into the wrong shade.
 */
function family(c: RGB): string {
  const [h, s, l] = toHsl(c);
  if (l >= 0.85) return 'light'; // near-white: eye whites, sky glow, highlights
  if (l <= 0.1) return 'black';
  if (s < 0.12) return 'gray';
  // warm, dark and not too vivid reads as brown, not orange/red
  if ((h < 50 || h >= 345) && l < 0.55 && s < 0.8) return 'brown';
  if (h < 15 || h >= 345) return 'red';
  if (h < 45) return 'orange';
  if (h < 65) return 'yellow';
  if (h < 170) return 'green';
  if (h < 200) return 'cyan';
  if (h < 255) return 'blue';
  if (h < 300) return 'purple';
  return 'pink';
}

/**
 * Return a new Mosaic whose palette has at most `maxPerFamily` shades of every
 * colour family. Within a family the shades are split by lightness and each
 * band is replaced by its usage-weighted average, so the kept shades track the
 * light/mid/dark tones that actually cover area. `mosaic.ts` is not involved.
 */
export function capShades(m: Mosaic, maxPerFamily: number): Mosaic {
  if (!maxPerFamily || maxPerFamily < 1 || m.palette.length <= maxPerFamily) return m;

  const counts = new Array(m.palette.length).fill(0);
  for (let i = 0; i < m.grid.length; i++) counts[m.grid[i]]++;

  const groups = new Map<string, number[]>();
  m.palette.forEach((c, i) => {
    const f = family(c);
    const g = groups.get(f);
    if (g) g.push(i);
    else groups.set(f, [i]);
  });

  // old palette index -> representative colour (shared array ref per kept shade)
  const repOf = new Array<RGB>(m.palette.length);

  for (const idxs of groups.values()) {
    if (idxs.length <= maxPerFamily) {
      for (const i of idxs) repOf[i] = m.palette[i];
      continue;
    }
    const sorted = idxs.slice().sort((a, b) => luma(m.palette[a]) - luma(m.palette[b]));
    const lo = luma(m.palette[sorted[0]]);
    const span = luma(m.palette[sorted[sorted.length - 1]]) - lo || 1;
    const bands: number[][] = Array.from({ length: maxPerFamily }, () => []);
    for (const i of sorted) {
      let b = Math.floor(((luma(m.palette[i]) - lo) / span) * maxPerFamily);
      if (b >= maxPerFamily) b = maxPerFamily - 1;
      bands[b].push(i);
    }
    for (const band of bands) {
      if (!band.length) continue;
      let r = 0;
      let g = 0;
      let bl = 0;
      let w = 0;
      for (const i of band) {
        const c = m.palette[i];
        const k = counts[i] || 1;
        r += c[0] * k;
        g += c[1] * k;
        bl += c[2] * k;
        w += k;
      }
      const rep: RGB = [r / w, g / w, bl / w];
      for (const i of band) repOf[i] = rep;
    }
  }

  // unique representatives -> new palette, ordered light → dark like buildMosaic
  const refToIdx = new Map<RGB, number>();
  const uniq: RGB[] = [];
  for (let i = 0; i < m.palette.length; i++) {
    const rep = repOf[i];
    if (!refToIdx.has(rep)) {
      refToIdx.set(rep, uniq.length);
      uniq.push(rep);
    }
  }
  const order = uniq.map((_, i) => i).sort((a, b) => luma(uniq[b]) - luma(uniq[a]));
  const palette = order.map((o) => uniq[o]);
  const uniqToNew = new Map<number, number>();
  order.forEach((o, n) => uniqToNew.set(o, n));

  const oldToNew = new Int32Array(m.palette.length);
  for (let i = 0; i < m.palette.length; i++) {
    oldToNew[i] = uniqToNew.get(refToIdx.get(repOf[i])!)!;
  }
  const grid = new Int32Array(m.grid.length);
  for (let i = 0; i < m.grid.length; i++) grid[i] = oldToNew[m.grid[i]];

  return { ...m, palette, grid };
}

// A fixed set of standard, nameable colours — roughly a colored-pencil box.
// Snapping to it guarantees every colour on the sheet is one a person can
// actually pick, and gives the legend an exact Hebrew name.
export const NAMED_COLORS: Array<{ name: string; rgb: RGB }> = [
  { name: 'לבן', rgb: [255, 255, 255] },
  { name: 'שחור', rgb: [20, 20, 20] },
  { name: 'אפור', rgb: [140, 140, 140] },
  { name: 'אפור בהיר', rgb: [205, 205, 205] },
  { name: 'אדום', rgb: [215, 35, 35] },
  { name: 'בורדו', rgb: [130, 25, 45] },
  { name: 'ורוד', rgb: [244, 150, 180] },
  { name: 'כתום', rgb: [242, 140, 35] },
  { name: 'צהוב', rgb: [248, 220, 55] },
  { name: 'חרדל', rgb: [205, 170, 60] },
  { name: 'חום', rgb: [125, 80, 45] },
  { name: 'חום בהיר', rgb: [178, 128, 90] },
  { name: 'שזוף', rgb: [216, 172, 132] },
  { name: "בז'", rgb: [232, 210, 175] },
  { name: 'ירוק', rgb: [45, 155, 70] },
  { name: 'ירוק כהה', rgb: [25, 90, 50] },
  { name: 'ירוק בהיר', rgb: [155, 210, 100] },
  { name: 'טורקיז', rgb: [45, 185, 180] },
  { name: 'כחול', rgb: [45, 90, 200] },
  { name: 'כחול כהה', rgb: [25, 45, 110] },
  { name: 'תכלת', rgb: [130, 195, 235] },
  { name: 'סגול', rgb: [130, 60, 175] },
  { name: 'לילך', rgb: [185, 160, 215] },
];

/**
 * Snap every palette colour to the nearest standard named colour, merging
 * duplicates. The result uses only real, nameable colours; the legend then
 * shows each one's exact Hebrew name. mosaic.ts is not involved.
 */
export function snapToNamed(m: Mosaic): Mosaic {
  if (!m.palette.length) return m;
  const named = NAMED_COLORS.map((c) => c.rgb);

  const repOf: RGB[] = m.palette.map((c) => {
    let bi = 0;
    let bd = Infinity;
    for (let j = 0; j < named.length; j++) {
      const p = named[j];
      const dr = c[0] - p[0];
      const dg = c[1] - p[1];
      const db = c[2] - p[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) {
        bd = d;
        bi = j;
      }
    }
    return named[bi];
  });

  const refToIdx = new Map<RGB, number>();
  const uniq: RGB[] = [];
  for (const rep of repOf) {
    if (!refToIdx.has(rep)) {
      refToIdx.set(rep, uniq.length);
      uniq.push(rep);
    }
  }
  const order = uniq.map((_, i) => i).sort((a, b) => luma(uniq[b]) - luma(uniq[a]));
  const palette = order.map((o) => uniq[o]);
  const uniqToNew = new Map<number, number>();
  order.forEach((o, n) => uniqToNew.set(o, n));

  const grid = new Int32Array(m.grid.length);
  for (let i = 0; i < m.grid.length; i++) {
    grid[i] = uniqToNew.get(refToIdx.get(repOf[m.grid[i]])!)!;
  }
  return { ...m, palette, grid };
}
