// ---------- my record: every answer, with the picture of the work ----------
const VERDICT_LABEL = {
  correct: ['right', 'Right'], incorrect: ['wrong', 'Wrong'], partly: ['wrong', 'Right answer, a step off'],
  unreadable: ['unsure', 'AI couldn’t read it'], unclear: ['unsure', 'No clear AI verdict'], error: ['unsure', 'Not checked (AI error)'],
  pending: ['unsure', 'Not checked'], 'self-right': ['right', 'Right (marked by you)'], 'self-wrong': ['wrong', 'Wrong (marked by you)'],
  noattempt: ['wrong', 'No attempt'], stuck: ['wrong', 'Stuck (asked for a hint)'], skipped: ['unsure', 'Skipped'],
};
function verdictLabel(a) {
  if (a.afterHint || (a.hints && a.hints.length && a.verdict !== 'stuck')) {
    const base = (VERDICT_LABEL[a.checkRight === true ? 'correct' : a.verdict] || VERDICT_LABEL.pending)[1];
    const n = (a.hints || []).length;
    return ['wrong', `${base} after ${n} hint${n === 1 ? '' : 's'} (counts as a miss)`];
  }
  if (a.verdict === 'stuck' && a.hints && a.hints.length) return ['wrong', `Stuck: ${a.hints.length} hint${a.hints.length === 1 ? '' : 's'}${a.skippedAfterHints ? ', then skipped' : ''}`];
  return VERDICT_LABEL[a.verdict] || (a.right === true ? VERDICT_LABEL.correct : a.right === false ? VERDICT_LABEL.incorrect : VERDICT_LABEL.pending); }
function sourceLabel(a) {
  if (a.source === 'skip') return 'skipped';
  if (a.verdict === 'stuck') return 'you pressed I’m stuck';
  return (a.source === 'key' ? 'graded by the answer key' : a.source === 'self' ? 'marked by you' : 'checked by AI' + (a.model ? ` (${a.model})` : '')) + (a.afterHint ? ', after a hint' : '');
}

async function scopedAttempts() {
  const all = await Records.all();
  const scope = state.prefs.recScope, filter = state.prefs.recFilter;
  return all.filter(a => scope === 'all' || (scope === 'deck' ? a.deckKey === state.deckKey : a.session === SESSION_ID))
    .filter(a => filter === 'all' || (filter === 'sketch' ? a.type === 'sketch' : a.right !== true));
}
let recRenderToken = 0;
async function renderRecord() {
  const token = ++recRenderToken;
  $('rec-scope').value = state.prefs.recScope; $('rec-filter').value = state.prefs.recFilter;
  const list = await scopedAttempts();
  if (token !== recRenderToken) return;
  const right = list.filter(a => a.right === true).length, wrong = list.filter(a => a.right === false).length;
  const unsure = list.length - right - wrong, pics = list.filter(a => a.image).length;
  const stats = $('rec-stats');
  stats.innerHTML = '';
  [[list.length, 'answers'], [right, 'right'], [wrong, 'wrong'], [unsure, 'not counted'], [pics, 'pictures of work']].forEach(([n, l]) => {
    const d = document.createElement('div'); d.className = 'stat';
    const b = document.createElement('b'); b.textContent = String(n);
    const s = document.createElement('span'); s.textContent = l;
    d.append(b, s); stats.appendChild(d);
  });
  ['rec-zip', 'rec-sheet', 'rec-print'].forEach(id => { $(id).disabled = !list.length; });
  $('rec-print').hidden = IN_CLAUDE;
  const ul = $('rec-list');
  ul.replaceChildren();
  const shown = list.slice().reverse().slice(0, 150);
  if (!shown.length) {
    const li = document.createElement('li'); li.className = 'rec no-img';
    li.innerHTML = '<div><p class="rec-q">Nothing here yet.</p><p class="rec-meta">Answer some questions in Study and they collect here.</p></div>';
    ul.appendChild(li);
  }
  for (const a of shown) {
    const li = document.createElement('li'); li.className = 'rec' + (a.image ? '' : ' no-img');
    if (a.image) {
      const img = document.createElement('img'); img.src = a.image; img.alt = 'Your work'; img.loading = 'lazy';
      img.addEventListener('click', () => { $('zoom-img').src = a.image; $('zoom-modal').hidden = false; });
      li.appendChild(img);
    }
    const box = document.createElement('div');
    const q = document.createElement('p'); q.className = 'rec-q'; q.textContent = a.question;
    const [cls, label] = verdictLabel(a);
    const meta = document.createElement('p'); meta.className = 'rec-meta';
    const v = document.createElement('span'); v.className = 'verdict ' + cls; v.textContent = label;
    meta.append(v, document.createTextNode(` · ${a.type === 'mc' ? 'flip card' : 'sketch'} · ${sourceLabel(a)} · ${a.category} · ${niceTime(a.ts)}`));
    box.append(q, meta);
    const lines = [];
    if (a.type === 'mc') lines.push(['You picked', a.picked]); else if (a.typed) lines.push(['You typed', a.typed]);
    if (a.type === 'sketch' && a.final && !/^none\b/i.test(a.final)) lines.push(['Final answer, as the AI read it', a.final]);
    lines.push(['Answer', a.correct]);
    for (const [k, val] of lines) {
      const p = document.createElement('p'); p.className = 'rec-meta';
      const b = document.createElement('strong'); b.textContent = k + ': ';
      const s = document.createElement('span'); s.textContent = val;
      p.append(b, s); box.appendChild(p);
    }
    if (a.read || a.feedback || a.aiExplain || (a.hints && a.hints.length) || (a.chat && a.chat.length)) {
      const d = document.createElement('details');
      const sm = document.createElement('summary'); sm.textContent = 'Help and AI feedback (written by AI, may contain mistakes)';
      const body = document.createElement('div'); body.className = 'ai-text';
      body.innerHTML = trailHTML(a);
      d.append(sm, body);
      d.addEventListener('toggle', () => { if (d.open) typeset(body); }, { once: true });
      box.appendChild(d);
    }
    li.appendChild(box);
    ul.appendChild(li);
  }
  typeset(ul);
  $('rec-note').textContent = (list.length > 150 ? `Showing the newest 150 of ${list.length}. Downloads include all of them. ` : '')
    + (Records.memoryOnly ? 'This browser won’t store the record, so it lasts only until you close the page. Download it before you go.' : 'Your record stays in this browser until you delete it.');
  updateFolderState();
}

