# Video prompts — the generated clips (0.00307)

How each clip the game plays was made: the models, the prompts and the
cut. Every clip is a file under `assets/video/` named by the data
(`backgrounds.json intro.file` for the title's fly-in); a redo is a new
filename (rule 7). The video models run on Replicate through
`tools/replicate.mjs` (`REPLICATE_API_TOKEN` / `REPLICATE_KEY`;
`NODE_USE_ENV_PROXY=1` behind a proxy); ffmpeg shapes the take.

## The title's fly-in (`title_flyin_v1.mp4`, 0.00307 — the prototype)

The idea (the developer's): the title painting is the END of a short
flight — the camera arrives at the castle, the picture freezes, and the
held frame fades onto the 3D renderer's rest pose, which is the same
painting cover-fit. Two plans were weighed: A, pull back from the
painting and play the take in reverse (one input picture; the crows and
the smoke would move backwards); B, the one built — paint a far, wide
view first, then fly from it INTO the painting with the painting as the
take's last frame, so the motion plays forwards and still lands exactly
on the game's own art.

### 1. The wide opening (Nano Banana Pro, `google/nano-banana-pro`)

Image input: `assets/bg/medieval_castle.jpg`. 16:9, 2K, jpg. Two rolls
(~$0.15 each); the second was the pick (the moon behind the castle, the
castle a little higher, nearer the painting's framing).

> Zoom out far from this painting. Repaint the SAME scene from much
> further away: the same gothic castle on its crag, with the same towers,
> the same glowing orange windows and the same blood-red full moon above
> it, but now small in the distance, centred in the frame, seen from far
> across a dark valley of jagged rocks, dead forest and rolling mist. The
> castle's crag and the stone bridge are visible but small. Keep the exact
> colour palette: deep crimson sky, black ink silhouettes, warm orange
> windows. Crows fly far away. Wide shot, no characters, no text.
> Style, word for word: in the combined style of Darkest Dungeon 2 and
> Mike Mignola, heavy black ink silhouettes, bold flat angular shapes,
> rough hand-drawn ink texture and hatching, dramatic chiaroscuro
> lighting, video game background art, wide shot, no characters.

### 2. The flight (start frame = the wide view, last frame = the painting)

One take per model, the same prompt; the pictures went inline as data
URIs (Kling's request died that way — ~1.2 MB in one POST through the
proxy — and went through the Files API, `replicate.mjs upload`, instead).

> Slow, smooth cinematic camera flight forward toward the gothic castle
> on the crag under the blood-red moon, a steady dolly-in, gliding over
> the misty valley and dead trees, ending framed on the castle. The scene
> is a still ink painting: nothing in it moves except a little drifting
> mist and a few distant crows; the castle, the moon, the rocks and the
> flags stay exactly as painted. Dark fantasy ink illustration style,
> heavy black silhouettes, flat angular shapes, no new objects, no people,
> no text, no flicker.

Negative (where the model takes one): people, characters, text,
watermark, blur, morphing, warping buildings, flicker, style change,
photorealism, daylight.

| Model | Input | Take | Last frame vs the painting (SSIM, 1920x1080) | Read |
|---|---|---|---|---|
| **Kling 2.5 Turbo Pro** `kwaivgi/kling-v2.5-turbo-pro` | `start_image`, `end_image`, 5 s | 1928x1072, 24 fps, 130 s | **0.726** | the smoothest flight, lands on the painting, the crows fly forwards — **the pick** |
| Hailuo 02 `minimax/hailuo-02` | `first_frame_image`, `last_frame_image`, 6 s, 1080p, optimizer off | 1936x1080, 200 s | 0.729 | lands exactly, but mid-flight the mist turns a washed-out beige and the frame brightens |
| Seedance 1 Pro `bytedance/seedance-1-pro` | `image`, `last_frame_image`, 5 s, 1080p, 24 fps | 1920x1088, 66 s | 0.636 | the most cinematic (big crows sweep past the camera); ends a touch zoomed and shifted |
| Veo 3.1 `google/veo-3.1` | `image`, `last_frame`, 4 s, 1080p, no audio | 1920x1080, 98 s | 0.480 | lands clearly off (zoomed in, a green line at the bottom) |

SSIM: `ffmpeg -i last.png -i painting.png -lavfi "[0][1]ssim" -f null -`
on the take's last frame and the painting both scaled to 1920x1080.

### 3. The cut

The models make 4-6 s; the intro wants about three. The take is
time-remapped with an ease-out — fast across the valley, slowing into the
castle — so the arrival reads as arriving, not stopping: frame n of N
lands at `T · (n/N)^p` with `p = N / (24 · T)`, which leaves the last
stretch at the take's own frame rate (no interpolation where the detail
is), then cover-fit to 1920x1080 and encoded H.264 (yuv420p, crf 20,
faststart, no audio; 2.0 MB for 3.2 s):

```
N=122; T=3.2; P=1.589
ffmpeg -i fly_kling.mp4 -an \
  -vf "setpts='($T*pow(N/$N,$P))/TB',fps=24,scale=-2:1080,crop=1920:1080,format=yuv420p" \
  -c:v libx264 -crf 20 -pix_fmt yuv420p eased.mp4
```

Then the painting itself is baked in as the ending: 0.6 s of the painting
(scaled 1920x1080) crossfaded over the eased take's last 0.4 s, so the
held frame IS the painting (SSIM 0.93 against it, the encode's loss)
and the fade onto the 3D renderer's rest pose has only the haze and the
vignette to cover (headless, software GL: 0.58 before the bake, 0.63
after; the differences left are the renderer's). 3.4 s, 2.4 MB:

```
ffmpeg -loop 1 -framerate 24 -t 0.6 -i assets/bg/medieval_castle.jpg -vf "scale=1920:1080,format=yuv420p" -c:v libx264 -crf 18 still.mp4
ffmpeg -i eased.mp4 -i still.mp4 -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.4:offset=2.8,format=yuv420p[v]" -map "[v]" -an \
  -c:v libx264 -preset slow -crf 20 -movflags +faststart -pix_fmt yuv420p assets/video/title_flyin_v1.mp4
```

**0.00310 (`title_flyin_v2.mp4`, undone in 0.00315):** the game's vignette baked over the
whole film — the CSS `#vignette` ellipse (centre to the farthest corner,
0 at 30%, 0.55 at 75%, 0.9 at 100%; the shader draws the same under the
live canvas) as a mask ffmpeg's `geq` makes and overlays, so the film's
corners are as dark as the painting's — and the renderer put back to its
rest pose as the fade begins (`bg3d.js bgArrive`: orbit's t = 0 is the
flat painting; the sway had reached its full 2.5° by then, a parallax
jump the fade used to carry) with the mist and haze rising again after
the hand-over. Headless, the held frame against the renderer 0.63 → 0.78
(what is left is the mist that has risen by the time of the screenshot).

```
ffmpeg -f lavfi -i "color=black:s=1920x1080:d=1,format=rgba" -vf "geq=r=0:g=0:b=0:a='st(0, sqrt(pow((X-W/2)/(W/2*sqrt(2)),2)+pow((Y-H/2)/(H/2*sqrt(2)),2))); 255*if(lt(ld(0),0.3),0,if(lt(ld(0),0.75),0.55*(ld(0)-0.3)/0.45,0.55+0.35*(ld(0)-0.75)/0.25))'" -frames:v 1 vignette.png
ffmpeg -i title_flyin_v1.mp4 -i vignette.png -filter_complex "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]" -map "[v]" -an \
  -c:v libx264 -preset slow -crf 20 -movflags +faststart -pix_fmt yuv420p assets/video/title_flyin_v2.mp4
```

**0.00315 (`title_flyin_v3.mp4` = the 0.00307 cut byte for byte, under a new
name; `title_flyin_720_v1.mp4` its 1280x720 encode for phones, crf 22,
0.8 MB):** the baked vignette went — it was the 16:9 frame's ellipse, and
a phone or an ultrawide crops the film, so the corners no longer matched
the screen's; the intro layer draws the game's own CSS ellipse over the
film instead (`#intro::after`), the same on every aspect ratio. The
check is `node tools/intro-check.mjs` (the held last frame under that
vignette against the renderer at rest: 0.95 desktop, 0.92 phone).

```
ffmpeg -i title_flyin_v3.mp4 -an -vf scale=1280:720 -c:v libx264 -preset slow -crf 22 -movflags +faststart -pix_fmt yuv420p assets/video/title_flyin_720_v1.mp4
```

### Open

A take with the painting's crows and smoke (the models add their own), a
second roll on Kling and Seedance, and the tool
(`tools/gen-video.mjs`, with candidates and verdicts like the others')
once the direction sticks. The scratch scripts of this round are not in
the repo; this file is the recipe.
