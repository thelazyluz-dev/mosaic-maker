# מוזאיקת מספרים / Mosaic Maker

Turns any image into a printable colour-by-number mosaic: a numbered grid sheet,
a Hebrew colour legend and a solution sheet. Everything runs in the browser —
no upload, no server, no keys.

## Run locally

```bash
npm install
npm run dev
```

## Deploy

Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and
publishes to GitHub Pages. Enable it once under **Settings → Pages → Source:
GitHub Actions**.

`vite.config.ts` uses `base: './'`, so the same build works on a project page,
a custom domain, or Cloudflare Pages without changes.

## How it works

`src/lib/mosaic.ts` — image → grid:
1. downscale by repeated halving so each cell averages its source pixels
2. optional saturation boost, so pencil colours stay distinguishable
3. k-means (k-means++ seeding) to quantize to N colours
4. denoise: a cell with no same-coloured neighbour is absorbed into its surroundings
5. drop empty clusters, sort the palette light → dark, number from 1

`src/lib/render.ts` — grid → SVG, sized in millimetres so the print is exact.
Guide lines are heavier every 5 cells. Cell size is derived from the A4
printable area, so the sheet always fits.

## Ideas next

- real PDF export (jsPDF/svg2pdf) instead of browser print
- gallery of ready-made sheets
- English + more languages
- batch mode: a folder of images in, PDFs out

## Contour mode

Choose **קווי מתאר** for freeform paint-by-number areas, or **רשת משבצות**
for the original mosaic. Contour mode samples at a higher resolution, merges
small connected areas into adjacent colors, traces closed boundaries (including
holes), and places one number inside each area. The detail slider and color
count control complexity. Both the outline sheet and colored solution use the
same region paths. Half-cell and grid-outline controls apply only to grid mode.
Very narrow regions can still require small numbers; the UI flags this for print.

### Verify contour geometry

```bash
npm run typecheck
npm run build
./node_modules/.bin/esbuild tests/contours.test.ts --bundle --platform=node --outfile=/tmp/mosaic-contours-test.cjs
node /tmp/mosaic-contours-test.cjs
```