// ---- save each answer to a folder on your computer as you go (Chrome / Edge) ----
const canPickFolder = () => !IN_CLAUDE && typeof window.showDirectoryPicker === 'function';
function updateFolderState() {
  $('rec-folder').hidden = !canPickFolder();
  $('rec-folder').textContent = state.folder ? 'Stop saving to the folder' : 'Save each answer to a folder as I go';
  $('folder-state').textContent = state.folder ? `Saving into “${state.folder.label}”.` : (canPickFolder() ? '' : '');
}
async function toggleFolder() {
  if (state.folder) { state.folder = null; updateFolderState(); return; }
  try {
    const root = await window.showDirectoryPicker({ mode: 'readwrite', id: 'flip-sketch-tutor' });
    const sub = await root.getDirectoryHandle(`${safeName(state.quiz?.quiz_name || 'session')}_${stamp()}`, { create: true });
    state.folder = { dir: sub, label: root.name + '/' + sub.name };
    updateFolderState();
    for (const a of await Records.all()) if (a.session === SESSION_ID) await folderWrite(a);
  } catch (e) {
    if (e?.name !== 'AbortError') $('folder-state').textContent = 'Couldn’t open that folder. Use Download ZIP instead.';
  }
}
async function writeFile(dir, name, data) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data); await w.close();
}
async function folderWrite(a) {
  const f = state.folder;
  if (!f) return;
  const base = `${stamp(a.ts)}_${a.type}_${a.id.slice(-5)}`;
  try {
    if (a.image) await writeFile(f.dir, base + '.png', dataURLtoBlob(a.image));
    const meta = { ...a, image: a.image ? base + '.png' : '' };
    await writeFile(f.dir, base + '.json', JSON.stringify(meta, null, 1));
  } catch (e) {
    state.folder = null; updateFolderState();
    $('folder-state').textContent = 'Lost access to the folder. Pick it again, or use Download ZIP.';
  }
}

// Everything the AI said about one answer, in the order it happened: hints, the check, the tutor, your follow-ups.
function trailHTML(a) {
  const parts = [];
  if (a.hints && a.hints.length) parts.push('<p class="muted small">Hints you asked for:</p><ol class="hint-list">' + a.hints.map(h => `<li>${md(h)}</li>`).join('') + '</ol>');
  if (a.read) parts.push('<p class="muted small">What the AI read:</p><div class="read-box">' + md(a.read) + '</div>');
  if (a.feedback && a.verdict !== 'stuck') parts.push(md(a.feedback));
  if (a.aiExplain) parts.push(md(a.aiExplain));
  if (a.chat && a.chat.length) parts.push('<p class="muted small">Your questions to the tutor' + (a.chat.length >= MAX_CHAT ? ` (last ${MAX_CHAT})` : '') + ':</p>' +
    a.chat.map(c => `<div class="me-msg">${escapeHTML(c.q)}${c.pic ? ' <span class="muted small">(picture sent)</span>' : ''}</div><div class="ai-msg">${md(c.a)}</div>`).join(''));
  return parts.join('');
}
