// ---------- the quiz (Flip Quiz Tutor flow, plus sketch problems) ----------
function currentQ() { return state.questions[state.currentIndex]; }

function makeQuestionList(value) {
  let base;
  if (value === 'all') base = state.index.filter(q => !q.ai);
  else if (value === 'missed') base = state.index.filter(q => needsWork(recFor(q.key)));
  else if (value.startsWith('set:')) base = state.index.filter(q => q.setId === value.slice(4));
  else base = state.index.filter(q => q.catIndex === Number(value));
  const mode = state.prefs.typeMode;
  const typed = base.filter(q => mode === 'mixed' || q.type === mode);
  const hidden = state.ai.ready ? 0 : typed.filter(q => q.type === 'sketch').length;
  return { list: state.ai.ready ? typed : typed.filter(q => q.type === 'mc'), hidden, typedCount: typed.length };
}

function prepareQuestions(shouldShuffle) {
  abortTutor(); abortCheck();
  const { list: picked, hidden, typedCount } = makeQuestionList($('category-select').value);
  const list = picked.map(q => ({ ...q }));
  if (shouldShuffle || $('category-select').value === 'missed') shuffleArray(list);
  list.forEach(q => {
    if (q.type === 'mc') q.choices = shuffleArray(q.answers.map((text, i) => ({ text, isCorrect: i === q.correctAnswer })));
  });
  state.questions = list;
  state.currentIndex = 0; state.answered = false; state.outcomes = [];
  $('deck-unverified').hidden = !(state.quiz.ai_generated || $('category-select').value.startsWith('set:'));
  $('question-screen').hidden = false;
  $('results-screen').hidden = true;
  const deckSketches = state.index.filter(q => q.type === 'sketch').length;
  $('sketch-notice').hidden = state.ai.ready || !deckSketches;
  $('sketch-notice-text').textContent = hidden
    ? `${hidden} sketch problem${hidden === 1 ? ' is' : 's are'} hidden until you connect an AI to read your work.`
    : `This deck has ${deckSketches} sketch problem${deckSketches === 1 ? '' : 's'}. Connect an AI to unlock them.`;
  const empty = !list.length;
  $('quiz-empty').hidden = !empty;
  $('quiz-body').hidden = empty;
  $('next-btn').disabled = true;
  if (empty) {
    $('quiz-empty-title').textContent = typedCount && hidden === typedCount ? 'These are all sketch problems.' : 'Nothing to practice here.';
    $('quiz-empty-text').textContent = typedCount && hidden === typedCount
      ? 'Connect an AI to work them on the sketch pad, or switch Question types to flip cards.'
      : ($('category-select').value === 'missed' ? 'No missed questions right now. Pick another set from the Practice menu.' : 'Pick another set from the Practice menu.');
    $('question-count').textContent = 'Question 0 of 0';
    $('score-count').textContent = 'Score: 0';
    $('category-name').textContent = '';
    $('progress-fill').style.width = '0%';
    return;
  }
  renderQuestion();
}
function scoreNow() { return (state.outcomes || []).filter(o => o && o.right === true).length; }
function updateScore() { $('score-count').textContent = `Score: ${scoreNow()} / ${state.questions.length}`; }

function resetAnswerArea() {
  $('feedback').textContent = '';
  $('explanation').textContent = ''; $('explanation').hidden = true;
  $('check-box').hidden = true; $('check-body').innerHTML = ''; $('check-error').hidden = true;
  $('key-box').hidden = true; $('key-box').open = false; $('override').hidden = true;
  $('ai-actions').hidden = true;
  resetTutorView();
  $('resend-pic').checked = false; $('resend-wrap').hidden = true;
  $('hint-box').hidden = true; $('hint-list').innerHTML = '';
}

