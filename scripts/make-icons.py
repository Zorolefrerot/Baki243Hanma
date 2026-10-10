"""Génère les icônes PWA (PNG) de ShopFlow RDC à partir du logo « panier qui monte ».

Usage : python3 scripts/make-icons.py
Nécessite cairosvg et Pillow (déjà présents dans l'environnement de build).
Les chemins du logo sont les mêmes que public/favicon.svg (source de vérité visuelle).
"""
import os
import sys

try:
    import cairosvg
except ImportError:
    sys.exit("cairosvg est requis : pip install cairosvg")

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)

NAVY = '#0b2239'
# Emblème « le panier qui monte » (identique à public/favicon.svg).
MARK = """
  <path d="M18 29 H46 L43.4 50.5 Q42.8 55.5 38.2 55.5 H25.8 Q21.2 55.5 20.6 50.5 Z" fill="{body}"/>
  <rect x="14.5" y="23.5" width="35" height="6.5" rx="3.25" fill="{body}"/>
  <path d="M26.5 43 V50" stroke="#3ecf9a" stroke-width="4.6" stroke-linecap="round" fill="none"/>
  <path d="M32.5 38.5 V50" stroke="#2e9aab" stroke-width="4.6" stroke-linecap="round" fill="none"/>
  <path d="M38.5 33.5 V50" stroke="#0b6878" stroke-width="4.6" stroke-linecap="round" fill="none"/>
  <path d="M23 23.5 C 22 11 35 8 44 11.5" stroke="{body}" stroke-width="4.6" stroke-linecap="round" fill="none"/>
  <path d="M50 6.5 L41.5 10.5 L45.5 17 Z" fill="#f2705b"/>
"""


def svg_icon(scale: float, rounded: bool, body: str = '#ffffff') -> str:
    """Carré bleu nuit + emblème centré à `scale` (64 = plein cadre)."""
    offset = (64 - 64 * scale) / 2
    rx = 15 if rounded else 0
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<rect width="64" height="64" rx="{rx}" fill="{NAVY}"/>'
        f'<g transform="translate({offset:.2f},{offset:.2f}) scale({scale:.3f})">'
        + MARK.format(body=body) +
        '</g></svg>'
    )


def render(svg: str, size: int) -> Image.Image:
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size)
    import io
    return Image.open(io.BytesIO(png)).convert('RGBA')


def rounded_alpha(img: Image.Image, radius_ratio: float = 0.22) -> Image.Image:
    size = img.width
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255)
    img.putalpha(mask)
    return img


# Icônes principales (coins arrondis, transparence).
rounded_alpha(render(svg_icon(scale=0.82, rounded=True), 192)).save(os.path.join(OUT, 'icon-192.png'))
rounded_alpha(render(svg_icon(scale=0.82, rounded=True), 512)).save(os.path.join(OUT, 'icon-512.png'))
# Maskable : contenu dans la zone de sécurité (80 %), fond plein.
render(svg_icon(scale=0.56, rounded=False), 512).convert('RGB').save(os.path.join(OUT, 'icon-maskable-512.png'))
# iOS : pas de transparence, coins gérés par le système.
render(svg_icon(scale=0.68, rounded=False), 180).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))

print('Icônes générées dans', os.path.abspath(OUT))
