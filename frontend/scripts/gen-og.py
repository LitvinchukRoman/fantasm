#!/usr/bin/env python3
"""Генерує превʼю-картинки статей: public/og/<hub>/<slug>-{16x9,4x3,1x1}.jpg (+ default-*.jpg).

Навіщо три пропорції: Google радить для Article-розмітки давати зображення 16:9, 4:3 і 1:1
(мінімум 50 000 пікселів, ми даємо 1200 px у ширину), а Open Graph використовує 16:9.

Запуск (з каталогу frontend): python3 scripts/gen-og.py
Потрібні Pillow і PyYAML; шрифт береться системний (Arial Bold), бо Onest не має локального файлу.
Перегенеровуйте після зміни `title` у content/**/*.mdx.
"""
import glob
import os
import re
import sys

import yaml
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CONTENT = os.path.join(ROOT, 'content')
OUT = os.path.join(ROOT, 'public', 'og')
LOGO = os.path.join(ROOT, 'public', 'favicon.jpg')

HUBS = {'startups': 'Стартапи', 'games': 'Ігри та івенти', 'campus': 'Кампус НаУКМА'}
SIZES = {'16x9': (1200, 675), '4x3': (1200, 900), '1x1': (1200, 1200)}

BG = (8, 9, 10)
TEXT = (245, 245, 247)
MUTED = (150, 152, 158)
ACCENT = (255, 99, 99)

FONT_CANDIDATES = [
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/Library/Fonts/Arial Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
]
FONT = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)
if not FONT:
    sys.exit('Не знайдено жирний шрифт із кирилицею: додайте шлях у FONT_CANDIDATES')


def font(size):
    return ImageFont.truetype(FONT, size)


def wrap(draw, text, fnt, max_width):
    lines, line = [], ''
    for word in text.split():
        trial = f'{line} {word}'.strip()
        if draw.textlength(trial, font=fnt) <= max_width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def logo_layer(size):
    """Біле лінійне лого як напівпрозорий шар: чорний фон логотипа стає прозорим."""
    img = Image.open(LOGO).convert('L').resize((size, size), Image.LANCZOS)
    layer = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    layer.putalpha(img.point(lambda v: int(v * 0.45)))
    return layer


def render(title, kicker, ratio):
    w, h = SIZES[ratio]
    img = Image.new('RGB', (w, h), BG)
    # лого праворуч, частково за краєм
    size = int(h * 1.05) if ratio != '1x1' else int(h * 0.8)
    layer = logo_layer(size)
    img.paste(layer, (w - int(size * 0.72), (h - size) // 2 if ratio != '1x1' else -int(size * 0.12)), layer)
    d = ImageDraw.Draw(img)

    pad = 72
    max_w = int(w * 0.72) if ratio != '1x1' else w - 2 * pad
    max_lines = 5 if ratio != '16x9' else 4
    for fs in range(76, 34, -2):
        fnt = font(fs)
        lines = wrap(d, title, fnt, max_w)
        if len(lines) <= max_lines:
            break
    line_h = int(fs * 1.16)
    block = line_h * len(lines)

    # кікер (розділ) зверху
    kf = font(30)
    d.rounded_rectangle((pad, pad, pad + d.textlength(kicker.upper(), font=kf) + 44, pad + 58), radius=29, outline=ACCENT, width=2)
    d.text((pad + 22, pad + 12), kicker.upper(), font=kf, fill=ACCENT)

    y = (h - block) // 2 + 10
    for line in lines:
        d.text((pad, y), line, font=fnt, fill=TEXT)
        y += line_h

    ff = font(30)
    d.text((pad, h - pad - 30), 'Fantasm', font=ff, fill=TEXT)
    d.text((pad + d.textlength('Fantasm  ', font=ff), h - pad - 30), 'ideas.naukma.com', font=ff, fill=MUTED)
    return img


def load_frontmatter(path):
    raw = open(path, encoding='utf8').read()
    m = re.match(r'^---\n(.*?)\n---', raw, re.S)
    return yaml.safe_load(m.group(1))


def main():
    jobs = [('default', 'Fantasm, платформа ідей Києво-Могилянської академії', 'НаУКМА')]
    for hub in HUBS:
        for path in sorted(glob.glob(os.path.join(CONTENT, hub, '*.mdx'))):
            slug = os.path.basename(path)[:-4]
            fm = load_frontmatter(path)
            name = 'index' if slug == 'index' else slug
            jobs.append((f'{hub}/{name}', fm['title'], HUBS[hub]))
    count = 0
    for name, title, kicker in jobs:
        for ratio in SIZES:
            target = os.path.join(OUT, f'{name}-{ratio}.jpg')
            os.makedirs(os.path.dirname(target), exist_ok=True)
            render(title, kicker, ratio).save(target, quality=68, optimize=True, progressive=True)
            count += 1
    print(f'generated {count} images for {len(jobs)} pages -> {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
