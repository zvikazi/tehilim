#!/usr/bin/env python3
"""Render the app icons with headless Chrome. usage: make_icons.py <outdir>"""
import asyncio, sys, pathlib
from playwright.async_api import async_playwright

OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)

# Full-bleed square (iOS and Android apply their own mask). The letter ת sits inside the central safe zone.
def page(size, scale):
    return f"""<html><body style="margin:0;width:{size}px;height:{size}px;background:#2B4A9C;display:flex;align-items:center;justify-content:center;overflow:hidden">
<div style="font:700 {int(size*scale)}px/1 'Frank Ruhl Libre','Times New Roman','DejaVu Serif',serif;color:#F7F9FC;transform:translateY({-int(size*0.02)}px)">ת</div></body></html>"""

JOBS = [('icon-180.png', 180, 0.62), ('icon-192.png', 192, 0.62), ('icon-512.png', 512, 0.62), ('icon-maskable-512.png', 512, 0.46)]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for name, size, scale in JOBS:
            pg = await b.new_page(viewport={'width': size, 'height': size})
            await pg.set_content(page(size, scale))
            await pg.screenshot(path=str(OUT / name))
            await pg.close()
        await b.close()
    print('icons:', ', '.join(n for n, *_ in JOBS))

asyncio.run(main())
