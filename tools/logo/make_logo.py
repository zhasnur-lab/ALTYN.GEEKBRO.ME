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
BROWN, CREAM, GOLD, GOLD_D, WHITE = '#4b3426', '#efe4d2', '#c9a066', '#7a5734', '#ffffff'

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
    """«A» логотипа: плоский верх, левая нога наклонная, правая вертикальная, перекладина ниже середины.
    Один контур: трапеция минус «окно» над перекладиной и вырез под ней (fill-rule evenodd)."""
    w, lt, t = 700, 230, stem * 1.18
    xi = lambda y: t + y * lt / CAP                     # внутренний край левой ноги
    y1, y2 = CAP * 0.30 + stem * 0.82, CAP - stem * 0.92  # окно
    cb = CAP * 0.30                                       # низ перекладины
    d = (f'M0 0 L{lt} {CAP} L{w} {CAP} L{w} 0 Z '
         f'M{xi(y1):.0f} {y1:.0f} L{xi(y2):.0f} {y2:.0f} L{w - stem} {y2:.0f} L{w - stem} {y1:.0f} Z '
         f'M{t:.0f} 0 L{xi(cb):.0f} {cb:.0f} L{w - stem} {cb:.0f} L{w - stem} 0 Z')
    return d, w

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
    """Эмблема: кремовое кольцо с тонкой линией, золотой диск, решётка крест-накрест, 4 «рога» и насечки."""
    s = r / 50
    o = [f'<g transform="translate({cx:.2f} {cy:.2f}) scale({s:.4f})">',
         f'<circle r="49" fill="{ring}"/>', f'<circle r="45.6" fill="none" stroke="{line}" stroke-width=".9" opacity=".7"/>',
         f'<circle r="42.5" fill="{disc}"/>', f'<circle r="42.5" fill="none" stroke="{line}" stroke-width="1.2"/>',
         '<clipPath id="ec"><circle r="40"/></clipPath><g clip-path="url(#ec)">']
    for ang in (45, -45):          # решётка: по 5 тонких полос в каждой диагонали
        o.append(f'<g transform="rotate({ang})">')
        for off in (-12, -6, 0, 6, 12):
            o.append(f'<rect x="-42" y="{off - 1.05:.2f}" width="84" height="2.1" fill="{line}"/>')
        o.append('</g>')
    o.append('</g>')
    o.append(f'<rect x="-4.2" y="-4.2" width="8.4" height="8.4" transform="rotate(45)" fill="{disc}" stroke="{line}" stroke-width="1.4"/>')
    horn = 'M-6.5 3.5 C-6.5 -3.5 -1 -5.5 0 -1 C1 -5.5 6.5 -3.5 6.5 3.5 M-6.5 3.5 C-6.5 0 -3 0 -3 2.2 M6.5 3.5 C6.5 0 3 0 3 2.2'
    for a in (0, 90, 180, 270):    # «қошқар мүйіз» в просветах по осям
        o.append(f'<g transform="rotate({a}) translate(0 -27.5)"><path d="{horn}" fill="none" stroke="{line}" stroke-width="1.5" stroke-linecap="round"/></g>')
    for a in (45, 135, 225, 315):  # насечки на кольце
        o.append(f'<g transform="rotate({a}) translate(0 -42.5)"><rect x="-3.5" y="-.9" width="7" height="1.8" fill="{line}"/></g>')
    o.append('</g>')
    return ''.join(o)

def wordmark(color, top_color=None):
    """Две строки надписи; возвращает (svg-группа, ширина, высота) в единицах шрифта (ALTYN кегль 1000)."""
    stem = 168
    A = custom_A(stem)
    big, wbig = word(M800, 'ALTYN', 30, {'A': A})
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

def horizontal(color, emb_ring=CREAM):
    g, ww, hh = wordmark(color)
    pad = 20; r = hh / 2 * 1.02; ex = ww + 70 + r
    body = f'<g transform="translate({pad} {pad})">{g}{emblem(ex, hh / 2, r, ring=emb_ring)}</g>'
    return svg(ex + r + 2 * pad, hh + 2 * pad, body)

def round_logo():
    """Как аватарка Instagram: коричневый круг, эмблема сверху, надпись крупно снизу."""
    R = 1000; g, ww, hh = wordmark(WHITE)
    sc = 1640 / ww; tx = R - ww * sc / 2; ty = 1030
    body = (f'<circle cx="{R}" cy="{R}" r="{R}" fill="#d9b98a"/><circle cx="{R}" cy="{R}" r="{R - 26}" fill="{BROWN}"/>'
            + emblem(R, 640, 320, ring=WHITE) + f'<g transform="translate({tx:.1f} {ty}) scale({sc:.4f})">{g}</g>')
    return svg(2 * R, 2 * R, body)

def icon():
    body = f'<rect width="1000" height="1000" rx="220" fill="{BROWN}"/>' + emblem(500, 500, 400)
    return svg(1000, 1000, body)

if __name__ == '__main__':
    files = {'logo.svg': horizontal(WHITE), 'logo-dark.svg': horizontal(BROWN, emb_ring='#e9dcc6'),
             'logo-round.svg': round_logo(), 'emblem.svg': svg(1000, 1000, emblem(500, 500, 500)), 'icon.svg': icon()}
    for n, s in files.items():
        open(os.path.join(OUT, n), 'w').write(s); print(n, len(s))
