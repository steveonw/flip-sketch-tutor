// ---------- state ----------
const SESSION_ID = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const state = {
  quiz: null, deckKey: null, progress: null,
  prefs: { autoExplain: true, typeMode: 'mixed', padSize: 'M', paper: 'plain', deckKey: null, recScope: 'session', recFilter: 'all', aiMode: 'normal' },
  index: [], questions: [], currentIndex: 0, score: 0, answered: false, picked: -1, roundMisses: [], skipped: 0,
  ai: { ready: false, pending: false, provider: 'none', sample: null, sampleImages: false },
  tutor: { turns: [], ctl: null, busy: false, images: [] },
  check: { ctl: null, attempt: null },
  genCtl: null, generated: null, downloads: null, folder: null, resetArmed: false, clearArmed: false,
};
function blankProgress() { return { questions: {}, sets: [], coach: [], updatedAt: 0 }; }
const MAX_SETS = 6, MAX_COACH = 6;
function progressKey() { return 'progress-' + state.deckKey; }
function saveProgress() { state.progress.updatedAt = Date.now(); Store.set(progressKey(), state.progress); }
function savePrefs() { Store.set('prefs', state.prefs); }

// ---------- deck format ----------
// schema_version 1 = Flip Quiz Tutor decks (all four-choice cards).
// schema_version 2 adds sketch problems: {"type":"sketch","question","answer","solution"?,
//   "explanation"?,"pad"?: "S"|"M"|"L","paper"?: "plain"|"grid"|"lined"|"dots"}.
const PAPERS = ['plain', 'grid', 'lined', 'dots'];
function qType(q) { return q && q.type === 'sketch' ? 'sketch' : 'mc'; }
function questionProblem(q) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return 'must be an object';
  if (q.type !== undefined && !['mc', 'sketch'].includes(q.type)) return 'has a type that is not "mc" or "sketch"';
  if (typeof q.question !== 'string' || !q.question.trim()) return 'needs question text';
  if (q.explanation !== undefined && typeof q.explanation !== 'string') return 'has an explanation that is not text';
  if (qType(q) === 'sketch') {
    if (typeof q.answer !== 'string' || !q.answer.trim()) return 'is a sketch problem and needs an "answer" (the answer key)';
    if (q.solution !== undefined && typeof q.solution !== 'string') return 'has a solution that is not text';
    if (q.pad !== undefined && !['S', 'M', 'L'].includes(q.pad)) return 'has a pad size that is not "S", "M" or "L"';
    if (q.paper !== undefined && !PAPERS.includes(q.paper)) return 'has a paper that is not plain, grid, lined or dots';
    return '';
  }
  if (!Array.isArray(q.answers) || q.answers.length !== 4) return 'must have exactly four answers';
  if (!q.answers.every(a => typeof a === 'string' && a.trim())) return 'has an empty answer';
  if (new Set(q.answers.map(a => a.trim().toLowerCase())).size !== 4) return 'has duplicate answer choices';
  if (!Number.isInteger(q.correct_answer) || q.correct_answer < 0 || q.correct_answer > 3) return 'needs a correct_answer number from 0 to 3';
  return '';
}
function validateQuiz(quiz) {
  if (!quiz || typeof quiz !== 'object' || Array.isArray(quiz)) return 'The JSON must contain a quiz object.';
  if (quiz.schema_version !== 1 && quiz.schema_version !== 2) return 'schema_version must be 1 or 2.';
  if (typeof quiz.quiz_name !== 'string' || !quiz.quiz_name.trim()) return 'The quiz needs a quiz_name.';
  if (quiz.description !== undefined && typeof quiz.description !== 'string') return 'description, if present, must be text.';
  if (!Array.isArray(quiz.categories) || !quiz.categories.length) return 'The quiz needs at least one category.';
  for (let i = 0; i < quiz.categories.length; i++) {
    const c = quiz.categories[i];
    if (!c || typeof c !== 'object' || Array.isArray(c)) return `Category ${i + 1} must be an object.`;
    if (typeof c.name !== 'string' || !c.name.trim()) return `Category ${i + 1} needs a name.`;
    if (!Array.isArray(c.questions) || !c.questions.length) return `Category "${c.name}" needs at least one question.`;
    for (let j = 0; j < c.questions.length; j++) {
      const p = questionProblem(c.questions[j]);
      if (p) return `Question ${j + 1} in "${c.name}" ${p}.`;
    }
  }
  return '';
}