function renderQuestion() {
  const q = currentQ();
  state.picked = -1; state.answered = false; state.check.attempt = null; state.check.applied = null; state.check.stuck = null;
  setMath($('question-text'), q.question);
  $('qtype').textContent = q.type === 'mc' ? 'Flip card' : 'Sketch problem: show your work';
  $('category-name').textContent = q.categoryName;
  $('question-count').textContent = `Question ${state.currentIndex + 1} of ${state.questions.length}`;
  updateScore();
  const pct = Math.round((state.currentIndex / state.questions.length) * 100);
  $('progress-fill').style.width = pct + '%';
  $('progress-bar').setAttribute('aria-valuenow', String(pct));
  resetAnswerArea();
  $('next-btn').disabled = true;
  $('next-btn').textContent = state.currentIndex === state.questions.length - 1 ? 'See results' : 'Next question';

  const grid = $('answer-grid');
  grid.replaceChildren();
  if (q.type === 'mc') {
    grid.hidden = false; $('pad-panel').hidden = true;
    $('feedback').textContent = 'Choose an answer.';
    q.choices.forEach((choice, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'answer-card';
      b.setAttribute('aria-label', `Answer ${i + 1}: ${choice.text}`);
      const hint = document.createElement('span'); hint.className = 'key-hint'; hint.textContent = String(i + 1); hint.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span'); inner.className = 'card-inner';
      const front = document.createElement('span'); front.className = 'card-face card-front' + (choice.text.replace(/\\[a-z]+|[${}]/gi, '').length > 38 ? ' long' : '');
      const ft = document.createElement('span'); ft.className = 'face-text'; ft.textContent = choice.text; front.appendChild(ft); // one text block, so inline math stays in the sentence
      const back = document.createElement('span'); back.className = 'card-face card-back';
      inner.append(front, back); b.append(hint, inner);
      b.addEventListener('click', () => chooseAnswer(i));
      grid.appendChild(b);
    });
    typeset(grid);
  } else {
    grid.hidden = true; $('pad-panel').hidden = false;
    $('feedback').textContent = 'Work it out on the pad, then submit.';
    Pad.reset({ size: q.pad || state.prefs.padSize, paper: q.paper || state.prefs.paper });
    $('typed-answer').value = '';
    $('submit-btn').disabled = false; $('submit-btn').textContent = 'Submit my work';
    $('skip-btn').hidden = false; updateStuckButton(); $('stuck-btn').disabled = false;
  }
}

// ---- progress bookkeeping (Flip Quiz Tutor's record, made reversible for sketch overrides) ----
function applyProgress(q, pickedText, right) {
  const r = state.progress.questions[q.key] || { right: 0, wrong: 0, streak: 0, picks: [] };
  r.q = q.question; r.cat = q.categoryName; r.correct = correctText(q); r.type = q.type;
  r.lastAt = Date.now();
  if (right) { r.right++; r.streak++; }
  else {
    r.wrong++; r.streak = 0;
    const p = r.picks.find(x => x.a === pickedText);
    if (p) p.n++; else r.picks.push({ a: pickedText, n: 1 });
  }
  state.progress.questions[q.key] = r;
  saveProgress();
}
function newAttempt(q, extra) {
  return Object.assign({
    id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), ts: Date.now(), session: SESSION_ID,
    deckKey: state.deckKey, deckName: state.quiz.quiz_name, aiWritten: !!(state.quiz.ai_generated || q.ai), setId: q.setId || '',
    category: q.categoryName, type: q.type, question: q.question, correct: correctText(q),
    solution: q.solution || '', explanation: q.explanation || '',
    choices: q.type === 'mc' ? q.choices.map(c => c.text) : null,
    picked: '', typed: '', image: '', right: null, source: q.type === 'mc' ? 'key' : 'ai', verdict: '',
    read: '', feedback: '', aiExplain: '', provider: '', model: '',
  }, extra || {});
}
async function storeAttempt(a) {
  await Records.put(a);
  if (state.folder) folderWrite(a);
  if (!$('view-record').hidden) renderRecord();
}

