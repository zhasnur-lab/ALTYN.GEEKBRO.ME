"""Логотип ALTYN в SVG по образцу с вывески и аватарки Instagram @meiramhana_altyn.
Надпись: «MEIRAMHANA» — Montserrat 500 с разрядкой, «ALTYN» — Montserrat 800, «A» с плоским верхом нарисована отдельно.
Эмблема: двойное кольцо и казахский орнамент (решётка крест-накрест и «қошқар мүйіз»).
Запуск: python3 tools/logo/make_logo.py <папка со шрифтами mont-latin-500.ttf, mont-latin-800.ttf>  → public/img/logo*.svg, icon.svg
"""
import math, sys, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

FD = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'img')
BROWN, CREAM, GOLD, GOLD_D, WHITE = '#3b2a1e', '#ffffff', '#d4a85a', '#3b2a1e', '#ffffff'

class Font:
    def __init__(self, path):
        self.f = TTFont(path); self.gs = self.f.getGlyphSet(); self.cmap = self.f.getBestCmap()
    def glyph(self, ch):
        g = self.gs[self.cmap[ord(ch)]]; pen = SVGPathPen(self.gs); g.draw(pen)
        bp = BoundsPen(self.gs); g.draw(bp)
        return pen.getCommands(), g.width, bp.bounds

M500, M800 = Font(os.path.join(FD, 'mont-latin-500.ttf')), Font(os.path.join(FD, 'mont-latin-800.ttf'))
CAP = 700  # высота прописных Montserrat (ед. шрифта)

def custom_A(stem):
    """«A» логотипа: плоский верх со скосом слева, правая стойка вертикальная, широкая перекладина."""
    w, t = 700, stem * 1.1
    cap = CAP; cut = 95                                   # скос левого верхнего угла
    d = (f'M0 0 L0 {cap - cut} L{cut} {cap} L{w} {cap} L{w} 0 Z '
         f'M{t:.0f} {cap * 0.30 + t * 0.95:.0f} L{t:.0f} {cap - t * 0.95:.0f} L{w - t:.0f} {cap - t * 0.95:.0f} L{w - t:.0f} {cap * 0.30 + t * 0.95:.0f} Z '
         f'M{t:.0f} 0 L{t:.0f} {cap * 0.30:.0f} L{w - t:.0f} {cap * 0.30:.0f} L{w - t:.0f} 0 Z')
    return d, w
def custom_Y(stem):
    """«Y» с угловой развилкой: две наклонные ветви сходятся в стойку."""
    w, t = 720, stem * 1.05; cap = CAP; mid = w / 2; yk = cap * 0.40; tt = t * 1.25  # толщина ветвей по горизонтали
    d = (f'M0 {cap} L{tt:.0f} {cap} L{mid:.0f} {yk + (mid - tt) * (cap - yk) / mid:.0f} L{w - tt:.0f} {cap} L{w} {cap} '
         f'L{mid + t / 2:.0f} {yk:.0f} L{mid + t / 2:.0f} 0 L{mid - t / 2:.0f} 0 L{mid - t / 2:.0f} {yk:.0f} Z')
    return d, w
def custom_N(stem):
    """«N»: левая стойка, правая стойка и диагональ-параллелограмм от верха левой к низу правой.
    Три отдельных контура (nonzero), без самопересечений. y в шрифте растёт вверх."""
    w, t = 760, stem * 1.05; cap = CAP; k = t * 1.35
    left = f'M0 0 L0 {cap} L{t:.0f} {cap} L{t:.0f} 0 Z'
    right = f'M{w - t:.0f} 0 L{w - t:.0f} {cap} L{w} {cap} L{w} 0 Z'
    diag = f'M{t:.0f} {cap} L{t + k:.0f} {cap} L{w - t:.0f} 0 L{w - t - k:.0f} 0 Z'
    return left + ' ' + right + ' ' + diag, w

