"""Shrinks the generated brand PNGs after `node scripts/generate-brand-svgs.mjs --png` (the Worker embeds every public file,
so bytes count against its limit). Flat-colour artwork loses nothing at 32 colours: the tile, glyph and dot colours are kept exact
and only anti-aliased edge pixels share palette entries. The themed (monochrome) icon keeps true 8-bit alpha and is only losslessly re-compressed.
Run: python scripts/optimize-brand-pngs.py
"""
from pathlib import Path
from PIL import Image

pub = Path(__file__).resolve().parent.parent / 'public'
for name in ('icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'):
    path = pub / name
    Image.open(path).convert('RGBA').quantize(colors=32, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)
for name in ('icon-monochrome-512.png',):
    path = pub / name
    image = Image.open(path); image.load(); image.save(path, optimize=True, compress_level=9)
for path in sorted(pub.glob('*.png')):
    print(path.name, path.stat().st_size)