function chooseAnswer(i) {
  if (state.answered) return;
  const q = currentQ();
  if (!q || q.type !== 'mc') return;
  const choice = q.choices[i];
  if (!choice) return;
  state.answered = true; state.picked = i;
  [...$('answer-grid').querySelectorAll('.answer-card')].forEach((b, j) => {
    b.disabled = true;
    const c = q.choices[j];
    if (c.isCorrect) b.classList.add('correct-answer');
    if (j === i) {
      b.classList.add('flipped', 'selected', c.isCorrect ? 'correct' : 'incorrect');
      b.querySelector('.card-back').textContent = c.isCorrect ? 'Correct!' : 'Not quite';
    } else if (!c.isCorrect) b.classList.add('dimmed');
  });
  const cText = correctText(q);
  const fb = $('feedback');
  if (choice.isCorrect) fb.innerHTML = '<span class="good"><strong>Correct!</strong></span>';
  else {
    fb.innerHTML = '<span class="bad"><strong>Not quite.</strong></span> The correct answer is <strong class="ans"></strong>.';
    fb.querySelector('.ans').textContent = cText;
  }
  typeset(fb);
  if (q.explanation) { $('explanation').hidden = false; setMath($('explanation'), q.explanation); }
  state.outcomes[state.currentIndex] = { q, right: choice.isCorrect, picked: choice.text };
  updateScore();
  $('next-btn').disabled = false;
  applyProgress(q, choice.text, choice.isCorrect);
  updateMissBadge();
  const a = newAttempt(q, { picked: choice.text, right: choice.isCorrect, verdict: choice.isCorrect ? 'correct' : 'incorrect' });
  state.check.attempt = a;
  storeAttempt(a);
  $('explain-btn').textContent = choice.isCorrect ? 'Why the other choices are wrong' : 'Explain my mistake';
  $('ai-actions').hidden = !state.ai.ready;
  if (!choice.isCorrect && state.prefs.autoExplain && state.ai.ready) explainCurrent();
  else $('next-btn').focus({ preventScroll: true });
}

