import { useCallback, useRef, useState } from 'react';
import { buildMosaic, type Mosaic, type MosaicOptions } from './lib/mosaic';
import { capShades } from './lib/palette';
import { splitEdges } from './lib/halfcells';
import { colorName, hex, puzzleSvg, solutionSvg } from './lib/render';

interface Preset {
  label: string;
  cols: number;
  colors: number;
  /** presets tuned for a faithful picture turn denoise off to keep detail */
  denoise?: boolean;
}

const PRESETS: Preset[] = [
  { label: 'ילדים · 20 עמודות', cols: 20, colors: 6 },
  { label: 'בינוני · 35 עמודות', cols: 35, colors: 9 },
  { label: 'מבוגרים · 50 עמודות', cols: 50, colors: 12 },
  { label: 'מומחה · 70 עמודות', cols: 70, colors: 16 },
  { label: 'מפורט · הכי נאמן', cols: 90, colors: 24, denoise: false },
];

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [thumb, setThumb] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [hot, setHot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(
    'לתמונות של אנשים חתכו קרוב לנושא. לתוצאה נאמנה ופחות "מופשטת" בחרו "מפורט" או הגדילו את מספר הצבעים.',
  );
  const [warn, setWarn] = useState(false);

  const [opts, setOpts] = useState<MosaicOptions>({
    cols: 50,
    colors: 12,
    denoise: true,
    boost: true,
  });
  const [withSolution, setWithSolution] = useState(true);
  const [mosaic, setMosaic] = useState<Mosaic | null>(null);

  // max shades per colour family (0 = no limit). Kept in a ref so the stable
  // generate() callback always reads the current value.
  const [maxShades, setMaxShades] = useState(3);
  const maxShadesRef = useRef(3);

  // split edge cells into two triangles for smoother contours (off by default)
  const [smoothEdges, setSmoothEdges] = useState(false);
  const smoothEdgesRef = useRef(false);

  // puzzle-sheet style — render-only, no recompute needed (both off by default)
  const [regionNumbers, setRegionNumbers] = useState(false);
  const [outlines, setOutlines] = useState(false);

  const say = (text: string, isWarning = false) => {
    setNote(text);
    setWarn(isWarning);
  };

  const generate = useCallback(
    (o: MosaicOptions) => {
      const img = imageRef.current;
      if (!img) return;
      setBusy(true);
      // let the button state paint before the synchronous work starts
      window.setTimeout(() => {
        try {
          const built = buildMosaic(img, o);
          const capped = maxShadesRef.current ? capShades(built, maxShadesRef.current) : built;
          const m = smoothEdgesRef.current ? splitEdges(capped, img, o.boost) : capped;
          setMosaic(m);
          if (m.cellMm < 3.2) {
            say(
              `הרשת צפופה (${m.cols}×${m.rows}, משבצת ${m.cellMm.toFixed(1)} מ"מ) — הדפס על A4 מלא או הקטן את רוחב הרשת.`,
              true,
            );
          } else {
            say(
              `רשת ${m.cols}×${m.rows}, ${m.palette.length} צבעים, משבצת ${m.cellMm.toFixed(1)} מ"מ.`,
            );
          }
        } catch {
          say('משהו השתבש בעיבוד התמונה. נסה קובץ אחר.', true);
        } finally {
          setBusy(false);
        }
      }, 0);
    },
    [],
  );

  const loadFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      say('הקובץ אינו תמונה. בחר JPG, PNG או WEBP.', true);
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setThumb(url);
      setFileName(`${file.name} — ${img.naturalWidth}×${img.naturalHeight}`);
      generate(opts);
    };
    img.onerror = () => say('לא הצלחתי לפתוח את התמונה. נסה קובץ אחר.', true);
    img.src = url;
  };

  const applyPreset = (p: Preset) => {
    const next = { ...opts, cols: p.cols, colors: p.colors, denoise: p.denoise ?? true };
    setOpts(next);
    if (imageRef.current) generate(next);
  };

  const activePreset = PRESETS.find((p) => p.cols === opts.cols && p.colors === opts.colors);
  const hasImage = Boolean(thumb);

  return (
    <div className="wrap">
      <header>
        <div className="pencils" aria-hidden="true">
          {['#D92B2B', '#F2B705', '#2E9E4F', '#3B5BDB', '#8B4FC4', '#8A5A2B'].map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </div>
        <h1>מוזאיקת מספרים</h1>
        <p>
          העלו תמונה וקבלו דף צביעה לפי מספרים מוכן להדפסה — רשת ממוספרת, מקרא צבעים ודף פתרון.
          הכול רץ בדפדפן, שום קובץ לא נשלח לשרת.
        </p>
      </header>

      <div className="panel">
        <div
          className={`drop${hot ? ' hot' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setHot(true);
          }}
          onDragLeave={() => setHot(false)}
          onDrop={(e) => {
            e.preventDefault();
            setHot(false);
            const f = e.dataTransfer.files?.[0];
            if (f) loadFile(f);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
            }}
          />
          {thumb ? (
            <>
              <img className="thumb" src={thumb} alt="" />
              <span>
                <strong>{fileName}</strong>
                <br />
                לחצו להחלפה
              </span>
            </>
          ) : (
            <span>
              בחרו תמונה או גררו לכאן
              <br />
              <strong>JPG, PNG, WEBP</strong>
            </span>
          )}
        </div>

        <div className="presets" role="group" aria-label="רמת קושי">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="chip"
              aria-pressed={activePreset === p}
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="rows">
          <div className="row">
            <label htmlFor="cols">
              רוחב הרשת: <span className="val">{opts.cols}</span> משבצות
            </label>
            <input
              id="cols"
              type="range"
              min={12}
              max={90}
              value={opts.cols}
              onChange={(e) => setOpts({ ...opts, cols: Number(e.target.value) })}
              onMouseUp={() => generate(opts)}
              onTouchEnd={() => generate(opts)}
            />
          </div>

          <div className="row">
            <label htmlFor="colors">
              מספר צבעים: <span className="val">{opts.colors}</span>
            </label>
            <input
              id="colors"
              type="range"
              min={3}
              max={24}
              value={opts.colors}
              onChange={(e) => setOpts({ ...opts, colors: Number(e.target.value) })}
              onMouseUp={() => generate(opts)}
              onTouchEnd={() => generate(opts)}
            />
          </div>

          <div className="row">
            <label htmlFor="shades">
              גווני צבע לכל משפחה:{' '}
              <span className="val">{maxShades ? `עד ${maxShades}` : 'ללא הגבלה'}</span>
            </label>
            <select
              id="shades"
              className="select"
              value={maxShades}
              onChange={(e) => {
                const v = Number(e.target.value);
                maxShadesRef.current = v;
                setMaxShades(v);
                generate(opts);
              }}
            >
              <option value={0}>ללא הגבלה</option>
              <option value={2}>עד 2 גוונים</option>
              <option value={3}>עד 3 גוונים</option>
              <option value={4}>עד 4 גוונים</option>
            </select>
          </div>

          <div className="checks">
            <label>
              <input
                type="checkbox"
                checked={opts.denoise}
                onChange={(e) => {
                  const next = { ...opts, denoise: e.target.checked };
                  setOpts(next);
                  generate(next);
                }}
              />
              ניקוי משבצות בודדות
            </label>
            <label>
              <input
                type="checkbox"
                checked={opts.boost}
                onChange={(e) => {
                  const next = { ...opts, boost: e.target.checked };
                  setOpts(next);
                  generate(next);
                }}
              />
              חיזוק צבעים
            </label>
            <label>
              <input
                type="checkbox"
                checked={smoothEdges}
                onChange={(e) => {
                  smoothEdgesRef.current = e.target.checked;
                  setSmoothEdges(e.target.checked);
                  generate(opts);
                }}
              />
              קצוות חלקים (חצאי משבצות)
            </label>
            <label>
              <input
                type="checkbox"
                checked={regionNumbers}
                onChange={(e) => setRegionNumbers(e.target.checked)}
              />
              מספר אחד לכל אזור
            </label>
            <label>
              <input
                type="checkbox"
                checked={outlines}
                onChange={(e) => setOutlines(e.target.checked)}
              />
              קווי מתאר לאזורים
            </label>
            <label>
              <input
                type="checkbox"
                checked={withSolution}
                onChange={(e) => setWithSolution(e.target.checked)}
              />
              דף פתרון
            </label>
          </div>
        </div>

        <div className="actions">
          <button
            type="button"
            className="btn"
            disabled={!hasImage || busy}
            onClick={() => generate(opts)}
          >
            {busy ? 'מחשב…' : 'צור דף'}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={!mosaic}
            onClick={() => window.print()}
          >
            הדפסה / שמירה כ‑PDF
          </button>
        </div>

        <p className={warn ? 'note warn' : 'note'}>{note}</p>
      </div>

      {mosaic && (
        <>
          <Sheet
            title="דף צביעה — צבעו כל משבצת לפי המספר"
            svg={puzzleSvg(mosaic, { regionNumbers, outlines })}
            mosaic={mosaic}
          />
          {withSolution && <Sheet title="פתרון" svg={solutionSvg(mosaic)} />}
        </>
      )}
    </div>
  );
}

function Sheet({ title, svg, mosaic }: { title: string; svg: string; mosaic?: Mosaic }) {
  return (
    <section className="sheet">
      <h2>{title}</h2>
      <div className="mosaic" dangerouslySetInnerHTML={{ __html: svg }} />
      {mosaic && (
        <div className="legend">
          {mosaic.palette.map((c, i) => (
            <span className="key" key={i}>
              <b>{i + 1}</b>
              <i style={{ background: hex(c) }} />
              {colorName(c)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
