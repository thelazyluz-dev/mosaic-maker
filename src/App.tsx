import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildMosaic, type Mosaic, type MosaicOptions } from './lib/mosaic';
import { capShades, snapToNamed } from './lib/palette';
import { splitEdges } from './lib/halfcells';
import { recommendSettings, applyRecommendation } from './lib/recommend';
import { colorName, hex, puzzleSvg, solutionSvg } from './lib/render';

import { buildContours, contourSvg, type ContourMosaic } from './lib/contours';

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
  const [mode, setMode] = useState<'grid' | 'contours'>('contours');
  const modeRef = useRef<'grid' | 'contours'>('contours');
  const [contour, setContour] = useState<ContourMosaic | null>(null);
  const generationRef = useRef(0);
  const [view, setView] = useState<'puzzle' | 'compare' | 'solution'>('compare');
  const [compare, setCompare] = useState(50);
  const [zoom, setZoom] = useState(1);
  const pendingRef = useRef<number>();
  const uploadRef = useRef(0);
  const objectUrlRef = useRef<string>();

  useEffect(() => () => {
    window.clearTimeout(pendingRef.current);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);
  const [mosaic, setMosaic] = useState<Mosaic | null>(null);

  // max shades per colour family (0 = no limit). Kept in a ref so the stable
  // generate() callback always reads the current value.
  const [maxShades, setMaxShades] = useState(3);
  const maxShadesRef = useRef(3);

  // snap colours to a standard, nameable pencil-box palette (off by default)
  const [namedPalette, setNamedPalette] = useState(false);
  const namedPaletteRef = useRef(false);

  // split edge cells into two triangles for smoother contours (off by default)
  const [smoothEdges, setSmoothEdges] = useState(false);
  const smoothEdgesRef = useRef(false);

  // puzzle-sheet region outlines — render-only, no recompute needed (off by default)
  const [outlines, setOutlines] = useState(false);

  // one-line explanation of the last "recommend settings" click
  const [recTip, setRecTip] = useState('');

  const say = (text: string, isWarning = false) => {
    setNote(text);
    setWarn(isWarning);
  };

  const generate = useCallback(
    (o: MosaicOptions) => {
      window.clearTimeout(pendingRef.current);
      const img = imageRef.current;
      if (!img) return;
      const request = ++generationRef.current;
      const selectedMode = modeRef.current;
      setBusy(true);
      // let the button state paint before the synchronous work starts
      window.setTimeout(() => {
        if (request !== generationRef.current) return;
        try {
          const built = buildMosaic(img, selectedMode === 'contours' ? { ...o, cols: 120 + o.cols * 2 } : o);
          const capped = maxShadesRef.current ? capShades(built, maxShadesRef.current) : built;
          const named = namedPaletteRef.current ? snapToNamed(capped) : capped;
          if (selectedMode === 'contours') {
            const result = buildContours(named, o.denoise);
            setContour(result);
            setMosaic(result);
            const small = result.regions.filter(r => r.fontSize * result.cellMm < 1.5).length;
            say(`${result.regions.length} אזורי צביעה, ${result.palette.length} צבעים.${small ? ' חלק מהאזורים קטנים — להדפסה נוחה הפחיתו פירוט או צבעים.' : ''}`, small > 0);
            return;
          }
          setContour(null);
          const m = smoothEdgesRef.current ? splitEdges(named, img, o.boost) : named;
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
    const upload = ++uploadRef.current;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (upload !== uploadRef.current) { URL.revokeObjectURL(url); return; }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;
      setZoom(1);
      imageRef.current = img;
      setThumb(url);
      setFileName(`${file.name} — ${img.naturalWidth}×${img.naturalHeight}`);
      generate(opts);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (upload === uploadRef.current) say('לא הצלחתי לפתוח את התמונה. נסה קובץ אחר.', true);
    };
    img.src = url;
  };

  const applyPreset = (p: Preset) => {
    const next = { ...opts, cols: p.cols, colors: p.colors, denoise: p.denoise ?? true };
    setOpts(next);
    if (imageRef.current) generate(next);
  };

  const recommend = () => {
    const img = imageRef.current;
    if (!img) return;
    const r = recommendSettings(img);
    const next = applyRecommendation(opts, r);
    setOpts(next);
    setRecTip(r.reason);
    generate(next);
  };

  const rendered = useMemo(() => mosaic ? {
    puzzle: contour ? contourSvg(contour) : puzzleSvg(mosaic, { outlines }),
    solution: contour ? contourSvg(contour, true) : solutionSvg(mosaic),
  } : null, [mosaic, contour, outlines]);

  const activePreset = PRESETS.find((p) => p.cols === opts.cols && p.colors === opts.colors);
  const hasImage = Boolean(thumb);

  const changeOptions = (next: MosaicOptions) => {
    setOpts(next);
    window.clearTimeout(pendingRef.current);
    pendingRef.current = window.setTimeout(() => generate(next), 300);
  };

  return (
    <div className="wrap">
      <header className="brand-bar"><a className="brand" href="./"><span className="brand-mark" aria-hidden="true">✦</span> מוזאיקת מספרים</a><span className="privacy">התמונה נשארת במכשיר שלך</span></header>
      <div className="intro"><span className="eyebrow">סטודיו לצביעה אישית</span><h1>התמונה שלך.<br /><span>רגע של צבע.</span></h1><p>בחרו תמונה, התאימו את הסגנון והדפיסו יצירה משלכם.</p></div>
      <main className="studio">
        <aside className="panel" aria-label="הגדרות דף הצביעה">
          <div className="section-heading"><span className="step">1</span><h2>מתחילים בתמונה</h2></div>
          <button type="button" className={`drop${hot ? ' hot' : ''}`} onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setHot(true); }} onDragLeave={() => setHot(false)}
            onDrop={e => { e.preventDefault(); setHot(false); const file = e.dataTransfer.files[0]; if (file) loadFile(file); }}>
            {thumb ? <><img className="thumb" src={thumb} alt="התמונה שבחרת" /><span><strong>החלפת תמונה</strong><small>{fileName}</small></span></> : <><span className="upload-symbol" aria-hidden="true">+</span><strong>בחירת תמונה</strong><small>או גררו לכאן · JPG, PNG, WEBP</small></>}
          </button>
          <input className="file-input" ref={fileRef} type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) loadFile(file); e.target.value = ''; }} />
          <div className="section-heading"><span className="step">2</span><h2>נותנים לה סגנון</h2></div>
          <div className="segmented" role="group" aria-label="סגנון דף הצביעה">
            {(['contours', 'grid'] as const).map(value => <button type="button" key={value} aria-pressed={mode === value} onClick={() => {
              modeRef.current = value; setMode(value); setMosaic(null); setContour(null); generate(opts);
            }}>{value === 'contours' ? 'קווי מתאר' : 'רשת משבצות'}</button>)}
          </div>
          <p className="help">{mode === 'contours' ? 'אזורי צבע חופשיים עם מספר בכל אזור.' : 'מוזאיקה עם מספר בכל משבצת.'}</p>
          <label className="field-title">רמת פירוט</label>
          <div className="presets" role="group" aria-label="רמת פירוט">
            {PRESETS.map((p, i) => <button type="button" className="chip" key={p.label} aria-pressed={activePreset === p} onClick={() => applyPreset(p)}>{['קליל', 'נוח', 'מאוזן', 'עשיר', 'מפורט'][i]}</button>)}
          </div>
          <div className="field"><label htmlFor="colors">מספר צבעים <output>{opts.colors}</output></label><input id="colors" type="range" min={3} max={24} value={opts.colors} onChange={e => changeOptions({ ...opts, colors: Number(e.target.value) })} /></div>
          <button type="button" className="btn subtle" disabled={!hasImage || busy} onClick={recommend}>✦ התאמת הגדרות לתמונה</button>
          {recTip && <p className="help">{recTip}</p>}
          <details className="advanced"><summary>הגדרות מתקדמות</summary>
            <div className="field"><label htmlFor="cols">{mode === 'contours' ? 'דיוק הפרטים' : 'רוחב הרשת'} <output>{opts.cols}</output></label><input id="cols" type="range" min={12} max={90} value={opts.cols} onChange={e => changeOptions({ ...opts, cols: Number(e.target.value) })} /></div>
            <div className="field"><label htmlFor="shades">גוונים לכל משפחת צבע</label><select id="shades" value={maxShades} onChange={e => { const v = Number(e.target.value); maxShadesRef.current = v; setMaxShades(v); generate(opts); }}><option value={0}>ללא הגבלה</option>{[2,3,4].map(n => <option key={n} value={n}>עד {n} גוונים</option>)}</select></div>
            <div className="checks">
              <label><input type="checkbox" checked={opts.denoise} onChange={e => { const next = { ...opts, denoise: e.target.checked }; setOpts(next); generate(next); }} />{mode === 'contours' ? 'איחוד אזורים קטנים' : 'ניקוי משבצות בודדות'}</label>
              <label><input type="checkbox" checked={opts.boost} onChange={e => { const next = { ...opts, boost: e.target.checked }; setOpts(next); generate(next); }} />חיזוק צבעים</label>
              <label><input type="checkbox" checked={namedPalette} onChange={e => { namedPaletteRef.current = e.target.checked; setNamedPalette(e.target.checked); generate(opts); }} />התאמה לצבעי עפרונות</label>
              {mode === 'grid' && <><label><input type="checkbox" checked={smoothEdges} onChange={e => { smoothEdgesRef.current = e.target.checked; setSmoothEdges(e.target.checked); generate(opts); }} />חצאי משבצות בקצוות</label><label><input type="checkbox" checked={outlines} onChange={e => setOutlines(e.target.checked)} />הדגשת גבולות בין צבעים</label></>}
            </div>
          </details>
          <button type="button" className="btn regenerate" disabled={!hasImage || busy} onClick={() => generate(opts)}>{busy ? 'יוצרים את דף הצביעה…' : 'יצירה מחדש'}</button>
        </aside>
        <section className="workspace" aria-label="תצוגה מקדימה" aria-busy={busy}>
          <div className="preview-toolbar"><div><span className="eyebrow">היצירה שלך</span><h2>מוכנים להוסיף צבע?</h2></div>
            {mosaic && <div className="segmented view-tabs" role="group" aria-label="תצוגה">{(['puzzle','compare','solution'] as const).map((v,i) => <button type="button" key={v} aria-pressed={view===v} onClick={() => setView(v)}>{['דף צביעה','השוואה','צבעוני'][i]}</button>)}</div>}
          </div>
          {mosaic && rendered ? <>
            <div className="canvas-desk"><div className="preview-scroll"><div className="preview-paper" style={{width: `${zoom * 100}%`}}>
              <div className="mosaic" dangerouslySetInnerHTML={{__html: view === 'solution' ? rendered.solution : rendered.puzzle}} />
              {view === 'compare' && <><div className="comparison-overlay mosaic" style={{clipPath: `inset(0 ${100-compare}% 0 0)`}} dangerouslySetInnerHTML={{__html: rendered.solution}} /><div className="comparison-line" style={{left: `${compare}%`}}><span aria-hidden="true">↔</span></div></>}
            </div></div></div>
            <div className="preview-controls">{view === 'compare' && <div className="comparison-control"><label htmlFor="compare">צבעוני מול דף צביעה</label><input id="compare" type="range" min={0} max={100} value={compare} dir="ltr" onChange={e => setCompare(Number(e.target.value))} /></div>}<div className="zoom-control"><button type="button" aria-label="הקטנה" disabled={zoom===1} onClick={() => setZoom(Math.max(1,zoom-.5))}>−</button><output>{zoom*100}%</output><button type="button" aria-label="הגדלה" disabled={zoom===3} onClick={() => setZoom(Math.min(3,zoom+.5))}>+</button></div></div>
            <div className="palette-block"><h3>הצבעים שלך <span>{mosaic.palette.length} גוונים</span></h3><Legend mosaic={mosaic} /></div>
          </> : <div className="empty-state"><div className="empty-art" aria-hidden="true"><span>1</span><span>2</span><span>3</span><span>4</span></div><h3>{busy ? 'היצירה שלך בדרך…' : 'כאן התמונה הופכת ליצירה'}</h3><p>בחרו תמונה כדי לראות את דף הצביעה ואת הפתרון הצבעוני.</p><button type="button" className="btn" onClick={() => fileRef.current?.click()}>בחירת תמונה</button></div>}
          <p className={warn ? 'note warn' : 'note'} role="status">{busy ? 'מעבדים את התמונה…' : note}</p>
          <div className="print-bar"><span>דף צביעה + מקרא צבעים<small>התצוגה הצבעונית היא לעזרה בלבד</small></span><button type="button" className="btn" disabled={!mosaic || busy} onClick={() => window.print()}>הדפסה / שמירה כ־PDF</button></div>
        </section>
      </main>
      <footer>יוצרים במכשיר שלך. בלי הרשמה, בלי העלאת תמונות לשרת.</footer>
      {mosaic && rendered && <section className="print-sheet"><style>{`@page { size: A4 ${mosaic.cols > mosaic.rows ? 'landscape' : 'portrait'}; margin: 9mm; }`}</style><h2>{contour ? 'צבעו כל אזור לפי המספר' : 'צבעו כל משבצת לפי המספר'}</h2><div className="mosaic" dangerouslySetInnerHTML={{__html:rendered.puzzle}} /><Legend mosaic={mosaic} /></section>}
    </div>
  );
}

function Legend({mosaic}: {mosaic: Mosaic}) {
  return <div className="legend">{mosaic.palette.map((c,i) => <span className="key" key={i}><b>{i+1}</b><i style={{background:hex(c)}} />{colorName(c)}</span>)}</div>;
}
