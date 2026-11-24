// ---------- math rendering (from math-photo-to-notes) ----------
// window.MathJax is configured in the first <script> of the page. The offline file
// embeds the pinned MathJax 3.2.2 tex-svg-full bundle right after it; the online file
// loads the same pinned bundle from jsDelivr the first time math needs drawing.
const MATHJAX_CDN = 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg-full.js';
let mathJaxLoad = null, mathQueue = Promise.resolve(), mathFailed = false;

function ensureMathJax() {
  if (window.MathJax?.typesetPromise) return Promise.resolve(window.MathJax);
  if (mathJaxLoad) return mathJaxLoad;
  mathJaxLoad = new Promise((resolve, reject) => {
    const started = window.MathJax?.startup?.promise;
    if (started) { started.then(() => resolve(window.MathJax), reject); return; }
    const node = document.createElement('script');
    node.src = MATHJAX_CDN; node.async = true; node.crossOrigin = 'anonymous';
    node.onload = () => Promise.resolve(window.MathJax?.startup?.promise).then(() => resolve(window.MathJax)).catch(reject);
    node.onerror = () => reject(new Error('MathJax could not load'));
    document.head.appendChild(node);
  }).catch(e => { mathFailed = true; updateStorageNote(); throw e; });
  return mathJaxLoad;
}
// MathJax reports TeX errors by drawing merror nodes; typesetPromise does not reject for them.
function mathErrorsIn(el) {
  return [...new Set([...el.querySelectorAll('[data-mml-node="merror"],mjx-merror')].map(n => n.getAttribute('data-mjx-error') || 'unrenderable TeX'))];
}
function hasMath(s) { return /\$|\\\(|\\\[/.test(String(s || '')); }
// Typeset calls are queued one at a time, as MathJax recommends.
function typeset(...els) {
  const list = els.filter(Boolean);
  if (!list.length || mathFailed) return Promise.resolve();
  if (!list.some(el => hasMath(el.textContent))) return Promise.resolve();
  mathQueue = mathQueue.then(() => ensureMathJax()).then(MJ => {
    MJ.typesetClear(list);
    return MJ.typesetPromise(list);
  }).catch(() => {});
  return mathQueue;
}
// Put text (which may hold $...$ TeX) into an element safely, then draw its math.
function setMath(el, text) { el.textContent = String(text ?? ''); return typeset(el); }
