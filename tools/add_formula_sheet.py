"""Add a Formula sheet (flip cards) and rule-practice sketch problems to the MTH 263 final deck.
Every answer is checked with sympy. Usage: python3 add_formula_sheet.py <deck.json>"""
import json, sys
import sympy as sp

x = sp.Symbol('x', positive=True); a = sp.Symbol('a', positive=True); n = sp.Symbol('n')
D = lambda f: sp.diff(f, x)
def ok(got, want, why):
    assert sp.simplify(got - want) == 0, (why, got, want)
f, g = sp.Function('f'), sp.Function('g')

# ---- derivatives ----
for F, d in [(sp.sin(x), sp.cos(x)), (sp.cos(x), -sp.sin(x)), (sp.tan(x), sp.sec(x)**2), (sp.sec(x), sp.sec(x)*sp.tan(x)),
             (sp.csc(x), -sp.csc(x)*sp.cot(x)), (sp.cot(x), -sp.csc(x)**2), (sp.exp(x), sp.exp(x)), (a**x, a**x*sp.log(a)),
             (sp.log(x), 1/x), (sp.log(x, a), 1/(x*sp.log(a))), (sp.asin(x), 1/sp.sqrt(1 - x**2)), (x**n, n*x**(n - 1))]:
    ok(D(F), d, F)
# ---- antiderivatives (differentiate the answer) ----
for F, integrand in [(sp.sin(x), sp.cos(x)), (sp.exp(x), sp.exp(x)), (sp.sec(x), sp.sec(x)*sp.tan(x)), (-sp.csc(x), sp.csc(x)*sp.cot(x)),
                     (sp.asin(x), 1/sp.sqrt(1 - x**2)), (-1/x, x**-2), (7*x, 7), (2*sp.sqrt(x), 1/sp.sqrt(x))]:
    ok(D(F), integrand, ('anti', F))
ok(D(x*sp.log(x) - x), sp.log(x), 'x ln x - x')
# ---- rule patterns ----
G = g(x)
ok(D(sp.exp(G)), sp.exp(G)*D(G), 'e^g'); ok(D(sp.log(G)), D(G)/G, 'ln g'); ok(D(sp.sin(G)), sp.cos(G)*D(G), 'sin g'); ok(D(G**5), 5*G**4*D(G), 'g^5')
# ---- practice problems ----
P = [
 (x**3*sp.cos(x), 3*x**2*sp.cos(x) - x**3*sp.sin(x)),
 (x**2*sp.exp(x), 2*x*sp.exp(x) + x**2*sp.exp(x)),
 (x**2*sp.log(x), 2*x*sp.log(x) + x),
 (sp.exp(5*x**2), 10*x*sp.exp(5*x**2)),
 (sp.sin(4*x**3), 12*x**2*sp.cos(4*x**3)),
 ((3*x**2 + 1)**6, 36*x*(3*x**2 + 1)**5),
 (sp.log(x**2 + 4), 2*x/(x**2 + 4)),
 (x*sp.exp(2*x), sp.exp(2*x) + 2*x*sp.exp(2*x)),
 (x**2*sp.sin(3*x), 2*x*sp.sin(3*x) + 3*x**2*sp.cos(3*x)),
 (x**2/(x + 1), (x**2 + 2*x)/(x + 1)**2),
 (sp.cos(x)/x, (-x*sp.sin(x) - sp.cos(x))/x**2),
]
for F, d in P: ok(D(F), d, F)
ok(D(sp.sin(2*x)), 2*sp.cos(2*x), 'sin2x d'); ok(D(-sp.cos(2*x)/2), sp.sin(2*x), 'sin2x int')
ok(D(sp.exp(3*x)), 3*sp.exp(3*x), 'e3x d'); ok(D(sp.exp(3*x)/3), sp.exp(3*x), 'e3x int')
print('formula-sheet math checks passed')

MC = lambda q, ans, c, e: {"question": q, "answers": ans, "correct_answer": c, "explanation": e}
SK = lambda q, ans, sol, e, pad="M": {"type": "sketch", "question": q, "answer": ans, "solution": sol, "explanation": e, "pad": pad, "paper": "plain"}
d = r"\dfrac{d}{dx}"
I = r"\displaystyle\int"

