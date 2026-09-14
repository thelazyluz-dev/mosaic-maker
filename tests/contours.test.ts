import assert from 'node:assert/strict';
import { buildContours, components, contourSvg } from '../src/lib/contours';
import type { Mosaic } from '../src/lib/mosaic';

function fixture(w: number, h: number, color: (x: number, y: number) => number): Mosaic {
  return { cols: w, rows: h, cellMm: 1, palette: [[255,255,255],[0,0,0],[255,0,0]],
    grid: Int32Array.from({length: w*h}, (_, i) => color(i%w, Math.floor(i/w))) };
}
const diagonal = fixture(2, 2, (x,y) => x === y ? 0 : 1);
assert.equal(components(diagonal).groups.length, 4);
const ring = fixture(30, 30, (x,y) => x >= 8 && x < 22 && y >= 8 && y < 22 ? 1 : 0);
const result = buildContours(ring);
assert.equal(result.regions.length, 2);
assert.equal((result.regions[0].path.match(/Z/g) ?? []).length, 2, 'preserve the inner hole');
for (const r of result.regions) {
  assert.equal(result.grid[Math.floor(r.y)*30+Math.floor(r.x)], r.color, 'label inside its region');
  assert(r.fontSize > 0);
}
assert.equal((contourSvg(result).match(/<text /g) ?? []).length, 2);
assert(!contourSvg(result,true).includes('<text'));
const speck = fixture(20,20,(x,y) => x===10 && y===10 ? 1 : 0);
assert.equal(buildContours(speck).regions.length, 1);
assert.equal(speck.grid[210], 1, 'do not mutate source');
const concave = buildContours(fixture(30,30,(x,y) => x<8 || y<8 ? 1 : 0));
for (const r of concave.regions) assert.equal(concave.grid[Math.floor(r.y)*30+Math.floor(r.x)],r.color);
console.log('PASS: diagonal separation, holes, interior labels, small-region merge, palette compaction, source immutability');
