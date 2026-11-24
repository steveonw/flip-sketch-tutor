// ---------- Mistakes view (from Flip Quiz Tutor) ----------
function catStats() {
  const cats = new Map();
  let attempted = 0, right = 0, wrong = 0;
  for (const q of state.index) {
    if (!cats.has(q.categoryName)) cats.set(q.categoryName, { name: q.categoryName, total: 0, attempted: 0, right: 0, wrong: 0, needs: 0 });
    const c = cats.get(q.categoryName);
    c.total++;
    const r = recFor(q.key);
    if (r && (r.right + r.wrong) > 0) {
      c.attempted++; c.right += r.right; c.wrong += r.wrong; attempted++; right += r.right; wrong += r.wrong;
      if (needsWork(r)) c.needs++;
    }
  }
  return { cats: [...cats.values()], attempted, right, wrong };
}
function weakList() {
  return state.index.map(q => ({ q, r: recFor(q.key) })).filter(x => needsWork(x.r))
    .sort((a, b) => (b.r.wrong - a.r.wrong) || ((b.r.lastAt || 0) - (a.r.lastAt || 0)));
}
function fixedList() { return state.index.map(q => ({ q, r: recFor(q.key) })).filter(x => x.r && x.r.wrong > 0 && !needsWork(x.r)); }

