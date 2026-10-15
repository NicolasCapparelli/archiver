"""Check production token contrast and create an icon review sheet."""
from pathlib import Path
import re, json
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
out = root / 'continuity/design/reading-room/qa/migration'
css = (root / 'src/style.css').read_text(encoding='utf-8')
blocks = [re.search(r':root \{(.*?)\n\}', css, re.S).group(1), re.search(r':root\[data-theme="light"\] \{(.*?)\n\}', css, re.S).group(1)]
def luminance(c):
    v = [int(c[i:i+2],16)/255 for i in (1,3,5)]
    return sum((x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4)*w for x,w in zip(v,[.2126,.7152,.0722]))
checks=[]
for theme, block in zip(['dark','light'],blocks):
    t=dict(re.findall(r'--([\w-]+):\s*(#[0-9A-Fa-f]{6})',block))
    pairs=[(fg,bg,4.5) for fg in ['ink','muted','faint','accent','command','amber','success','danger'] for bg in ['bg','panel','raised']]
    pairs += [(fg,'accent-bg',4.5) for fg in ['ink','muted','accent']]
    pairs += [('command','command-bg',4.5),('danger','danger-bg',4.5),('panel','accent',4.5)]
    pairs += [(fg,bg,3) for fg in ['control-border','accent'] for bg in ['bg','panel','raised','accent-bg']]
    for fg,bg,minimum in pairs:
        hi,lo=sorted([luminance(t[fg]),luminance(t[bg])],reverse=True)
        ratio=(hi+.05)/(lo+.05)
        checks.append(dict(theme=theme,foreground=fg,background=bg,ratio=round(ratio,2),minimum=minimum,passes=ratio>=minimum))
(out/'contrast-report.json').write_text(json.dumps(checks,indent=2))
assert all(c['passes'] for c in checks), [c for c in checks if not c['passes']]
sheet=Image.new('RGB',(640,220),'#F5F1E8');draw=ImageDraw.Draw(sheet)
tile=Image.open(root/'src-tauri/icons/icon.png').convert('RGBA')
tray=Image.open(root/'src-tauri/icons/tray.png').convert('RGBA')
assert tray.size==(32,32) and tray.getextrema()[3][0]==0
for i,size in enumerate([16,20,24,32,40,48,64]):
    x=24+i*86
    draw.text((x,12),f'{size}px',fill='#252B28')
    sheet.paste(tile.resize((size,size),Image.Resampling.LANCZOS),(x,36),tile.resize((size,size),Image.Resampling.LANCZOS))
    draw.rectangle((x-4,120,x+size+4,120+size+8),fill='#191F1C')
    small=tray.resize((size,size),Image.Resampling.LANCZOS)
    sheet.paste(small,(x,124),small)
sheet.save(out/'icon-review.png')
print(f'{len(checks)} production contrast pairs pass; platform/tray review sheet created.')
