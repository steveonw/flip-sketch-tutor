// ---------- sketch pad (from the EquationWright Scratchpad, rebuilt to never smear) ----------
// The EquationWright pad stored a bitmap and stretched it when the pad was resized, which
// smudged the ink. This pad stores every stroke as points on a fixed page (900 units wide),
// so the screen and the exported picture are always redrawn sharp. The page size (S/M/L)
// also locks as soon as there is ink on it, so the picture the AI gets is the page you drew.
const Pad = (() => {
  const W = 900;
  const SIZES = { S: 340, M: 540, L: 800 };
  const CELL = 30;
  let canvas, ctx, wrap;
  let size = 'M', paper = 'plain', tool = 'pen', color = '#111827', width = 3.2;
  let strokes = [], redoStack = [], cur = null, drawing = false, penSeen = false, enabled = true, scale = 1;

  const H = () => SIZES[size];
  function visible() {
    let start = 0;
    for (let i = strokes.length - 1; i >= 0; i--) if (strokes[i].tool === 'clear') { start = i + 1; break; }
    return strokes.slice(start);
  }
  function hasInk() { return visible().some(s => s.tool !== 'erase'); }

  function strokePath(g, s, k) {
    const pts = s.pts;
    g.lineWidth = s.w * k; g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = s.color;
    g.globalCompositeOperation = s.tool === 'erase' ? 'destination-out' : 'source-over';
    g.beginPath();
    if (s.tool === 'line') { g.moveTo(pts[0][0] * k, pts[0][1] * k); g.lineTo(pts[1][0] * k, pts[1][1] * k); g.stroke(); return; }
    if (pts.length === 1) {
      g.fillStyle = s.color; g.arc(pts[0][0] * k, pts[0][1] * k, s.w * k / 2, 0, Math.PI * 2); g.fill(); return;
    }
    g.moveTo(pts[0][0] * k, pts[0][1] * k);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      g.quadraticCurveTo(pts[i][0] * k, pts[i][1] * k, mx * k, my * k);
    }
    const last = pts[pts.length - 1];
    g.lineTo(last[0] * k, last[1] * k);
    g.stroke();
  }
  function renderInk(g, k, extra) {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    g.restore();
    for (const s of visible()) strokePath(g, s, k);
    if (extra) strokePath(g, extra, k);
    g.globalCompositeOperation = 'source-over';
  }
  function redraw(extra) { if (ctx) renderInk(ctx, scale, extra); }

  function fit() {
    const r = wrap.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    scale = (r.width * dpr) / W;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.width * dpr * H() / W);
    const cssCell = CELL * r.width / W;
    wrap.style.setProperty('--cell', cssCell + 'px');
    wrap.style.setProperty('--cell2', (cssCell * 1.4) + 'px');
    redraw();
  }
  function applyLook() {
    wrap.style.aspectRatio = `${W} / ${H()}`;
    wrap.classList.remove('paper-grid', 'paper-dots', 'paper-lined');
    if (paper !== 'plain') wrap.classList.add('paper-' + paper);
    ['S', 'M', 'L'].forEach(k => {
      const b = $('pad-size-' + k);
      b.classList.toggle('active', k === size);
      b.setAttribute('aria-pressed', String(k === size));
    });
    $('pad-paper').value = paper;
    updateLock();
    requestAnimationFrame(fit);
  }
  function updateLock() {
    const locked = hasInk();
    ['S', 'M', 'L'].forEach(k => { $('pad-size-' + k).disabled = locked || !enabled; });
    $('pad-paper').disabled = locked || !enabled;
    const note = $('pad-lock');
    note.classList.toggle('locked', locked);
    note.textContent = locked ? `Size locked at ${size}. Clear the pad to change it.` : `Pick a size, then write. It locks once there's ink.`;
    $('pad-undo').disabled = !enabled || !strokes.length;
    $('pad-redo').disabled = !enabled || !redoStack.length;
    $('pad-clear').disabled = !enabled || !visible().length;
  }
  function setTool(t) {
    tool = t;
    [['pen', 'pad-pen'], ['line', 'pad-line'], ['erase', 'pad-erase']].forEach(([k, id]) => $(id).classList.toggle('active', k === t));
    canvas.style.cursor = t === 'erase' ? 'cell' : 'crosshair';
  }
  function pt(e) {
    const r = canvas.getBoundingClientRect();
    const k = W / r.width;
    return [Math.round((e.clientX - r.left) * k * 10) / 10, Math.round((e.clientY - r.top) * k * 10) / 10];
  }
  function commit(s) { strokes.push(s); redoStack = []; updateLock(); onChange(); }
  let onChange = () => {};

  function down(e) {
    if (!enabled) return;
    if (e.pointerType === 'pen') penSeen = true;
    if (e.pointerType === 'touch' && penSeen) return; // palm rejection once a stylus has been used
    if (e.button !== undefined && e.button > 0) return;
    canvas.setPointerCapture(e.pointerId);
    drawing = true;
    const p = pt(e);
    cur = { tool, color, w: tool === 'erase' ? 24 : width, pts: tool === 'line' ? [p, p] : [p] };
    if (tool !== 'line') redraw(cur);
    e.preventDefault();
  }
  function move(e) {
    if (!drawing || !cur) return;
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    if (cur.tool === 'line') cur.pts[1] = pt(evs[evs.length - 1] || e);
    else for (const ev of (evs.length ? evs : [e])) {
      const p = pt(ev), last = cur.pts[cur.pts.length - 1];
      if (Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) >= 0.8) cur.pts.push(p);
    }
    redraw(cur);
    e.preventDefault();
  }
  function up(e) {
    if (!drawing) return;
    drawing = false;
    if (cur) {
      if (e && e.type === 'pointerup' && cur.tool === 'line') cur.pts[1] = pt(e);
      const s = cur; cur = null;
      commit(s);
    }
    redraw();
  }

  function undo() { if (!enabled || !strokes.length) return; redoStack.push(strokes.pop()); redraw(); updateLock(); onChange(); }
  function redo() { if (!enabled || !redoStack.length) return; strokes.push(redoStack.pop()); redraw(); updateLock(); onChange(); }
  function clear() { if (!enabled || !visible().length) return; commit({ tool: 'clear', pts: [] }); redraw(); }

  function drawPaper(g, k, w, h) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.lineWidth = Math.max(1, k * 0.8);
    if (paper === 'grid') {
      g.strokeStyle = '#e5e7eb'; g.beginPath();
      for (let x = 0; x <= W; x += CELL) { g.moveTo(x * k, 0); g.lineTo(x * k, h); }
      for (let y = 0; y <= H(); y += CELL) { g.moveTo(0, y * k); g.lineTo(w, y * k); }
      g.stroke();
    } else if (paper === 'lined') {
      g.strokeStyle = '#dbe3ef'; g.beginPath();
      for (let y = CELL * 1.4; y <= H(); y += CELL * 1.4) { g.moveTo(0, y * k); g.lineTo(w, y * k); }
      g.stroke();
    } else if (paper === 'dots') {
      g.fillStyle = '#cbd5e1';
      for (let y = 0; y <= H(); y += CELL) for (let x = 0; x <= W; x += CELL) { g.beginPath(); g.arc(x * k, y * k, 1.3 * k, 0, Math.PI * 2); g.fill(); }
    }
  }

  return {
    W, SIZES,
    init(changeHandler) {
      canvas = $('pad-canvas'); wrap = $('pad-wrap'); ctx = canvas.getContext('2d');
      onChange = changeHandler || onChange;
      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', () => { cur = null; drawing = false; redraw(); });
      canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
      new ResizeObserver(() => fit()).observe(wrap);
      $('pad-pen').addEventListener('click', () => setTool('pen'));
      $('pad-line').addEventListener('click', () => setTool('line'));
      $('pad-erase').addEventListener('click', () => setTool('erase'));
      $('pad-undo').addEventListener('click', undo);
      $('pad-redo').addEventListener('click', redo);
      $('pad-clear').addEventListener('click', clear);
      $('pad-width').addEventListener('change', e => { width = Number(e.target.value) || 3.2; if (tool === 'erase') setTool('pen'); });
      document.querySelectorAll('.ink-dot').forEach(b => b.addEventListener('click', () => {
        color = b.dataset.color;
        document.querySelectorAll('.ink-dot').forEach(x => x.classList.toggle('active', x === b));
        if (tool === 'erase') setTool('pen');
      }));
      ['S', 'M', 'L'].forEach(k => $('pad-size-' + k).addEventListener('click', () => {
        if (hasInk()) return;
        size = k; strokes = []; redoStack = [];
        state.prefs.padSize = k; savePrefs();
        applyLook();
      }));
      $('pad-paper').addEventListener('change', e => {
        if (hasInk()) { e.target.value = paper; return; }
        paper = PAPERS.includes(e.target.value) ? e.target.value : 'plain';
        state.prefs.paper = paper; savePrefs();
        applyLook();
      });
    },
    reset(opts = {}) {
      size = ['S', 'M', 'L'].includes(opts.size) ? opts.size : size;
      paper = PAPERS.includes(opts.paper) ? opts.paper : paper;
      strokes = []; redoStack = []; cur = null; drawing = false; enabled = true;
      canvas.style.pointerEvents = '';
      applyLook();
    },
    setEnabled(on) { enabled = !!on; canvas.style.pointerEvents = on ? '' : 'none'; updateLock(); },
    hasInk, undo, redo, setTool,
    get size() { return size; }, get paper() { return paper; },
    // White page + paper + ink, 2 px per unit (1800 px wide), as a PNG data URL.
    exportPNG(k = 2) {
      const w = Math.round(W * k), h = Math.round(H() * k);
      const out = document.createElement('canvas'); out.width = w; out.height = h;
      const g = out.getContext('2d');
      drawPaper(g, k, w, h);
      const ink = document.createElement('canvas'); ink.width = w; ink.height = h;
      renderInk(ink.getContext('2d'), k);
      g.drawImage(ink, 0, 0);
      return out.toDataURL('image/png');
    },
    strokeCount() { return visible().filter(s => s.tool !== 'erase').length; },
    // True if any ink is left after erasing (drawn small and scanned; strokes alone can't tell).
    inkVisible() {
      if (!hasInk()) return false;
      const k = 0.25, c = document.createElement('canvas');
      c.width = Math.ceil(W * k); c.height = Math.ceil(H() * k);
      const g = c.getContext('2d'); renderInk(g, k);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) return true;
      return false;
    },
  };
})();
