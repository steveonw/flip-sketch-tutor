"""Builds decks/sample_derivatives_deck.json and checks every sketch answer with sympy."""
import json, sympy as sp
x = sp.symbols('x', positive=True)
checks = [
  (sp.diff(x**2*sp.sin(x), x), 2*x*sp.sin(x) + x**2*sp.cos(x)),
  (sp.diff(sp.exp(3*x**2), x), 6*x*sp.exp(3*x**2)),
  (sp.diff(sp.log(x)/x, x), (1 - sp.log(x))/x**2),
  ((lambda f: f.subs(x,1) + sp.diff(f,x).subs(x,1)*(x-1))(x**3 - 2*x), x - 2),
  (sp.integrate(3*x**2 + 1, (x, 0, 2)), 10),
  (sp.solve(sp.Eq(3*x + 7, 22), x)[0], 5),
  (sp.diff(sp.tan(x), x), sp.sec(x)**2),
  (sp.diff(sp.Symbol('a', positive=True)**x, x), sp.Symbol('a', positive=True)**x*sp.log(sp.Symbol('a', positive=True))),
]
for got, want in checks:
    assert sp.simplify(got - want) == 0, (got, want)

MC = lambda q, a, c, e: {"question": q, "answers": a, "correct_answer": c, "explanation": e}
SK = lambda q, a, s, e, pad="M", paper="plain": {"type": "sketch", "question": q, "answer": a, "solution": s, "explanation": e, "pad": pad, "paper": paper}
deck = {
 "schema_version": 2,
 "quiz_name": "Sample: Derivative Rules + Show Your Work",
 "description": "Flip cards for the rules you should know cold, plus sketch problems you work by hand. Sketch problems need an AI connected.",
 "categories": [
  {"name": "Basic derivatives", "questions": [
   MC(r"$\dfrac{d}{dx}\,\sin x = \;?$", [r"$\cos x$", r"$-\cos x$", r"$-\sin x$", r"$\sec^2 x$"], 0, r"The slope of $\sin x$ is $\cos x$; the minus sign belongs to the derivative of $\cos x$."),
   MC(r"$\dfrac{d}{dx}\,\cos x = \;?$", [r"$\sin x$", r"$-\sin x$", r"$-\cos x$", r"$\cos x$"], 1, r"Cosine falls where sine is positive, so $\frac{d}{dx}\cos x = -\sin x$."),
   MC(r"$\dfrac{d}{dx}\,e^x = \;?$", [r"$x e^{x-1}$", r"$e^{x-1}$", r"$e^x$", r"$\ln x$"], 2, r"$e^x$ is its own derivative. The power rule does not apply: the variable is in the exponent."),
   MC(r"$\dfrac{d}{dx}\,\ln x = \;?$ (for $x>0$)", [r"$e^x$", r"$\dfrac{1}{x^2}$", r"$x\ln x - x$", r"$\dfrac{1}{x}$"], 3, r"$\frac{d}{dx}\ln x = \frac{1}{x}$. ($x\ln x - x$ is the antiderivative.)"),
   MC(r"$\dfrac{d}{dx}\,\tan x = \;?$", [r"$\sec^2 x$", r"$\sec x\tan x$", r"$-\csc^2 x$", r"$\cot x$"], 0, r"Quotient rule on $\frac{\sin x}{\cos x}$ gives $\frac{1}{\cos^2 x} = \sec^2 x$. $\sec x\tan x$ is the derivative of $\sec x$."),
   MC(r"$\dfrac{d}{dx}\,a^x = \;?$ (for $a>0$)", [r"$x a^{x-1}$", r"$a^x \ln a$", r"$a^x$", r"$\dfrac{a^x}{\ln a}$"], 1, r"$a^x = e^{x\ln a}$, so the chain rule gives $a^x\ln a$."),
  ]},
  {"name": "Combining rules", "questions": [
   MC(r"Product rule: $\dfrac{d}{dx}\big[f(x)\,g(x)\big] = \;?$", [r"$f'(x)\,g'(x)$", r"$f'(x)g(x) - f(x)g'(x)$", r"$f'(x)g(x) + f(x)g'(x)$", r"$\dfrac{f'(x)}{g'(x)}$"], 2, r"Derivative of the first times the second, plus the first times the derivative of the second."),
   MC(r"Quotient rule: $\dfrac{d}{dx}\left[\dfrac{f}{g}\right] = \;?$", [r"$\dfrac{f'g - fg'}{g^2}$", r"$\dfrac{fg' - f'g}{g^2}$", r"$\dfrac{f'}{g'}$", r"$\dfrac{f'g + fg'}{g^2}$"], 0, r"“Low d-high minus high d-low, over low squared.” Swapping the order flips the sign."),
   MC(r"Chain rule: $\dfrac{d}{dx}\,f\big(g(x)\big) = \;?$", [r"$f'(x)\,g'(x)$", r"$f'\big(g'(x)\big)$", r"$f\big(g'(x)\big)$", r"$f'\big(g(x)\big)\,g'(x)$"], 3, r"Outside derivative, evaluated at the inside, times the inside's derivative."),
   MC(r"$\displaystyle\int \cos x\,dx = \;?$", [r"$-\sin x + C$", r"$\sin x + C$", r"$\cos x + C$", r"$-\cos x + C$"], 1, r"Check by differentiating: $\frac{d}{dx}\sin x = \cos x$."),
  ]},
  {"name": "Show your work", "questions": [
   SK(r"Solve for $x$: $\;3x + 7 = 22$", r"$x = 5$", r"$3x = 15$, so $x = 5$.", r"Undo the $+7$, then the $\times 3$.", pad="S"),
   SK(r"Find $\dfrac{d}{dx}\big[x^2 \sin x\big]$.", r"$2x\sin x + x^2\cos x$", r"Product rule with $f = x^2$, $g = \sin x$: $f'g + fg' = 2x\sin x + x^2\cos x$.", r"A product needs the product rule, not $(x^2)'(\sin x)'$."),
   SK(r"Find $\dfrac{dy}{dx}$ if $y = e^{3x^2}$.", r"$6x\,e^{3x^2}$", r"Chain rule: outside $e^u$ stays $e^u$, inside $u = 3x^2$ has $u' = 6x$, so $y' = 6x\,e^{3x^2}$.", r"Don't forget the inside derivative."),
   SK(r"Find $\dfrac{d}{dx}\left[\dfrac{\ln x}{x}\right]$.", r"$\dfrac{1 - \ln x}{x^2}$", r"Quotient rule: $\dfrac{\frac{1}{x}\cdot x - \ln x \cdot 1}{x^2} = \dfrac{1 - \ln x}{x^2}$.", r"Low d-high minus high d-low, over low squared."),
   SK(r"Find the tangent line to $y = x^3 - 2x$ at $x = 1$.", r"$y = x - 2$", r"$y(1) = -1$. $y' = 3x^2 - 2$, so the slope is $y'(1) = 1$. Point-slope: $y + 1 = 1(x - 1)$, so $y = x - 2$.", r"You need both the point and the slope.", paper="grid"),
   SK(r"Evaluate $\displaystyle\int_0^2 \left(3x^2 + 1\right)dx$.", r"$10$", r"Antiderivative $x^3 + x$. $(8 + 2) - (0 + 0) = 10$.", r"Fundamental Theorem: antiderivative at the top minus at the bottom."),
  ]},
 ]}
from pathlib import Path
json.dump(deck, open(Path(__file__).resolve().parent.parent / 'decks' / 'sample_derivatives_deck.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f"{len(checks)} math checks passed;", sum(len(c['questions']) for c in deck['categories']), "questions")
