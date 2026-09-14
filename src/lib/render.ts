import type { Mosaic, RGB } from './mosaic';
import type { Split, SplitType } from './halfcells';

type RenderMosaic = Mosaic & { splits?: (Split | null)[] };

// Geometry of a split cell, in cell-local coordinates (0..1), offset by x,y.
// Region A is the mask-true region (its colour is grid[i]); region B is grid.b.
const CENTROID: Record<SplitType, { a: [number, number]; b: [number, number] }> = {
  slash: { a: [1 / 3, 1 / 3], b: [2 / 3, 2 / 3] },
  backslash: { a: [1 / 3, 2 / 3], b: [2 / 3, 1 / 3] },
  top: { a: [0.5, 0.3], b: [0.5, 0.8] },
  left: { a: [0.25, 0.5], b: [0.75, 0.5] },
};
const SEPARATOR: Record<SplitType, [number, number, number, number]> = {
  slash: [1, 0, 0, 1],
  backslash: [0, 0, 1, 1],
  top: [0, 0.5, 1, 0.5],
  left: [0.5, 0, 0.5, 1],
};
const B_REGION: Record<SplitType, Array<[number, number]>> = {
  slash: [[1, 0], [1, 1], [0, 1]],
  backslash: [[0, 0], [1, 0], [1, 1]],
  top: [[0, 0.5], [1, 0.5], [1, 1], [0, 1]],
  left: [[0.5, 0], [1, 0], [1, 1], [0.5, 1]],
};

export function hex(c: RGB): string {
  return (
    '#' +
    [0, 1, 2]
      .map((i) => {
        const v = Math.max(0, Math.min(255, Math.round(c[i]))).toString(16);
        return v.length < 2 ? '0' + v : v;
      })
      .join('')
  );
}

const NAMES: Array<[string, number, number, number]> = [
  ['לבן', 255, 255, 255],
  ['שחור', 20, 20, 20],
  ['אפור', 140, 140, 140],
  ['אפור בהיר', 205, 205, 205],
  ['אדום', 215, 35, 35],
  ['בורדו', 130, 25, 45],
  ['ורוד', 244, 150, 180],
  ['כתום', 242, 140, 35],
  ['צהוב', 248, 220, 55],
  ['חרדל', 205, 170, 60],
  ['חום', 125, 80, 45],
  ["בז'", 232, 210, 175],
  ['ירוק', 45, 155, 70],
  ['ירוק כהה', 25, 90, 50],
  ['ירוק בהיר', 155, 210, 100],
  ['טורקיז', 45, 185, 180],
  ['כחול', 45, 90, 200],
  ['כחול כהה', 25, 45, 110],
  ['תכלת', 130, 195, 235],
  ['סגול', 130, 60, 175],
  ['לילך', 185, 160, 215],
];

export function colorName(c: RGB): string {
  let best = NAMES[0][0];
  let bd = Infinity;
  for (const [name, r, g, b] of NAMES) {
    const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2;
    if (d < bd) {
      bd = d;
      best = name;
    }
  }
  return best;
}

function open(m: Mosaic): string {
  const w = (m.cellMm * m.cols).toFixed(2);
  const h = (m.cellMm * m.rows).toFixed(2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.cols} ${m.rows}" ` +
    `style="--pw:${w}mm;--ph:${h}mm" width="${w}mm" height="${h}mm" ` +
    `shape-rendering="crispEdges" role="img">`
  );
}

/** Thin lines every cell, heavier every 5 — the counting aid real mosaics use. */
function gridLines(cols: number, rows: number): string {
  const thin: string[] = [];
  const thick: string[] = [];
  for (let x = 0; x <= cols; x++) (x % 5 === 0 ? thick : thin).push(`M${x} 0V${rows}`);
  for (let y = 0; y <= rows; y++) (y % 5 === 0 ? thick : thin).push(`M0 ${y}H${cols}`);
  return (
    `<path d="${thin.join('')}" stroke="#C2C9D2" stroke-width="0.035" fill="none"/>` +
    `<path d="${thick.join('')}" stroke="#8C97A3" stroke-width="0.06" fill="none"/>`
  );
}

export function puzzleSvg(m: RenderMosaic): string {
  const fs = 0.56;
  const fss = 0.42; // smaller digits for the two halves of a split cell
  const splits = m.splits;
  const parts: string[] = [open(m)];
  parts.push(`<rect width="${m.cols}" height="${m.rows}" fill="#ffffff"/>`);
  const seps: string[] = [];
  parts.push(
    `<g font-family="Heebo, Arial, sans-serif" font-size="${fs}" text-anchor="middle" fill="#3C4855">`,
  );
  for (let y = 0; y < m.rows; y++) {
    for (let x = 0; x < m.cols; x++) {
      const i = y * m.cols + x;
      const s = splits?.[i];
      if (!s) {
        const n = m.grid[i] + 1;
        parts.push(`<text x="${x + 0.5}" y="${(y + 0.5 + fs * 0.35).toFixed(2)}">${n}</text>`);
        continue;
      }
      const c = CENTROID[s.type];
      const [x1, y1, x2, y2] = SEPARATOR[s.type];
      seps.push(`M${x + x1} ${y + y1}L${x + x2} ${y + y2}`);
      parts.push(
        `<text x="${(x + c.a[0]).toFixed(2)}" y="${(y + c.a[1] + fss * 0.35).toFixed(2)}" ` +
          `font-size="${fss}">${m.grid[i] + 1}</text>`,
      );
      parts.push(
        `<text x="${(x + c.b[0]).toFixed(2)}" y="${(y + c.b[1] + fss * 0.35).toFixed(2)}" ` +
          `font-size="${fss}">${s.b + 1}</text>`,
      );
    }
  }
  parts.push('</g>');
  parts.push(gridLines(m.cols, m.rows));
  if (seps.length) {
    parts.push(`<path d="${seps.join('')}" stroke="#8C97A3" stroke-width="0.05" fill="none"/>`);
  }
  parts.push('</svg>');
  return parts.join('');
}

export function solutionSvg(m: RenderMosaic): string {
  const splits = m.splits;
  const parts: string[] = [open(m)];
  for (let y = 0; y < m.rows; y++) {
    for (let x = 0; x < m.cols; x++) {
      const i = y * m.cols + x;
      // 1.02 overlap hides hairline seams between cells in print
      parts.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${hex(m.palette[m.grid[i]])}"/>`);
      const s = splits?.[i];
      if (s) {
        const pts = B_REGION[s.type].map(([px, py]) => `${x + px},${y + py}`).join(' ');
        parts.push(`<polygon points="${pts}" fill="${hex(m.palette[s.b])}"/>`);
      }
    }
  }
  parts.push(
    `<rect x="0" y="0" width="${m.cols}" height="${m.rows}" fill="none" stroke="#16202B" stroke-width="0.08"/>`,
  );
  parts.push('</svg>');
  return parts.join('');
}