// ---------- progress records (Flip Quiz Tutor rules) ----------
function needsWork(r) { return !!r && r.wrong > 0 && r.streak < 2; }
function recFor(key) { return state.progress.questions[key] || null; }
function missedCount() { return state.index.filter(q => needsWork(recFor(q.key))).length; }

function buildIndex() {
  const idx = [];
  state.quiz.categories.forEach((c, ci) => {
    c.questions.forEach(q => {
      const type = qType(q);
      idx.push({
        key: (type === 'sketch' ? 's' : 'q') + hash(c.name + '|' + q.question), catIndex: ci, categoryName: c.name, type,
        question: q.question, explanation: q.explanation || '',
        answers: type === 'mc' ? q.answers.slice() : null, correctAnswer: type === 'mc' ? q.correct_answer : -1,
        answer: type === 'sketch' ? q.answer : '', solution: q.solution || '', pad: q.pad || '', paper: q.paper || '',
      });
    });
  });
  // AI practice sets live alongside the deck (stored with this deck's progress), never in place of it.
  (state.progress.sets || []).forEach(set => {
    set.categories.forEach(c => c.questions.forEach(q => {
      const type = qType(q);
      idx.push({
        key: 'g' + hash(set.id + '|' + c.name + '|' + q.question), catIndex: -1, setId: set.id, ai: true,
        categoryName: set.name + (set.categories.length > 1 ? ' · ' + c.name : ''), type,
        question: q.question, explanation: q.explanation || '',
        answers: type === 'mc' ? q.answers.slice() : null, correctAnswer: type === 'mc' ? q.correct_answer : -1,
        answer: type === 'sketch' ? q.answer : '', solution: q.solution || '', pad: q.pad || '', paper: q.paper || '',
      });
    }));
  });
  state.index = idx;
}
function correctText(q) { return q.type === 'mc' ? q.answers[q.correctAnswer] : q.answer; }

function installQuiz(quiz, opts = {}) {
  const err = validateQuiz(quiz);
  if (err) return err;
  abortAll();
  state.quiz = quiz;
  state.deckKey = 'd' + hash(quiz.quiz_name.trim().toLowerCase() + (quiz.ai_generated ? '|ai' : ''));
  state.progress = Store.get(progressKey()) || blankProgress();
  if (!state.progress.questions) state.progress = blankProgress();
  state.progress.sets = state.progress.sets || [];
  state.progress.coach = state.progress.coach || [];
  buildIndex();
  if (!opts.restore) {
    Store.set('deck-' + state.deckKey, { quiz });
    state.prefs.deckKey = state.deckKey;
    savePrefs();
  }
  $('deck-name').textContent = quiz.quiz_name;
  $('deck-description').textContent = quiz.description || '';
  $('deck-unverified').hidden = !quiz.ai_generated;
  $('welcome').hidden = true;
  $('workspace').hidden = false;
  $('load-error').textContent = '';
  fillCategorySelect('all');
  showTab('study');
  prepareQuestions(false);
  refreshSideViews();
  return '';
}

function fillCategorySelect(selected) {
  const sel = $('category-select');
  sel.replaceChildren();
  const add = (value, label) => { const o = document.createElement('option'); o.value = value; o.textContent = label; sel.appendChild(o); };
  add('all', 'All categories');
  state.quiz.categories.forEach((c, i) => add(String(i), c.name));
  add('missed', `My missed questions (${missedCount()})`);
  (state.progress.sets || []).forEach(set => add('set:' + set.id, `AI practice: ${set.name} (${set.categories.reduce((n, c) => n + c.questions.length, 0)})`));
  sel.value = [...sel.options].some(o => o.value === selected) ? selected : 'all';
}
