import type { MosaicOptions } from './mosaic';

// Suggest good capture settings for a specific image, entirely client-side and
// heuristic (no ML): sample the image small and read how detailed, how
// colourful, how bright and how saturated it is, then pick cols / colours /
// boost / denoise. Only the "capture" options — style toggles stay the user's.

export interface Recommendation {
  cols: number;
  colors: number;
  boost: boolean;
  denoise: boolean;
  reason: string;
}

export function recommendSettings(image: HTMLImageElement): Recommendation {
  const w = 72;
  const sw = image.naturalWidth || image.width;
  const sh = image.naturalHeight || image.height;
  const h = Math.max(1, Math.round((w * sh) / sw));

  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  cx.drawImage(image, 0, 0, w, h);
  const d = cx.getImageData(0, 0, w, h).data;

  const luma = (i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

  let sumL = 0;
  let sumSat = 0;
  let rg = 0;
  let yb = 0;
  let rg2 = 0;
  let yb2 = 0;
  const n = w * h;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    sumL += luma(i);
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    sumSat += mx === 0 ? 0 : (mx - mn) / mx;
    const a1 = r - g;
    const a2 = 0.5 * (r + g) - b;
    rg += a1; yb += a2; rg2 += a1 * a1; yb2 += a2 * a2;
  }
  const brightness = sumL / n; // 0..255
  const sat = sumSat / n; // 0..1
  // Hasler–Süsstrunk colourfulness
  const stdRg = Math.sqrt(Math.max(0, rg2 / n - (rg / n) ** 2));
  const stdYb = Math.sqrt(Math.max(0, yb2 / n - (yb / n) ** 2));
  const meanRg = Math.abs(rg / n);
  const meanYb = Math.abs(yb / n);
  const colourfulness = Math.hypot(stdRg, stdYb) + 0.3 * Math.hypot(meanRg, meanYb);

  // busyness = mean absolute luminance difference between adjacent cells
  let diff = 0;
  let pairs = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (x + 1 < w) { diff += Math.abs(luma(i) - luma(i + 4)); pairs++; }
      if (y + 1 < h) { diff += Math.abs(luma(i) - luma(i + w * 4)); pairs++; }
    }
  }
  const busyness = pairs ? diff / pairs : 0; // 0..255

  const busy = busyness > 25 ? 'high' : busyness > 12 ? 'med' : 'low';
  const colour = colourfulness > 45 ? 'high' : colourfulness > 18 ? 'med' : 'low';
  const dark = brightness < 80;
  const vivid = sat > 0.5;

  const cols = busy === 'high' ? 56 : busy === 'med' ? 48 : 40;
  const colors = colour === 'high' ? 16 : colour === 'med' ? 12 : 9;
  const boost = !dark && !vivid; // dark → don't invent hues; vivid → no need
  const denoise = true;

  const detail = busy === 'high' ? 'עשירת פרטים' : busy === 'med' ? 'בינונית בפירוט' : 'פשוטה';
  const rich = colour === 'high' ? 'צבעונית מאוד' : colour === 'med' ? 'צבעונית' : 'דלת צבעים';
  let reason = `זיהיתי תמונה ${detail} ו${rich}${dark ? ' וכהה' : ''} → בחרתי ${cols} עמודות, ${colors} צבעים, `;
  reason += boost ? 'עם חיזוק צבעים.' : 'בלי חיזוק צבעים.';
  if (busy === 'high' && (dark || !vivid)) {
    reason += ' (תמונה מאתגרת — לתוצאה חדה יותר שקול לחתוך לנושא אחד.)';
  }

  return { cols, colors, boost, denoise, reason };
}

// convenience: fold a recommendation onto existing options
export function applyRecommendation(opts: MosaicOptions, r: Recommendation): MosaicOptions {
  return { ...opts, cols: r.cols, colors: r.colors, boost: r.boost, denoise: r.denoise };
}
