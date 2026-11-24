// ---------- exports: ZIP + review sheet (math drawn as self-contained SVG) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
// Minimal store-only ZIP (PNG pictures are already compressed). files: [{name, data: Uint8Array|string}]
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true);
    c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}

async function saveFile(filename, blob) {
  if (IN_CLAUDE) {
    if (!state.downloads) throw new Error('Downloads aren’t available in this view.');
    try { await state.downloads.save({ filename, data: blob }); return true; }
    catch (e) {
      if (e?.code === 'declined') return false;
      throw new Error(e?.code === 'rate_limited' ? 'A download is already waiting for you to confirm.' : 'The download didn’t go through.');
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

// Builds the review sheet in a hidden box, draws its math with MathJax, then returns the
// finished HTML. Misses come first so the sheet opens on what to study.
const SHEET_CSS = `body{font:15px/1.5 "Atkinson Hyperlegible",system-ui,sans-serif;color:#16204a;margin:28px auto;max-width:820px;padding:0 18px}
h1{font:600 28px/1.1 "STIX Two Text",Georgia,serif;color:#6f5000;margin:0 0 4px}.sub{color:#56608a;margin:0 0 18px}
.sum{display:flex;gap:22px;flex-wrap:wrap;margin:0 0 20px}.sum b{display:block;font:600 24px "STIX Two Text",Georgia,serif}
h2{font:600 19px "STIX Two Text",Georgia,serif;color:#6f5000;border-bottom:1px solid #c8d0e4;padding-bottom:4px;margin:22px 0 10px;break-after:avoid;page-break-after:avoid}
.it{border:1px solid #c8d0e4;border-radius:10px;padding:12px 14px;margin:0 0 12px}
.it.short{break-inside:avoid;page-break-inside:avoid}
.it .work,.it .read,.it .key,.it ol.hints li,.it .chat-a,.it ol.ch,.it .q{break-inside:avoid;page-break-inside:avoid}
.meta{color:#56608a;font-size:13px;margin:0 0 4px}.q{font:18px/1.4 "STIX Two Text",Georgia,serif;margin:0 0 8px}
.v-right{color:#1b7a4f;font-weight:700}.v-wrong{color:#b8382f;font-weight:700}.v-unsure{color:#9a5b00;font-weight:700}
.work{display:block;max-width:100%;max-height:3.1in;width:auto;border:1px solid #c8d0e4;border-radius:6px;margin:6px 0}
.ai-label{color:#9a5b00;font-size:12px;margin:6px 0 0}
ol.hints{margin:2px 0 6px;padding-left:22px}ol.hints li p{margin:0 0 4px}
.chat-q{margin:6px 0 2px;font-weight:700}.chat-a{border-left:2px solid #c8d0e4;padding-left:10px}
.right-list{list-style:none;padding:0;margin:0}.right-list li{display:flex;gap:10px;align-items:flex-start;padding:6px 0;border-bottom:1px solid #e3e7f0;break-inside:avoid;page-break-inside:avoid}
.right-list .thumb{height:52px;width:auto;border:1px solid #c8d0e4;border-radius:4px;flex:none}.right-list .rq{font-family:"STIX Two Text",Georgia,serif}
ol.ch{margin:4px 0 8px;padding-left:22px}ol.ch li.ok{color:#1b7a4f}ol.ch li.pick{color:#b8382f}
ul.ch{margin:4px 0 8px;padding-left:20px}ul.ch li.ok{color:#1b7a4f}ul.ch li.pick{color:#b8382f}
.read{border:1px dashed #c8d0e4;border-radius:6px;padding:6px 10px;margin:4px 0;font-family:"STIX Two Text",Georgia,serif}
.key{background:#f3f5fa;border-radius:6px;padding:6px 10px;margin-top:6px}.coach{border-left:3px solid #8f6700;padding:2px 0 2px 14px;margin:0 0 8px}.coach h3{font-size:16px;color:#6f5000;margin:12px 0 4px}.fb p{margin:4px 0}
mjx-container{max-width:100%}
mjx-container use,mjx-container path{stroke:none}
mjx-assistive-mml{position:absolute!important;top:0;left:0;clip:rect(1px,1px,1px,1px);padding:1px 0 0 0!important;border:0!important;display:block!important;width:auto!important;overflow:hidden!important;user-select:none}
@media print{body{margin:0}}`;

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function buildSheetBody(attempts, imgSrc) {
  const root = el('div');
  const right = attempts.filter(a => a.right === true).length, wrong = attempts.filter(a => a.right === false).length;
  const decks = [...new Set(attempts.map(a => a.deckName))];
  root.append(el('h1', '', 'Study review'),
    el('p', 'sub', `${decks.join(', ')} · ${new Date().toLocaleString()} · made with ${APP_NAME}`));
  const sum = el('div', 'sum');
  [[attempts.length, 'answers'], [right, 'right'], [wrong, 'wrong'], [attempts.length - right - wrong, 'not counted']].forEach(([n, l]) => {
    const d = el('div'); d.append(el('b', '', String(n)), document.createTextNode(l)); sum.appendChild(d);
  });
  root.appendChild(sum);
  const groups = [['To study: wrong answers', attempts.filter(a => a.right === false)],
                  ['Not counted: check these yourself', attempts.filter(a => a.right !== true && a.right !== false && a.verdict !== 'skipped')],
                  ['Skipped', attempts.filter(a => a.verdict === 'skipped')],
                  ['Got right', attempts.filter(a => a.right === true && !hasTrail(a))],
                  ['Got right, with questions to the tutor', attempts.filter(a => a.right === true && hasTrail(a))]];
  let n = 0;
  for (const [title, list] of groups) {
    if (!list.length) continue;
    root.appendChild(el('h2', '', `${title} (${list.length})`));
    if (title === 'Got right' || title === 'Skipped') { // one line each
      const ul = el('ul', 'right-list');
      for (const a of list) {
        n++;
        const li = el('li');
        if (a.image) { const t = el('img', 'thumb'); t.setAttribute('data-src', imgSrc(a)); t.alt = 'My work'; li.appendChild(t); }
        const box = el('div');
        box.append(el('div', 'rq', a.question), el('div', 'meta', `#${n} · ${a.type === 'mc' ? 'flip card' : 'sketch'} · ${a.category} · ${title === 'Skipped' ? 'skipped' : 'answer: ' + a.correct + ' · ' + sourceLabel(a)}`));
        li.appendChild(box); ul.appendChild(li);
      }
      root.appendChild(ul);
      continue;
    }
    for (const a of list) {
      n++;
      const it = el('div', 'it' + (a.image || hasTrail(a) || a.aiExplain ? '' : ' short'));
      const [cls, label] = verdictLabel(a);
      const meta = el('p', 'meta');
      meta.append(el('span', 'v-' + cls, label), document.createTextNode(` · #${n} · ${a.type === 'mc' ? 'flip card' : 'sketch problem'} · ${a.category} · ${niceTime(a.ts)} · ${sourceLabel(a)}${a.aiWritten ? ' · AI-written question' : ''}`));
      it.append(meta, el('p', 'q', a.question));
      if (a.type === 'mc' && a.choices) {
        const ul = el('ol', 'ch');
        a.choices.forEach(c => {
          const li = el('li', c === a.correct ? 'ok' : (c === a.picked ? 'pick' : ''), c);
          if (c === a.correct) li.append(document.createTextNode('  ✓ correct'));
          if (c === a.picked && c !== a.correct) li.append(document.createTextNode('  ✗ your pick'));
          ul.appendChild(li);
        });
        it.appendChild(ul);
      }
      if (a.image) { const img = el('img', 'work'); img.setAttribute('data-src', imgSrc(a)); img.alt = 'My work'; it.appendChild(img); }
      if (a.typed) it.appendChild(el('p', '', 'Typed answer: ' + a.typed));
      if (a.final && !/^none\b/i.test(a.final)) it.appendChild(el('p', '', 'Final answer, as the AI read it: ' + a.final));
      if (a.hints && a.hints.length) {
        it.appendChild(el('p', 'ai-label', `Hints you asked for (written by AI):`));
        const ol = el('ol', 'hints'); a.hints.forEach(h => { const li = el('li'); li.innerHTML = md(h); ol.appendChild(li); }); it.appendChild(ol);
      }
      if (a.read || (a.feedback && a.verdict !== 'stuck') || a.aiExplain) it.appendChild(el('p', 'ai-label', 'Written by AI, may contain mistakes:'));
      if (a.read) { it.appendChild(el('p', 'meta', 'What the AI read:')); const r = el('div', 'read'); r.innerHTML = md(a.read); it.appendChild(r); }
      if (a.feedback && a.type === 'sketch' && a.verdict !== 'stuck') { const f = el('div', 'fb'); f.innerHTML = md(a.feedback); it.appendChild(f); }
      if (a.aiExplain) { const f = el('div', 'fb'); f.innerHTML = md(a.aiExplain); it.appendChild(f); }
      if (a.chat && a.chat.length) {
        it.appendChild(el('p', 'ai-label', `Your questions to the tutor${a.chat.length >= MAX_CHAT ? ` (last ${MAX_CHAT})` : ''}:`));
        a.chat.forEach(c => {
          const qd = el('div', 'chat-q', 'You: ' + c.q + (c.pic ? ' (picture sent)' : '')); it.appendChild(qd);
          const ad = el('div', 'fb chat-a'); ad.innerHTML = md(c.a); it.appendChild(ad);
        });
      }
      const key = el('div', 'key');
      key.appendChild(el('div', '', 'Answer: ' + a.correct));
      if (a.solution) key.appendChild(el('div', '', 'Solution: ' + a.solution));
      if (a.explanation) key.appendChild(el('div', '', 'Why: ' + a.explanation));
      it.appendChild(key);
      root.appendChild(it);
    }
  }
  return root;
}
function sheetCoachNotes(attempts) {
  const c = attempts.some(a => a.deckKey === state.deckKey) ? latestCoach() : null;
  if (!c) return null;
  const box = el('div', 'coach');
  box.appendChild(el('h2', '', `Coaching notes (${niceTime(c.at)})`));
  if (c.focus) box.appendChild(el('p', 'meta', 'You asked: ' + c.focus));
  const body = el('div', 'fb'); body.innerHTML = md(c.text); box.appendChild(body);
  return box;
}
async function sheetHTML(attempts, imgSrc) {
  const host = el('div');
  host.style.cssText = 'position:absolute;left:-10000px;top:0;width:820px;';
  const sheet = buildSheetBody(attempts, imgSrc);
  const notes = sheetCoachNotes(attempts);
  if (notes) sheet.insertBefore(notes, sheet.children[3] || null);
  host.appendChild(sheet);
  document.body.appendChild(host);
  try { await typeset(host); } finally { host.remove(); }
  const mjCss = document.getElementById('MJX-SVG-styles')?.textContent || '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Study review</title><style>${SHEET_CSS}\n${mjCss}</style></head><body>${host.innerHTML.replace(/ data-src="/g, ' src="')}</body></html>`;
}
function attemptsFileName(ext) { return `${safeName(state.quiz?.quiz_name || 'study')}_review_${stamp()}.${ext}`; }

async function exportZip() {
  const list = await scopedAttempts();
  if (!list.length) return;
  setRecNote('Building the ZIP…');
  const files = [], names = new Map();
  list.forEach((a, i) => { if (a.image) names.set(a.id, `work/${String(i + 1).padStart(3, '0')}_${a.type}_${a.right === true ? 'right' : a.right === false ? 'wrong' : 'unsure'}.png`); });
  const html = await sheetHTML(list, a => names.get(a.id));
  files.push({ name: 'review.html', data: html });
  files.push({ name: 'answers.json', data: JSON.stringify({ format: 'flip-sketch-record-v1', app: APP_NAME, version: APP_VERSION, exported: new Date().toISOString(),
    answers: list.map(a => ({ ...a, image: names.get(a.id) || '' })) }, null, 1) });
  for (const a of list) if (a.image) files.push({ name: names.get(a.id), data: dataURLtoBytes(a.image) });
  const notes = list.some(a => a.deckKey === state.deckKey) ? (state.progress?.coach || []) : [];
  if (notes.length) files.push({ name: 'coaching_notes.md', data: coachNotesMarkdown(notes.slice().reverse()) });
  files.push({ name: 'README.txt', data: `${APP_NAME} record\r\n\r\nreview.html  - open in a browser; print it or save it as a PDF\r\nanswers.json - every answer: question, your pick or typed answer, right/wrong, who graded it, AI feedback\r\nwork/        - pictures of your sketch pad, named by number, type and result\r\ncoaching_notes.md - the AI coach's notes for this deck, newest first (if you asked for coaching)\r\n\r\nNo API keys are stored in this file.\r\n` });
  try { const ok = await saveFile(attemptsFileName('zip'), makeZip(files)); setRecNote(ok ? 'ZIP ready.' : 'Download cancelled.'); }
  catch (e) { setRecNote(e.message); }
}
async function exportSheet() {
  const list = await scopedAttempts();
  if (!list.length) return;
  setRecNote('Building the review sheet…');
  const html = await sheetHTML(list, a => a.image);
  try { const ok = await saveFile(attemptsFileName('html'), new Blob([html], { type: 'text/html' })); setRecNote(ok ? 'Review sheet ready. Open it in a browser to print or save as PDF.' : 'Download cancelled.'); }
  catch (e) { setRecNote(e.message); }
}
async function printSheet() {
  const list = await scopedAttempts();
  if (!list.length || IN_CLAUDE) return;
  setRecNote('Preparing to print…');
  const html = await sheetHTML(list, a => a.image);
  const fr = document.createElement('iframe');
  fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(fr);
  fr.srcdoc = html;
  fr.onload = () => {
    setRecNote('Choose “Save as PDF” in the print dialog to keep a PDF.');
    setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { setRecNote('Printing was blocked. Use Download review sheet instead.'); } }, 300);
    setTimeout(() => fr.remove(), 60000);
  };
}
function setRecNote(t) { $('rec-note').textContent = t; }

function exportSetDeck(id) {
  const set = (state.progress.sets || []).find(s => s.id === id);
  if (!set) return;
  const deck = { schema_version: 2, quiz_name: `${state.quiz.quiz_name}: ${set.name}`, ai_generated: true,
    description: `AI practice set written by ${set.provider} on ${new Date(set.at).toLocaleString()}${set.focus ? ` (asked for: ${set.focus})` : ''}. Answer keys are not verified.`,
    categories: set.categories };
  saveFile(safeName(deck.quiz_name) + '.json', new Blob([JSON.stringify(deck, null, 1)], { type: 'application/json' }))
    .then(ok => { $('coach-note').textContent = ok ? 'Saved. Load it any time with Load deck.' : 'Download cancelled.'; })
    .catch(e => { $('coach-note').textContent = e.message; });
}

function hasTrail(a) { return !!((a.chat && a.chat.length) || (a.hints && a.hints.length)); }
