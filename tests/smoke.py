"""Browser smoke test for Flip & Sketch Tutor (offline file, mocked local AI server)."""
import json, os, sys, zipfile, io, re
from pathlib import Path
from playwright.sync_api import sync_playwright

APP = Path(sys.argv[1] if len(sys.argv) > 1 else 'dist/flip_sketch_tutor_OFFLINE.html').resolve()
OUT = Path('tests/out'); OUT.mkdir(parents=True, exist_ok=True)
fails = []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

calls = []
REPLIES = []
def handle(route):
    body = json.loads(route.request.post_data or '{}')
    calls.append(body)
    text = REPLIES.pop(0) if REPLIES else 'ready'
    route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'},
                  body=json.dumps({'choices': [{'message': {'content': text}}]}))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1100, 'height': 900}, accept_downloads=True)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append('console: ' + m.text))
    ctx.route('http://mock.local/**', lambda r: r.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST'}) if r.request.method == 'OPTIONS' else handle(r))
    pg.goto(APP.as_uri()); pg.wait_for_timeout(500)
    check(pg.is_visible('#welcome'), 'welcome screen shows')

    # ---- no AI: flip cards only ----
    pg.click('#builtin-btn'); pg.wait_for_timeout(1500)
    check(pg.is_visible('#sketch-notice'), 'sketch notice shows with no AI')
    check('6 sketch problems are hidden' in pg.inner_text('#sketch-notice-text'), 'notice counts 6 hidden sketch problems')
    check(pg.inner_text('#question-count').endswith('of 10'), 'only the 10 flip cards are in the round: ' + pg.inner_text('#question-count'))
    check(pg.locator('#question-text mjx-container svg').count() > 0, 'question math is drawn as SVG')
    check(pg.locator('#answer-grid mjx-container').count() == 4, 'all four card faces have drawn math')
    # answer right then wrong
    ok_i = pg.evaluate("state.questions[0].choices.findIndex(c=>c.isCorrect)")
    pg.click(f'#answer-grid .answer-card >> nth={ok_i}'); pg.wait_for_timeout(300)
    check('Correct' in pg.inner_text('#feedback'), 'right card says Correct')
    pg.click('#next-btn'); pg.wait_for_timeout(600)
    bad_i = pg.evaluate("state.questions[1].choices.findIndex(c=>!c.isCorrect)")
    pg.keyboard.press(str(bad_i + 1)); pg.wait_for_timeout(500)
    check('Not quite' in pg.inner_text('#feedback'), 'keyboard pick of a wrong card says Not quite')
    check(pg.locator('#feedback mjx-container').count() > 0, 'correct answer in feedback is drawn as math')
    check(pg.inner_text('#miss-count') == '1', 'Mistakes badge shows 1')
    # all deck math renders without errors
    pg.evaluate("""async()=>{const box=document.createElement('div');box.id='allmath';document.body.appendChild(box);
      for(const q of state.index){for(const t of [q.question,...(q.answers||[]),q.answer,q.solution,q.explanation]){if(!t)continue;const d=document.createElement('p');d.textContent=t;box.appendChild(d);}}
      await typeset(box);}""")
    pg.wait_for_timeout(500)
    errs_tex = pg.evaluate("mathErrorsIn(document.getElementById('allmath'))")
    check(errs_tex == [], f'every deck formula renders with no TeX errors {errs_tex}')
    pg.evaluate("document.getElementById('allmath').remove()")

    # ---- connect the mocked local AI ----
    pg.click('#ai-pill'); pg.wait_for_timeout(200)
    opts = pg.eval_on_selector_all('#ai-provider option', 'os=>os.map(o=>o.value)')
    check('claude' not in opts and 'gateway' in opts and 'anthropic' in opts, f'standalone provider list {opts}')
    pg.select_option('#ai-provider', 'compat')
    pg.fill('#ai-base', 'http://mock.local/v1'); pg.fill('#ai-model', 'vision-test')
    REPLIES.append('ready')
    pg.click('#ai-test'); pg.wait_for_timeout(800)
    check('Connected' in pg.inner_text('#ai-status'), 'Test connection works: ' + pg.inner_text('#ai-status'))
    pg.click('#ai-close'); pg.wait_for_timeout(800)
    check(pg.is_hidden('#sketch-notice'), 'notice hides once AI is connected')
    check(pg.inner_text('#question-count').endswith('of 16'), 'all 16 questions once AI is on')
    check('local server' in pg.inner_text('#ai-pill'), 'AI pill shows the provider')
    saved = pg.evaluate("localStorage.getItem('flip-sketch-tutor:aikey-compat')")
    check(saved is None, 'key not remembered unless ticked')

    # ---- sketch problem ----
    pg.select_option('#type-select', 'sketch'); pg.wait_for_timeout(800)
    check(pg.is_visible('#pad-panel') and pg.is_hidden('#answer-grid'), 'sketch problem shows the pad, not the cards')
    q0 = pg.evaluate("currentQ().question")
    size0 = pg.evaluate("Pad.size")
    check(not pg.is_disabled('#pad-size-L'), 'size buttons enabled on a blank pad')
    if size0 != 'L':
        pg.click('#pad-size-L'); pg.wait_for_timeout(300)
    check(pg.evaluate("Pad.size") == 'L', 'can switch the blank pad to L')
    box = pg.locator('#pad-canvas').bounding_box()
    def stroke(x0, y0, pts):
        pg.mouse.move(box['x'] + x0, box['y'] + y0); pg.mouse.down()
        for (x, y) in pts: pg.mouse.move(box['x'] + x, box['y'] + y, steps=4)
        pg.mouse.up()
    stroke(60, 60, [(120, 120), (180, 60)])
    stroke(220, 120, [(300, 120), (300, 60)])
    check(pg.evaluate("Pad.strokeCount()") == 2, 'two strokes recorded')
    check(pg.is_disabled('#pad-size-S') and pg.is_disabled('#pad-paper'), 'size and paper lock once there is ink')
    check('locked' in pg.inner_text('#pad-lock').lower(), 'lock note shows')
    pg.click('#pad-undo'); check(pg.evaluate("Pad.strokeCount()") == 1, 'undo removes a stroke')
    pg.click('#pad-redo'); check(pg.evaluate("Pad.strokeCount()") == 2, 'redo brings it back')
    # resizing the window redraws from strokes (no smear): pixel export identical before/after
    png1 = pg.evaluate("Pad.exportPNG()")
    pg.set_viewport_size({'width': 700, 'height': 900}); pg.wait_for_timeout(400)
    pg.set_viewport_size({'width': 1100, 'height': 900}); pg.wait_for_timeout(400)
    png2 = pg.evaluate("Pad.exportPNG()")
    check(png1 == png2, 'exported picture is identical after the window is resized (no smearing)')
    dims = pg.evaluate("""u=>new Promise(r=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const g=c.getContext('2d');g.drawImage(i,0,0);const d=g.getImageData(0,0,i.width,i.height).data;let dark=0;for(let k=0;k<d.length;k+=4){if(d[k]<120)dark++;}r([i.width,i.height,d[0],d[1],d[2],d[3],dark])};i.src=u})""", png1)
    check(dims[0] == 1800 and dims[1] == 1600, f'export is 1800×1600 for L {dims[:2]}')
    check(dims[2:6] == [255, 255, 255, 255], 'export background is solid white (not transparent)')
    check(dims[6] > 500, f'export contains the ink ({dims[6]} dark pixels)')
    Path(OUT / 'pad_export.png').write_bytes(__import__('base64').b64decode(png1.split(',')[1]))

    pg.fill('#typed-answer', 'x = 4')
    REPLIES.append("VERDICT: incorrect\nREAD:\n$3x + 7 = 22$\n$3x = 12$\n$x = 4$\nFEEDBACK:\nYou subtracted wrong: $22 - 7 = 15$, not $12$. So $x = \\frac{15}{3} = 5$.\n- Tip: check by plugging back in.")
    pg.click('#submit-btn'); pg.wait_for_timeout(1500)
    last = calls[-1]
    content = last['messages'][-1]['content']
    imgs = [c for c in content if isinstance(c, dict) and c.get('type') == 'image_url']
    check(len(imgs) == 1 and imgs[0]['image_url']['url'].startswith('data:image/png;base64,'), 'AI request carries the PNG of the pad')
    txt = [c for c in content if isinstance(c, dict) and c.get('type') == 'text'][0]['text']
    check('Answer key:' in txt and 'x = 4' in txt, 'AI request carries the answer key and the typed answer')
    check(last['messages'][0]['role'] == 'system' and 'VERDICT' in last['messages'][0]['content'], 'system prompt asks for the VERDICT format')
    check(last.get('model') == 'vision-test', 'model name is sent')
    check('Not quite' in pg.inner_text('#feedback'), 'incorrect verdict shows Not quite')
    check(pg.locator('#check-body .read-box mjx-container').count() >= 3, 'what the AI read is drawn as math')
    check(pg.locator('#check-body mjx-container').count() >= 5, 'feedback math (\\frac) is drawn')
    check(pg.evaluate("mathErrorsIn(document.getElementById('check-body'))") == [], 'no TeX errors in AI feedback')
    check(pg.is_visible('#key-box') and pg.is_visible('#override'), 'answer key and override show')
    check(pg.inner_text('#score-count').startswith('Score: 0'), 'wrong sketch scores 0')
    check(pg.evaluate("Object.values(state.progress.questions).some(r=>r.type==='sketch'&&r.wrong===1)"), 'sketch miss recorded in progress')
    pg.click('#ov-right'); pg.wait_for_timeout(400)
    check('Marked right by you' in pg.inner_text('#feedback'), 'override to right works')
    check(pg.inner_text('#score-count').startswith('Score: 1'), 'override updates the score')
    check(pg.evaluate("Object.values(state.progress.questions).filter(r=>r.type==='sketch').every(r=>r.wrong===0&&r.right===1)"), 'override replaces (not adds to) the progress record')
    # follow-up with picture
    REPLIES.append('Because $22-7=15$.')
    pg.fill('#tutor-input', 'why 15?'); pg.click('#tutor-ask'); pg.wait_for_timeout(1000)
    fu = calls[-1]['messages']
    check(any(isinstance(m['content'], list) and any(c.get('type') == 'image_url' for c in m['content']) for m in fu), 'follow-up question resends the picture')
    check('15' in pg.inner_text('#tutor-body'), 'follow-up answer shows')

    # next sketch: unreadable is not counted
    pg.click('#next-btn'); pg.wait_for_timeout(600)
    check(pg.evaluate("Pad.strokeCount()") == 0 and not pg.is_disabled('#pad-size-S'), 'next problem starts with a blank, unlocked pad')
    box = pg.locator('#pad-canvas').bounding_box()
    stroke(50, 50, [(90, 70)])
    REPLIES.append('VERDICT: unreadable\nREAD:\n[unclear]\nFEEDBACK:\nI can\'t make out a final answer. Write it larger on its own line.')
    pg.click('#submit-btn'); pg.wait_for_timeout(1200)
    check('couldn’t read' in pg.inner_text('#feedback'), 'unreadable verdict is shown as not counted')
    check(pg.evaluate("state.outcomes[state.currentIndex].right") is None, 'unreadable is not counted right or wrong')
    # ---- economy mode ----
    check(pg.is_hidden('#resend-wrap'), 'normal mode: no resend box')
    pg.click('#ai-pill'); pg.select_option('#ai-mode', 'econ'); pg.click('#ai-close'); pg.wait_for_timeout(300)
    check(pg.is_visible('#resend-wrap') and pg.is_checked('#resend-pic'), 'economy: resend box shows, ticked after an unreadable check')
    REPLIES.append('Write the answer on its own line.')
    pg.fill('#tutor-input', 'what did you see?'); pg.click('#tutor-ask'); pg.wait_for_timeout(800)
    msgs = calls[-1]['messages']
    imgs = [i for i, m in enumerate(msgs) if isinstance(m['content'], list) and any(c.get('type') == 'image_url' for c in m['content'])]
    check(imgs == [len(msgs) - 1], f'economy: picture goes only with the question that asked for it {imgs}')
    check(not pg.is_checked('#resend-pic'), 'economy: resend box unticks after sending')
    REPLIES.append('ok')
    pg.fill('#tutor-input', 'and then?'); pg.click('#tutor-ask'); pg.wait_for_timeout(800)
    msgs = calls[-1]['messages']
    check(all(isinstance(m['content'], str) for m in msgs), 'economy: later follow-ups are text only')
    check('work from your transcription' in msgs[0]['content'] and 'scratch pad is attached' not in msgs[0]['content'], 'economy: the AI is told to use its READ transcription')
    big = len(json.dumps(calls[-3])); small = len(json.dumps(calls[-1]))
    print(f'     (follow-up request size: with picture {big:,} chars, economy {small:,} chars)')
    check(pg.evaluate("JSON.parse(localStorage.getItem('flip-sketch-tutor:prefs')).aiMode") == 'econ', 'economy setting is saved')
    # empty submit guard
    pg.click('#next-btn'); pg.wait_for_timeout(600)
    n_calls = len(calls)
    pg.click('#submit-btn'); pg.wait_for_timeout(300)
    check(len(calls) == n_calls and 'first' in pg.inner_text('#feedback'), 'blank pad + no typed answer is not sent')
    # AI failure keeps the picture and allows self-marking
    stroke(50, 50, [(120, 90)])
    REPLIES.append('this reply has no verdict at all')
    pg.click('#submit-btn'); pg.wait_for_timeout(1200)
    check('clear verdict' in pg.inner_text('#feedback'), 'reply without a verdict is not guessed')
    check(pg.is_visible('#resend-wrap') and pg.is_checked('#resend-pic'), 'economy: box ticked automatically when the reply had no verdict')
    pg.click('#ov-wrong'); pg.wait_for_timeout(300)
    check('Marked wrong by you' in pg.inner_text('#feedback'), 'self-mark wrong works')

    # ---- record + exports ----
    pg.click('#tab-record'); pg.wait_for_timeout(1500)
    n_rec = pg.locator('#rec-list > li').count()
    check(n_rec == 5, f'record lists 5 answers this session (got {n_rec})')
    check(pg.locator('#rec-list img').count() == 3, 'three sketch pictures in the record')
    with pg.expect_download() as dl:
        pg.click('#rec-zip')
    zpath = OUT / 'record.zip'; dl.value.save_as(zpath)
    z = zipfile.ZipFile(zpath)
    names = z.namelist()
    check(z.testzip() is None, 'ZIP is valid (CRC check passes)')
    check('review.html' in names and 'answers.json' in names and sum(n.startswith('work/') for n in names) == 3, f'ZIP has review, answers and 3 pictures {names}')
    rv = z.read('review.html').decode()
    check(rv.count('<svg') > 10 and 'data-mml-node="merror"' not in rv.split('<body>')[1], 'review sheet has drawn math and no TeX errors')
    check('work/' in rv, 'review sheet links the pictures in the ZIP')
    ans = json.loads(z.read('answers.json'))
    check(all('apiKey' not in json.dumps(a) and 'mock.local' not in json.dumps(a) for a in ans['answers']), 'no keys or server addresses in the export')
    check(ans['answers'][0]['type'] == 'mc' and ans['answers'][0]['right'] is True, 'first answer recorded as right flip card')
    Path(OUT / 'review.html').write_text(rv)
    with pg.expect_download() as dl2:
        pg.click('#rec-sheet')
    sp = OUT / 'sheet.html'; dl2.value.save_as(sp)
    sheet = sp.read_text()
    check('data:image/png;base64' in sheet and sheet.index('To study') < sheet.index('Got right'), 'standalone review sheet embeds pictures and puts misses first')
    pg.select_option('#rec-filter', 'wrong'); pg.wait_for_timeout(800)
    check(pg.locator('#rec-list > li').count() == 3, 'filter: wrong and unsure only')

    # ---- AI coach: text copy of results + focus -> coaching + practice set added (deck kept) ----
    deck_name = pg.evaluate("state.quiz.quiz_name"); n_index = pg.evaluate("state.index.length")
    pg.click('#tab-aiquiz'); pg.wait_for_timeout(300)
    check(pg.is_visible('#coach-btn') and not pg.is_disabled('#coach-btn'), 'coach button is ready')
    pg.fill('#coach-focus', 'I mix up the product and quotient rules')
    REPLIES.append("""=== COACHING ===
## What went wrong
- **Solving for $x$:** you wrote $x = 4$, but $22 - 7 = 15$, so $x = \\frac{15}{3} = 5$.
## Where to start when you're stuck
- For $y = e^{3x^2}$, spot the inside function $3x^2$ first.
## What you already have
- The chain rule pattern.
## Next steps
- Redo the sketch problems.

=== QUESTION ===
TYPE: card
CATEGORY: Product vs quotient
QUESTION: Which rule do you need for $\\dfrac{d}{dx}\\left[x^3 \\cos x\\right]$?
A: Product rule
B: Quotient rule
C: Chain rule only
D: Power rule only
CORRECT: A
EXPLANATION: Two functions multiplied together.

=== QUESTION ===
TYPE: sketch
CATEGORY: Product vs quotient
QUESTION: Find $\\dfrac{d}{dx}\\left[\\dfrac{x^2}{\\sin x}\\right]$.
ANSWER: $\\dfrac{2x\\sin x - x^2\\cos x}{\\sin^2 x}$
SOLUTION: Quotient rule.
EXPLANATION: Low d-high minus high d-low.""")
    pg.click('#coach-btn'); pg.wait_for_timeout(2500)
    req = calls[-1]['messages']
    ctext = req[-1]['content']
    check(isinstance(ctext, str), 'coach request is text only (no pictures sent)')
    check('WRONG (' in ctext and 'NOT COUNTED' in ctext and 'RIGHT (' in ctext, 'coach gets wrong / not counted / right sections')
    check(re.search(r'They picked: \$[^$]+\$', ctext) is not None and 'What the AI read on their pad: [unclear]' in ctext and 'They marked this one wrong themselves' in ctext and 'Solve for $x$' in ctext.split('RIGHT (')[1], 'coach gets picks, typed answers and what the AI read')
    check('I mix up the product and quotient rules' in ctext, "coach gets the student's focus")
    check('=== COACHING ===' in ctext and '=== QUESTION ===' in ctext, 'coach asks for coaching then a block-format set')
    check(pg.locator('#coach-out mjx-container').count() >= 3 and pg.evaluate("mathErrorsIn(document.getElementById('coach-out'))") == [], 'coaching renders with math')
    check('What went wrong' in pg.inner_text('#coach-out') and '=== QUESTION' not in pg.inner_text('#coach-out'), 'coaching shows without the raw question blocks')
    check(pg.evaluate("state.quiz.quiz_name") == deck_name, 'deck is NOT replaced')
    check(pg.evaluate("state.index.length") == n_index + 2, 'practice set added alongside the deck (+2 questions)')
    check(pg.locator('#category-select option[value^="set:"]').count() == 1, 'practice set appears in the Practice menu')
    check('Added a practice set of 2' in pg.inner_text('#coach-note'), 'coach note reports the new set')
    check(pg.locator('#set-list > li').count() == 1, 'practice set listed')
    pg.click('#coach-practice'); pg.wait_for_timeout(1000)
    check(pg.inner_text('#question-count').endswith('of 2') and pg.is_visible('#deck-unverified'), 'Practice the new set: 2 questions, marked unverified')
    if pg.evaluate("currentQ().type") == 'mc':
        pg.keyboard.press('1'); pg.wait_for_timeout(400)
    else:
        pg.click('#skip-btn'); pg.wait_for_timeout(400); pg.keyboard.press('1'); pg.wait_for_timeout(400)
    pg.select_option('#category-select', 'all'); pg.wait_for_timeout(600)
    check(pg.inner_text('#question-count').endswith('of 16'), '“All categories” is still the original 16 (AI sets kept separate)')
    # topic set also adds, never replaces
    pg.click('#tab-aiquiz'); pg.click('#topic-wrap summary'); pg.fill('#gen-topic', 'chain rule')
    REPLIES.append("""=== QUESTION ===
TYPE: card
CATEGORY: Chain rule
QUESTION: $\\frac{d}{dx}\\sin(3x) = ?$
A: $3\\cos(3x)$
B: $\\cos(3x)$
C: $-3\\cos(3x)$
D: $3\\sin(3x)$
CORRECT: A
EXPLANATION: Inside derivative is $3$; the $\\theta$ trap does not apply.

=== QUESTION ===
TYPE: card
QUESTION: broken one with two choices
A: 1
B: 2
CORRECT: A""")
    pg.click('#gen-btn'); pg.wait_for_timeout(1500)
    check('1 came back broken' in pg.inner_text('#gen-note'), 'topic set reports the broken question')
    check(pg.locator('#set-list > li').count() == 2 and pg.evaluate("state.quiz.quiz_name") == deck_name, 'topic set added; deck still the same')
    check(pg.evaluate("state.index.find(q=>q.ai && q.question.includes('sin(3x)')).question").startswith('$\\frac'), 'LaTeX backslashes survive (\\frac intact)')
    # coaching goes into the ZIP and the review sheet
    pg.click('#tab-record'); pg.select_option('#rec-filter', 'all'); pg.wait_for_timeout(800)
    with pg.expect_download() as dl3:
        pg.click('#rec-zip')
    z2 = zipfile.ZipFile(io.BytesIO(Path(dl3.value.path()).read_bytes()))
    check('coaching_notes.md' in z2.namelist() and 'What went wrong' in z2.read('coaching_notes.md').decode(), 'ZIP includes the coaching notes')
    check('Coaching notes' in z2.read('review.html').decode(), 'review sheet includes the coaching notes')
    a_last = json.loads(z2.read('answers.json'))['answers'][-1]
    check(a_last['aiWritten'] is True and a_last['setId'], 'answers from a practice set are marked AI-written')
    check('unsimplified' in calls[1]['messages'][0]['content'] if len(calls) > 1 and isinstance(calls[1]['messages'][0]['content'], str) else any('unsimplified' in (m.get('content') if isinstance(m.get('content'), str) else '') for c in calls for m in c['messages']), 'sketch check tells the AI not to call unsimplified-but-equal steps wrong')

    # ---- mistakes view ----
    pg.click('#tab-mistakes'); pg.wait_for_timeout(500)
    check(pg.locator('#cat-bars > div').count() >= 1, 'mistakes view renders')

    # ---- phone width ----
    pg.set_viewport_size({'width': 380, 'height': 800}); pg.click('#tab-study'); pg.wait_for_timeout(500)
    sw = pg.evaluate("document.documentElement.scrollWidth")
    check(sw <= 381, f'no sideways scroll at phone width (scrollWidth {sw})')
    pg.screenshot(path=str(OUT / 'phone.png'), full_page=True)
    pg.set_viewport_size({'width': 1100, 'height': 900})

    # reload keeps record + deck
    pg.reload(); pg.wait_for_timeout(1500)
    check(pg.is_visible('#workspace'), 'deck comes back after reload')
    check(pg.locator('#category-select option[value^="set:"]').count() == 2, 'practice sets survive a reload')
    pg.click('#tab-record'); pg.select_option('#rec-scope', 'all'); pg.select_option('#rec-filter', 'all'); pg.wait_for_timeout(1000)
    check(pg.locator('#rec-list > li').count() == 6, 'record survives a reload (IndexedDB)')

    check(not errs, f'no page errors {errs[:3]}')
    b.close()
print('\n' + ('ALL PASSED' if not fails else f'{len(fails)} FAILED'))
sys.exit(1 if fails else 0)
