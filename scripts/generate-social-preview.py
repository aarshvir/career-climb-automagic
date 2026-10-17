"""Job Loop sharing card from the project's editable drawing source.

No customer data, external images or implied customer history. The versioned URL
refreshes future social previews; the legacy URL is corrected too.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parent.parent
FONT_DIR=Path('C:/Windows/Fonts')
def font(size,bold=False):
    return ImageFont.truetype(str(FONT_DIR/('segoeuib.ttf' if bold else 'segoeui.ttf')),size)
image=Image.new('RGB',(1200,630),'#f2f4fa')
d=ImageDraw.Draw(image)
blue='#2850df';ink='#14223b';muted='#526079'
d.rounded_rectangle((64,46,110,92),radius=13,fill=blue)
d.line((77,79,96,60),fill='white',width=4)
d.line((84,60,97,60,97,73),fill='white',width=4)
d.text((125,43),'jobvance.',font=font(34,True),fill=ink)
d.rounded_rectangle((960,49,1136,91),radius=21,fill='#e2f69e')
d.text((996,56),'JOB LOOP',font=font(20,True),fill=ink)
d.text((64,135),'Automate your job search.',font=font(60,True),fill=ink)
d.text((67,224),'Your CV. Your preferences. A search on your schedule.',font=font(27),fill=muted)
panels = [
    ('01','Create your account',['Upload your CV or build one','from your experience.']),
    ('02','Set your search',['Choose roles, locations','and a recurring schedule.']),
    ('03','Review your matches',['Jobs and prepared CVs','together in your dashboard.']),
]
for index,(number,title,lines) in enumerate(panels):
    left=64+index*370
    d.rounded_rectangle((left,310,left+332,489),radius=20,fill='white',outline='#dce2ef',width=2)
    d.text((left+22,327),number,font=font(19,True),fill=blue)
    d.text((left+22,366),title,font=font(23,True),fill=ink)
    for row,line in enumerate(lines):
        d.text((left+22,411+row*28),line,font=font(20),fill=muted)
    if index<2:
        x=left+346
        d.line((x,399,x+13,399),fill=blue,width=3)
        d.line((x+7,393,x+13,399,x+7,405),fill=blue,width=3)
d.text((66,531),'From connected sources. You review and approve each CV.',font=font(22),fill=muted)
d.text((66,578),'jobvance.io',font=font(22,True),fill=ink)
d.text((806,578),'Your experience. Your decision.',font=font(20),fill=muted)
for filename in ['og-job-loop-account.png','og-jobvance.png']:
    destination=ROOT/'public'/filename
    image.save(destination,optimize=True)
    print(f'{filename}: 1200x630; {destination.stat().st_size} bytes')
