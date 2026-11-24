# Flip & Sketch Tutor

Flip cards for the rules. A sketch pad for the work. An AI that reads it.

A single-file study app that mixes two kinds of questions in one deck:

- **Flip cards** (4 choices) for rules and formulas. They're graded by the deck's answer key, with no AI needed.
- **Sketch problems** that you work out by hand on a pad. When you submit, an AI reads a picture of your work, compares your final answer with the deck's answer key, and points to the first step that went wrong.

It grew out of three earlier projects: Flip Quiz Tutor (the quiz and mistake tracking), [EquationWright](https://github.com/steveonw/equationwright) (the scratch pad and the local tutor gateway), and [math-photo-to-notes](https://github.com/steveonw/math-photo-to-notes) (pinned MathJax, the provider code, and the "never guess" reading rules).

## Open it

| File | Use it when |
|---|---|
| `index.html` / `dist/flip_sketch_tutor.html` | Online. Math is drawn by MathJax 3.2.2 from jsDelivr. |
| `dist/flip_sketch_tutor_OFFLINE.html` | No internet. The same pinned MathJax bundle is built into the file. |
| `decks/sample_derivatives_deck.json` | Sample deck: 10 flip cards and 6 sketch problems. |
| `decks/MTH263_Final_Review_Deck.json` | MTH 263 (Calculus I) final review: 213 questions (162 flip cards, 51 sketch problems): a Formula sheet, product/chain/quotient practice, Part A (4.7–6.1), Part B (Chapters 2–4) and past Exams I–III. Answers checked with sympy. |
| `decks/mth263_final_written_mastery.json` | MTH 263 final, written mastery: 51 sketch problems (needs an AI connected). |

If GitHub Pages is turned on for this repo, the app is at `https://steveonw.github.io/flip-sketch-tutor/`.

## How it works

- **No AI connected:** only the flip cards run. Sketch problems stay hidden until you connect an AI.
- **Sketch check:** the checker reads first, then judges. It writes out your work, then your final answer as it reads it, then a verdict, then feedback.
  - **Correct / partly correct / incorrect** count normally. "Partly correct" means a right answer with a wrong step, and it counts as a miss so you see it again.
  - **No attempt** (a blank pad, a "?" or "no idea") counts as a miss.
  - **Unreadable** (there is work, but no readable final answer) isn't counted.
  - You can always override the AI with **Count it right** or **Count it wrong**.
- **I'm stuck → Next step:** the first press counts the problem as a miss, so it lands on your Mistakes list. The AI gives only the next step, up to 3 hints, each building on the last. Hints stay on screen above the check.
- **The pad never smears.** Strokes are stored as points on a fixed page, 900 units wide. S, M and L lock as soon as there's ink. Exports are 1800 px wide on a solid white background.
- **Mistakes:** a question stays on the list until you get it right twice in a row (the Flip Quiz Tutor rule). Repeat misses ask the AI for a different explanation than last time.
- **AI coach:** the AI gets a **text copy** of your answers, with no pictures. That includes your picks, typed answers, what the AI read on your pad, hints, skips, and your questions to the tutor, plus what you want help with. It explains the patterns behind your mistakes. It can also write a practice set that's **added** to the deck, never replacing it, and marked unverified.
- **My record:** every answer is saved in your browser (IndexedDB) with the picture of your work and the help trail: hints, the check, the explanation, and your last 3 follow-up questions. From there you can:
  - **Download ZIP**, with `review.html`, `answers.json`, `work/*.png` and `coaching_notes.md`.
  - **Download review sheet**, a single HTML file with the pictures embedded. Print it, or save it as a PDF.
  - In Chrome or Edge, **save each answer to a folder** as you go.

## Choosing an AI

| Option | Notes |
|---|---|
| Claude (inside claude.ai) | Used automatically when the page runs as a Claude artifact. |
| Anthropic, OpenAI, Gemini | Bring your own API key. Calls go straight from your browser. |
| Tutor gateway | The `tutor-gateway.exe` from EquationWright: `http://127.0.0.1:8090/v1`, key `54`. |
| Other OpenAI-compatible server | Ollama (`http://127.0.0.1:11434/v1`, start it with `OLLAMA_ORIGINS=*`), LM Studio, or OpenRouter (`https://openrouter.ai/api/v1`). |

For sketch problems, the model has to be able to read images. Keys stay in memory unless you tick "Remember", and they are never written into exports.

**AI usage:** *Normal* resends the picture of your work with every follow-up question. *Economy* sends follow-ups as text, using the problem, the answer key, and what the AI read on your pad. A **Send my picture again** box sends it with one question when you need the AI to look again. In testing, a follow-up was about 3,000 characters instead of about 59,000.

## Deck format

`schema_version` 1 decks (Flip Quiz Tutor) load unchanged. Version 2 adds sketch problems. Write math as TeX in `$…$`, and remember that JSON needs every backslash doubled.

```json
{
  "schema_version": 2,
  "quiz_name": "My deck",
  "description": "optional",
  "categories": [
    { "name": "Rules", "questions": [
      { "question": "$\\frac{d}{dx}\\sin x$", "answers": ["$\\cos x$", "$-\\cos x$", "$-\\sin x$", "$\\sec^2 x$"],
        "correct_answer": 0, "explanation": "optional" }
    ]},
    { "name": "Show your work", "questions": [
      { "type": "sketch", "question": "Find $\\frac{d}{dx}[x^2\\sin x]$.", "answer": "$2x\\sin x + x^2\\cos x$",
        "solution": "optional worked steps", "explanation": "optional", "pad": "M", "paper": "grid" }
    ]}
  ]
}
```

- `pad`: `S`, `M` or `L`.
- `paper`: `plain`, `grid`, `lined` or `dots`.
- Progress is stored by deck name, so you can edit a deck without losing progress on the questions you didn't change.

## Development

The app is built from `src/` into one HTML file:

```bash
python3 build.py            # writes dist/*.html and index.html
```

`build.py` checks the vendored MathJax bundle (`vendor/mathjax/tex-svg-full.js`, 3.2.2) against its pinned Git blob SHA-1 before embedding it into the offline file.

Browser tests (Playwright + Chromium):

```bash
pip install playwright sympy && playwright install chromium
python3 tests/smoke.py                      # main flows, using a mocked AI
python3 tests/fixes.py                      # checker format, hints, economy mode, records, exports
python3 tests/deck_check.py some_deck.json  # loads a deck and renders every formula
```

Set `CHROME=/path/to/chrome` to use an installed browser. The sample deck's answers are checked with sympy by `tools/make_sample_deck.py`.

```
src/style.css, src/body.html   page
src/js/01_util.js … 11_boot.js  app (joined in order)
decks/                          sample deck
vendor/mathjax/                 pinned MathJax 3.2.2 tex-svg-full + license
tests/, tools/                  browser tests, deck builder
dist/                           built files (online + offline)
```

## Privacy

Everything stays in your browser unless you connect an AI. When you do, the text of each question goes to the AI you chose. A picture of your work goes only when you submit a sketch problem, or when you choose to resend it. The coach sends text only.

## License

MIT, see [LICENSE](LICENSE). MathJax is Apache-2.0, see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