// ---- sketch problems ----
function stampAI(extra) { return Object.assign({ provider: aiCfg.provider, model: aiCfg.provider === 'claude' ? 'Claude' : modelFor(aiCfg.provider) }, extra || {}); }
async function submitSketch() {
  const q = currentQ();
  if (!q || q.type !== 'sketch' || state.check.ctl || state.answered) return;
  const typed = $('typed-answer').value.trim();
  const ink = Pad.hasInk() && Pad.inkVisible(); // a pad erased back to blank doesn't count as work
  if (!ink && !typed) { $('feedback').innerHTML = '<span class="unsure">Write your work on the pad, or type your final answer, first. Stuck? Press “I’m stuck” for a first step.</span>'; return; }
  if (!state.ai.ready) { $('feedback').innerHTML = '<span class="unsure">Connect an AI to check sketch problems.</span>'; return; }
  const image = ink ? Pad.exportPNG() : '';
  Pad.setEnabled(false);
  $('submit-btn').disabled = true; $('skip-btn').hidden = true; $('stuck-btn').hidden = true; $('typed-answer').disabled = true;
  let a;
  if (state.check.stuck?.attempt) { // after hints: the same record carries on
    a = Object.assign(state.check.stuck.attempt, stampAI({ typed, image, padSize: Pad.size, verdict: 'pending', afterHint: true, ts: Date.now() }));
  } else a = newAttempt(q, stampAI({ typed, image, padSize: Pad.size, verdict: 'pending' }));
  state.check.attempt = a;
  await Records.put(a); // keep the picture even if the AI call fails
  runCheck();
}
async function runCheck() {
  const q = currentQ(), a = state.check.attempt;
  if (!q || !a) return;
  abortCheck(); abortTutor();
  const ctl = new AbortController(); state.check.ctl = ctl;
  $('next-btn').disabled = true; // Next waits for the check, so it can't be cancelled by accident
  $('check-box').hidden = false; $('check-error').hidden = true; $('override').hidden = true; $('key-box').hidden = true;
  $('check-title').textContent = 'AI check';
  $('check-body').innerHTML = '<p class="thinking">Reading your work…</p>';
  $('feedback').innerHTML = '<span class="muted">Checking…</span>';
  const messages = [{ role: 'user', text: sketchUserText(q, a.typed, !!a.image), images: a.image ? [a.image] : [] }];
  try {
    const text = await callAI({ system: sketchSystemPrompt(), messages, signal: ctl.signal, tier: 'default' });
    if (state.check.ctl !== ctl) return;
    const res = parseCheck(text);
    showCheck(q, a, res);
    state.tutor.turns = sketchTutorTurns(q, a, text);
    $('resend-pic').checked = res.verdict === 'unreadable' || res.verdict === 'unclear';
    $('tutor').hidden = false; renderTutor();
    applySketchResult(q, a, verdictToRight(res.verdict), 'ai', res);
    const r = state.progress.questions[q.key];
    if (r && res.feedback) { r.lastFeedback = res.feedback.slice(0, 600); saveProgress(); }
  } catch (e) {
    if (state.check.ctl !== ctl) return;
    $('check-body').innerHTML = '';
    $('check-error').textContent = e.message || 'The AI check failed.';
    $('check-error').hidden = false;
    $('feedback').innerHTML = '<span class="unsure">Not checked yet.</span> Mark it yourself below, check again, or ask the tutor.';
    a.verdict = 'error'; a.feedback = e.message || '';
    state.tutor.turns = sketchTutorTurns(q, a, '(The check failed, so there is no reading of the pad yet.)');
    $('resend-pic').checked = true;
    $('tutor').hidden = false; renderTutor();
    showKey(q);
    $('override').hidden = false;
    storeAttempt(a);
  } finally {
    if (state.check.ctl === ctl) {
      state.check.ctl = null;
      state.answered = true; $('next-btn').disabled = false;
      updateResendBox();
    }
  }
}
function showKey(q) {
  const kb = $('key-body');
  kb.innerHTML = '';
  const add = (label, text) => {
    if (!text) return;
    const p = document.createElement('p');
    const b = document.createElement('strong'); b.textContent = label + ' ';
    const s = document.createElement('span'); s.textContent = text;
    p.append(b, s); kb.appendChild(p);
  };
  add('Answer:', q.answer); add('Solution:', q.solution); add('Why:', q.explanation);
  $('key-box').hidden = false;
  typeset(kb);
}
function showCheck(q, a, res) {
  const body = $('check-body');
  body.innerHTML = '';
  if (res.read) {
    const h = document.createElement('p'); h.className = 'muted small'; h.style.margin = '0'; h.textContent = 'What the AI read on your pad:';
    const rb = document.createElement('div'); rb.className = 'read-box'; rb.innerHTML = md(res.read);
    body.append(h, rb);
  }
  if (res.final && !/^none\b/i.test(res.final)) {
    const fp = document.createElement('p'); fp.className = 'small';
    const b = document.createElement('strong'); b.textContent = 'Your final answer, as read: ';
    const s = document.createElement('span'); s.textContent = res.final;
    fp.append(b, s); body.appendChild(fp);
  }
  const fb = document.createElement('div'); fb.innerHTML = md(res.feedback || (res.verdict === 'unclear' ? res.raw : ''));
  body.appendChild(fb);
  a.verdict = res.verdict; a.read = res.read; a.final = res.final || ''; a.feedback = res.feedback || res.raw;
  showKey(q);
  $('override').hidden = false;
  typeset(body);
}
const VERDICT_TEXT = {
  correct: ['good', 'Correct!', ''],
  partly: ['bad', 'Right answer, but a step is off.', 'It counts as a miss so you see it again.'],
  incorrect: ['bad', 'Not quite.', ''],
  noattempt: ['bad', 'No attempt yet.', 'It counts as a miss so it comes back. Next time, try “I’m stuck” for a first step.'],
  unreadable: ['unsure', 'The AI couldn’t read a final answer.', 'It isn’t counted. Mark it yourself or try again.'],
  unclear: ['unsure', 'The AI’s reply didn’t include a clear verdict.', 'It isn’t counted. Mark it yourself or check again.'],
};
function sketchPicked(a) {
  if (a.typed) return a.typed;
  if (a.final && !/^none\b/i.test(a.final)) return a.final;
  return a.verdict === 'noattempt' ? '(no attempt)' : '(sketch work)';
}
// Applies (or re-applies after an override) the result of one sketch attempt.
// After “I’m stuck” the question is already counted as a miss, so the check only fills in the record.
function applySketchResult(q, a, right, source, res) {
  a.source = source;
  if (state.check.stuck) { a.checkRight = right; a.right = false; } else a.right = right;
  if (source === 'self') a.verdict = right ? 'self-right' : 'self-wrong';
  if (!state.check.stuck) {
    if (state.check.applied) { // undo the earlier application for this attempt, if any
      if (state.check.applied.before) state.progress.questions[q.key] = state.check.applied.before;
      else delete state.progress.questions[q.key];
    }
    const before = state.progress.questions[q.key] ? clone(state.progress.questions[q.key]) : null;
    state.check.applied = { before };
    if (right !== null) applyProgress(q, sketchPicked(a), right);
    else saveProgress();
    state.outcomes[state.currentIndex] = { q, right, picked: sketchPicked(a) };
  }
  updateScore(); updateMissBadge();
  const v = source === 'self' ? (right ? 'correct' : 'incorrect') : (res?.verdict || 'unclear');
  const [cls, head, tail] = VERDICT_TEXT[v] || VERDICT_TEXT.unclear;
  const fb = $('feedback');
  fb.innerHTML = `<span class="${cls}"><strong></strong></span> <span class="tail"></span>`;
  fb.querySelector('strong').textContent = source === 'self' ? (right ? 'Marked right by you.' : 'Marked wrong by you.') : head;
  fb.querySelector('.tail').textContent = state.check.stuck
    ? 'You used a hint, so this one still counts as a miss and will come back.'
    : (source === 'self' ? '' : tail);
  storeAttempt(a);
}
function overrideSketch(right) {
  const q = currentQ(), a = state.check.attempt;
  if (!q || q.type !== 'sketch' || !a || state.check.ctl) return;
  applySketchResult(q, a, right, 'self');
}
// “I'm stuck” / “Next step”: the first press counts as a miss (so it lands on your Mistakes list);
// each press gives the next step only, up to MAX_HINTS. All hints stay on screen and in the record.
const MAX_HINTS = 3;
function updateStuckButton() {
  const n = state.check.stuck?.attempt?.hints?.length || 0;
  const b = $('stuck-btn');
  b.hidden = state.answered || n >= MAX_HINTS;
  b.textContent = n ? `Next step (hint ${n + 1} of ${MAX_HINTS})` : 'I’m stuck';
  b.title = n ? 'Shows the next step only' : 'Counts as a miss, and gives you a first step';
}
function renderHints() {
  const hints = state.check.stuck?.attempt?.hints || [];
  $('hint-box').hidden = !hints.length;
  const ol = $('hint-list');
  ol.innerHTML = hints.map(h => `<li>${md(h)}</li>`).join('');
  typeset(ol);
}
async function stuckSketch() {
  const q = currentQ();
  if (!q || q.type !== 'sketch' || state.answered || state.check.ctl) return;
  const typed = $('typed-answer').value.trim();
  if (!state.check.stuck) {
    const a = newAttempt(q, stampAI({ typed, verdict: 'stuck', right: false, source: 'self', hints: [] }));
    state.check.stuck = { attempt: a };
    applyProgress(q, '(stuck: asked for a hint)', false);
    state.outcomes[state.currentIndex] = { q, right: false, picked: '(stuck)' };
    updateScore(); updateMissBadge();
  }
  const a = state.check.stuck.attempt;
  if (a.hints.length >= MAX_HINTS) return;
  a.typed = typed;
  if (Pad.hasInk() && Pad.inkVisible()) a.image = Pad.exportPNG(); // what was on the pad when they asked
  $('feedback').innerHTML = `<span class="unsure"><strong>Counted as a miss, so it comes back.</strong></span> ${a.hints.length ? 'Here’s the next step.' : 'Here’s a first step.'} Keep going on the pad, then submit.`;
  const ol = $('hint-list'); $('hint-box').hidden = false;
  const li = document.createElement('li'); li.innerHTML = '<p class="thinking">Thinking of the next step…</p>'; ol.appendChild(li);
  $('stuck-btn').disabled = true; $('submit-btn').disabled = true;
  let text = '';
  if (!state.ai.ready) {
    const steps = String(q.solution || '').split(/(?<=\.)\s/);
    text = steps[a.hints.length] || 'Look at the worked solution in the answer key after you submit.';
  } else {
    const ctl = new AbortController(); state.check.ctl = ctl;
    try {
      text = await callAI({ system: '', messages: [{ role: 'user', text: buildStuckPrompt(q, typed, a.hints) }], signal: ctl.signal,
        onText: t => { if (state.check.ctl === ctl) li.innerHTML = md(t); } });
    } catch (e) {
      if (state.check.ctl !== ctl && e?.code === 'cancelled') return;
      const steps = String(q.solution || '').split(/(?<=\.)\s/);
      text = steps[a.hints.length] ? 'The AI didn’t answer, so here’s the next line of the worked solution: ' + steps[a.hints.length] : '';
      if (!text) { li.remove(); $('feedback').innerHTML = '<span class="unsure">The AI didn’t answer. Try again.</span>'; }
    } finally { if (state.check.ctl === ctl) state.check.ctl = null; }
  }
  if (text) a.hints.push(text);
  renderHints();
  $('stuck-btn').disabled = false; $('submit-btn').disabled = false;
  updateStuckButton();
  storeAttempt(a);
}
function skipQuestion() {
  const q = currentQ();
  if (!q || state.answered || state.check.ctl) return;
  state.outcomes[state.currentIndex] = { q, right: null, picked: '', skipped: true };
  if (!state.check.stuck) storeAttempt(newAttempt(q, { verdict: 'skipped', right: null, source: 'skip', typed: $('typed-answer').value.trim() }));
  else storeAttempt(Object.assign(state.check.stuck.attempt, { skippedAfterHints: true }));
  state.answered = true;
  goNext();
}

