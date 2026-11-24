import json, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
deck = Path(sys.argv[1]).read_text(encoding='utf-8')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1000, 'height': 900}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(Path('dist/flip_sketch_tutor_OFFLINE.html').resolve().as_uri()); pg.wait_for_timeout(500)
    err = pg.evaluate("t => loadQuizText(t)", deck)
    print('load error:', repr(err))
    print('index:', pg.evaluate("state.index.length"), 'sketch:', pg.evaluate("state.index.filter(q=>q.type==='sketch').length"))
    print('round without AI:', pg.inner_text('#question-count'), '|', pg.inner_text('#sketch-notice-text'))
    bad = pg.evaluate("""async()=>{const out=[];
      for(const q of state.index){const box=document.createElement('div');document.body.appendChild(box);
        for(const t of [q.question,...(q.answers||[]),q.answer,q.solution,q.explanation]){if(!t)continue;const d=document.createElement('p');d.textContent=t;box.appendChild(d);}
        await typeset(box); const e=mathErrorsIn(box); if(e.length) out.push([q.categoryName,q.question.slice(0,60),e]); box.remove();}
      return out;}""")
    print('TeX errors:', bad if bad else 'none')
    print('page errors:', errs)
    b.close()
