#!/usr/bin/env python3
"""Incremental sticker extractor.

Each asset is defined in MANIFEST with its source sheet, grid cell, method and
tuning. Assets with locked=True are NEVER regenerated (their PNG is kept as-is).
Run:  python3 extract.py            -> processes only non-locked assets
      python3 extract.py name ...   -> processes just the named assets (ignores lock)
      python3 extract.py --sheet    -> rebuilds the contact sheet only
"""
import sys, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # Developer Files
OUT  = os.path.join(ROOT, "public", "brand", "parts")
SRC  = os.path.dirname(ROOT)  # YeeHaw.io project root (holds the source sheets)

SHEETS = {
    "s1": "Icons - from ChatGPT.png",      # 4x4, largest individual pieces
    "s2": "Icons 2 - from ChatGPT.png",
    "s3": "Icons 3 - from ChatGPT.png",
}
_cache = {}
def sheet(key):
    if key not in _cache:
        _cache[key] = np.asarray(Image.open(os.path.join(SRC, SHEETS[key])).convert("RGB"))
    return _cache[key]

# ---- mask helpers -----------------------------------------------------------
def dilate(m, r):
    p = np.pad(m, r); out = np.zeros_like(m); h, w = m.shape
    for dy in range(-r, r+1):
        for dx in range(-r, r+1):
            out |= p[r+dy:r+dy+h, r+dx:r+dx+w]
    return out
def erode(m, r):
    return ~dilate(~m, r) if r else m

def _largest(fg):
    h, w = fg.shape; lab = np.zeros((h, w), np.int32); cur = best = bid = 0
    for sy in range(h):
        for sx in range(w):
            if fg[sy, sx] and lab[sy, sx] == 0:
                cur += 1; cnt = 0; st = [(sy, sx)]; lab[sy, sx] = cur
                while st:
                    y, x = st.pop(); cnt += 1
                    for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        ny, nx = y+dy, x+dx
                        if 0<=ny<h and 0<=nx<w and fg[ny,nx] and lab[ny,nx]==0:
                            lab[ny,nx]=cur; st.append((ny,nx))
                if cnt > best: best = cnt; bid = cur
    return lab == bid

def _fill_holes(fg, cell=None):
    # fill enclosed holes, but skip ones that look like trapped background
    # (light + desaturated tan/cream wedges in concavities) so they stay transparent.
    h, w = fg.shape; holes = ~fg; hb = np.zeros((h,w), bool); st=[]
    for x in range(w):
        for y in (0, h-1):
            if holes[y,x] and not hb[y,x]: hb[y,x]=True; st.append((y,x))
    for y in range(h):
        for x in (0, w-1):
            if holes[y,x] and not hb[y,x]: hb[y,x]=True; st.append((y,x))
    while st:
        y,x = st.pop()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny,nx=y+dy,x+dx
            if 0<=ny<h and 0<=nx<w and holes[ny,nx] and not hb[ny,nx]: hb[ny,nx]=True; st.append((ny,nx))
    enclosed = holes & ~hb
    if cell is None:
        return fg | enclosed
    c = cell.astype(np.int16); S = c.max(2)-c.min(2); L = 0.299*c[:,:,0]+0.587*c[:,:,1]+0.114*c[:,:,2]
    lab = np.zeros((h,w), np.int32); cur = 0
    out = fg.copy()
    for sy in range(h):
        for sx in range(w):
            if enclosed[sy,sx] and lab[sy,sx]==0:
                cur += 1; comp=[(sy,sx)]; lab[sy,sx]=cur; pts=[(sy,sx)]
                while comp:
                    y,x = comp.pop()
                    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                        ny,nx=y+dy,x+dx
                        if 0<=ny<h and 0<=nx<w and enclosed[ny,nx] and lab[ny,nx]==0:
                            lab[ny,nx]=cur; comp.append((ny,nx)); pts.append((ny,nx))
                ys=[p[0] for p in pts]; xs=[p[1] for p in pts]
                mL = float(np.median(L[ys,xs])); mS = float(np.median(S[ys,xs]))
                if mL > 120 and mS < 45:    # trapped background wedge -> leave transparent
                    continue
                for (y,x) in pts: out[y,x]=True
    return out