def word(font, text, tracking, custom=None):
    """Возвращает список (path, x) и общую ширину строки в единицах шрифта."""
    parts, x = [], 0
    for i, ch in enumerate(text):
        if custom and ch in custom: d, adv = custom[ch]; lsb = 0
        else:
            d, adv, b = font.glyph(ch); lsb = 0
        parts.append((d, x)); x += adv + (tracking if i < len(text) - 1 else 0)
    return parts, x

def emblem(cx, cy, r, ring=CREAM, disc=GOLD, line=GOLD_D):
    """Эмблема по оригиналу: белое кольцо, внутри на коричневом фоне — ажурный золотой орнамент.
    Две диагональные тройки полос крест-накрест, центральный ромб с сеткой точек, в 4 осевых
    секторах — пара «қошқар мүйіз» и треугольник, на кольце — 4 диагональных завитка.
    ring — цвет кольца, disc — золото, line — фон внутри."""
    s = r / 50; g = disc; bg = line
    o = [f'<g transform="translate({cx:.2f} {cy:.2f}) scale({s:.4f})">',
         f'<circle r="49" fill="{ring}"/>', f'<circle r="44.6" fill="{bg}"/>',
         f'<circle r="39.5" fill="none" stroke="{g}" stroke-width="2.2"/>',
         f'<clipPath id="ed{cx:.0f}"><circle r="38.4"/></clipPath><g clip-path="url(#ed{cx:.0f})" fill="{g}">']
    # диагональные тройки полос (золото), с просветом по оси
    for ang in (45, -45):
        o.append(f'<g transform="rotate({ang})">')
        for off in (-12, -8, -4, 4, 8, 12):
            o.append(f'<rect x="-40" y="{off - 1.0:.2f}" width="80" height="2.0"/>')
        o.append('</g>')
    o.append('</g>')
    # просветы-«окна» между полосами возле центра: заливаем фоном вдоль осей
    o.append(f'<g fill="{bg}">')
    for a in (0, 90, 180, 270):
        o.append(f'<g transform="rotate({a})"><path d="M-14 -14 L14 -14 L0 -0.5 Z" opacity="0"/></g>')
    o.append('</g>')
    # центральный ромб (контур золото) с сеткой точек
    o.append(f'<g transform="rotate(45)" fill="{g}"><rect x="-8" y="-8" width="16" height="16" fill="{bg}" stroke="{g}" stroke-width="1.6"/>')
    for i in (-4.4, 0, 4.4):
        for j in (-4.4, 0, 4.4): o.append(f'<circle cx="{i}" cy="{j}" r="1.15"/>')
    o.append('</g>')
    # осевые секторы: треугольник у края + пара рогов (золотые линии)
    horn = 'M-2 1 C-6 1 -9 -2 -8 -6 C-7 -9 -3 -9 -3 -6 C-3 -4 -5 -4 -5 -5.5'
    for a in (0, 90, 180, 270):
        o.append(f'<g transform="rotate({a}) translate(0 -24)" fill="none" stroke="{g}" stroke-width="2" stroke-linecap="round">')
        o.append(f'<path d="M-5.5 -10.5 L5.5 -10.5 L0 -3.5 Z" fill="{g}" stroke="none"/>')
        o.append(f'<path d="{horn}"/><path d="{horn}" transform="scale(-1 1)"/>')
        o.append(f'<path d="M-2 1 C-2 5 2 5 2 1" /><circle cy="7" r="1.4" fill="{g}" stroke="none"/>')
        o.append('</g>')
    # 4 диагональных завитка на границе кольца
    curl = 'M0 0 C-3.6 -0.8 -5 -4.6 -2.4 -6.8 C0 -8.6 3 -6.4 1.8 -3.8 C1 -2.2 -1 -2.4 -0.9 -3.9 M0 0 C3.6 0.8 5 4.6 2.4 6.8 C0 8.6 -3 6.4 -1.8 3.8 C-1 2.2 1 2.4 0.9 3.9'
    for a in (45, 135, 225, 315):
        o.append(f'<g transform="rotate({a}) translate(0 -42)"><path d="{curl}" fill="none" stroke="{g}" stroke-width="1.5" stroke-linecap="round"/><circle r="1.5" fill="{g}"/></g>')
    o.append('</g>')
    return ''.join(o)

