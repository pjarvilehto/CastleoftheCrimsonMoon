#!/usr/bin/env python3
"""tools/gen-depth.py — depth maps for the 3D backgrounds (0.083).

Runs Depth Anything V2 **Small** (Apache-2.0; the larger V2 models are
CC-BY-NC, i.e. non-commercial) as ONNX on every background in
assets/data/backgrounds.json and writes an 8-bit grayscale depth map per
image to assets/bg/depth/<name>.png (white = near, black = far).

Setup (once):
  pip install onnxruntime numpy pillow scipy
  curl -L -o /tmp/da2_vits.onnx \
    https://github.com/fabio-sim/Depth-Anything-ONNX/releases/download/v2.0.0/depth_anything_v2_vits_dynamic.onnx

Usage:
  python3 tools/gen-depth.py /tmp/da2_vits.onnx            # all backgrounds
  python3 tools/gen-depth.py /tmp/da2_vits.onnx new.jpg    # just one

Options (0.090), for art with small objects standing on surfaces:
  --ground      move small upright objects (candlesticks, jugs...) forward
                to the depth of the surface they stand on — depth models
                tend to give thin objects the depth of the wall behind
  --width N     output width (default 512; 1024 keeps thin objects)
  --suffix S    output name suffix, e.g. _v2 (a changed map needs a NEW
                filename — then map it in backgrounds.json parallax.depthFiles)
  e.g. python3 tools/gen-depth.py model.onnx castle_great_hall.jpg --ground --width 1024 --suffix _v2

New background art = new depth file (the renderer finds it by name). Per
the asset rule, never overwrite a shipped depth map in place: if one is
regenerated with different settings, give the art a new filename.
"""

import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
BG = ROOT / "assets" / "bg"
OUT = BG / "depth"

# Model input: shorter side 518 (DA-V2's training size), both sides a
# multiple of 14 (ViT patch size). 2048x1152 -> 924x518.
SHORT_SIDE = 518
# Stored map size. The renderer samples depth once per mesh vertex (a
# ~160x90 grid), so 512 wide is ample and keeps each file ~20-40KB.
OUT_W = 512
# Edge treatment, in output pixels (512 wide):
#   DILATE grows near objects outward so a silhouette's edge pixels move
#   WITH the object — the unavoidable stretch lands in the background
#   behind it instead of tearing the foreground edge.
#   BLUR smooths the steps so the mesh bends instead of shearing.
DILATE = 7
BLUR_SIGMA = 2.5
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def to_multiple(x, m=14):
    return int(np.ceil(x / m) * m)


def infer(sess, img):
    w, h = img.size
    scale = SHORT_SIDE / min(w, h)
    iw, ih = to_multiple(w * scale), to_multiple(h * scale)
    x = np.asarray(img.convert("RGB").resize((iw, ih), Image.BICUBIC), dtype=np.float32) / 255.0
    x = ((x - MEAN) / STD).transpose(2, 0, 1)[None]
    # Test-time flip: average with the mirrored prediction — steadier depth
    # on painted art, where single passes can wobble.
    d = sess.run(None, {"image": x})[0][0]
    df = sess.run(None, {"image": x[..., ::-1].copy()})[0][0][..., ::-1]
    return (d + df) / 2  # relative disparity: larger = nearer


def ground(d, k=31, t=0.035, below=4):
    """Small upright objects -> the depth of the surface under their base.

    Finds things narrower than k px that stick out of their surroundings
    (white top-hat), keeps the small, upright ones (not wide bench or table
    edges), and lifts each to the depth found just below its bottom edge.
    """
    h_img, w_img = d.shape
    tophat = d - ndimage.grey_opening(d, size=(k, k))
    mask = ndimage.binary_opening(tophat > t, iterations=1)
    lab, _ = ndimage.label(mask)
    out = d.copy()
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        comp = lab[sl] == i
        ys, xs = np.nonzero(comp)
        h, w = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
        if len(ys) < 12 or h < 0.7 * w or len(ys) > 0.01 * h_img * w_img:
            continue  # small upright objects only
        bottom = {}
        for y, x in zip(ys + sl[0].start, xs + sl[1].start):
            bottom[x] = max(bottom.get(x, -1), y)
        contact = [d[min(h_img - 1, y + below), x] for x, y in bottom.items() if not mask[min(h_img - 1, y + below), x]]
        if contact:
            region = out[sl]
            region[comp] = np.maximum(region[comp], np.percentile(contact, 75))
    return out


def postprocess(disp, out_size, grounded=False):
    lo, hi = np.percentile(disp, [1, 99])
    d = np.clip((disp - lo) / max(hi - lo, 1e-6), 0, 1)
    d = np.asarray(Image.fromarray((d * 65535).astype(np.uint16)).resize(out_size, Image.BICUBIC), dtype=np.float32) / 65535
    if grounded:
        d = ground(d)
    r = DILATE // 2 if not grounded else 2  # lighter edge treatment keeps thin objects
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    disk = (xx * xx + yy * yy) <= r * r  # round footprint: square ones leave blocky silhouettes
    d = ndimage.grey_dilation(d, footprint=disk)
    d = ndimage.gaussian_filter(d, BLUR_SIGMA if not grounded else 1.5)
    return np.clip(d, 0, 1)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    args = sys.argv[2:]
    opt = lambda flag, default: args[args.index(flag) + 1] if flag in args else default
    grounded = "--ground" in args
    out_w = int(opt("--width", OUT_W))
    suffix = opt("--suffix", "")
    for flag in ("--width", "--suffix"):
        if flag in args:
            del args[args.index(flag):args.index(flag) + 2]
    args = [a for a in args if a != "--ground"]
    sess = ort.InferenceSession(sys.argv[1], providers=["CPUExecutionProvider"])
    cfg = json.loads((ROOT / "assets" / "data" / "backgrounds.json").read_text())
    names = args or sorted({cfg["title"], cfg["hub"], cfg["death"], cfg["shrine"], *cfg["rooms"], *cfg["bosses"], *cfg["treasure"]})
    OUT.mkdir(parents=True, exist_ok=True)
    for name in names:
        img = Image.open(BG / name)
        w, h = img.size
        out_size = (out_w, round(out_w * h / w))
        d = postprocess(infer(sess, img), out_size, grounded)
        dest = OUT / (Path(name).stem + suffix + ".png")
        Image.fromarray((d * 255 + 0.5).astype(np.uint8), "L").save(dest, optimize=True)
        print(f"{name} -> {dest.relative_to(ROOT)} {out_size[0]}x{out_size[1]} {dest.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
