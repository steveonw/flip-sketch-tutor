// ---------- loading decks ----------
function loadQuizText(text) {
  let quiz;
  try { quiz = JSON.parse(stripCodeFences(text)); }
  catch (e) { return `Could not read that JSON: ${e.message}`; }
  return installQuiz(quiz);
}
function loadFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const err = loadQuizText(String(reader.result || ''));
    $('load-error').textContent = err;
    if (err && !$('workspace').hidden) $('storage-note').textContent = err;
  };
  reader.onerror = () => { $('load-error').textContent = 'Could not read that file.'; };
  reader.readAsText(file);
}
function openPasteModal() { $('paste-error').textContent = ''; $('paste-input').value = ''; $('paste-modal').hidden = false; $('paste-input').focus(); }
function closePasteModal() { $('paste-modal').hidden = true; }

// ---------- Claude inside claude.ai ----------
async function connectClaude() {
  if (!IN_CLAUDE) return;
  state.ai.pending = true; refreshAiState();
  try {
    const [s, dl] = await Promise.all([window.claude.use('sample').catch(() => null), window.claude.use('downloads').catch(() => null)]);
    state.downloads = dl;
    if (s) {
      state.ai.sample = s;
      try { state.ai.sampleImages = !!(await s.limits())?.images; } catch (e) { state.ai.sampleImages = false; }
    }
  } catch (e) {}
  state.ai.pending = false;
  refreshAiState();
  if (state.quiz && !state.answered) prepareQuestions(false);
  if (!state.downloads) ['rec-zip', 'rec-sheet'].forEach(id => { $(id).title = 'Downloads aren’t available in this view'; });
}

