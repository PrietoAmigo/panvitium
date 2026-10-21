#!/usr/bin/env python3
"""Render Panvitium Steam Header Capsules at exactly 920x430 from game assets."""
from __future__ import annotations

from pathlib import Path
import math
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont, ImageOps

W, H = 920, 430
ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "apps/web/public/assets/panvitium"
OUT = ROOT / "marketing/steam-capsules/output"
GOLD = (223, 182, 84)
CREAM = (226, 205, 166)

def font_path(italic=False):
    candidates = ([
        "/usr/share/fonts/truetype/ebgaramond/EBGaramond12-Italic.ttf",
        "/usr/share/fonts/truetype/ebgaramond/EBGaramond08-Italic.ttf",
    ] if italic else [
        "/usr/share/fonts/truetype/ebgaramond/EBGaramond12-Regular.ttf",
        "/usr/share/fonts/truetype/ebgaramond/EBGaramondSC12-Regular.ttf",
    ]) + [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return path
    raise FileNotFoundError("Install an EB Garamond or serif font.")

def fit_bg(path, align_y=0.48):
    img = Image.open(path).convert("RGB")
    ratio = max(W/img.width, H/img.height)
    sw, sh = math.ceil(img.width*ratio), math.ceil(img.height*ratio)
    img = img.resize((sw,sh), Image.Resampling.LANCZOS)
    left = (sw-W)//2
    top = int((sh-H)*align_y)
    return img.crop((left,top,left+W,top+H))

def grade(img, theme):
    import numpy as np
    a = np.array(img.convert("RGB")).astype("float32")
    yy, xx = np.mgrid[0:H, 0:W]
    if theme=="altar":
        # Candlelit marble, ritual shadows, warm shrine.
        a *= np.array([0.64, 0.52, 0.40],dtype="float32")
        a += np.array([2,0,0],dtype="float32")
        light = np.exp(-((xx-460)/235)**2-((yy-234)/195)**2)
        a += light[...,None]*np.array([23,12,3],dtype="float32")
        veil = 0.17+0.74*np.exp(-((yy-70)/122)**2)
        a *= (1-0.73*veil[...,None])
    else:
        # Descent: crimson void, dark spires, subtle lightning highlights.
        lum = (a[:,:,0]+a[:,:,1]+a[:,:,2])/3
        a *= np.array([0.59,0.42,0.42],dtype="float32")
        a += np.maximum(lum-55,0)[...,None]*np.array([0.13,0.03,0.01],dtype="float32")
        glow = np.exp(-((xx-690)/290)**2-((yy-175)/280)**2)
        a += glow[...,None]*np.array([34,2,1],dtype="float32")
        lower = np.clip((yy-194)/160,0,1)*0.52
        a *= 1-lower[...,None]
    radial = ((xx-460)/555)**2+((yy-205)/314)**2
    a *= 1-np.clip(radial,0,1.4)[...,None]*0.52
    rng = np.random.default_rng(48 if theme=="altar" else 91)
    a += rng.normal(0,1.85,(H,W,1))
    return Image.fromarray(np.uint8(np.clip(a,0,255)),"RGB").convert("RGBA")

def typeset(text,size,spacing,max_width,color,italic=False):
    fontfile = font_path(italic)
    tmp = Image.new("L",(W,170),0)
    draw = ImageDraw.Draw(tmp)
    while True:
        font = ImageFont.truetype(fontfile,size)
        width = sum(draw.textlength(c,font=font) for c in text)+(len(text)-1)*spacing
        if width <= max_width or size <=24:
            break
        size -= 1
    x = (W-width)/2
    bounds=draw.textbbox((0,0),text,font=font)
    y=-bounds[1]+4
    for ch in text:
        draw.text((int(round(x)),y),ch,font=font,fill=255)
        x += draw.textlength(ch,font=font)+spacing
    bound=tmp.getbbox()
    if bound is None:
        return Image.new("RGBA",(W,1))
    alpha=tmp.crop((0,bound[1],W,bound[3]))
    layer=Image.new("RGBA",alpha.size,(*color,0))
    layer.putalpha(alpha)
    return layer

def logo(canvas,top,size=119,spacing=12,max_width=870):
    gold=typeset("PANVITIUM",size,spacing,max_width,GOLD)
    a=gold.getchannel("A")
    halo=Image.new("RGBA",gold.size,(169,94,24,0))
    halo.putalpha(a.filter(ImageFilter.GaussianBlur(16)).point(lambda v:int(v*.42)))
    glow=Image.new("RGBA",gold.size,(255,184,67,0))
    glow.putalpha(a.filter(ImageFilter.GaussianBlur(3)).point(lambda v:int(v*.4)))
    shadow=Image.new("RGBA",gold.size,(7,3,1,0))
    shadow.putalpha(a.point(lambda v:int(v*.72)))
    canvas.alpha_composite(halo,(0,top))
    canvas.alpha_composite(glow,(0,top))
    canvas.alpha_composite(shadow,(0,top+2))
    canvas.alpha_composite(gold,(0,top))

def motto(canvas,top,size=25,max_width=470):
    ink=typeset("Per vitia, ad solium.",size,.6,max_width,CREAM,italic=True)
    shade=Image.new("RGBA",ink.size,(4,2,1,0))
    shade.putalpha(ink.getchannel("A").filter(ImageFilter.GaussianBlur(3)))
    canvas.alpha_composite(shade,(0,top+2))
    canvas.alpha_composite(ink,(0,top))

def frame(canvas,theme):
    over=Image.new("RGBA",(W,H),(0,0,0,0))
    d=ImageDraw.Draw(over)
    if theme=="altar":
        d.rectangle((8,8,W-9,H-9),outline=(196,134,52,69),width=1)
        d.line((31,19,188,19),fill=(202,149,66,105),width=1)
        d.line((W-189,19,W-32,19),fill=(202,149,66,105),width=1)
        line_y=401;left=190;right=W-190;ink=(196,141,65)
    else:
        d.rectangle((8,8,W-9,H-9),outline=(122,58,42,57),width=1)
        d.line((37,30,138,30),fill=(178,70,45,110),width=1)
        d.line((W-139,30,W-38,30),fill=(178,70,45,110),width=1)
        line_y=237;left=290;right=630;ink=(181,101,55)
    for x in range(left,right):
        strength=max(0,1-abs(x-(left+right)/2)/((right-left)/2))
        d.point((x,line_y),fill=(*ink,int(130*strength)))
    canvas.alpha_composite(over)

def save(canvas,name):
    OUT.mkdir(parents=True,exist_ok=True)
    path=OUT/name
    canvas.convert("RGB").save(path,"PNG",optimize=True)
    print(f"{path}: {Image.open(path).size} | {path.stat().st_size} bytes")

def option_altar():
    source=ASSETS/"backgrounds/altar_complete.png"
    canvas=grade(fit_bg(source,align_y=.53),"altar")
    frame(canvas,"altar")
    logo(canvas,36,max_width=833,size=118,spacing=13)
    motto(canvas,150,size=25,max_width=430)
    save(canvas,"panvitium_steam_header_01_altar.png")

def option_princes():
    source=ASSETS/"katabasis/katabasis3.png"
    canvas=grade(fit_bg(source,align_y=.49),"prince")
    seal=ASSETS/"katabasis/seal-panvitium.png"
    if seal.exists():
        glyph=Image.open(seal).convert("RGBA")
        glyph.thumbnail((248,248),Image.Resampling.LANCZOS)
        alpha=glyph.getchannel("A").point(lambda v:int(v*.32))
        grey=ImageOps.grayscale(glyph.convert("RGB"))
        alpha=ImageChops.multiply(alpha,grey.point(lambda v:0 if v<56 else min(255,int((v-56)*1.65))))
        ink=Image.new("RGBA",glyph.size,(191,62,34,0))
        ink.putalpha(alpha)
        canvas.alpha_composite(ink,(W//2-glyph.width//2,53))
    frame(canvas,"prince")
    logo(canvas,264,max_width=852,size=113,spacing=13)
    motto(canvas,372,size=23,max_width=420)
    save(canvas,"panvitium_steam_header_02_princes.png")

if __name__=="__main__":
    option_altar()
    option_princes()
