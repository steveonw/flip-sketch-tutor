#!/usr/bin/env python3
"""Builds Flip & Sketch Tutor from src/ into dist/.

dist/flip_sketch_tutor.html          online file (also index.html and the Claude artifact): MathJax 3.2.2 from jsDelivr
dist/flip_sketch_tutor_OFFLINE.html  one-file offline edition: the same pinned MathJax bundle embedded inline

The MathJax bundle is the one math-photo-to-notes pins (tex-svg-full.js 3.2.2), checked by Git blob SHA-1.
"""
from __future__ import annotations
import hashlib, json, re, sys
from pathlib import Path

ROOT = Path(__file__).parent
EXPECTED_GIT_BLOB_SHA1 = "b3388d20a8d2773b001eebd3211ef1a337335d67"

MATHJAX_CONFIG = r"""<script>
window.MathJax = {
  tex: {
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true,
    // TeX in decks and AI replies is untrusted (from math-photo-to-notes):
    // no \href/\style injection, undefined macros show as errors, no loading extensions.
    packages: { '[-]': ['html', 'noundefined', 'require'] }
  },
  svg: { fontCache: 'local' },
  options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'select', 'option'] },
  startup: { typeset: false }
};
</script>"""


def git_blob_sha1(data: bytes) -> str:
    h = hashlib.sha1(); h.update(f"blob {len(data)}\0".encode()); h.update(data); return h.hexdigest()


def build() -> int:
    src = ROOT / "src"
    css = (src / "style.css").read_text(encoding="utf-8")
    body = (src / "body.html").read_text(encoding="utf-8")
    js = "\n".join(p.read_text(encoding="utf-8") for p in sorted((src / "js").glob("*.js")))
    deck = json.loads((ROOT / "decks" / "sample_derivatives_deck.json").read_text(encoding="utf-8"))
    deck_js = json.dumps(deck, ensure_ascii=False).replace("<", "\\u003c")
    script = "<script>\n'use strict';\nconst BUILTIN_DECK = " + deck_js + ";\n" + js + "\n</script>"
    if "</script" in js.lower():
        print("ERROR: app JS contains a closing script tag", file=sys.stderr); return 2

    head = ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            '<title>Flip &amp; Sketch Tutor</title>\n'
            '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
            '<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=STIX+Two+Text:wght@400;600&display=swap" rel="stylesheet">\n'
            f'<style>\n{css}\n</style>\n{MATHJAX_CONFIG}\n')
    tail = f"</head>\n<body>\n{body}\n{script}\n</body>\n</html>\n"

    dist = ROOT / "dist"; dist.mkdir(exist_ok=True)
    online = head + tail
    (dist / "flip_sketch_tutor.html").write_text(online, encoding="utf-8")
    (ROOT / "index.html").write_text(online, encoding="utf-8")  # GitHub Pages opens the app

    bundle = (ROOT / "vendor" / "mathjax" / "tex-svg-full.js").read_bytes()
    actual = git_blob_sha1(bundle)
    if actual != EXPECTED_GIT_BLOB_SHA1:
        print(f"ERROR: MathJax bundle {actual} != pinned {EXPECTED_GIT_BLOB_SHA1}", file=sys.stderr); return 3
    text = bundle.decode("utf-8")
    n = len(re.findall(r"</script", text, re.I))
    text = re.sub(r"</script", r"<\\/script", text, flags=re.I)  # only appears inside JS strings, where \/ == /
    offline = head + '<script id="embedded-mathjax">\n' + text + "\n</script>\n" + tail
    (dist / "flip_sketch_tutor_OFFLINE.html").write_text(offline, encoding="utf-8")
    print(f"online  {len(online.encode()):>9,} bytes\noffline {len(offline.encode()):>9,} bytes (MathJax {actual[:12]}…, {n} script-tag escapes)")
    return 0


if __name__ == "__main__":
    sys.exit(build())