def wordmark(color, top_color=None):
    """Две строки надписи; возвращает (svg-группа, ширина, высота) в единицах шрифта (ALTYN кегль 1000)."""
    stem = 168
    A = custom_A(stem)
    big, wbig = word(M800, 'ALTYN', 30, {'A': A, 'Y': custom_Y(stem), 'N': custom_N(stem)})
    small_scale = 0.40
    sm, wsm_raw = word(M500, 'MEIRAMHANA', 0)
    # разрядка так, чтобы MEIRAMHANA была одной ширины с ALTYN
    track = (wbig / small_scale - wsm_raw) / 9
    sm, wsm = word(M500, 'MEIRAMHANA', track)
    gap = 120; h_small = CAP * small_scale
    total_h = h_small + gap + CAP
    g = [f'<g fill="{top_color or color}" transform="translate(0 {h_small:.1f}) scale({small_scale} -{small_scale})">']
    g += [f'<path transform="translate({x:.1f} 0)" d="{d}"/>' for d, x in sm] + ['</g>']
    g += [f'<g fill="{color}" transform="translate(0 {total_h:.1f}) scale(1 -1)">']
    g += [f'<path transform="translate({x:.1f} 0)" d="{d}"{' fill-rule="evenodd"' if i == 0 else ''}/>' for i, (d, x) in enumerate(big)] + ['</g>']
    return ''.join(g), wbig, total_h

def svg(w, h, body, bg=None):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}">'
            + (f'<rect width="100%" height="100%" fill="{bg}"/>' if bg else '') + body + '</svg>\n')

def horizontal(color, emb_ring=CREAM, emb_bg=BROWN):
    g, ww, hh = wordmark(color)
    pad = 20; r = hh / 2 * 1.02; ex = ww + 70 + r
    body = f'<g transform="translate({pad} {pad})">{g}{emblem(ex, hh / 2, r, ring=emb_ring, line=emb_bg)}</g>'
    return svg(ex + r + 2 * pad, hh + 2 * pad, body)

def round_logo():
    """Как аватарка Instagram: коричневый круг, эмблема сверху, надпись крупно снизу."""
    R = 1000; g, ww, hh = wordmark(WHITE)
    sc = 1640 / ww; tx = R - ww * sc / 2; ty = 1030
    body = (f'<circle cx="{R}" cy="{R}" r="{R}" fill="#d9b98a"/><circle cx="{R}" cy="{R}" r="{R - 26}" fill="{BROWN}"/>'
            + emblem(R, 640, 320, ring=WHITE, line=BROWN) + f'<g transform="translate({tx:.1f} {ty}) scale({sc:.4f})">{g}</g>')
    return svg(2 * R, 2 * R, body)

def icon():
    body = f'<rect width="1000" height="1000" rx="220" fill="{BROWN}"/>' + emblem(500, 500, 400, line=BROWN)
    return svg(1000, 1000, body)

if __name__ == '__main__':
    files = {'logo.svg': horizontal(WHITE), 'logo-dark.svg': horizontal(BROWN, emb_ring='#3b2a1e', emb_bg='#efe4d2'),
             'logo-round.svg': round_logo(), 'emblem.svg': svg(1000, 1000, f'<circle cx="500" cy="500" r="500" fill="{BROWN}"/>' + emblem(500, 500, 480, line=BROWN)), 'icon.svg': icon()}
    for n, s in files.items():
        open(os.path.join(OUT, n), 'w').write(s); print(n, len(s))
