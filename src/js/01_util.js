// ---------- small helpers (from Flip Quiz Tutor) ----------
const $ = (id) => document.getElementById(id);
const APP_NAME = 'Flip & Sketch Tutor';
const APP_VERSION = '1.4.0';
const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');

function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function escapeHTML(text) {
  return String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function shuffleArray(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function stripCodeFences(text) {
  const t = String(text || '').trim();
  const f = t.match(/^```[a-zA-Z]*\s*([\s\S]*?)\s*```$/);
  if (f) return f[1].trim();
  const o = t.match(/^```[a-zA-Z]*\s*([\s\S]*)$/);
  if (o) return o[1].replace(/```\s*$/, '').trim();
  return t;
}
// Math spans are protected so Markdown never touches the TeX inside them.
function protectMath(s) {
  const keep = [];
  const out = String(s).replace(/\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$/g, m => {
    keep.push(m); return '\u0000' + (keep.length - 1) + '\u0000';
  });
  return { out, keep };
}
function inlineMd(s) {
  const { out, keep } = protectMath(s);
  return escapeHTML(out)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\u0000(\d+)\u0000/g, (_, i) => escapeHTML(keep[Number(i)]));
}
// Minimal, safe Markdown: headings, bullets, numbered lists, bold, paragraphs.
function md(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  let html = '', list = null, para = [];
  const flushPara = () => { if (para.length) { html += '<p>' + para.map(inlineMd).join('<br>') + '</p>'; para = []; } };
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const t = raw.trim();
    let m;
    if (!t) { flushPara(); closeList(); continue; }
    if ((m = t.match(/^#{1,6}\s+(.*)$/))) { flushPara(); closeList(); html += `<h3>${inlineMd(m[1])}</h3>`; continue; }
    if ((m = t.match(/^[-*•]\s+(.*)$/))) { flushPara(); if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += `<li>${inlineMd(m[1])}</li>`; continue; }
    if ((m = t.match(/^\d+[.)]\s+(.*)$/))) { flushPara(); if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += `<li>${inlineMd(m[1])}</li>`; continue; }
    closeList(); para.push(t);
  }
  flushPara(); closeList();
  return html;
}
function stamp(ts = Date.now()) {
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
function niceTime(ts) {
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function safeName(s) { return String(s || 'file').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'file'; }
function dataURLtoBytes(url) {
  const b64 = String(url).split(',')[1] || '';
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function dataURLtoBlob(url) {
  const mime = (String(url).match(/^data:([^;,]+)/) || [])[1] || 'application/octet-stream';
  return new Blob([dataURLtoBytes(url)], { type: mime });
}
