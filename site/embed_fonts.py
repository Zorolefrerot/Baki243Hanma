#!/usr/bin/env python3
"""Intègre les polices (woff2) en base64 dans les pages du site, pour un rendu autonome."""
import base64
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
FONTS = [
    ('Jakarta', 700, ROOT / 'fonts-tmp' / 'PlusJakartaSans-700.woff2'),
    ('Jakarta', 800, ROOT / 'fonts-tmp' / 'PlusJakartaSans-800.woff2'),
    ('InterApp', 400, ROOT / 'fonts-tmp' / 'Inter-400.woff2'),
    ('InterApp', 500, ROOT / 'fonts-tmp' / 'Inter-500.woff2'),
    ('InterApp', 600, ROOT / 'fonts-tmp' / 'Inter-600.woff2'),
]


def faces() -> str:
    out = []
    for family, weight, path in FONTS:
        b64 = base64.b64encode(path.read_bytes()).decode()
        out.append(
            "@font-face{font-family:'%s';font-style:normal;font-weight:%d;font-display:swap;"
            "src:url(data:font/woff2;base64,%s) format('woff2');}" % (family, weight, b64)
        )
    return '\n'.join(out)


def main() -> None:
    block = faces()
    for page in sys.argv[1:] or ['index.html', 'tutoriel.html']:
        p = ROOT / page
        html = p.read_text()
        html2 = re.sub(r"/\*FONT_FACES\*/", block, html, count=1)
        if html2 == html and '/*FONT_FACES*/' in html:
            raise SystemExit(f'marqueur non remplacé dans {page}')
        p.write_text(html2)
        print(f'{page}: polices intégrées ({p.stat().st_size // 1024} Ko)')


if __name__ == '__main__':
    main()