def mask(cell, method="tol", tol=26, sat=70, black=False, grow=1, white=200):
    # white = min-channel threshold for the "white sticker border" wall. Raise it
    # (or set >255 to disable) when the background itself is light/cream, so the bg
    # isn't mistaken for border; rely on the black outline (black=True) to bound.
    c = cell.astype(np.int16); h, w, _ = c.shape
    S = c.max(2)-c.min(2); mn = c.min(2); L = 0.299*c[:,:,0]+0.587*c[:,:,1]+0.114*c[:,:,2]
    wall = (S>=sat) | (mn>=white)
    if black: wall |= (L<=45)
    bg = np.zeros((h,w), bool); st=[]
    # seed from ALL non-wall border pixels (robust when the icon fills the crop)
    for x in range(w):
        for y in (0, h-1):
            if not wall[y,x] and not bg[y,x]: bg[y,x]=True; st.append((y,x))
    for y in range(h):
        for x in (0, w-1):
            if not wall[y,x] and not bg[y,x]: bg[y,x]=True; st.append((y,x))
    if method == "tol":
        while st:
            y,x=st.pop(); cy=c[y,x]
            for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                ny,nx=y+dy,x+dx
                if 0<=ny<h and 0<=nx<w and not bg[ny,nx] and not wall[ny,nx]:
                    if int(abs(c[ny,nx,0]-cy[0])+abs(c[ny,nx,1]-cy[1])+abs(c[ny,nx,2]-cy[2]))<=tol:
                        bg[ny,nx]=True; st.append((ny,nx))
    else:  # "wall": flood all non-wall
        while st:
            y,x=st.pop()
            for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                ny,nx=y+dy,x+dx
                if 0<=ny<h and 0<=nx<w and not bg[ny,nx] and not wall[ny,nx]:
                    bg[ny,nx]=True; st.append((ny,nx))
    fg = _fill_holes(_largest(~bg), cell)
    return erode(fg, grow)

def grid_cell(arr, rows, cols, r, c, pad=48):
    # crop the cell PLUS outward padding into the gutters so stickers that spill
    # past their cell edge aren't clipped; largest-component drops any neighbor sliver.
    H, W, _ = arr.shape; cw, ch = W//cols, H//rows
    x0 = max(0, c*cw - pad); y0 = max(0, r*ch - pad)
    x1 = min(W, (c+1)*cw + pad); y1 = min(H, (r+1)*ch + pad)
    return arr[y0:y1, x0:x1]

