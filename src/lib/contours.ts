import type { Mosaic } from './mosaic';
import { hex } from './render';

export interface ColorRegion {
  color: number;
  cells: number[];
  path: string;
  x: number;
  y: number;
  fontSize: number;
}
export interface ContourMosaic extends Mosaic {
  regions: ColorRegion[];
}

function neighbors(i: number, w: number, h: number): number[] {
  const out: number[] = [];
  if (i % w) out.push(i - 1);
  if (i % w < w - 1) out.push(i + 1);
  if (i >= w) out.push(i - w);
  if (i < w * (h - 1)) out.push(i + w);
  return out;
}

/** Four-connected components: diagonal contact never joins two paint areas. */
export function components(m: Mosaic): { ids: Int32Array; groups: number[][] } {
  const ids = new Int32Array(m.grid.length).fill(-1);
  const groups: number[][] = [];
  for (let start = 0; start < ids.length; start++) {
    if (ids[start] !== -1) continue;
    const id = groups.length;
    const cells = [start];
    ids[start] = id;
    for (let k = 0; k < cells.length; k++) {
      for (const n of neighbors(cells[k], m.cols, m.rows)) {
        if (ids[n] === -1 && m.grid[n] === m.grid[start]) {
          ids[n] = id;
          cells.push(n);
        }
      }
    }
    groups.push(cells);
  }
  return { ids, groups };
}

/** Merge only into an adjacent color, retaining large features and holes. */
function mergeSmall(m: Mosaic, minimum: number): void {
  // Recompute connected components after each pass.
  for (let pass = 0; pass < 4; pass++) {
    const { groups } = components(m);
    let changed = false;
    for (const cells of groups.sort((a, b) => a.length - b.length)) {
      if (cells.length >= minimum) continue;
      const original = m.grid[cells[0]];
      const border = new Map<number, number>();
      for (const i of cells) {
        for (const n of neighbors(i, m.cols, m.rows)) {
          const c = m.grid[n];
          if (c !== original) border.set(c, (border.get(c) ?? 0) + 1);
        }
      }
      let best = original;
      let score = Infinity;
      for (const [color, contact] of border) {
        const distance = m.palette[color].reduce((s, c, k) => s + (c - m.palette[original][k]) ** 2, 0);
        const candidate = (distance + 100) / Math.sqrt(contact);
        if (candidate < score) { score = candidate; best = color; }
      }
      if (best !== original) {
        cells.forEach(i => { m.grid[i] = best; });
        changed = true;
      }
    }
    if (!changed) break;
  }
}

type Point = [number, number];
/** Trace directed pixel edges, including inner loops. Smooth only two-region
 * vertices, so both sides share exactly the same curve and junctions stay closed. */
function trace(cells: number[], id: number, ids: Int32Array, w: number, h: number): string {
  const stride = w + 1;
  const edges = new Map<number, number[]>();
  const add = (x: number, y: number, nx: number, ny: number) => {
    const a = y * stride + x;
    const list = edges.get(a) ?? [];
    list.push(ny * stride + nx);
    edges.set(a, list);
  };
  for (const i of cells) {
    const x = i % w, y = Math.floor(i / w);
    if (!y || ids[i - w] !== id) add(x, y, x + 1, y);
    if (x === w - 1 || ids[i + 1] !== id) add(x + 1, y, x + 1, y + 1);
    if (y === h - 1 || ids[i + w] !== id) add(x + 1, y + 1, x, y + 1);
    if (!x || ids[i - 1] !== id) add(x, y + 1, x, y);
  }
  const point = (v: number): Point => [v % stride, Math.floor(v / stride)];
  const midpoint = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const parts: string[] = [];
  while (edges.size) {
    const start = edges.keys().next().value as number;
    const loop: Point[] = [];
    let at = start;
    do {
      loop.push(point(at));
      const list = edges.get(at)!;
      const next = list.pop()!;
      if (!list.length) edges.delete(at);
      at = next;
    } while (at !== start);
    const first = midpoint(loop[loop.length - 1], loop[0]);
    parts.push(`M${first.join(' ')}`);
    loop.forEach((p, i) => {
      const next = midpoint(p, loop[(i + 1) % loop.length]);
      const [x, y] = p;
      const around = new Set<number>();
      if (x > 0 && x < w && y > 0 && y < h) {
        for (const k of [(y - 1) * w + x - 1, (y - 1) * w + x, y * w + x - 1, y * w + x]) around.add(ids[k]);
      }
      if (around.size === 2) parts.push(`Q${p.join(' ')} ${next.join(' ')}`);
      else parts.push(`L${p.join(' ')}L${next.join(' ')}`);
    });
    parts.push('Z');
  }
  return parts.join('');
}

