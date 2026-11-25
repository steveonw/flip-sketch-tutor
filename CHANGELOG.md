# Changelog

## Unreleased
- New deck `decks/MTH263_Final_Review_All.json`: the MTH 263 final review deck and the Written Mastery deck merged into one (264 questions). The two original decks are unchanged.

## 1.4.1
- Flip cards grow to fit long answer choices instead of cutting them off, and long choices use slightly smaller type.
- MTH 263 deck: added a Formula sheet (46 cards) and 13 product/chain/quotient practice problems.

## 1.4.0
- **I'm stuck** becomes **Next step** after the first hint: up to 3 hints, each building on the last, still one miss.
- Hints stay on screen in their own box, with the check shown below.
- One record per problem: hints, submitted work, the check and follow-ups together.
- The last 3 follow-up questions and answers are saved on each answer. They show in My record, the review sheet and PDF, and the coach summary.
- Review sheet: long entries can split between their parts (no more blank page), and correct answers that had questions keep their full layout.

## 1.3.0
- Fixed: `\frac` in the checker prompt was turned into a form-feed character by JavaScript. A test now scans every prompt for control characters.
- Fixed: Next/Enter during a check cancelled it; Anthropic replies were capped at 2,000 tokens; skips weren't recorded; Economy mode's "re-attached" note and retry behavior; a failed check hid the tutor; an erased pad was sent as work.
- New: **I'm stuck** (counts as a miss, gives the first step). New verdict **no attempt** (counts as a miss).
- The checker now reads before it judges: READ → FINAL → VERDICT → FEEDBACK.
- Explanations number choices 1–4 like the cards, speak to the student as "you", and use a different angle on a repeat miss.
- More compact review sheet. AI-written text is labeled.

## 1.2.0
- **AI usage** switch: Normal / Economy (text-only follow-ups, plus a "Send my picture again" box).

## 1.1.1
- PDF fix: MathJax glyphs no longer print bold (Chrome's PDF output treats `stroke-width="0"` as a hairline).

## 1.1.0
- **AI coach** replaces the AI quiz. It works from a text copy of your results and adds practice sets to the deck instead of replacing it.

## 1.0.0
- First version: mixed flip cards and sketch problems, a vector pad that never smears, a choice of AI providers, records with ZIP and review-sheet export.
