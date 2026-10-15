from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
assets = root / 'assets'
mark = (assets / 'archiver-mark.svg').read_text(encoding='utf-8')
(assets / 'archiver-mark-reversed.svg').write_text(mark.replace('#214E44', '#A6C8B5'), encoding='utf-8')
paths = ''.join(re.findall(r'<path[^>]+/>', mark))
(assets / 'archiver-app-icon.svg').write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-label="Archiver app icon"><rect width="512" height="512" rx="104" fill="#214E44"/><g transform="translate(72 72) scale(5.75)" fill="#FFFCF5">{paths}</g></svg>''', encoding='utf-8')
(assets / 'archiver-wordmark.svg').write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" width="440" height="96" viewBox="0 0 440 96" role="img" aria-label="Archiver wordmark reference"><g transform="translate(4 12) scale(1.05)" fill="#214E44">{paths}</g><text x="90" y="72" fill="#214E44" font-family="Instrument Serif, Georgia, serif" font-size="76" letter-spacing="-1">Archiver</text></svg>''', encoding='utf-8')
licenses = Path(__file__).resolve().parents[2] / 'node_modules' / '@fontsource'
for font in ['dm-sans', 'instrument-serif']:
    (assets / 'fonts' / f'{font}-LICENSE.txt').write_text((licenses / font / 'LICENSE').read_text(encoding='utf-8'), encoding='utf-8')
print('Wrote inverse, app tile, wordmark reference, and font licenses.')