export function buildContours(source: Mosaic, clean = true): ContourMosaic {
  const m: Mosaic = { ...source, grid: source.grid.slice() };
  mergeSmall(m, clean ? Math.max(12, Math.round(m.grid.length / 1800)) : 4);
  // Remove unused colors so legend numbers exactly match the finished areas.
  const used = [...new Set(m.grid)].sort((a, b) => a - b);
  const remap = new Map(used.map((c, i) => [c, i]));
  m.palette = used.map(c => m.palette[c]);
  m.grid = m.grid.map(c => remap.get(c)!);
  const { ids, groups } = components(m);
  // Chebyshev distance to the boundary: the chosen label square stays inside
  // the region, including concave shapes and regions containing holes.
  const depth = new Int32Array(m.grid.length);
  const queue: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    const x = i % m.cols, y = Math.floor(i / m.cols);
    let boundary = !x || !y || x === m.cols - 1 || y === m.rows - 1;
    for (let dy = -1; dy <= 1 && !boundary; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (ids[i + dy * m.cols + dx] !== ids[i]) boundary = true;
    }
    if (boundary) { depth[i] = 1; queue.push(i); }
  }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k], x = i % m.cols, y = Math.floor(i / m.cols);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx < 0 || x + dx >= m.cols || y + dy < 0 || y + dy >= m.rows) continue;
      const n = i + dy * m.cols + dx;
      if (!depth[n] && ids[n] === ids[i]) { depth[n] = depth[i] + 1; queue.push(n); }
    }
  }
  const regions = groups.map((cells, id): ColorRegion => {
    let center = cells[0];
    for (const i of cells) if (depth[i] > depth[center]) center = i;
    const color = m.grid[center];
    const digits = String(color + 1).length;
    return {
      color, cells, path: trace(cells, id, ids, m.cols, m.rows),
      x: center % m.cols + 0.5, y: Math.floor(center / m.cols) + 0.5,
      fontSize: Math.min(2.2 / m.cellMm, (depth[center] * 2 - 1) / Math.max(1.3, digits * 0.75)),
    };
  });
  return { ...m, regions };
}

export function contourSvg(m: ContourMosaic, colored = false): string {
  const w = (m.cols * m.cellMm).toFixed(2), h = (m.rows * m.cellMm).toFixed(2);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.cols} ${m.rows}" width="${w}mm" height="${h}mm" style="--pw:${w}mm;--ph:${h}mm" role="img" aria-label="${colored ? 'פתרון צבעוני' : 'צביעה לפי מספרים בקווי מתאר'}">`, `<rect width="${m.cols}" height="${m.rows}" fill="white"/>`];
  for (const r of m.regions) {
    const fill = colored ? hex(m.palette[r.color]) : 'white';
    parts.push(`<path d="${r.path}" fill="${fill}" fill-rule="evenodd" stroke="${colored ? fill : '#9299a0'}" stroke-width="${colored ? 0.12 : 0.12 / m.cellMm}" stroke-linejoin="round"/>`);
  }
  if (!colored) for (const r of m.regions) {
    parts.push(`<text x="${r.x}" y="${r.y}" font-size="${r.fontSize}" font-family="Arial,sans-serif" fill="#626971" text-anchor="middle" dominant-baseline="central">${r.color + 1}</text>`);
  }
  parts.push('</svg>');
  return parts.join('');
}
