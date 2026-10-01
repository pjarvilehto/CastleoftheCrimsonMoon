#!/usr/bin/env python3
"""tools/gen-music.py — render the procedural dark ambient score (0.114).

    pip install numpy scipy lameenc
    python3 tools/gen-music.py                 # all five beds
    python3 tools/gen-music.py title boss      # just these
    python3 tools/gen-music.py --suffix v3     # new filenames (never replace
                                               # a shipped file in place)

Writes assets/audio/music-<name>-<suffix>.mp3 (128 kbps, 44.1 kHz) and
prints level / loop statistics. Each file is the loop plus its own first
TAIL_S seconds again: the game restarts the loop exactly one loop-length
in and crossfades over identical audio (src/audio/musicLoop.js), so the
beat never shifts and any MP3 decoder delay is hidden. Its length goes in
assets/data/audio.json music.scores.dark.tracks (loopS, tailS; gainDb
matches the classic beds' loudness as played). The instruments are tools/music/synth.py,
the hall / loop / master tools/music/mix.py, the pieces tools/music/score.py.
Each render is deterministic (seeded): same code, same file.
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'music'))
from score import TRACKS  # noqa: E402
from mix import save_mp3, stats  # noqa: E402
import numpy as np  # noqa: E402

TAIL_S = 2.0

args = [a for a in sys.argv[1:] if not a.startswith('--')]
suffix = 'v2'
if '--suffix' in sys.argv:
    suffix = sys.argv[sys.argv.index('--suffix') + 1]
    args = [a for a in args if a != suffix]
out_dir = Path(__file__).parent.parent / 'assets' / 'audio'
for name in args or TRACKS:
    t0 = time.time()
    x = TRACKS[name]()
    path = out_dir / f'music-{name}-{suffix}.mp3'
    size = save_mp3(np.concatenate([x, x[:, : int(TAIL_S * 44100)]], axis=1), path)
    print(f'{name:7} {x.shape[1] / 44100:5.1f}s  {size / 1024:6.0f} KB  {time.time() - t0:5.1f}s  {stats(x)}')