function missItem({ key, q, cat, correct, pickedNow, rec, type, showExplain = true }) {
  const li = document.createElement('li');
  li.className = 'miss';
  const add = (cls, label, val) => {
    const p = document.createElement('p'); p.className = 'miss-line ' + cls;
    const l = document.createElement('span'); l.className = 'label'; l.textContent = label;
    p.appendChild(l);
    if (val !== undefined) { const v = document.createElement('span'); v.className = 'val'; v.textContent = val; p.appendChild(v); }
    li.appendChild(p);
  };
  const c = document.createElement('p'); c.className = 'miss-cat'; c.textContent = cat + (type === 'sketch' ? ' · sketch problem' : '');
  const qq = document.createElement('p'); qq.className = 'miss-q'; qq.textContent = q;
  li.append(c, qq);
  add('right', 'Correct: ', correct);
  if (pickedNow) add('wrong', type === 'sketch' ? 'Your answer: ' : 'You picked: ', pickedNow);
  else if (rec && rec.picks.length) add('wrong', 'Your answers: ', rec.picks.map(p => p.a + (p.n > 1 ? ` (${p.n}×)` : '')).join('; '));
  if (rec) add('', `Missed ${rec.wrong}×, right ${rec.right}×${rec.streak ? `, ${rec.streak} in a row now` : ''}`);
  if (showExplain) {
    const row = document.createElement('div'); row.className = 'row'; row.dataset.ai = '';
    row.hidden = !state.ai.ready;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'quiet'; btn.textContent = 'Explain';
    const out = document.createElement('div'); out.className = 'ai-text'; out.hidden = true;
    const err = document.createElement('p'); err.className = 'ai-error'; err.hidden = true;
    btn.addEventListener('click', () => explainMiss(key, pickedNow, btn, out, err));
    row.appendChild(btn);
    li.append(row, out, err);
  }
  return li;
}
async function explainMiss(key, pickedNow, btn, out, err) {
  if (!state.ai.ready) return;
  const item = state.index.find(x => x.key === key);
  const rec = recFor(key);
  if (!item) return;
  const cText = correctText(item);
  const prompt = `You are a patient tutor helping a college student review a question they keep missing. Speak to them as "you".

${deckContext()}
Category: ${item.categoryName}
Question: ${item.question}
${item.type === 'mc' ? `Choices: ${item.answers.map(a => `"${a}"`).join(', ')}\n` : ''}Correct answer: "${cText}"
${item.solution ? `Worked solution: ${item.solution}\n` : ''}${rec?.picks.length ? `Their wrong answers so far: ${rec.picks.map(p => `"${p.a}" (${p.n}×)`).join(', ')}.` : pickedNow ? `They answered "${pickedNow}".` : ''}
${item.explanation ? `Deck's short explanation: ${item.explanation}` : ''}

1. Name the specific misconception behind their wrong answer(s).
2. Show why "${cText}" is right; if it's a computation, show the key steps.
3. Give one memory tip or exam check.
${rec?.lastExplain ? `Last time you explained it like this: "${rec.lastExplain.replace(/\s+/g, ' ').slice(0, 500)}". Use a different angle this time.\n` : ''}Speak to the student as "you". Under 170 words, short paragraphs or "- " bullets, **bold** only for key terms, no headings. ${MATH_STYLE}`;
  btn.disabled = true; out.hidden = false; err.hidden = true;
  out.innerHTML = '<p class="thinking">Thinking…</p>';
  try {
    const text = await callAI({ system: '', messages: [{ role: 'user', text: prompt }], onText: t => { out.innerHTML = md(t); } });
    out.innerHTML = md(text);
    typeset(out);
    if (rec) { rec.lastExplain = text.slice(0, 700); saveProgress(); }
  } catch (e) {
    out.innerHTML = e?.text ? md(e.text) : ''; out.hidden = !e?.text;
    if (e?.code !== 'cancelled') { err.textContent = e.message; err.hidden = false; }
  } finally { btn.disabled = false; btn.textContent = 'Explain again'; }
}
function renderMistakes() {
  const s = catStats();
  const attempts = s.right + s.wrong;
  const acc = attempts ? Math.round((s.right / attempts) * 100) : 0;
  const nWeak = missedCount();
  $('stats').innerHTML = `
    <div class="stat"><b>${s.attempted}</b><span>of ${state.index.length} questions tried</span></div>
    <div class="stat"><b>${attempts ? acc + '%' : '—'}</b><span>correct across ${attempts} answers</span></div>
    <div class="stat"><b>${nWeak}</b><span>need work</span></div>`;
  const bars = $('cat-bars');
  bars.replaceChildren();
  s.cats.forEach(c => {
    const n = c.right + c.wrong;
    const p = n ? Math.round((c.right / n) * 100) : 0;
    const div = document.createElement('div');
    const cls = !n ? '' : p < 60 ? 'low' : p >= 85 ? 'high' : '';
    div.innerHTML = `<div class="cat-bar-top"><span>${escapeHTML(c.name)}</span><span>${n ? `${p}% correct` : 'not tried yet'}${c.needs ? `, ${c.needs} to fix` : ''}</span></div>
      <div class="bar ${cls}" role="img" aria-label="${escapeHTML(c.name)}: ${n ? p + '% correct' : 'not tried'}"><i style="width:${n ? Math.max(p, 3) : 0}%"></i></div>`;
    bars.appendChild(div);
  });
  const list = $('miss-list');
  list.replaceChildren();
  const weak = weakList();
  if (!weak.length) {
    const li = document.createElement('li'); li.className = 'miss';
    li.innerHTML = attempts
      ? '<p class="miss-q">Nothing to fix right now.</p><p class="miss-line"><span class="label">Missed questions show up here until you get them right twice in a row.</span></p>'
      : '<p class="miss-q">No answers yet.</p><p class="miss-line"><span class="label">Answer some questions in Study and your misses will collect here.</span></p>';
    list.appendChild(li);
  }
  weak.forEach(({ q, r }) => list.appendChild(missItem({ key: q.key, q: q.question, cat: q.categoryName, correct: correctText(q), rec: r, type: q.type })));
  $('mistakes-practice-btn').disabled = !weak.length;
  $('mistakes-practice-btn').textContent = weak.length ? `Practice these (${weak.length})` : 'Practice these';
  const fixed = fixedList();
  $('fixed-wrap').hidden = !fixed.length;
  $('fixed-summary').textContent = `Fixed (${fixed.length}): missed before, now right twice in a row`;
  const fl = $('fixed-list');
  fl.replaceChildren();
  fixed.forEach(({ q, r }) => fl.appendChild(missItem({ key: q.key, q: q.question, cat: q.categoryName, correct: correctText(q), rec: r, type: q.type, showExplain: false })));
  typeset(list, fl);
}
function updateMissBadge() {
  const n = state.index.length ? missedCount() : 0;
  $('miss-count').textContent = n ? String(n) : '';
  const opt = [...$('category-select').options].find(o => o.value === 'missed');
  if (opt) opt.textContent = `My missed questions (${n})`;
}
function refreshSideViews() {
  updateMissBadge();
  if (!$('view-mistakes').hidden) renderMistakes();
  if (!$('view-record').hidden) renderRecord();
}
function showTab(name) {
  ['study', 'mistakes', 'record', 'aiquiz'].forEach(t => {
    $('tab-' + t).setAttribute('aria-selected', String(t === name));
    $('view-' + t).hidden = t !== name;
  });
  if (name === 'mistakes') renderMistakes();
  if (name === 'record') renderRecord();
  if (name === 'aiquiz') renderCoachTab();
}

// ---------- AI coach: help with what I got wrong, then practice from a new angle ----------
const clip = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
async function coachAttempts() {
  const scope = $('coach-scope').value;
  const all = await Records.all();
  const mine = all.filter(a => a.deckKey === state.deckKey && (scope === 'deck' || a.session === SESSION_ID));
  // one line per question: the latest attempt, with the miss count from progress
  const latest = new Map();
  for (const a of mine) latest.set(a.type + '|' + a.question, a);
  return [...latest.values()];
}
function coachRecordText(list) {
  list = list.slice();
  const skipped = list.filter(a => a.verdict === 'skipped');
  list = list.filter(a => a.verdict !== 'skipped');
  const wrong = list.filter(a => a.right === false), unsure = list.filter(a => a.right !== true && a.right !== false), right = list.filter(a => a.right === true);
  const misses = a => { const q = state.index.find(x => x.question === a.question && x.type === a.type); const r = q && recFor(q.key); return r && r.wrong > 1 ? `\n   Missed ${r.wrong} times so far.` : ''; };
  const block = (a, i) => {
    const head = `#${i + 1} [${a.category}] ${a.type === 'mc' ? 'Flip card' : 'Sketch problem'}${a.aiWritten ? ' (AI-written practice)' : ''}\n   Question: ${clip(a.question, 300)}`;
    const body = a.type === 'mc'
      ? `\n   Choices: ${(a.choices || []).map(c => clip(c, 80)).join(' | ')}\n   They picked: ${clip(a.picked, 120)}`
      : a.verdict === 'stuck' ? `\n   They pressed "I'm stuck" and never submitted an answer${a.typed ? ` (typed so far: ${clip(a.typed, 120)})` : ''}.`
      : `\n   Typed final answer: ${a.typed ? clip(a.typed, 120) : '(none)'}\n   What the AI read on their pad: ${a.image ? clip(a.read || '(not read)', 500) : '(blank pad)'}${a.final ? `\n   Their final answer, as read: ${clip(a.final, 120)}` : ''}\n   Verdict: ${a.verdict || 'none'}${a.afterHint ? ' (after a hint)' : ''}\n   What the AI check told them: ${clip(a.feedback, 350) || '(no check)'}`;
    const self = a.source === 'self' && a.verdict !== 'stuck' && !a.afterHint ? `\n   They marked this one ${a.right ? 'right' : 'wrong'} themselves.` : '';
    const hints = a.hints && a.hints.length ? `\n   They asked for ${a.hints.length} hint${a.hints.length === 1 ? '' : 's'}${a.afterHint ? `, then submitted (the check said: ${a.checkRight === true ? 'correct' : a.verdict})` : a.skippedAfterHints ? ', then skipped it' : ''}.` : '';
    const asked = a.chat && a.chat.length ? `\n   They asked the tutor: ${a.chat.map(c => '"' + clip(c.q, 100) + '"').join('; ')}` : '';
    return head + body + `\n   Correct answer: ${clip(a.correct, 200)}` + self + hints + asked + misses(a);
  };
  const parts = [];
  parts.push(`WRONG (${wrong.length})`, wrong.length ? wrong.slice(-30).map(block).join('\n\n') : '(none)');
  parts.push(`\nNOT COUNTED: no readable final answer (${unsure.length})`, unsure.length ? unsure.slice(-20).map(block).join('\n\n') : '(none)');
  parts.push(`\nSKIPPED (${skipped.length})`, skipped.length ? skipped.slice(-20).map(a => `- [${a.category}] ${clip(a.question, 140)}`).join('\n') : '(none)');
  parts.push(`\nRIGHT (${right.length})`, right.length ? right.slice(-30).map(a => `- [${a.category}] ${clip(a.question, 140)}  →  ${clip(a.correct, 80)}${a.chat && a.chat.length ? `  (They asked the tutor: ${a.chat.map(c => '"' + clip(c.q, 80) + '"').join('; ')})` : ''}`).join('\n') : '(none)');
  return { text: parts.join('\n'), wrong: wrong.length, unsure: unsure.length + skipped.length, right: right.length };
}
function shortDay(ts = Date.now()) { return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' }); }
function addPracticeSet(questions, name, source, focus) {
  const cats = new Map();
  questions.forEach(({ cat, q }) => { if (!cats.has(cat)) cats.set(cat, []); cats.get(cat).push(q); });
  const set = { id: 'p' + Date.now().toString(36), name, source, focus: focus || '', at: Date.now(),
    provider: shortProviderName(aiCfg.provider), categories: [...cats].map(([n, qs]) => ({ name: n, questions: qs })) };
  state.progress.sets.push(set);
  set.removedOldest = '';
  while (state.progress.sets.length > MAX_SETS) set.removedOldest = state.progress.sets.shift().name;
  saveProgress();
  const sel = $('category-select').value;
  buildIndex();
  fillCategorySelect(sel);
  renderSets();
  return set;
}
function practiceSet(id) {
  state.prefs.typeMode = 'mixed'; $('type-select').value = 'mixed'; savePrefs();
  fillCategorySelect('set:' + id);
  showTab('study');
  prepareQuestions(false);
}
async function runCoach() {
  if (!state.ai.ready || state.genCtl || !state.quiz) return;
  const list = await coachAttempts();
  const focus = $('coach-focus').value.trim();
  if (!list.length && !focus) { $('coach-note').textContent = 'Answer some questions first (or say what you want help with), then ask for coaching.'; return; }
  const rec = coachRecordText(list);
  const makeSet = $('coach-make-set').checked, count = Number($('coach-count').value) || 8, mix = $('coach-mix').value;
  const ctl = new AbortController(); state.genCtl = ctl;
  $('coach-btn').disabled = true; $('coach-stop').hidden = false; $('coach-practice').hidden = true;
  $('coach-note').textContent = `Sending a text copy of ${list.length} answer${list.length === 1 ? '' : 's'} (${rec.wrong} wrong, ${rec.unsure} not counted, ${rec.right} right). No pictures are sent. This can take a minute.`;
  $('coach-wrap').hidden = false; $('coach-meta').textContent = '';
  $('coach-out').innerHTML = '<p class="thinking">Reading your answers…</p>';
  try {
    const text = await callAI({ system: '', messages: [{ role: 'user', text: buildCoachPrompt({ record: rec.text, focus, makeSet, count, mix }) }],
      signal: ctl.signal, tier: 'default', onText: t => { if (state.genCtl === ctl) $('coach-out').innerHTML = md(splitCoachReply(t).coaching); } });
    const { coaching, rest } = splitCoachReply(text);
    let set = null, note = '';
    if (makeSet) {
      const { questions, dropped } = parseQuizBlocks(rest);
      if (questions.length) {
        set = addPracticeSet(questions, `${shortDay()}${focus ? ': ' + clip(focus, 40) : ': from my mistakes'}`, 'coach', focus);
        note = `Added a practice set of ${questions.length} question${questions.length === 1 ? '' : 's'} to this deck.` + (dropped.length ? ` ${dropped.length} came back broken and were left out.` : '')
          + (set.removedOldest ? ` To stay at ${MAX_SETS} sets, the oldest one (“${set.removedOldest}”) was removed.` : '');
      } else note = 'The practice set came back in the wrong format, so only the coaching was kept. Try again for a set.';
    }
    state.progress.coach.push({ id: 'c' + Date.now().toString(36), at: Date.now(), scope: $('coach-scope').value, focus, text: coaching, setId: set?.id || '',
      counts: { wrong: rec.wrong, unsure: rec.unsure, right: rec.right } });
    while (state.progress.coach.length > MAX_COACH) state.progress.coach.shift();
    saveProgress();
    renderCoach();
    $('coach-note').textContent = note;
  } catch (e) {
    $('coach-note').textContent = e?.code === 'cancelled' ? 'Stopped.' : (e.message || 'The coach didn’t answer.');
    renderCoach();
  } finally {
    state.genCtl = null; $('coach-stop').hidden = true; refreshAiState();
  }
}
function latestCoach() { const c = state.progress?.coach || []; return c[c.length - 1] || null; }
function renderCoach() {
  const c = latestCoach();
  $('coach-wrap').hidden = !c;
  if (!c) return;
  $('coach-out').innerHTML = md(c.text);
  typeset($('coach-out'));
  const set = (state.progress.sets || []).find(s => s.id === c.setId);
  $('coach-practice').hidden = !set;
  $('coach-meta').textContent = `Coaching from ${niceTime(c.at)}, based on ${c.counts.wrong} wrong, ${c.counts.unsure} not counted and ${c.counts.right} right answer${c.counts.right === 1 ? '' : 's'}${c.focus ? `. You asked: “${clip(c.focus, 120)}”` : ''}.`;
}
function coachNotesMarkdown(notes) {
  return notes.map(c => `# Coaching notes: ${state.quiz?.quiz_name || ''}\n_${new Date(c.at).toLocaleString()}${c.focus ? ` · You asked: ${c.focus}` : ''}_\n\n${c.text}\n`).join('\n---\n\n');
}
function renderSets() {
  const ul = $('set-list');
  if (!ul || !state.progress) return;
  ul.replaceChildren();
  const sets = (state.progress.sets || []).slice().reverse();
  if (!sets.length) {
    const li = document.createElement('li'); li.className = 'miss';
    li.innerHTML = '<p class="miss-q">No practice sets yet.</p><p class="miss-line"><span class="label">Ask the coach above, or write a set from a topic below.</span></p>';
    ul.appendChild(li); return;
  }
  for (const set of sets) {
    const n = set.categories.reduce((k, c) => k + c.questions.length, 0);
    const idx = state.index.filter(q => q.setId === set.id);
    const tried = idx.filter(q => { const r = recFor(q.key); return r && r.right + r.wrong; }).length;
    const li = document.createElement('li'); li.className = 'miss set-item';
    const t = document.createElement('p'); t.className = 'miss-q'; t.textContent = set.name;
    const m = document.createElement('p'); m.className = 'miss-line';
    m.textContent = `${n} question${n === 1 ? '' : 's'} · ${tried} tried · ${set.source === 'coach' ? 'from coaching' : 'from a topic'} · written by ${set.provider} · ${niceTime(set.at)}`;
    const row = document.createElement('div'); row.className = 'row';
    const go = document.createElement('button'); go.type = 'button'; go.className = 'primary'; go.textContent = 'Practice';
    go.addEventListener('click', () => practiceSet(set.id));
    const save = document.createElement('button'); save.type = 'button'; save.className = 'quiet'; save.textContent = 'Save as deck file';
    save.addEventListener('click', () => exportSetDeck(set.id));
    const del = document.createElement('button'); del.type = 'button'; del.className = 'danger'; del.textContent = 'Delete';
    let armed = false;
    del.addEventListener('click', () => {
      if (!armed) { armed = true; del.textContent = 'Click again to delete'; setTimeout(() => { armed = false; del.textContent = 'Delete'; }, 3500); return; }
      state.progress.sets = state.progress.sets.filter(s => s.id !== set.id);
      saveProgress();
      const sel = $('category-select').value;
      buildIndex(); fillCategorySelect(sel === 'set:' + set.id ? 'all' : sel);
      if (sel === 'set:' + set.id) prepareQuestions(false);
      renderSets(); renderCoach(); updateMissBadge();
    });
    row.append(go, save, del);
    li.append(t, m, row);
    ul.appendChild(li);
  }
}
async function generateTopicSet() {
  if (!state.ai.ready || state.genCtl || !state.quiz) return;
  const topic = $('gen-topic').value.trim();
  if (!topic) { $('gen-note').textContent = 'Describe what to practice first.'; return; }
  const count = Number($('gen-count').value) || 8, mix = $('gen-mix').value;
  const ctl = new AbortController(); state.genCtl = ctl;
  $('gen-btn').disabled = true; $('coach-btn').disabled = true; $('gen-stop').hidden = false;
  $('gen-note').textContent = `Writing ${count} questions… this can take up to a minute.`;
  try {
    const text = await callAI({ system: '', messages: [{ role: 'user', text: buildQuizPrompt(topic, count, mix) }], signal: ctl.signal, tier: 'default' });
    const { questions, dropped } = parseQuizBlocks(text);
    if (!questions.length) throw aiError('format', 'The set came back in the wrong format. Try again.');
    const set = addPracticeSet(questions, `${shortDay()}: ${clip(topic.split(/[.\n]/)[0], 50)}`, 'topic', topic);
    $('gen-note').textContent = `Added “${set.name}” with ${questions.length} questions.` + (dropped.length ? ` ${dropped.length} came back broken and were left out.` : '')
      + (set.removedOldest ? ` To stay at ${MAX_SETS} sets, the oldest one (“${set.removedOldest}”) was removed.` : '');
  } catch (e) {
    $('gen-note').textContent = e?.code === 'cancelled' ? '' : (e.message || 'Couldn’t write the set.');
  } finally {
    state.genCtl = null; $('gen-stop').hidden = true; refreshAiState();
  }
}
function renderCoachTab() { renderCoach(); renderSets(); }

// ---------- AI settings ----------
function openAiModal() {
  const sel = $('ai-provider');
  sel.replaceChildren();
  providerList().forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = PROVIDERS[k].label; sel.appendChild(o); });
  sel.value = aiCfg.provider;
  $('ai-intro').textContent = IN_CLAUDE
    ? 'Flip cards always work with no AI. Inside Claude, this page uses Claude itself: no key needed. (Other AIs work in the downloaded copy of this page.)'
    : 'Flip cards always work with no AI. Pick an AI to unlock sketch problems, explanations and AI-written quizzes. Your key stays in this browser and never goes into anything you download.';
  fillAiFields();
  $('ai-status').textContent = '';
  state.ai.readyAtOpen = state.ai.ready;
  $('ai-modal').hidden = false;
  sel.focus();
}
function fillAiFields() {
  const p = $('ai-provider').value, d = PROVIDERS[p];
  $('ai-key-wrap').hidden = !d.key; $('ai-remember-wrap').hidden = !d.key;
  $('ai-model-wrap').hidden = d.model === undefined;
  $('ai-base-wrap').hidden = !d.base;
  $('ai-key').value = d.key ? (aiKeys[p] ?? d.keyDefault ?? '') : '';
  $('ai-key').placeholder = d.optionalKey ? 'Only if your server needs one' : 'Paste your key';
  $('ai-model').value = modelFor(p);
  $('ai-model').placeholder = d.modelHint || '';
  $('ai-base').value = baseFor(p);
  $('ai-remember').checked = !!aiCfg.remember;
  $('ai-mode').value = state.prefs.aiMode === 'econ' ? 'econ' : 'normal';
  $('ai-mode-wrap').hidden = p === 'none';
  $('ai-help').textContent = d.help || (p === 'claude' ? 'Claude asks your permission the first time. Pictures of your work are sent to Claude only when you submit a sketch problem.' : p === 'none' ? 'Sketch problems stay hidden until you pick an AI.' : '');
}
function readAiFields() {
  const p = $('ai-provider').value, d = PROVIDERS[p];
  aiCfg.provider = p;
  if (d.key) aiKeys[p] = $('ai-key').value.trim();
  if (d.model !== undefined) aiCfg.models[p] = $('ai-model').value.trim();
  if (d.base) aiCfg.bases[p] = $('ai-base').value.trim();
  aiCfg.remember = $('ai-remember').checked;
  state.prefs.aiMode = $('ai-mode').value === 'econ' ? 'econ' : 'normal'; savePrefs();
  updateResendBox();
  saveAiConfig();
  refreshAiState();
}
async function testAi() {
  readAiFields();
  const problem = aiConfigProblem();
  if (aiCfg.provider === 'none') { $('ai-status').textContent = 'No AI chosen.'; return; }
  if (problem) { $('ai-status').textContent = problem; return; }
  $('ai-status').textContent = 'Testing…';
  try {
    const t = await callAI({ system: '', messages: [{ role: 'user', text: 'Reply with the single word: ready' }] });
    $('ai-status').textContent = 'Connected. The AI said: “' + t.slice(0, 60) + '”';
  } catch (e) { $('ai-status').textContent = e.message; }
}
function closeAiModal() {
  const wasReady = state.ai.readyAtOpen;
  readAiFields();
  $('ai-modal').hidden = true;
  if (state.quiz && wasReady !== state.ai.ready) prepareQuestions(false);
  updateStorageNote();
}

function updateStorageNote() {
  const bits = [];
  bits.push(Store.ok ? 'Your progress is saved in this browser.' : 'This browser isn’t saving progress, so it lasts until you close the page.');
  if (mathFailed) bits.push('Math couldn’t be drawn (no connection to the math renderer), so it shows as plain TeX. The offline copy of this page has it built in.');
  $('storage-note').textContent = bits.join(' ');
}
