"""Tests for the 1.3.0 fixes and improvements (from the five-AI review)."""
import json, os, sys, re, time, zipfile, io
from pathlib import Path
from playwright.sync_api import sync_playwright

APP = Path(sys.argv[1] if len(sys.argv) > 1 else 'dist/flip_sketch_tutor_OFFLINE.html').resolve()
fails = []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

calls, REPLIES = [], []
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _cors(self):
        self.send_header('access-control-allow-origin', '*'); self.send_header('access-control-allow-headers', '*'); self.send_header('access-control-allow-methods', 'POST, OPTIONS')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('content-length') or 0)) or b'{}'); calls.append(body)
        r = REPLIES.pop(0) if REPLIES else 'ok'
        status = 200
        if isinstance(r, dict):
            if r.get('delay'): time.sleep(r['delay'])
            status = r.get('status', 200); r = r.get('text', '')
        out = json.dumps({'error': {'message': 'server down'}} if status != 200 else {'choices': [{'message': {'content': r}}], 'content': [{'type': 'text', 'text': r}]}).encode()
        self.send_response(status); self._cors(); self.send_header('content-type', 'application/json'); self.send_header('content-length', str(len(out))); self.end_headers(); self.wfile.write(out)
srv = ThreadingHTTPServer(('127.0.0.1', 0), H); PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
def reply(route):  # used for api.anthropic.com
    if route.request.method == 'OPTIONS':
        return route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'})
    calls.append(json.loads(route.request.post_data or '{}'))
    route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'content': [{'type': 'text', 'text': 'ready'}]}))
