import type { Mosaic } from './mosaic';

// Connected-component analysis of the cell grid, used to draw the puzzle in the
// classic paint-by-numbers style: one number per colour region (placed deep
// inside it) and a dark outline around each region. Pure geometry over grid[i];
// mosaic.ts is not involved.

export interface RegionLabel {
  x: number; // cell centre, in cell units
  y: number;
  fs: number; // font size that fits the region
  color: number; // palette index (number shown is color + 1)
}

export function regionData(m: Mosaic): { labels: RegionLabel[]; outline: string } {
  const { cols, rows, grid } = m;
  const n = cols * rows;
  const comp = new Int32Array(n).fill(-1);
  const cellsOf: number[][] = [];
  const colorOf: number[] = [];
  const stack: number[] = [];

  for (let s = 0; s < n; s++) {
    if (comp[s] !== -1) continue;
    const color = grid[s];
    const id = cellsOf.length;
    const cells: number[] = [];
    comp[s] = id;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop()!;
      cells.push(p);
      const x = p % cols;
      const y = (p / cols) | 0;
      if (x > 0 && comp[p - 1] === -1 && grid[p - 1] === color) { comp[p - 1] = id; stack.push(p - 1); }
      if (x < cols - 1 && comp[p + 1] === -1 && grid[p + 1] === color) { comp[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && comp[p - cols] === -1 && grid[p - cols] === color) { comp[p - cols] = id; stack.push(p - cols); }
      if (y < rows - 1 && comp[p + cols] === -1 && grid[p + cols] === color) { comp[p + cols] = id; stack.push(p + cols); }
    }
    cellsOf.push(cells);
    colorOf.push(color);
  }

  // distance from each cell to its region's edge (multi-source BFS), so the
  // number lands on the most interior cell where it has the most room.
  const dist = new Int32Array(n);
  const q: number[] = [];
  for (let p = 0; p < n; p++) {
    const x = p % cols;
    const y = (p / cols) | 0;
    let edge = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
    if (!edge) {
      const id = comp[p];
      edge = comp[p - 1] !== id || comp[p + 1] !== id || comp[p - cols] !== id || comp[p + cols] !== id;
    }
    if (edge) { dist[p] = 1; q.push(p); }
  }
  for (let head = 0; head < q.length; head++) {
    const p = q[head];
    const x = p % cols;
    const y = (p / cols) | 0;
    const d = dist[p] + 1;
    const id = comp[p];
    if (x > 0 && dist[p - 1] === 0 && comp[p - 1] === id) { dist[p - 1] = d; q.push(p - 1); }
    if (x < cols - 1 && dist[p + 1] === 0 && comp[p + 1] === id) { dist[p + 1] = d; q.push(p + 1); }
    if (y > 0 && dist[p - cols] === 0 && comp[p - cols] === id) { dist[p - cols] = d; q.push(p - cols); }
    if (y < rows - 1 && dist[p + cols] === 0 && comp[p + cols] === id) { dist[p + cols] = d; q.push(p + cols); }
  }

  const labels: RegionLabel[] = [];
  for (let id = 0; id < cellsOf.length; id++) {
    let best = cellsOf[id][0];
    let bd = -1;
    for (const p of cellsOf[id]) {
      if (dist[p] > bd) { bd = dist[p]; best = p; }
    }
    const fs = Math.min(1, Math.max(0.42, (bd * 2 - 1) * 0.5));
    labels.push({ x: (best % cols) + 0.5, y: ((best / cols) | 0) + 0.5, fs, color: colorOf[id] });
  }

  // outline: an edge wherever two cells belong to different regions, plus the border
  const seg: string[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const p = y * cols + x;
      if (x === 0) seg.push(`M${x} ${y}v1`);
      if (y === 0) seg.push(`M${x} ${y}h1`);
      if (x === cols - 1 || comp[p + 1] !== comp[p]) seg.push(`M${x + 1} ${y}v1`);
      if (y === rows - 1 || comp[p + cols] !== comp[p]) seg.push(`M${x} ${y + 1}h1`);
    }
  }
  return { labels, outline: seg.join('') };
}
