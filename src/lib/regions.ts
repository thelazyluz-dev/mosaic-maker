import type { Mosaic } from './mosaic';

// A dark outline around every colour region for the puzzle sheet: a segment
// wherever two adjacent cells differ in colour, plus the outer border. Pure
// geometry over grid[i]; mosaic.ts is not involved.
export function outlinePath(m: Mosaic): string {
  const { cols, rows, grid } = m;
  const seg: string[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const p = y * cols + x;
      if (x === 0) seg.push(`M${x} ${y}v1`);
      if (y === 0) seg.push(`M${x} ${y}h1`);
      if (x === cols - 1 || grid[p + 1] !== grid[p]) seg.push(`M${x + 1} ${y}v1`);
      if (y === rows - 1 || grid[p + cols] !== grid[p]) seg.push(`M${x} ${y + 1}h1`);
    }
  }
  return seg.join('');
}