def has_img(msg):
    return isinstance(msg.get('content'), list) and any(c.get('type') in ('image_url', 'image') for c in msg['content'])

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1100, 'height': 900}, accept_downloads=True)
    ctx.route('https://api.anthropic.com/**', reply)
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(APP.as_uri()); pg.wait_for_timeout(400)
    pg.click('#builtin-btn'); pg.wait_for_timeout(800)

    # ---- 1. prompts contain no control characters; \frac survives ----
    out = pg.evaluate("""()=>{const q=state.index.find(q=>q.type==='sketch'); const mc=state.index.find(q=>q.type==='mc');
      mc.choices=mc.answers.map((t,i)=>({text:t,isCorrect:i===mc.correctAnswer}));
      return {sys:sketchSystemPrompt(), user:sketchUserText(q,'x',true), stuck:buildStuckPrompt(q,''), ex:buildExplainPrompt(mc,mc.answers[1],false),
        quiz:buildQuizPrompt('t',5,'mixed'), coach:buildCoachPrompt({record:'r',focus:'f',makeSet:true,count:5,mix:'mixed'})};}""")
    bad = {k: [hex(ord(c)) for c in v if ord(c) < 32 and c not in '\n\t'] for k, v in out.items()}
    check(all(not v for v in bad.values()), f'no control characters in any prompt {bad}')
    check('$\\frac{3x^3}{3}$' in out['sys'], 'checker prompt really contains \\frac{3x^3}{3}')
    check(out['sys'].index('READ:') < out['sys'].index('FINAL:') < out['sys'].rindex('VERDICT:') < out['sys'].rindex('FEEDBACK:'), 'checker reads first: READ, FINAL, VERDICT, FEEDBACK')
    check('no attempt' in out['sys'] and 'neatness' in out['sys'], 'checker knows "no attempt" and to skip neatness notes')
    check(re.search(r'^1\) ', out['ex'], re.M) and not re.search(r'^A\) ', out['ex'], re.M) and '"you"' in out['ex'], 'explanations number choices 1–4 and speak as "you"')

    # ---- connect a mocked local server; sketch problems only ----
    pg.click('#ai-pill'); pg.select_option('#ai-provider', 'compat'); pg.fill('#ai-base', f'http://127.0.0.1:{PORT}/v1'); pg.fill('#ai-model', 'v')
    pg.select_option('#ai-mode', 'econ'); pg.click('#ai-close'); pg.wait_for_timeout(500)
    pg.select_option('#type-select', 'sketch'); pg.wait_for_timeout(500)
    def draw(pts):
        box = pg.locator('#pad-canvas').bounding_box()
        pg.mouse.move(box['x'] + pts[0][0], box['y'] + pts[0][1]); pg.mouse.down()
        for x, y in pts[1:]: pg.mouse.move(box['x'] + x, box['y'] + y, steps=6)
        pg.mouse.up()

    # ---- 2. erased-to-blank pad is not sent ----
    draw([(60, 60), (120, 60)])
    pg.click('#pad-erase'); draw([(40, 60), (140, 60)]); draw([(40, 56), (140, 56)]); draw([(40, 64), (140, 64)])
    check(pg.evaluate("Pad.hasInk()") and not pg.evaluate("Pad.inkVisible()"), 'pad knows the ink was all erased')
    n = len(calls); pg.click('#submit-btn'); pg.wait_for_timeout(300)
    check(len(calls) == n and 'first' in pg.inner_text('#feedback'), 'a pad erased back to blank is not sent to the AI')
    pg.click('#pad-pen')

    # ---- 3. Next waits for the check; new READ-first format; FINAL is used ----
    draw([(60, 60), (160, 120)])
    REPLIES.append({'delay': 1.2, 'text': "READ:\n$3x + 7 = 22$\n$3x = 15$\n$x = 5$\nFINAL: $x = 5$\nVERDICT: correct\nFEEDBACK:\nRight. You subtracted $7$, then divided by $3$."})
    pg.click('#submit-btn'); pg.wait_for_timeout(200)
    check(pg.is_disabled('#next-btn'), 'Next is disabled while the check runs')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    check(pg.evaluate("state.currentIndex") == 0, 'Enter during the check does not move on')
    pg.wait_for_timeout(1600)
    check(not pg.is_disabled('#next-btn') and 'Correct' in pg.inner_text('#feedback'), 'Next comes back after the check finishes')
    check('as read' in pg.inner_text('#check-body') and pg.locator('#check-body mjx-container').count() >= 4, 'final answer as read is shown (as math)')
    check(pg.evaluate("state.check.attempt.final") == '$x = 5$', 'FINAL is parsed and stored')

    # ---- 4. economy follow-ups: note matches what is sent; box clears only after success; failure restores the question ----
    pg.check('#resend-pic')
    REPLIES.append({'status': 500})
    pg.fill('#tutor-input', 'look again please'); pg.click('#tutor-ask'); pg.wait_for_timeout(900)
    check(pg.input_value('#tutor-input') == 'look again please', 'failed follow-up puts the question back in the box')
    check(pg.is_checked('#resend-pic'), 'resend box stays ticked when the request failed')
    check(pg.evaluate("state.tutor.turns.filter(t=>!t.hidden).length") == 0, 'failed follow-up is taken back out of the conversation')
    REPLIES.append('I see it now.')
    pg.click('#tutor-ask'); pg.wait_for_timeout(900)
    m = calls[-1]['messages']
    check(has_img(m[-1]) and 're-attached' in json.dumps(m[-1]), 'resend: picture and note go with that question')
    check(not pg.is_checked('#resend-pic'), 'resend box clears after the reply came back')
    REPLIES.append('sure')
    pg.fill('#tutor-input', 'and why divide?'); pg.click('#tutor-ask'); pg.wait_for_timeout(900)
    m = calls[-1]['messages']
    check(not any(has_img(x) for x in m), 'next follow-up sends no picture')
    old = [x for x in m if 'look again please' in json.dumps(x)][0]
    check('not included now' in json.dumps(old) and 're-attached' not in json.dumps(old), 'older question now says the picture is NOT included')
    chat = pg.evaluate("state.check.attempt.chat")
    check(len(chat) == 2 and chat[0]['q'] == 'look again please' and chat[0]['pic'] is True and chat[1]['a'] == 'sure', 'follow-up questions and answers are saved on the record')
    for k in range(2):
        REPLIES.append(f'answer {k}')
        pg.fill('#tutor-input', f'step by step please {k}'); pg.click('#tutor-ask'); pg.wait_for_timeout(700)
    chat = pg.evaluate("state.check.attempt.chat")
    check(len(chat) == 3 and chat[0]['q'] == 'and why divide?' and chat[-1]['a'] == 'answer 1', 'only the last 3 follow-ups are kept')
    stored = pg.evaluate("Records.all().then(r=>r.find(a=>a.id===state.check.attempt.id).chat.length)")
    check(stored == 3, 'the trail is saved in the browser record')

    # ---- 5. failed check: tutor still available, box ticked ----
    pg.click('#next-btn'); pg.wait_for_timeout(500)
    draw([(60, 60), (160, 120)])
    REPLIES.append({'status': 500})
    pg.click('#submit-btn'); pg.wait_for_timeout(1000)
    check(pg.is_visible('#tutor') and pg.is_visible('#resend-wrap') and pg.is_checked('#resend-pic'), 'failed check: tutor box shows with the picture box ticked')
    check(not pg.is_disabled('#next-btn'), 'failed check: Next is available')

    # ---- 6. "no attempt" counts as a miss ----
    pg.click('#next-btn'); pg.wait_for_timeout(500)
    q_na = pg.evaluate("currentQ().key")
    draw([(80, 60), (90, 40), (100, 60), (95, 80)])
    REPLIES.append("READ:\n?\nFINAL: none\nVERDICT: no attempt\nFEEDBACK:\nThis is a product, so start with $f = x^2$ and $g = \\sin x$.")
    pg.click('#submit-btn'); pg.wait_for_timeout(1200)
    check('No attempt' in pg.inner_text('#feedback') and pg.evaluate("state.outcomes[state.currentIndex].right") is False, '"no attempt" verdict counts as a miss')
    check(pg.evaluate(f"recFor('{q_na}').wrong") == 1 and pg.evaluate(f"recFor('{q_na}').picks[0].a") == '(no attempt)', 'no-attempt goes on the Mistakes list as "(no attempt)"')
    check(pg.evaluate(f"recFor('{q_na}').lastFeedback").startswith('This is a product'), 'feedback is remembered for next time')
    check('Last time they tried this problem' in pg.evaluate(f"sketchUserText(state.index.find(q=>q.key==='{q_na}'),'',true)"), 'a repeat attempt tells the checker what it said last time')

    # ---- 7. I'm stuck ----
    pg.click('#next-btn'); pg.wait_for_timeout(500)
    q_st = pg.evaluate("currentQ().key"); misses0 = pg.evaluate("missedCount()")
    check(pg.is_visible('#stuck-btn'), "I'm stuck button shows on sketch problems")
    REPLIES.append('The exponent $3x^2$ is an inside function, so use the **chain rule**. First line: $y\' = e^{3x^2}\\cdot \\frac{d}{dx}(3x^2)$.')
    pg.click('#stuck-btn'); pg.wait_for_timeout(1000)
    hint_req = calls[-1]['messages']
    check(not any(has_img(x) for x in hint_req) and "I'm stuck" in json.dumps(hint_req) and 'do not reveal' in json.dumps(hint_req), 'hint request is text only and asks for just the first move')
    check('Counted as a miss' in pg.inner_text('#feedback') and pg.is_visible('#hint-box') and 'chain rule' in pg.inner_text('#hint-list'), 'hint shows in the hint box and the problem is counted as a miss')
    check(pg.evaluate("missedCount()") == misses0 + 1 and pg.evaluate(f"recFor('{q_st}').wrong") == 1, "I'm stuck puts it on the Mistakes list")
    check(not pg.is_disabled('#submit-btn') and pg.is_visible('#stuck-btn') and 'Next step (hint 2 of 3)' in pg.inner_text('#stuck-btn'), 'pad stays open, and the button becomes "Next step"')
    REPLIES.append('Now take the derivative of the exponent: $\\frac{d}{dx}(3x^2) = 6x$.')
    pg.click('#stuck-btn'); pg.wait_for_timeout(1000)
    h2 = json.dumps(calls[-1]['messages'])
    check('Hints you already gave' in h2 and 'inside function' in h2 and 'NEXT step' in h2, 'second hint builds on the first')
    check(pg.locator('#hint-list > li').count() == 2 and pg.evaluate("missedCount()") == misses0 + 1, 'two hints on screen, still one miss')
    draw([(60, 60), (200, 100)])
    REPLIES.append("READ:\n$6x e^{3x^2}$\nFINAL: $6x e^{3x^2}$\nVERDICT: correct\nFEEDBACK:\nThat's it.")
    pg.click('#submit-btn'); pg.wait_for_timeout(1200)
    check('Correct' in pg.inner_text('#feedback') and 'used a hint' in pg.inner_text('#feedback'), 'after a hint, a correct answer says it still counts as a miss')
    check(pg.evaluate(f"recFor('{q_st}').wrong") == 1 and pg.evaluate(f"recFor('{q_st}').right") == 0, 'progress not changed again after the hint')
    check(pg.evaluate("state.outcomes[state.currentIndex].right") is False, 'round score keeps it as a miss')
    check(pg.evaluate("state.check.attempt.afterHint") is True, 'the checked attempt is marked "after a hint"')
    check(pg.is_visible('#hint-box') and pg.locator('#hint-list > li').count() == 2, 'hints stay on screen after the check')
    same = pg.evaluate(f"Records.all().then(r=>r.filter(a=>a.session===SESSION_ID && a.question===currentQ().question).map(a=>({{v:a.verdict,h:(a.hints||[]).length,img:!!a.image}})))")
    check(len(same) == 1 and same[0]['h'] == 2 and same[0]['img'], f'one record for the problem: hints + submitted work together {same}')
    check('after 2 hints' in pg.evaluate("verdictLabel(state.check.attempt)[1]"), 'record label says "after 2 hints"')

    # ---- 8. skips are recorded ----
    pg.click('#next-btn'); pg.wait_for_timeout(500)
    pg.click('#skip-btn'); pg.wait_for_timeout(500)
    recs = pg.evaluate("Records.all().then(r=>r.map(a=>({v:a.verdict,t:a.type,h:!!(a.hints&&a.hints.length)})))")
    check(any(r['v'] == 'skipped' for r in recs), 'skipped problem is in the record')
    check(any(r['h'] for r in recs), 'the hinted attempt is in the record')

    # ---- 9. coach sees stuck / skipped / final ----
    t = pg.evaluate("Records.all().then(l=>coachRecordText(l.filter(a=>a.session===SESSION_ID)).text)")
    check('SKIPPED (1)' in t and 'asked for 2 hints, then submitted' in t and 'They asked the tutor' in t and 'final answer, as read' in t.lower(), 'coach record includes skipped, hints, questions asked and the final answer as read')

    # ---- 10. review sheet: compact and labeled ----
    pg.click('#tab-record'); pg.wait_for_timeout(800)
    with pg.expect_download() as dl:
        pg.click('#rec-zip')
    z = zipfile.ZipFile(io.BytesIO(Path(dl.value.path()).read_bytes()))
    rv = z.read('review.html').decode(); body = rv.split('<body>')[1]
    check('break-after:avoid' in rv, 'section headings stay with their first item')
    check('class="right-list"' in body and 'Skipped (1)' in body, 'right answers and skips are compact one-line lists')
    check('Written by AI, may contain mistakes' in body and 'Hints you asked for' in body, 'AI-written text and hints are labeled in the sheet')
    check('Your questions to the tutor (last 3)' in body and 'step by step please 1' in body, 'the follow-up trail is in the sheet')
    check(z.testzip() is None and 'data-mml-node="merror"' not in body, 'ZIP valid, no TeX errors')

    # ---- 11. explanation memory on flip cards ----
    pg.click('#tab-study'); pg.select_option('#type-select', 'mc'); pg.wait_for_timeout(600)
    pg.evaluate("state.prefs.autoExplain = true")
    key = pg.evaluate("currentQ().key"); wrong = pg.evaluate("currentQ().choices.findIndex(c=>!c.isCorrect)")
    REPLIES.append('Think of the slope of $\\sin x$ at $0$: it is $1$, and $\\cos 0 = 1$.')
    pg.keyboard.press(str(wrong + 1)); pg.wait_for_timeout(1200)
    check(pg.evaluate(f"recFor('{key}').lastExplain").startswith('Think of the slope'), 'explanation is remembered per card')
    check('DIFFERENT angle' in pg.evaluate("buildExplainPrompt(currentQ(), currentQ().choices[0].text, false)"), 'next miss on that card asks for a different angle')

    # ---- 12. Anthropic reply limit ----
    pg.click('#ai-pill'); pg.select_option('#ai-provider', 'anthropic'); pg.fill('#ai-key', 'sk-test'); pg.click('#ai-test'); pg.wait_for_timeout(800)
    check(calls[-1].get('max_tokens') == 8192, f"Anthropic max_tokens raised to 8192 (got {calls[-1].get('max_tokens')})")
    pg.select_option('#ai-provider', 'none'); pg.wait_for_timeout(100)
    check(pg.is_hidden('#ai-mode-wrap'), 'AI usage setting hides when no AI is chosen')
    pg.click('#ai-close')

    # ---- 13. seventh practice set says the oldest was removed ----
    msg = pg.evaluate("""()=>{let s; for(let i=0;i<7;i++) s=addPracticeSet([{cat:'c',q:{question:'Q'+i+'?',answers:['a','b','c','d'],correct_answer:0}}],'Set '+i,'topic','');
       return [s.removedOldest, state.progress.sets.length];}""")
    check(msg[0] == 'Set 0' and msg[1] == 6, f'7th set reports the removed oldest one {msg}')

    check(not errs, f'no page errors {errs[:3]}')
    b.close()
print('\n' + ('ALL PASSED' if not fails else f'{len(fails)} FAILED'))
sys.exit(1 if fails else 0)
