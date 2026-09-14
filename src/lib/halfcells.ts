import type { Mosaic } from './mosaic';

// Optional post-pass: where a cell straddles a colour boundary, split it into
// two regions (a diagonal or a straight half) so edges follow the boundary
// instead of stair-stepping. Lets a low-resolution, easy-to-colour grid keep
// smooth contours. buildMosaic is not involved — this samples the source image
// again, finely, and only reads the finished palette.

export type SplitType = 'slash' | 'backslash' | 'top' | 'left';
export interface Split {
  type: SplitType;
  /** palette index of the second (mask-false) region; the first region is grid[i] */
  b: number;
}
export type SplitMosaic = Mosaic & { splits: (Split | null)[] };

const lumaOf = (r: number, g: number, b: number): number =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

// region-A test in normalised cell coords u,v ∈ [0,1)
const MASKS: Record<SplitType, (u: number, v: number) => boolean> = {
  slash: (u, v) => u + v < 1, // "/" — region A is the upper-left triangle
  backslash: (u, v) => u < v, // "\" — region A is the lower-left triangle
  top: (_u, v) => v < 0.5,
  left: (u) => u < 0.5,
};
const TYPES: SplitType[] = ['slash', 'backslash', 'top', 'left'];

function majority(arr: number[]): [number, number] {
  const c = new Map<number, number>();
  let bi = arr[0];
  let bc = 0;
  for (const v of arr) {
    const n = (c.get(v) || 0) + 1;
    c.set(v, n);
    if (n > bc) {
      bc = n;
      bi = v;
    }
  }
  return [bi, bc];
}

export function splitEdges(m: Mosaic, image: HTMLImageElement, boost: boolean): SplitMosaic {
  const { cols, rows, palette } = m;
  const K = 6; // sub-samples per cell edge
  const fw = cols * K;
  const fh = rows * K;

  const cv = document.createElement('canvas');
  cv.width = fw;
  cv.height = fh;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  cx.imageSmoothingEnabled = true;
  cx.imageSmoothingQuality = 'high';
  cx.fillStyle = '#ffffff';
  cx.fillRect(0, 0, fw, fh);
  cx.drawImage(image, 0, 0, fw, fh);
  const data = cx.getImageData(0, 0, fw, fh).data;

  const nearest = (r: number, g: number, b: number): number => {
    if (boost) {
      const l = lumaOf(r, g, b);
      const A = 1.35;
      r = Math.max(0, Math.min(255, l + (r - l) * A));
      g = Math.max(0, Math.min(255, l + (g - l) * A));
      b = Math.max(0, Math.min(255, l + (b - l) * A));
    }
    let bi = 0;
    let bd = Infinity;
    for (let j = 0; j < palette.length; j++) {
      const p = palette[j];
      const dr = r - p[0];
      const dg = g - p[1];
      const db = b - p[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) {
        bd = d;
        bi = j;
      }
    }
    return bi;
  };

  const fine = new Int32Array(fw * fh);
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const i = (y * fw + x) * 4;
      fine[y * fw + x] = nearest(data[i], data[i + 1], data[i + 2]);
    }
  }

  const grid = m.grid.slice();
  const splits: (Split | null)[] = new Array(cols * rows).fill(null);
  const N = K * K;
  const marginToSplit = 0.14 * N; // a split must beat the whole cell by this much

  for (let cy = 0; cy < rows; cy++) {
    for (let cxi = 0; cxi < cols; cxi++) {
      const all: number[] = [];
      const uv: Array<{ idx: number; u: number; v: number }> = [];
      for (let j = 0; j < K; j++) {
        for (let i = 0; i < K; i++) {
          const idx = fine[(cy * K + j) * fw + (cxi * K + i)];
          all.push(idx);
          uv.push({ idx, u: (i + 0.5) / K, v: (j + 0.5) / K });
        }
      }
      const [wa, wc] = majority(all);
      let bestType: SplitType | null = null;
      let bestA = wa;
      let bestB = wa;
      let bestScore = wc;
      for (const t of TYPES) {
        const mask = MASKS[t];
        const tArr: number[] = [];
        const fArr: number[] = [];
        for (const p of uv) (mask(p.u, p.v) ? tArr : fArr).push(p.idx);
        if (!tArr.length || !fArr.length) continue;
        const [ta, tc] = majority(tArr);
        const [fa, fc] = majority(fArr);
        if (ta === fa) continue;
        const score = tc + fc;
        if (score > bestScore) {
          bestScore = score;
          bestType = t;
          bestA = ta;
          bestB = fa;
        }
      }
      const ci = cy * cols + cxi;
      if (bestType && bestScore - wc >= marginToSplit) {
        grid[ci] = bestA;
        splits[ci] = { type: bestType, b: bestB };
      }
    }
  }

  return { ...m, grid, splits };
}