function goNext() {
  if (!state.answered) return;
  abortTutor(); abortCheck();
  $('typed-answer').disabled = false;
  if (state.currentIndex < state.questions.length - 1) {
    state.currentIndex++; renderQuestion();
    $('question-text').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } else showResults();
}

function showResults() {
  $('question-screen').hidden = true;
  $('results-screen').hidden = false;
  $('progress-fill').style.width = '100%';
  const total = state.questions.length;
  const outs = state.outcomes || [];
  const right = outs.filter(o => o && o.right === true).length;
  const counted = outs.filter(o => o && (o.right === true || o.right === false)).length;
  const skipped = outs.filter(o => o && o.skipped).length;
  const unsure = outs.filter(o => o && o.right === null && !o.skipped).length;
  const pct = counted ? Math.round((right / counted) * 100) : 0;
  let line = `You got ${right} out of ${counted} counted questions right (${pct}%).`;
  if (skipped) line += ` Skipped ${skipped}.`;
  if (unsure) line += ` ${unsure} not counted (the AI couldn't read them).`;
  if (counted === total && !skipped) line = `You got ${right} out of ${total} correct (${pct}%).`;
  $('final-score').textContent = line;
  const ul = $('round-misses');
  ul.replaceChildren();
  outs.filter(o => o && o.right === false).forEach(({ q, picked }) => {
    ul.appendChild(missItem({ key: q.key, q: q.question, cat: q.categoryName, correct: correctText(q), pickedNow: picked, type: q.type }));
  });
  typeset(ul);
  $('practice-missed-btn').disabled = missedCount() === 0;
  refreshSideViews();
}

