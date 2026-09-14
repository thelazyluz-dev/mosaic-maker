import type { Mosaic, RGB } from './mosaic';
import type { Split, SplitType } from './halfcells';
import { regionData } from './regions';
import { NAMED_COLORS } from './palette';

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

export function colorName(c: RGB): string {
  let best = NAMED_COLORS[0].name;
  let bd = Infinity;
  for (const { name, rgb } of NAMED_COLORS) {
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
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

export function puzzleSvg(
  m: RenderMosaic,
  opts: { regionNumbers?: boolean; outlines?: boolean } = {},
): string {
  const fs = 0.56;
  const fss = 0.42; // smaller digits for the two halves of a split cell
  const splits = m.splits;
  const rd = opts.regionNumbers || opts.outlines ? regionData(m) : null;
  const parts: string[] = [open(m)];
  parts.push(`<rect width="${m.cols}" height="${m.rows}" fill="#ffffff"/>`);

  // divider lines for split cells — shown in every mode when half-cells are on
  const seps: string[] = [];
  if (splits) {
    for (let i = 0; i < splits.length; i++) {
      const s = splits[i];
      if (!s) continue;
      const x = i % m.cols;
      const y = (i / m.cols) | 0;
      const [x1, y1, x2, y2] = SEPARATOR[s.type];
      seps.push(`M${x + x1} ${y + y1}L${x + x2} ${y + y2}`);
    }
  }

  parts.push(
    `<g font-family="Heebo, Arial, sans-serif" font-size="${fs}" text-anchor="middle" fill="#3C4855">`,
  );
  if (opts.regionNumbers && rd) {
    // one number per connected colour region, at its most interior cell
    for (const L of rd.labels) {
      parts.push(
        `<text x="${L.x.toFixed(2)}" y="${(L.y + L.fs * 0.35).toFixed(2)}" ` +
          `font-size="${L.fs.toFixed(2)}">${L.color + 1}</text>`,
      );
    }
  } else {
    for (let y = 0; y < m.rows; y++) {
      for (let x = 0; x < m.cols; x++) {
        const i = y * m.cols + x;
        const s = splits?.[i];
        if (!s) {
          parts.push(
            `<text x="${x + 0.5}" y="${(y + 0.5 + fs * 0.35).toFixed(2)}">${m.grid[i] + 1}</text>`,
          );
          continue;
        }
        const c = CENTROID[s.type];
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
  }
  parts.push('</g>');

  parts.push(gridLines(m.cols, m.rows));
  if (opts.outlines && rd) {
    parts.push(`<path d="${rd.outline}" stroke="#16202B" stroke-width="0.07" fill="none"/>`);
  }
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
