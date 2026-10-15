from pathlib import Path
import re, json
from pypdf import PdfReader
root = Path(__file__).resolve().parents[1]
css = (root / 'tokens.css').read_text(encoding='utf-8')
blocks = re.findall(r'\{([^}]+)\}', css)
themes = {name:dict(re.findall(r'--([\w-]+):\s*(#[0-9A-Fa-f]{6})', block)) for name,block in zip(['light','dark'],blocks)}
def luminance(c):
    rgb=[int(c[i:i+2],16)/255 for i in (1,3,5)]
    rgb=[x/12.92 if x<=0.04045 else ((x+0.055)/1.055)**2.4 for x in rgb]
    return sum(x*w for x,w in zip(rgb,[.2126,.7152,.0722]))
def ratio(a,b):
    hi,lo=sorted([luminance(a),luminance(b)],reverse=True)
    return (hi+.05)/(lo+.05)
checks=[]
for name,t in themes.items():
    pairs=[(fg,bg,4.5) for fg in ['ink','muted','faint','accent','command','amber','success','danger'] for bg in ['bg','panel','raised']]
    pairs += [(fg,'accent-bg',4.5) for fg in ['ink','muted','accent']]
    pairs += [('command','command-bg',4.5),('danger','danger-bg',4.5),('panel','accent',4.5)]
    pairs += [(fg,bg,3) for fg in ['control-border','accent'] for bg in ['bg','panel','raised','accent-bg']]
    for fg,bg,minimum in pairs:
        actual=ratio(t[fg],t[bg]);checks.append(dict(theme=name,foreground=fg,background=bg,ratio=round(actual,2),minimum=minimum,passes=actual>=minimum))
failures=[r for r in checks if not r['passes']]
(root/'qa'/'contrast-report.json').write_text(json.dumps(dict(checks=checks,failures=failures),indent=2))
print(f'{len(checks)} contrast checks; {len(failures)} failures')
if failures:
    print(json.dumps(failures,indent=2));raise SystemExit(1)
reader=PdfReader(root/'Archiver-design-study.pdf')
assert len(reader.pages)==10, len(reader.pages)
expected=['The Reading','Two roles','recognizable home','Warmth through','reading desk','clear workspace','Dark mode','common language','theme lives','migration an agent']
for i,(page,phrase) in enumerate(zip(reader.pages,expected),1):
    text=page.extract_text()
    assert phrase.casefold() in text.casefold(), (i,phrase)
    assert 'HANDOFF.md was absent' not in text
print('PDF verified: 10 searchable pages with expected headings.')
