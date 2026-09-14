export type RGB = [number, number, number];

export interface MosaicOptions {
  /** grid width in cells */
  cols: number;
  /** number of colours in the palette */
  colors: number;
  /** absorb single cells that have no same-coloured neighbour */
  denoise: boolean;
  /** push saturation so pencil colours stay distinguishable */
  boost: boolean;
}

export interface Mosaic {
  cols: number;
  rows: number;
  /** palette index per cell, row-major */
  grid: Int32Array;
  palette: RGB[];
  /** printed cell size in millimetres */
  cellMm: number;
}

/** Printable area inside A4 with 9mm margins, minus room for the title. */
export const PAGE_W_MM = 192;
export const PAGE_H_MM = 250;

/**
 * Downscale with repeated halving so each cell is a true average of the
 * source pixels. A single drawImage() to a tiny canvas aliases badly.
 */
function downscale(image: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
  let cw = image.naturalWidth || image.width;
  let ch = image.naturalHeight || image.height;

  let src = document.createElement('canvas');
  src.width = cw;
  src.height = ch;
  src.getContext('2d')!.drawImage(image, 0, 0);

  while (cw > w * 2 && ch > h * 2) {
    const nw = Math.max(w, Math.floor(cw / 2));
    const nh = Math.max(h, Math.floor(ch / 2));
    const tmp = document.createElement('canvas');
    tmp.width = nw;
    tmp.height = nh;
    const tx = tmp.getContext('2d')!;
    tx.imageSmoothingEnabled = true;
    tx.imageSmoothingQuality = 'high';
    tx.drawImage(src, 0, 0, cw, ch, 0, 0, nw, nh);
    src = tmp;
    cw = nw;
    ch = nh;
  }

  const fin = document.createElement('canvas');
  fin.width = w;
  fin.height = h;
  const fx = fin.getContext('2d', { willReadFrequently: true })!;
  fx.imageSmoothingEnabled = true;
  fx.imageSmoothingQuality = 'high';
  fx.fillStyle = '#ffffff';
  fx.fillRect(0, 0, w, h);
  fx.drawImage(src, 0, 0, cw, ch, 0, 0, w, h);
  return fx.getImageData(0, 0, w, h).data;
}

function luma(c: RGB): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function saturate(px: RGB[], amount: number): void {
  for (const p of px) {
    const l = luma(p);
    for (let c = 0; c < 3; c++) {
      p[c] = Math.max(0, Math.min(255, l + (p[c] - l) * amount));
    }
  }
}

function dist2(a: RGB, b: RGB): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/** k-means with k-means++ seeding. Deterministic enough for a few thousand cells. */
function kmeans(data: RGB[], k: number, iters = 14): { centers: RGB[]; labels: Int32Array } {
  const n = data.length;
  k = Math.max(1, Math.min(k, n));

  const centers: RGB[] = [[...data[(Math.random() * n) | 0]] as RGB];
  const best = new Float64Array(n).fill(Infinity);

  while (centers.length < k) {
    const c = centers[centers.length - 1];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const d = dist2(data[i], c);
      if (d < best[i]) best[i] = d;
      sum += best[i];
    }
    if (sum <= 0) {
      centers.push([...data[(Math.random() * n) | 0]] as RGB);
      continue;
    }
    let r = Math.random() * sum;
    let pick = 0;
    for (let i = 0; i < n; i++) {
      r -= best[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    centers.push([...data[pick]] as RGB);
  }

  const labels = new Int32Array(n);
  for (let it = 0; it <= iters; it++) {
    for (let i = 0; i < n; i++) {
      let bi = 0;
      let bd = Infinity;
      for (let j = 0; j < centers.length; j++) {
        const d = dist2(data[i], centers[j]);
        if (d < bd) {
          bd = d;
          bi = j;
        }
      }
      labels[i] = bi;
    }
    if (it === iters) break;

    const sums = Array.from({ length: centers.length }, () => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const s = sums[labels[i]];
      s[0] += data[i][0];
      s[1] += data[i][1];
      s[2] += data[i][2];
      s[3]++;
    }
    for (let j = 0; j < centers.length; j++) {
      const s = sums[j];
      centers[j] = s[3] > 0
        ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]]
        : ([...data[(Math.random() * n) | 0]] as RGB);
    }
  }

  return { centers, labels };
}

/**
 * A cell with no same-coloured neighbour is unpaintable in practice —
 * replace it with the dominant colour around it.
 */
function denoiseGrid(labels: Int32Array, cols: number, rows: number, passes: number): Int32Array {
  let cur = labels;
  for (let p = 0; p < passes; p++) {
    const next = cur.slice();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const me = cur[y * cols + x];
        const tally = new Map<number, number>();
        let same = 0;
        let bestLabel = me;
        let bestCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const l = cur[ny * cols + nx];
            if (l === me) same++;
            const t = (tally.get(l) ?? 0) + 1;
            tally.set(l, t);
            if (t > bestCount) {
              bestCount = t;
              bestLabel = l;
            }
          }
        }
        if (same === 0) next[y * cols + x] = bestLabel;
      }
    }
    cur = next;
  }
  return cur;
}

export function buildMosaic(image: HTMLImageElement, opts: MosaicOptions): Mosaic {
  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;

  let cols = Math.max(8, Math.round(opts.cols));
  let rows = Math.max(4, Math.round((cols * srcH) / srcW));

  // keep the sheet inside A4 portrait
  const maxRows = Math.floor((cols * PAGE_H_MM) / PAGE_W_MM);
  if (rows > maxRows) {
    cols = Math.max(8, Math.round((cols * maxRows) / rows));
    rows = Math.max(4, Math.round((cols * srcH) / srcW));
  }

  const data = downscale(image, cols, rows);
  const px: RGB[] = [];
  for (let i = 0; i < cols * rows; i++) {
    px.push([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  }
  if (opts.boost) saturate(px, 1.35);

  const { centers, labels } = kmeans(px, opts.colors);
  const cleaned = opts.denoise ? denoiseGrid(labels, cols, rows, 2) : labels;

  // drop unused clusters, order light → dark, remap indices
  const used = new Set<number>();
  for (let i = 0; i < cleaned.length; i++) used.add(cleaned[i]);
  const order = [...used].sort((a, b) => luma(centers[b]) - luma(centers[a]));

  const remap = new Map<number, number>();
  const palette: RGB[] = [];
  order.forEach((oldIdx, newIdx) => {
    remap.set(oldIdx, newIdx);
    palette.push(centers[oldIdx]);
  });

  const grid = new Int32Array(cleaned.length);
  for (let i = 0; i < cleaned.length; i++) grid[i] = remap.get(cleaned[i])!;

  const cellMm = Math.min(PAGE_W_MM / cols, PAGE_H_MM / rows);
  return { cols, rows, grid, palette, cellMm };
}