// ---------- events ----------
function bindEvents() {
  $('builtin-btn').addEventListener('click', () => installQuiz(clone(BUILTIN_DECK)));
  $('load-file-btn').addEventListener('click', () => $('file-input').click());
  $('welcome-load-btn').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', e => { loadFromFile(e.target.files[0]); e.target.value = ''; });
  $('paste-btn').addEventListener('click', openPasteModal);
  $('welcome-paste-btn').addEventListener('click', openPasteModal);
  $('cancel-paste-btn').addEventListener('click', closePasteModal);
  $('load-paste-btn').addEventListener('click', () => {
    const err = loadQuizText($('paste-input').value);
    if (err) { $('paste-error').textContent = err; return; }
    closePasteModal();
  });
  $('paste-modal').addEventListener('click', e => { if (e.target === $('paste-modal')) closePasteModal(); });

  $('ai-pill').addEventListener('click', openAiModal);
  $('notice-connect').addEventListener('click', openAiModal);
  $('ai-provider').addEventListener('change', fillAiFields);
  $('ai-test').addEventListener('click', testAi);
  $('ai-close').addEventListener('click', closeAiModal);
  $('ai-modal').addEventListener('click', e => { if (e.target === $('ai-modal')) closeAiModal(); });
  $('zoom-close').addEventListener('click', () => { $('zoom-modal').hidden = true; });
  $('zoom-modal').addEventListener('click', e => { if (e.target === $('zoom-modal')) $('zoom-modal').hidden = true; });

  ['study', 'mistakes', 'record', 'aiquiz'].forEach(t => $('tab-' + t).addEventListener('click', () => showTab(t)));
  $('category-select').addEventListener('change', () => prepareQuestions(false));
  $('type-select').addEventListener('change', e => { state.prefs.typeMode = e.target.value; savePrefs(); prepareQuestions(false); });
  $('shuffle-btn').addEventListener('click', () => prepareQuestions(true));
  $('next-btn').addEventListener('click', goNext);
  $('restart-btn').addEventListener('click', () => prepareQuestions(false));
  $('shuffle-restart-btn').addEventListener('click', () => prepareQuestions(true));
  const practiceMissed = () => { fillCategorySelect('missed'); showTab('study'); prepareQuestions(true); };
  $('practice-missed-btn').addEventListener('click', practiceMissed);
  $('mistakes-practice-btn').addEventListener('click', practiceMissed);
  $('results-record-btn').addEventListener('click', () => showTab('record'));

  $('auto-explain').addEventListener('change', e => { state.prefs.autoExplain = e.target.checked; savePrefs(); });
  $('explain-btn').addEventListener('click', explainCurrent);
  $('tutor-stop').addEventListener('click', () => state.tutor.ctl?.abort());
  $('tutor-ask').addEventListener('click', askFollowUp);
  $('tutor-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); askFollowUp(); } });

  $('submit-btn').addEventListener('click', submitSketch);
  $('skip-btn').addEventListener('click', skipQuestion);
  $('stuck-btn').addEventListener('click', stuckSketch);
  $('typed-answer').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitSketch(); } });
  $('ov-right').addEventListener('click', () => overrideSketch(true));
  $('ov-wrong').addEventListener('click', () => overrideSketch(false));
  $('ov-retry').addEventListener('click', runCheck);

  $('rec-scope').addEventListener('change', e => { state.prefs.recScope = e.target.value; savePrefs(); renderRecord(); });
  $('rec-filter').addEventListener('change', e => { state.prefs.recFilter = e.target.value; savePrefs(); renderRecord(); });
  $('rec-zip').addEventListener('click', exportZip);
  $('rec-sheet').addEventListener('click', exportSheet);
  $('rec-print').addEventListener('click', printSheet);
  $('rec-folder').addEventListener('click', toggleFolder);
  $('rec-clear').addEventListener('click', async () => {
    if (!state.clearArmed) {
      state.clearArmed = true; $('rec-clear').textContent = 'Click again to delete every saved answer and picture';
      setTimeout(() => { state.clearArmed = false; $('rec-clear').textContent = 'Delete everything in my record'; }, 4000);
      return;
    }
    state.clearArmed = false; $('rec-clear').textContent = 'Delete everything in my record';
    await Records.clear(); renderRecord();
  });

  $('coach-btn').addEventListener('click', runCoach);
  $('coach-stop').addEventListener('click', () => state.genCtl?.abort());
  $('coach-practice').addEventListener('click', () => { const c = latestCoach(); if (c?.setId) practiceSet(c.setId); });
  $('coach-copy').addEventListener('click', async () => {
    const c = latestCoach(); if (!c) return;
    try { await navigator.clipboard.writeText(c.text); $('coach-copy').textContent = 'Copied'; }
    catch (e) { $('coach-copy').textContent = 'Copy failed; select the text instead'; }
    setTimeout(() => { $('coach-copy').textContent = 'Copy notes'; }, 2000);
  });
  $('coach-save').addEventListener('click', () => {
    const c = latestCoach(); if (!c) return;
    saveFile(`${safeName(state.quiz.quiz_name)}_coaching_${stamp(c.at)}.md`, new Blob([coachNotesMarkdown([c])], { type: 'text/markdown' }))
      .then(ok => { $('coach-note').textContent = ok ? 'Notes downloaded.' : 'Download cancelled.'; }).catch(e => { $('coach-note').textContent = e.message; });
  });
  $('gen-btn').addEventListener('click', generateTopicSet);
  $('gen-stop').addEventListener('click', () => state.genCtl?.abort());

  $('reset-btn').addEventListener('click', () => {
    if (!state.resetArmed) {
      state.resetArmed = true; $('reset-btn').textContent = 'Click again to erase all progress for this deck';
      setTimeout(() => { state.resetArmed = false; $('reset-btn').textContent = 'Reset progress for this deck'; }, 4000);
      return;
    }
    state.resetArmed = false; $('reset-btn').textContent = 'Reset progress for this deck';
    state.progress = blankProgress(); saveProgress();
    fillCategorySelect('all'); prepareQuestions(false); refreshSideViews(); renderMistakes();
  });

  document.addEventListener('keydown', e => {
    if (!$('paste-modal').hidden || !$('ai-modal').hidden || !$('zoom-modal').hidden) {
      if (e.key === 'Escape') { closePasteModal(); if (!$('ai-modal').hidden) closeAiModal(); $('zoom-modal').hidden = true; }
      return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable) return;
    if ($('workspace').hidden || $('view-study').hidden || $('question-screen').hidden || $('quiz-body').hidden) return;
    const q = currentQ();
    if (!q) return;
    if (q.type === 'sketch' && !state.answered) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? Pad.redo() : Pad.undo(); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'p') Pad.setTool('pen'); else if (k === 'l') Pad.setTool('line'); else if (k === 'e') Pad.setTool('erase');
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (tag === 'button' && (e.key === 'Enter' || e.key === ' ')) return;
    if (q.type === 'mc' && !state.answered && ['1', '2', '3', '4'].includes(e.key)) chooseAnswer(Number(e.key) - 1);
    else if (state.answered && (e.key === 'Enter' || e.key === 'ArrowRight')) { e.preventDefault(); goNext(); }
  });
}

// ---------- boot ----------
(function boot() {
  const prefs = Store.get('prefs');
  if (prefs) Object.assign(state.prefs, prefs);
  $('auto-explain').checked = !!state.prefs.autoExplain;
  $('type-select').value = state.prefs.typeMode;
  loadAiConfig();
  Pad.init();
  bindEvents();
  refreshAiState();
  if (state.prefs.deckKey) {
    const d = Store.get('deck-' + state.prefs.deckKey);
    if (d && d.quiz && !validateQuiz(d.quiz)) installQuiz(d.quiz, { restore: true });
  }
  updateStorageNote();
  connectClaude();
})();
