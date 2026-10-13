"""Original vector-style Jobvance sharing card. No customer data or external images."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parent.parent
FONT_DIR=Path('C:/Windows/Fonts')
def font(size,bold=False):
    return ImageFont.truetype(str(FONT_DIR/('segoeuib.ttf' if bold else 'segoeui.ttf')),size)
image=Image.new('RGB',(1200,630),'#f2f4fa')
d=ImageDraw.Draw(image)
blue='#2850df';ink='#14223b';muted='#526079'
d.rounded_rectangle((64,52,116,104),radius=14,fill=blue)
d.line((78,89,100,67),fill='white',width=5)
d.line((88,66,101,66,101,80),fill='white',width=5)
d.text((130,49),'jobvance.',font=font(38,True),fill=ink)
d.rounded_rectangle((895,60,1136,102),radius=21,fill='#e2f69e')
d.text((920,66),'FREE CV CHECK',font=font(20,True),fill=ink)
d.text((64,162),'Your experience.',font=font(58,True),fill=ink)
d.text((64,232),'Your next application.',font=font(58,True),fill=ink)
d.text((68,334),'Bring a CV and one vacancy.',font=font(28),fill=muted)
d.text((68,377),'Review the evidence. Choose your next step.',font=font(26),fill=muted)
d.rounded_rectangle((66,467,562,533),radius=16,fill=blue)
d.text((88,481),'Start free. No account needed.',font=font(25,True),fill='white')
d.rounded_rectangle((789,171,1136,474),radius=24,fill='white',outline='#dce2ef',width=2)
d.text((814,196),'SOURCE → VACANCY → REVIEW',font=font(16,True),fill=blue)
d.line((814,237,1110,237),fill='#e2e7f1',width=2)
d.text((814,260),'Your actual words.',font=font(25,True),fill=ink)
d.text((814,308),'Relevant source passages',font=font(20),fill=muted)
d.text((814,341),'Clear gaps and questions',font=font(20),fill=muted)
d.text((814,374),'A document you approve',font=font(20),fill=muted)
d.text((66,574),'jobvance.io',font=font(23,True),fill=ink)
d.text((789,576),'Your experience. Your decision.',font=font(18),fill=muted)
image.save(ROOT/'public'/'og-jobvance.png',optimize=True)
print(f'Original sharing image:1200×630;{(ROOT/"public"/"og-jobvance.png").stat().st_size}bytes')