# ---- manifest ---------------------------------------------------------------
# locked=True  -> file is final, never regenerated
# Each: (sheet, rows, cols, r, c, kwargs)
MANIFEST = {
 # ----- LOCKED (approved) -----
 "cassette":          dict(locked=True , src="s1", g=(4,4,0,0), box=(6,12,376,300), method="tol", grow=1),
 "blob":              dict(locked=True,  src="s1", g=(4,4,3,0), method="tol",  grow=1),
 "gameboy":           dict(locked=True,  src="s1", g=(4,4,3,1), method="tol",  grow=1),
 "floppy":            dict(locked=True,  src="s1", g=(4,4,2,1), method="tol",  grow=1),
 "stamps/stamp-bonus-track": dict(locked=True, src="s1", g=(4,4,1,2), method="tol", grow=1),
 "stamps/stamp-power-up":    dict(locked=True, src="s1", g=(4,4,2,2), method="tol", grow=1),
 "stamps/stamp-weird-find":  dict(locked=True, src="s1", g=(4,4,2,3), method="tol", grow=1),
 "stamps/stamp-rewind":      dict(locked=True, src="s1", g=(4,4,3,3), method="tol", grow=1),
 "stamps/stamp-field-note":  dict(locked=True, src="s1", g=(4,4,3,2), method="tol", grow=1),
 # ----- REDO (bleeding / cut-off) -> stronger edge erode -----
 "controller":        dict(locked=True , src="s1", g=(4,4,1,0), method="tol",  grow=3),
 "vhs-tape":          dict(locked=True , src="s1", g=(4,4,0,1), method="wall", black=True, grow=3),
 "joystick":          dict(locked=True , src="s1", g=(4,4,2,0), method="wall", black=True, grow=3),
 "lightning":         dict(locked=True , src="s1", g=(4,4,1,1), method="tol",  grow=3),
 "stamps/stamp-yeehaw":     dict(locked=True , src="s1", g=(4,4,0,2), method="tol", grow=3),
 "stamps/stamp-new":        dict(locked=True , src="s1", g=(4,4,0,3), method="tol", grow=3),
 "stamps/stamp-good-stuff": dict(locked=True , src="s1", g=(4,4,1,3), method="tol", grow=3),
 # ----- from sheet 2 (cleaner art, correct lettering; warm tan bg -> sat=100, black outline) -----
 "crt-tv":            dict(locked=True , src="s2", box=(525,42,705,214),    method="tol", sat=100, black=True, grow=2, white=999),
 "arcade":            dict(locked=True , src="s2", box=(752,42,930,218),    method="tol", sat=100, black=True, grow=2, white=999),
 "boombox":           dict(locked=True , src="s2", box=(466,266,702,422),   method="tol", sat=100, black=True, grow=2, white=999),
 "watch":             dict(locked=True , src="s2", box=(748,266,876,428),   method="tol", sat=100, black=True, grow=2, white=999),
 "star":              dict(locked=True , src="s2", box=(1280,266,1440,438), method="tol", sat=100, black=True, grow=2, white=999),
 "stamps/stamp-now-playing":  dict(locked=True , src="s2", box=(1173,461,1402,582), method="tol", sat=100, black=True, grow=2, white=999),
 "stamps/stamp-secret-area":  dict(locked=True , src="s2", box=(594,663,752,780),  method="tol", sat=100, black=True, grow=2, white=999),
 "logos/logo-primary":        dict(locked=True , src="s2", box=(24,808,612,975),   method="tol", sat=100, black=True, grow=2, white=999),
 "logos/logo-club":           dict(locked=True , src="s2", box=(606,800,852,988),  method="tol", sat=100, black=True, grow=2, white=999),
 "logos/logo-mixtape":        dict(locked=True , src="s2", box=(803,816,1497,970), method="tol", sat=100, black=True, grow=2, white=999),
}

def extract_one(name, cfg):
    arr = sheet(cfg["src"])
    if "box" in cfg:                      # explicit absolute crop (x0,y0,x1,y1)
        x0, y0, x1, y1 = cfg["box"]
        p = cfg.get("pad", 22)            # pad outward so there is a clean bg border to flood from
        H, W, _ = arr.shape
        cell = arr[max(0,y0-p):min(H,y1+p), max(0,x0-p):min(W,x1+p)]
    else:
        rows, cols, r, c = cfg["g"]
        cell = grid_cell(arr, rows, cols, r, c)
    kw = {k: cfg[k] for k in ("method","tol","sat","black","grow","white") if k in cfg}
    fg = mask(cell, **kw)
    ys, xs = np.where(fg)
    y1,y2,x1,x2 = ys.min(), ys.max()+1, xs.min(), xs.max()+1
    rgb = cell[y1:y2, x1:x2]; alpha = (fg[y1:y2, x1:x2]*255).astype(np.uint8)
    img = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8))
    path = os.path.join(OUT, name + ".png")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    return img.size

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if "--sheet" in sys.argv:
        names = list(MANIFEST)
    elif args:
        names = args
    else:
        names = [n for n, c in MANIFEST.items() if not c["locked"]]
    for n in names:
        if n not in MANIFEST:
            print("?? unknown", n); continue
        sz = extract_one(n, MANIFEST[n])
        print(f"{'LOCK' if MANIFEST[n]['locked'] else 'redo'} {n:30s} {sz[0]}x{sz[1]}")

if __name__ == "__main__":
    main()
