#!/usr/bin/env python3
"""Build index.html: inline CSS, JS and the Psalms text.

usage: build.py <sefaria-psalms.json | --sample> <out.html>
"""
import json, re, sys, pathlib

HERE = pathlib.Path(__file__).resolve().parent

CANTILLATION = re.compile(r'[֑-֯]')
TAGS = re.compile(r'<[^>]*>')
# Source marks ketiv/qere as: unpointed-ketiv [pointed-qere]. The ketiv is the unpointed word
# (or the unpointed part after a maqaf) right before the bracket. Keep only the qere.
KQ = re.compile(r'(?:(?<=\s)|(?<=־)|^)[א-ת‍]+־?\s*\[([^\]]*)\]')
# A qere split across two brackets leaves a second bracket with no ketiv before it.
KQ_REST = re.compile(r'\s*\[([^\]]*)\]')
PARASHA = re.compile(r'\{[^}]*\}')


def clean(v: str) -> str:
    v = TAGS.sub('', v)
    v = v.replace('&nbsp;', ' ').replace('&thinsp;', ' ').replace('‍', '')
    v = KQ.sub(r'\1', v)
    v = KQ_REST.sub(r' \1', v)
    v = re.sub('־\\s+', '־', v)   # no space after a maqaf
    v = PARASHA.sub('', v)          # {פ} {ס} paragraph markers
    v = CANTILLATION.sub('', v)
    return re.sub(r'\s+', ' ', v).strip()


def load(path):
    raw = json.load(open(path, encoding='utf-8'))
    text = raw['text'] if isinstance(raw, dict) else raw
    chapters = [[clean(v) for v in ch if isinstance(v, str) and clean(v)] for ch in text]
    if len(chapters) != 150:
        sys.exit(f'expected 150 chapters, got {len(chapters)}')
    empty = [i + 1 for i, c in enumerate(chapters) if not c]
    if empty:
        sys.exit(f'empty chapters: {empty}')
    return chapters


def sample():
    # Placeholder text only, for testing the app. Not the real Psalms.
    out = []
    for n in range(1, 151):
        k = 4 + (n % 5)
        out.append([' '.join(['מילה'] * (2 + (i * 3) % 9)) + f' ({n}:{i + 1})' for i in range(k)])
    return out


def main():
    src, out = sys.argv[1], sys.argv[2]
    chapters = sample() if src == '--sample' else load(src)
    tpl = (HERE / 'index.template.html').read_text(encoding='utf-8')
    data = 'window.__PSALMS__=' + json.dumps(chapters, ensure_ascii=False, separators=(',', ':')) + ';'
    html = (tpl.replace('/*STYLE*/', (HERE / 'style.css').read_text(encoding='utf-8'))
               .replace('/*CORE*/', (HERE / 'core.js').read_text(encoding='utf-8'))
               .replace('/*APP*/', (HERE / 'app.js').read_text(encoding='utf-8'))
               .replace('<!--DATA-->', '<script>' + data + '</script>')
               .replace('<!--SAMPLE-->', '<p class="notice">גרסת בדיקה: הטקסט כאן הוא מילים לדוגמה ולא תהילים. מטרתה לבדוק את הקול העברי, ההפסקות והסימון.</p>' if src == '--sample' else ''))
    if '--standalone' in sys.argv:
        # Full page for hosting on its own: manifest, iOS home-screen tags, service worker.
        head = ('<!doctype html>\n<html lang="he" dir="rtl">\n<meta charset="utf-8">\n'
                '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                '<meta name="theme-color" content="#2B4A9C">\n'
                '<meta name="mobile-web-app-capable" content="yes">\n'
                '<meta name="apple-mobile-web-app-status-bar-style" content="default">\n'
                '<link rel="manifest" href="manifest.webmanifest">\n'
                '<link rel="apple-touch-icon" href="icon-180.png">\n')
        sw = ("<script>if('serviceWorker' in navigator){addEventListener('load',function(){"
              "navigator.serviceWorker.register('sw.js').catch(function(){});});}</script>\n")
        html = head + html.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '') + sw
    pathlib.Path(out).write_text(html, encoding='utf-8')
    verses = sum(len(c) for c in chapters)
    print(f'wrote {out}: {len(chapters)} chapters, {verses} verses, {len(html) / 1024:.0f} KB')


main()