deriv = [
 MC(rf"${d}\sin x = \;?$", [r"$-\cos x$", r"$\cos x$", r"$-\sin x$", r"$\sec^2 x$"], 1, r"Sine's slope is cosine. The minus sign belongs to $\frac{d}{dx}\cos x$."),
 MC(rf"${d}\cos x = \;?$", [r"$\sin x$", r"$\cos x$", r"$-\sin x$", r"$-\cos x$"], 2, r"Cosine goes down where sine is positive, so it's $-\sin x$."),
 MC(rf"${d}\tan x = \;?$", [r"$\sec^2 x$", r"$\sec x\tan x$", r"$-\csc^2 x$", r"$\cot x$"], 0, r"$\sec x\tan x$ is the derivative of $\sec x$, not $\tan x$."),
 MC(rf"${d}\sec x = \;?$", [r"$\sec^2 x$", r"$\tan^2 x$", r"$\sec x\tan x$", r"$-\sec x\tan x$"], 2, r"Rewrite $\sec x = (\cos x)^{-1}$: the chain rule gives $\frac{\sin x}{\cos^2 x} = \sec x\tan x$."),
 MC(rf"${d}\csc x = \;?$", [r"$\csc x\cot x$", r"$-\csc x\cot x$", r"$-\csc^2 x$", r"$\sec x\tan x$"], 1, r"Every co- function's derivative has a minus sign: $-\csc x\cot x$."),
 MC(rf"${d}\cot x = \;?$", [r"$-\csc^2 x$", r"$\csc^2 x$", r"$-\csc x\cot x$", r"$-\tan^2 x$"], 0, r"Co- functions get the minus sign: $\frac{d}{dx}\cot x = -\csc^2 x$."),
 MC(rf"${d}e^x = \;?$", [r"$x e^{x-1}$", r"$e^{x-1}$", r"$\ln x$", r"$e^x$"], 3, r"$e^x$ is its own derivative. The power rule doesn't apply when $x$ is in the exponent."),
 MC(rf"${d}a^x = \;?$ (for $a>0$)", [r"$x a^{x-1}$", r"$a^x \ln a$", r"$\dfrac{a^x}{\ln a}$", r"$a^x$"], 1, r"Differentiating multiplies by $\ln a$. Dividing by $\ln a$ is the antiderivative."),
 MC(rf"${d}\ln x = \;?$ (for $x>0$)", [r"$\dfrac{1}{x}$", r"$x\ln x - x$", r"$\ln x$", r"$-\dfrac{1}{x^2}$"], 0, r"$\frac{d}{dx}\ln x = \frac{1}{x}$. Lead with that; it's the one to know cold."),
 MC(rf"${d}\log_a x = \;?$", [r"$\dfrac{\ln a}{x}$", r"$\dfrac{1}{x}$", r"$\dfrac{1}{x\ln a}$", r"$a^x \ln a$"], 2, r"$\log_a x = \frac{\ln x}{\ln a}$, so the derivative is $\frac{1}{x\ln a}$."),
 MC(rf"${d}\arcsin x = \;?$", [r"$\dfrac{1}{1 + x^2}$", r"$\dfrac{1}{\sqrt{1 - x^2}}$", r"$-\dfrac{1}{\sqrt{1 - x^2}}$", r"$\cos x$"], 1, r"Inverse sine has the square root. $\frac{1}{1+x^2}$ is inverse tangent; the minus sign is inverse cosine."),
 MC(rf"Power rule: ${d}x^n = \;?$", [r"$\dfrac{x^{n+1}}{n+1}$", r"$n x^{n+1}$", r"$x^{n-1}$", r"$n x^{n-1}$"], 3, r"Bring the power down, then subtract one. $\frac{x^{n+1}}{n+1}$ is the integral rule."),
]
anti = [
 MC(rf"${I}\cos x\,dx = \;?$", [r"$\sin x + C$", r"$-\sin x + C$", r"$\cos x + C$", r"$-\cos x + C$"], 0, r"Check by differentiating: $\frac{d}{dx}\sin x = \cos x$."),
 MC(rf"${I} e^x\,dx = \;?$", [r"$\dfrac{e^{x+1}}{x+1} + C$", r"$x e^{x-1} + C$", r"$e^x + C$", r"$\ln x + C$"], 2, r"$e^x$ is its own antiderivative, too."),
 MC(rf"${I}\sec x\tan x\,dx = \;?$", [r"$\sec^2 x + C$", r"$\sec x + C$", r"$\tan x + C$", r"$\dfrac{\sec^2 x}{2} + C$"], 1, r"Because $\frac{d}{dx}\sec x = \sec x\tan x$."),
 MC(rf"${I}\csc x\cot x\,dx = \;?$", [r"$\csc x + C$", r"$-\cot x + C$", r"$-\csc x + C$", r"$\csc^2 x + C$"], 2, r"$\frac{d}{dx}\csc x = -\csc x\cot x$, so you need the minus sign."),
 MC(rf"${I}\frac{{1}}{{\sqrt{{1 - x^2}}}}\,dx = \;?$", [r"$\arctan x + C$", r"$\arcsin x + C$", r"$\ln\sqrt{1 - x^2} + C$", r"$-\arcsin x + C$"], 1, r"Square root on the bottom: inverse sine. No root: inverse tangent."),
 MC(rf"${I}\frac{{1}}{{x^2}}\,dx = \;?$", [r"$\ln(x^2) + C$", r"$-\dfrac{2}{x^3} + C$", r"$\dfrac{1}{x} + C$", r"$-\dfrac{1}{x} + C$"], 3, r"Write it as $x^{-2}$: raise the power to $-1$ and divide by $-1$. $-\frac{2}{x^3}$ is the derivative."),
 MC(rf"${I}\frac{{1}}{{\sqrt{{x}}}}\,dx = \;?$", [r"$2\sqrt{x} + C$", r"$\dfrac{\sqrt{x}}{2} + C$", r"$-\dfrac{1}{2}x^{-3/2} + C$", r"$\ln\sqrt{x} + C$"], 0, r"$x^{-1/2} \to \frac{x^{1/2}}{1/2} = 2\sqrt{x}$."),
 MC(rf"${I} 7\,dx = \;?$", [r"$0$", r"$7 + C$", r"$7x + C$", r"$\dfrac{7x^2}{2} + C$"], 2, r"A constant integrates to constant times $x$. ($0$ is its derivative.)"),
 MC(rf"Which pair is right? ${d}\cos x$ and ${I}\cos x\,dx$", [r"$-\sin x$ and $\sin x + C$", r"$\sin x$ and $-\sin x + C$", r"$-\sin x$ and $-\sin x + C$", r"$\sin x$ and $\sin x + C$"], 0, r"Opposite directions: the derivative picks up the minus sign; the antiderivative doesn't."),
 MC(rf"Which pair is right? ${d}\ln x$ and ${I}\ln x\,dx$", [r"$x\ln x - x$ and $\dfrac{1}{x} + C$", r"$\dfrac{1}{x}$ and $x\ln x - x + C$", r"$\dfrac{1}{x}$ and $\dfrac{1}{x} + C$", r"$\ln x$ and $x\ln x + C$"], 1, r"Your session 2 mix-up: $\frac{1}{x}$ is the derivative; $x\ln x - x + C$ is the antiderivative. Check either by differentiating."),
]
rules = [
 MC(rf"Product rule: ${d}\big[f(x)g(x)\big] = \;?$", [r"$f'(x)g'(x)$", r"$f'(x)g(x) + f(x)g'(x)$", r"$f'(x)g(x) - f(x)g'(x)$", r"$\dfrac{f'(x)}{g'(x)}$"], 1, r"Quick check: $f = g = x$ gives $x^2$, whose derivative is $2x$. Only $f'g + fg' = x + x$ gives $2x$; $f'g' = 1$."),
 MC(rf"Chain rule: ${d} f\big(g(x)\big) = \;?$", [r"$f'(x)\,g'(x)$", r"$f'\big(g'(x)\big)$", r"$f'\big(g(x)\big)\,g'(x)$", r"$f\big(g'(x)\big)$"], 2, r"Outside derivative, evaluated at the inside, times the inside's derivative."),
 MC(rf"${d} e^{{g(x)}} = \;?$", [r"$e^{g(x)}$", r"$g(x)\,e^{g(x)-1}$", r"$e^{g'(x)}$", r"$g'(x)\,e^{g(x)}$"], 3, r"Keep $e^{g(x)}$ exactly as it is, then multiply by $g'(x)$. That's $e^{3x^2} \to 6x\,e^{3x^2}$."),
 MC(rf"${d}\ln\big(g(x)\big) = \;?$", [r"$\dfrac{g'(x)}{g(x)}$", r"$\dfrac{1}{g(x)}$", r"$\dfrac{1}{g'(x)}$", r"$\ln\big(g'(x)\big)$"], 0, r"$\frac{1}{\text{inside}}$ times the inside's derivative."),
 MC(rf"${d}\big[g(x)\big]^5 = \;?$", [r"$5\big[g(x)\big]^4$", r"$5\big[g'(x)\big]^4$", r"$5\big[g(x)\big]^4 g'(x)$", r"$\big[g(x)\big]^4 g'(x)$"], 2, r"Power rule on the outside, then times the inside's derivative. Leaving off $g'(x)$ is the most common chain-rule slip."),
 MC(rf"${d}\sin\big(g(x)\big) = \;?$", [r"$\cos\big(g'(x)\big)$", r"$\cos\big(g(x)\big)\,g'(x)$", r"$\cos x\, g'(x)$", r"$\sin\big(g(x)\big)\,g'(x)$"], 1, r"The inside stays inside the cosine; $g'(x)$ multiplies outside."),
]
start = [
 MC(r"First step for $\dfrac{d}{dx}\big[x^2 \sin x\big]$?", [r"Chain rule with $u = x^2$", r"Multiply the derivatives: $(2x)(\cos x)$", r"Product rule with $f = x^2$, $g = \sin x$", r"Quotient rule"], 2, r"Two functions of $x$ multiplied side by side: product rule. Write $f$, $g$, $f'$, $g'$ in the margin first."),
 MC(r"First step for $\dfrac{d}{dx}\, e^{3x^2}$?", [r"Chain rule: outside $e^u$, inside $u = 3x^2$", r"Product rule with $3$ and $e^{x^2}$", r"Power rule on $3x^2$ only", r"Pull the $3$ out front: $3e^{x^2}$"], 0, r"The exponent isn't just $x$, so it's a chain. Your session 2 work moved the $3$ out of the exponent; it has to stay in."),
 MC(r"First step for $\dfrac{d}{dx}\,\dfrac{\ln x}{x}$?", [r"Differentiate top and bottom separately", r"Quotient rule with top $\ln x$, bottom $x$", r"Chain rule", r"Rewrite as $\ln x - x$"], 1, r"A fraction of two functions: quotient rule (or the product rule on $\ln x \cdot x^{-1}$)."),
 MC(r"Which rule does $\dfrac{d}{dx}(2x + 1)^5$ need?", [r"Product rule", r"Power rule only: $5(2x+1)^4$", r"Quotient rule", r"Chain rule: $5(2x+1)^4 \cdot 2$"], 3, r"Something other than plain $x$ is raised to a power, so multiply by the inside's derivative."),
 MC(r"Which rule does $\dfrac{d}{dx}\,\sin(x^2)$ need?", [r"Chain rule: $\cos(x^2)\cdot 2x$", r"Product rule", r"None: it's $\cos(x^2)$", r"Power rule: $2\sin x$"], 0, r"$x^2$ is inside the sine: chain rule."),
 MC(r"Which rules does $\dfrac{d}{dx}\big[x\, e^{2x}\big]$ need?", [r"Product rule only", r"Chain rule only", r"Product rule, and the chain rule on $e^{2x}$", r"Quotient rule"], 2, r"$x$ times $e^{2x}$ is a product; differentiating $e^{2x}$ needs the chain (×2). Answer: $e^{2x} + 2x\,e^{2x}$."),
 MC(r"Which order of steps is right for $\dfrac{d}{dx}\big[x^3 \cos x\big]$?", [r"Differentiate both, then multiply: $3x^2 \cdot (-\sin x)$", r"Name $f = x^3$, $g = \cos x$ $\to$ find $f' = 3x^2$, $g' = -\sin x$ $\to$ write $f'g + fg'$ $\to$ simplify", r"Write $f'g + fg'$ $\to$ plug in $f = 3x^2$ $\to$ simplify", r"Simplify $x^3\cos x$ first $\to$ power rule"], 1, r"Name the pieces, find their derivatives, then assemble. Writing $f, g, f', g'$ in the margin prevents most product-rule slips."),
 MC(r"Which order is right for finding the absolute max of $f$ on $[a, b]$?", [r"Solve $f'(x) = 0$ $\to$ the biggest $x$ is the max", r"Plug in the endpoints only", r"Find $f''$ $\to$ where $f'' < 0$ is the max", r"Find $f'$ $\to$ critical numbers inside $[a, b]$ $\to$ evaluate $f$ at those AND the endpoints $\to$ largest value is the max"], 3, r"The closed-interval method. The answer is a $y$-value (with where it happens), and endpoints always get tested."),
 MC(r"First step for $\displaystyle\int 6x\,(3x^2 + 1)^4\,dx$?", [r"Expand $(3x^2 + 1)^4$", r"$u = 3x^2 + 1$, so $du = 6x\,dx$", r"Integrate $6x$ and $(3x^2+1)^4$ separately, then multiply", r"Power rule: $\frac{(3x^2+1)^5}{5}$, done"], 1, r"There's no product rule for integrals. Spot the inside whose derivative is sitting outside, and substitute."),
 MC(r"First step for $\displaystyle\int \frac{x + 1}{\sqrt{x}}\,dx$?", [r"u-substitution with $u = \sqrt{x}$", r"Quotient rule", r"Split it: $x^{1/2} + x^{-1/2}$, then the power rule", r"Integrate the top, divide by the integral of the bottom"], 2, r"No quotient rule for integrals. Rewrite as powers of $x$ first."),
]
defs = [
 MC(r"FTC Part 1: if $F(x) = \displaystyle\int_a^x f(t)\,dt$, then $F'(x) = \;?$", [r"$f(x) - f(a)$", r"$f(x)$", r"$f'(x)$", r"$\displaystyle\int f(x)\,dx$"], 1, r"The derivative of an accumulation function gives back the integrand, evaluated at $x$."),
 MC(r"FTC Part 2: $\displaystyle\int_a^b f(x)\,dx = \;?$ (where $F' = f$)", [r"$F(b) - F(a)$", r"$F(b) + F(a)$", r"$F(a) - F(b)$", r"$F'(b) - F'(a)$"], 0, r"Antiderivative at the top minus at the bottom."),
 MC(r"The Mean Value Theorem concludes that some $c$ in $(a, b)$ has…", [r"$f(c) = 0$", r"$f'(c) = 0$", r"$f(c) = \dfrac{f(a) + f(b)}{2}$", r"$f'(c) = \dfrac{f(b) - f(a)}{b - a}$"], 3, r"Instantaneous slope equals average slope somewhere. Rolle's Theorem is the special case $f(a) = f(b)$, giving $f'(c) = 0$."),
 MC(r"Rolle's Theorem needs $f$ continuous on $[a, b]$, differentiable on $(a, b)$, and…", [r"$f(a) = f(b)$", r"$f(a) = 0$", r"$f'(a) = f'(b)$", r"$f$ increasing"], 0, r"Equal heights at the ends guarantee a flat tangent somewhere between."),
 MC(r"Intermediate Value Theorem: if $f$ is continuous on $[a, b]$ and $N$ is between $f(a)$ and $f(b)$, then…", [r"$f'(c) = N$ for some $c$", r"$f(c) = N$ for some $c$ in $(a, b)$", r"$f$ has a max at $N$", r"$f(N) = c$"], 1, r"A continuous function can't skip values. It's used to show a root exists."),
 MC(r"Squeeze Theorem: if $g(x) \le f(x) \le h(x)$ near $a$ and…", [r"$g(a) = h(a)$, then $f(a)$ exists", r"$g$ and $h$ are continuous, then $f$ is", r"$\lim g = \lim h = L$, then $\lim f = L$", r"$g < h$, then $\lim f = 0$"], 2, r"Example: $-x^2 \le x^2\cos(1/x) \le x^2$, so the limit is $0$."),
 MC(r"The definite integral is defined as…", [r"$F(b) + F(a)$", r"$\displaystyle\lim_{n\to\infty}\sum_{i=1}^{n} f(x_i)\,\Delta x$", r"$\displaystyle\sum_{i=1}^{n} f(x_i)$", r"$\displaystyle\lim_{h\to 0}\frac{f(x+h) - f(x)}{h}$"], 1, r"A limit of Riemann sums: heights times widths. The last choice defines the derivative."),
 MC(r"Extreme Value Theorem: a function that is continuous on a closed interval $[a, b]$…", [r"has a critical number", r"is differentiable", r"attains an absolute max and an absolute min there", r"has $f'(c) = 0$ somewhere"], 2, r"That's why the closed-interval method works: the max and min exist, at critical numbers or endpoints."),
]
practice = [
 SK(r"Warm-up (product rule): find $\dfrac{d}{dx}\big[x^2 e^{x}\big]$.", r"$2x e^x + x^2 e^x$", r"$f = x^2$, $f' = 2x$; $g = e^x$, $g' = e^x$. $f'g + fg' = 2x e^x + x^2 e^x$.", r"Write $f, g, f', g'$ first.", "S"),
 SK(r"Product rule: find $\dfrac{d}{dx}\big[x^3 \cos x\big]$.", r"$3x^2\cos x - x^3 \sin x$", r"$f = x^3$, $f' = 3x^2$; $g = \cos x$, $g' = -\sin x$. $3x^2\cos x + x^3(-\sin x)$.", r"Watch the sign from $\frac{d}{dx}\cos x$."),
 SK(r"Product rule: find $\dfrac{d}{dx}\big[x^2 \ln x\big]$.", r"$2x\ln x + x$", r"$f = x^2$, $g = \ln x$: $2x\ln x + x^2\cdot\frac{1}{x} = 2x\ln x + x$.", r"Simplify $x^2 \cdot \frac1x$ at the end."),
 SK(r"Warm-up (chain rule): find $\dfrac{d}{dx}\, e^{5x^2}$.", r"$10x\,e^{5x^2}$", r"Outside $e^u$ stays $e^{5x^2}$; inside $u = 5x^2$, $u' = 10x$. Multiply.", r"Same shape as $e^{3x^2}$: the number stays in the exponent.", "S"),
 SK(r"Chain rule: find $\dfrac{d}{dx}\,\sin(4x^3)$.", r"$12x^2\cos(4x^3)$", r"Outside $\sin u \to \cos u$; inside $u = 4x^3$, $u' = 12x^2$.", r"The inside stays inside the cosine.", "S"),
 SK(r"Chain rule: find $\dfrac{d}{dx}\,(3x^2 + 1)^6$.", r"$36x(3x^2 + 1)^5$", r"$6(3x^2+1)^5 \cdot 6x = 36x(3x^2+1)^5$.", r"Power rule on the outside, times the inside's derivative.", "S"),
 SK(r"Chain rule: find $\dfrac{d}{dx}\,\ln(x^2 + 4)$.", r"$\dfrac{2x}{x^2 + 4}$", r"$\frac{1}{x^2 + 4}\cdot 2x$.", r"$\frac{d}{dx}\ln(\text{inside}) = \frac{\text{inside}'}{\text{inside}}$.", "S"),
 SK(r"Product + chain: find $\dfrac{d}{dx}\big[x\,e^{2x}\big]$.", r"$e^{2x} + 2x\,e^{2x}$", r"$f = x$, $f' = 1$; $g = e^{2x}$, $g' = 2e^{2x}$ (chain). $1\cdot e^{2x} + x\cdot 2e^{2x}$.", r"Two rules: product for the whole, chain for $e^{2x}$."),
 SK(r"Product + chain: find $\dfrac{d}{dx}\big[x^2 \sin(3x)\big]$.", r"$2x\sin(3x) + 3x^2\cos(3x)$", r"$f = x^2$, $f' = 2x$; $g = \sin 3x$, $g' = 3\cos 3x$. $2x\sin 3x + x^2\cdot 3\cos 3x$.", r"$\sin(3x)$ pays the chain factor $3$."),
 SK(r"Quotient rule: find $\dfrac{d}{dx}\,\dfrac{x^2}{x + 1}$.", r"$\dfrac{x^2 + 2x}{(x + 1)^2}$", r"$\frac{2x(x+1) - x^2\cdot 1}{(x+1)^2} = \frac{x^2 + 2x}{(x+1)^2}$.", r"Low d-high minus high d-low, over low squared."),
 SK(r"Quotient rule: find $\dfrac{d}{dx}\,\dfrac{\cos x}{x}$.", r"$\dfrac{-x\sin x - \cos x}{x^2}$", r"$\frac{(-\sin x)(x) - (\cos x)(1)}{x^2}$.", r"Two minus signs to keep track of."),
 SK(r"Both ways: find $\dfrac{d}{dx}\sin(2x)$ AND $\displaystyle\int \sin(2x)\,dx$.", r"$2\cos(2x)$ and $-\dfrac{1}{2}\cos(2x) + C$", r"Derivative: chain, $\cos(2x)\cdot 2$. Integral: $u = 2x$, $du = 2\,dx$: $\frac12\int \sin u\,du = -\frac12\cos 2x + C$.", r"Differentiating multiplies by the inside's derivative; integrating divides by it. Check the integral by differentiating it."),
 SK(r"Both ways: find $\dfrac{d}{dx}e^{3x}$ AND $\displaystyle\int e^{3x}\,dx$.", r"$3e^{3x}$ and $\dfrac{e^{3x}}{3} + C$", r"Derivative: $e^{3x}\cdot 3$. Integral: $\frac{1}{3}e^{3x} + C$; check: $\frac{d}{dx}\frac{e^{3x}}{3} = e^{3x}$.", r"Same idea: multiply one way, divide the other.", "S"),
]
new_cats = [
 ("Formula sheet · Derivatives", deriv), ("Formula sheet · Antiderivatives", anti), ("Formula sheet · Rules", rules),
 ("Formula sheet · Which rule & how to start", start), ("Formula sheet · Definitions & theorems", defs),
 ("Practice · Product, chain & quotient (show your work)", practice),
]
path = sys.argv[1]
deck = json.load(open(path, encoding='utf-8'))
names = {c['name'] for c in deck['categories']}
assert not any(n in names for n, _ in new_cats), 'already added'
# formula sheet first, so it's at the top of the Practice menu
deck['categories'] = [{"name": nme, "questions": qs} for nme, qs in new_cats] + deck['categories']
deck['description'] = deck['description'].rstrip('.') + ". Updated Nov 24: added a Formula sheet (derivatives, antiderivatives, rules, which rule & how to start, definitions & theorems) and product/chain/quotient practice problems."
seen = set(); pos = [0]*4; nmc = nsk = 0
for c in deck['categories']:
    for q in c['questions']:
        k = (c['name'], q['question']); assert k not in seen, k; seen.add(k)
        if q.get('type') == 'sketch': nsk += 1; assert q['answer'].strip()
        else:
            nmc += 1; assert len(q['answers']) == 4 and len({s.strip().lower() for s in q['answers']}) == 4, q['question']
            pos[q['correct_answer']] += 1
json.dump(deck, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
added_mc = sum(len(q) for _, q in new_cats[:5]); added_sk = len(practice)
print(f'added {added_mc} formula-sheet cards and {added_sk} practice problems; deck now {nmc + nsk} questions ({nmc} flip cards, {nsk} sketch)')