// ---- tutor (Flip Quiz Tutor), now with the picture for sketch problems ----
function explainCurrent() {
  const q = currentQ();
  if (!state.ai.ready || !state.answered || !q || q.type !== 'mc') return;
  const picked = q.choices[state.picked];
  state.tutor.turns = [{ role: 'user', text: buildExplainPrompt(q, picked.text, picked.isCorrect), hidden: true }];
  $('tutor').hidden = false;
  $('explain-btn').textContent = 'Explain again';
  runTutor(true);
}
function resetTutorView() {
  state.tutor.turns = [];
  $('tutor').hidden = true; $('tutor-body').innerHTML = ''; $('tutor-error').hidden = true;
  $('tutor-input').value = ''; $('tutor-stop').hidden = true;
}
function abortTutor() { state.tutor.ctl?.abort(); state.tutor.ctl = null; state.tutor.busy = false; }
function abortCheck() { state.check.ctl?.abort(); state.check.ctl = null; }
function abortAll() { abortTutor(); abortCheck(); state.genCtl?.abort(); }
function renderTutor(streaming) {
  const parts = [];
  state.tutor.turns.forEach(t => {
    if (t.hidden) return;
    parts.push(t.role === 'assistant' ? `<div class="ai-msg">${md(t.text)}</div>` : `<div class="me-msg">${escapeHTML(t.display || t.text)}</div>`);
  });
  if (streaming !== undefined) parts.push(`<div class="ai-msg">${streaming ? md(streaming) : '<p class="thinking">Thinking…</p>'}</div>`);
  $('tutor-body').innerHTML = parts.join('');
  if (streaming === undefined) typeset($('tutor-body'));
}
async function runTutor(first) {
  abortTutor();
  const ctl = new AbortController();
  state.tutor.ctl = ctl; state.tutor.busy = true;
  $('tutor-error').hidden = true; $('tutor-stop').hidden = false; $('tutor-ask').disabled = true; $('explain-btn').disabled = true;
  renderTutor('');
  const asked = state.tutor.turns[state.tutor.turns.length - 1];
  let turns = state.tutor.turns;
  if (turns.length > 12) turns = [turns[0], turns[1], ...turns.slice(-10)];
  try {
    // Economy mode: only the newest question may carry a picture; older ones go as text.
    // The "picture attached" note is written from what is really sent this time.
    const last = turns.length - 1;
    const messages = turns.map((t, i) => {
      const keep = !economy() || i === last;
      const note = !t.picNote ? '' : keep
        ? '\n\n(The student re-attached the picture of their scratch pad for this question.)'
        : '\n\n(The student attached the picture with this question earlier; it is not included now.)';
      return { role: t.role, text: t.text + note, images: keep ? t.images : [] };
    });
    const text = await callAI({ system: '', messages, signal: ctl.signal,
      onText: t => { if (state.tutor.ctl === ctl) renderTutor(t); } });
    if (state.tutor.ctl !== ctl) return;
    state.tutor.turns.push({ role: 'assistant', text });
    if (asked?.picNote) $('resend-pic').checked = false; // only after it really went
    renderTutor();
    const a = state.check.attempt, q = currentQ();
    if (a && first) { a.aiExplain = text; storeAttempt(a); }
    if (a && !first && asked && !asked.hidden) {
      a.chat = [...(a.chat || []), { q: asked.display || '', a: text, at: Date.now(), pic: !!asked.picNote }].slice(-MAX_CHAT);
      storeAttempt(a);
    }
    if (first && q?.type === 'mc') { const r = state.progress.questions[q.key]; if (r) { r.lastExplain = text.slice(0, 700); saveProgress(); } }
  } catch (e) {
    if (state.tutor.ctl !== ctl && e?.code === 'cancelled') return;
    // a follow-up that failed (or was stopped) is taken back out, and the question goes back in the box
    if (asked && asked.role === 'user' && !asked.hidden && state.tutor.turns[state.tutor.turns.length - 1] === asked) {
      state.tutor.turns.pop();
      if (!$('tutor-input').value) $('tutor-input').value = asked.display || '';
    }
    if (e?.text) state.tutor.turns.push({ role: 'assistant', text: e.text });
    renderTutor();
    if (e?.code !== 'cancelled') { $('tutor-error').textContent = (e.message || 'The AI didn’t answer.') + (asked && !asked.hidden ? ' Your question is back in the box; press Ask to try again.' : ''); $('tutor-error').hidden = false; }
  } finally {
    if (state.tutor.ctl === ctl) {
      state.tutor.ctl = null; state.tutor.busy = false;
      $('tutor-stop').hidden = true; $('tutor-ask').disabled = false; $('explain-btn').disabled = false;
    }
  }
}
function askFollowUp() {
  const text = $('tutor-input').value.trim();
  const q = currentQ();
  if (!text || state.tutor.busy || !state.ai.ready || !q || !state.answered) return;
  if (!state.tutor.turns.length) {
    if (q.type === 'mc') {
      const picked = q.choices[state.picked];
      state.tutor.turns = [{ role: 'user', text: buildExplainPrompt(q, picked.text, picked.isCorrect), hidden: true },
                           { role: 'assistant', text: '(The student asked a question before reading an explanation.)', hidden: true }];
    } else {
      state.tutor.turns = sketchTutorTurns(q, state.check.attempt, '(No check result yet.)');
    }
  }
  const a = state.check.attempt;
  // rebuild the hidden start for the current mode (the mode may have changed since the check)
  if (q.type === 'sketch' && state.tutor.turns.length >= 2 && state.tutor.turns[0].hidden && state.tutor.turns[1].hidden)
    state.tutor.turns[0] = sketchTutorTurns(q, a, state.tutor.turns[1].text)[0];
  const resend = q.type === 'sketch' && economy() && $('resend-pic').checked && !!a?.image;
  state.tutor.turns.push({ role: 'user', display: text, images: resend ? [a.image] : [], picNote: resend,
    text: text + `\n\n(Answer the student directly as "you", in under 150 words. ${MATH_STYLE})` });
  $('tutor-input').value = '';
  $('tutor').hidden = false;
  runTutor(false);
}
// ---- Normal vs Economy AI usage ----
function economy() { return state.prefs.aiMode === 'econ'; }
// The hidden start of a sketch follow-up conversation. Normal: the picture goes with every follow-up.
// Economy: no picture; the AI works from its own transcription (READ) in the check reply.
function sketchTutorTurns(q, a, checkReply) {
  const withPic = !!a?.image;
  if (!economy()) {
    return [{ role: 'user', text: sketchSystemPrompt() + '\n\n' + sketchUserText(q, a?.typed || '', withPic), images: withPic ? [a.image] : [], hidden: true },
            { role: 'assistant', text: checkReply, hidden: true }];
  }
  return [{ role: 'user', hidden: true, images: [],
    text: sketchSystemPrompt() + '\n\n' + sketchUserText(q, a?.typed || '', false).replace(/\n[^\n]*(attached|did not draw)[^\n]*$/, '') +
      (withPic ? '\nYou already checked a picture of their scratch pad; your reply below includes what you read (READ). The picture is not attached now, so work from your transcription. If the student says you misread something, ask them to re-send the picture instead of guessing.' : '\nThey did not draw anything on the scratch pad.') },
    { role: 'assistant', text: checkReply, hidden: true }];
}
function updateResendBox() {
  const q = currentQ(), a = state.check.attempt;
  $('resend-wrap').hidden = !(economy() && q && q.type === 'sketch' && state.answered && a?.image);
}

const MAX_CHAT = 3; // follow-up questions and answers kept per answer in the record
