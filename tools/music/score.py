"""tools/music/score.py — the five beds of the dark ambient score (0.108).

All in D minor (the castle's key), all seamless loops:
  title   "The Crimson Keep"  96s  slow string chords over a D pedal, distant
                                   bells, choir rising in the second half
  combat  "Steel in the Dark" 60s  96 bpm: low spiccato ostinato, taiko, brass
                                   swells, tremolo dissonance building over 3 phrases
  boss    "The Vampire Lord"  60s  72 bpm: gothic organ, chanting choir, heavy
                                   drums, brass stabs, a tolling bell
  shrine  "Sanctum"           80s  choir and high strings, D major / borrowed
                                   chords, celesta and bell glints, no drums
  end     "Ashes"             72s  felt piano over low strings and a humming choir
"""
import numpy as np
import synth as S
from synth import midi  # noqa: F401  (handy when editing)
from mix import Track


def _flat_drone(m, n, fade, level):
    f0 = S.midi(m)
    t = S.times(n)
    breath = 0.8 + 0.2 * np.sin(2 * np.pi * 0.07 * t)
    x = 0.7 * np.sin(2 * np.pi * S.phase_of(f0, n, drift=0.0008)) + 0.3 * S.lowpass(S.read(S.saw_table(f0, 1500), S.phase_of(f0, n)), 400)
    return x * breath * S.adsr(n, fade, fade) * level


def wind_loop(length, fade=4.0, **kw):
    n = int((length + fade) * S.SR)
    return S.wind(length + fade, **kw) * S.adsr(n, fade, fade)


# ---------------------------------------------------------------- title
def title():
    S.seed(101)
    L = 96.0
    tr = Track(L)
    chords = [  # (bass, voicing) — 16s each
        (38, [50, 57, 62, 65, 69]),        # Dm
        (34, [46, 53, 57, 62, 65]),        # Bbmaj7
        (31, [43, 50, 58, 62, 69]),        # Gm9
        (39, [51, 55, 58, 63, 69]),        # Eb (#11)
        (41, [50, 57, 60, 65, 69]),        # Dm7/F
        (33, [45, 52, 57, 62, 64, 70]),    # A7sus4(b9) -> A
    ]
    tr.place(_flat_drone(26, int((L + 4) * S.SR), 4.0, 1.0), 0, gain=0.22, send=0.15)
    tr.place(wind_loop(L, lo=150, hi=700), 0, gain=0.035, send=0.5)
    for i, (bass, voicing) in enumerate(chords):
        t0 = i * 16.0
        tr.place(S.strings(bass, 19, attack=3.5, release=4.5, bright=0.2), t0 - 1.5, gain=0.32, send=0.35)
        tr.place(S.strings(bass + 12, 19, attack=3.5, release=4.5, bright=0.25), t0 - 1.5, pan=-0.2, gain=0.18, send=0.4)
        for j, m in enumerate(voicing):
            if i == 5 and m == 62:  # the sus4 resolves to the major third halfway
                tr.place(S.strings(62, 10, attack=3, release=3, bright=0.3), t0 - 1.5, pan=0.1, gain=0.13, send=0.45)
                tr.place(S.strings(61, 11, attack=3, release=4.5, bright=0.3), t0 + 7, pan=0.1, gain=0.13, send=0.45)
                continue
            tr.place(S.strings(m, 19, attack=3.5, release=4.5, bright=0.3), t0 - 1.5,
                     pan=(j / len(voicing) - 0.5) * 0.9, gain=0.13, send=0.45)
        if i >= 2:  # the choir rises in the second half
            for j, m in enumerate(voicing[-3:]):
                tr.place(S.choir(m, 18, 'oo', 'ah' if i >= 4 else 'oo', attack=4, release=5), t0 - 1,
                         pan=(j - 1) * 0.5, gain=0.07 + 0.015 * i, send=0.6)
        tr.place(S.boom(), t0, gain=0.55, send=0.45)
    t = 3.0
    while t < L:
        tr.place(S.bell(int(S.rng.choice([69, 72, 74, 77, 81])), 8), t, pan=S.rng.uniform(-0.7, 0.7), gain=0.09, send=0.75)
        t += S.rng.uniform(5.5, 9.5)
    return tr.render(rt60=5.0, wet_gain=1.1, target_db=-19.0)


# ---------------------------------------------------------------- combat
OSTINATO = [0, 0, 3, 0, 1, 0, -2, 0]  # D D F D Eb D C D: phrygian unease


def combat():
    S.seed(202)
    tr = Track(60.0, tempo=96)
    beat = tr.beat
    roots = [38, 38, 34, 33, 38, 31, 39, 33, 38, 34, 36, 33]  # one per 2 bars
    triad = lambda r: [r + 12, r + 15, r + 19]  # minor triad an octave up
    for bar in range(24):
        root = roots[bar // 2]
        phrase = bar // 8
        # low strings spiccato ostinato, doubled at the octave below
        for k, step in enumerate(OSTINATO):
            when = tr.at(bar, k * 0.5)
            accent = 1.0 if k % 2 == 0 else 0.7
            tr.place(S.pluck(root + step, 0.32), when, pan=-0.25, gain=0.30 * accent, send=0.2)
            tr.place(S.pluck(root + step - 12, 0.4, bright=0.6), when, pan=0.15, gain=0.22 * accent, send=0.15)
        # drums
        tr.place(S.taiko(1.0), tr.at(bar, 0), gain=0.75, send=0.3)
        tr.place(S.taiko(0.7), tr.at(bar, 1.5), pan=0.3, gain=0.35, send=0.3)
        tr.place(S.taiko(1.0), tr.at(bar, 2), gain=0.55, send=0.3)
        tr.place(S.taiko(0.7), tr.at(bar, 3), pan=-0.3, gain=0.35, send=0.3)
        tr.place(S.frame_drum(), tr.at(bar, 1), pan=0.4, gain=0.12, send=0.35)
        tr.place(S.frame_drum(), tr.at(bar, 3), pan=0.4, gain=0.12, send=0.35)
        if phrase == 2:
            tr.place(S.taiko(0.6), tr.at(bar, 3.5), pan=0.35, gain=0.3, send=0.3)
        if bar % 8 == 7:  # fill into the next phrase
            for k in range(8):
                tr.place(S.taiko(0.65), tr.at(bar, 2 + k * 0.25), pan=(k % 2 - 0.5) * 0.6, gain=0.18 + 0.04 * k, send=0.3)
        if bar % 2 == 0:
            # a quiet string pad glues the harmony
            for j, m in enumerate(triad(root)):
                tr.place(S.strings(m, 5.6, attack=1.0, release=1.5, bright=0.25), tr.at(bar), pan=(j - 1) * 0.5, gain=0.07, send=0.4)
            if phrase >= 1:  # brass swells from the second phrase
                tr.place(S.brass(root, 4.6, attack=1.6, release=1.4), tr.at(bar), pan=-0.1, gain=0.20, send=0.4)
                tr.place(S.brass(root + 7, 4.6, attack=1.6, release=1.4), tr.at(bar), pan=0.15, gain=0.13, send=0.4)
            if phrase == 2:  # dissonant tremolo above
                tr.place(S.tremolo_strings(74, 5.2, bright=0.5), tr.at(bar), pan=-0.4, gain=0.05, send=0.5)
                tr.place(S.tremolo_strings(75, 5.2, bright=0.5), tr.at(bar), pan=0.4, gain=0.045, send=0.5)
        if bar % 8 == 0:
            tr.place(S.boom(4.0), tr.at(bar), gain=0.45, send=0.4)
    tr.place(S.riser(2.5), tr.at(23, 0) + 2.5 * beat - 2.5 + beat * 1.5, gain=0.25, send=0.5)
    return tr.render(rt60=3.2, wet_gain=0.9, target_db=-18.0)


# ---------------------------------------------------------------- boss
def boss():
    S.seed(303)
    tr = Track(60.0, tempo=72)
    harmony = [  # (bass, chord) per bar, 18 bars
        (38, [50, 53, 57]), (38, [50, 53, 57]), (39, [51, 55, 58]), (39, [51, 55, 58]),
        (38, [50, 53, 57]), (38, [50, 53, 57]), (37, [49, 52, 55, 58]), (37, [49, 52, 55, 58]),
        (34, [46, 50, 53]), (34, [46, 50, 53]), (31, [43, 46, 50]), (31, [43, 46, 50]),
        (39, [51, 55, 58]), (39, [51, 55, 58]), (33, [45, 49, 52, 58]), (33, [45, 49, 52, 58]),
        (38, [50, 53, 57]), (33, [45, 49, 52]),
    ]
    bar_s = 4 * tr.beat
    for bar, (bass, chord) in enumerate(harmony):
        t0 = tr.at(bar)
        new = bar == 0 or harmony[bar - 1] != harmony[bar]
        if new:
            span = 2 if bar + 1 < len(harmony) and harmony[bar + 1] == harmony[bar] else 1
            dur = span * bar_s + 0.6
            tr.place(S.organ(bass - 12, dur, attack=0.15, release=0.8), t0, gain=0.22, send=0.35)
            for j, m in enumerate(chord):
                tr.place(S.organ(m + 12, dur, attack=0.15, release=0.8), t0, pan=(j / len(chord) - 0.4) * 0.8, gain=0.09, send=0.45)
            if bar >= 4:  # the choir chants from bar 5
                for j, m in enumerate(chord):
                    tr.place(S.choir(m + 12, dur + 0.5, 'ah', 'oh', attack=0.9, release=1.2, voices=4), t0,
                             pan=(j / len(chord) - 0.4) * 1.0, gain=0.10, send=0.55)
            if bar % 4 == 0:
                tr.place(S.bell(bass + 12, 9, decay=0.7), t0, pan=-0.3, gain=0.22, send=0.6)
        # heavy drums
        for b, g, s in ((0, 0.85, 1.25), (1.5, 0.4, 0.8), (2, 0.6, 1.1), (3, 0.4, 0.8), (3.5, 0.3, 0.7)):
            tr.place(S.taiko(s), tr.at(bar, b), pan=(b - 2) * 0.12, gain=g, send=0.35)
        if bar >= 8:  # brass stabs on the downbeat
            tr.place(S.brass(bass, 1.3, attack=0.05, release=0.9, bright=0.9), t0, pan=-0.15, gain=0.22, send=0.35)
            tr.place(S.brass(bass + 12, 1.3, attack=0.05, release=0.9, bright=0.9), t0, pan=0.15, gain=0.16, send=0.35)
        if bar in (6, 7, 14, 15):
            tr.place(S.tremolo_strings(bass + 24, bar_s + 0.3, rate=12, bright=0.6), t0, pan=-0.4, gain=0.06, send=0.5)
            tr.place(S.tremolo_strings(bass + 25, bar_s + 0.3, rate=12, bright=0.6), t0, pan=0.4, gain=0.05, send=0.5)
        if bar % 8 == 0:
            tr.place(S.boom(5.0), t0, gain=0.6, send=0.45)
    return tr.render(rt60=4.0, wet_gain=1.0, target_db=-16.5)


# ---------------------------------------------------------------- shrine
def shrine():
    S.seed(404)
    L = 80.0
    tr = Track(L)
    chords = [  # 10s each
        (38, [50, 57, 61, 64, 66]),   # Dmaj9
        (35, [47, 54, 57, 61, 62]),   # Bm9
        (31, [43, 50, 54, 59, 61]),   # Gmaj7#11
        (33, [45, 52, 57, 62, 64]),   # Asus4
        (38, [50, 57, 61, 64, 66]),   # Dmaj9
        (34, [46, 53, 57, 62, 65]),   # Bbmaj7 (borrowed: the shrine remembers the castle)
        (31, [43, 50, 55, 58, 64]),   # Gm6
        (33, [45, 52, 57, 59, 64]),   # Asus2
    ]
    tr.place(wind_loop(L, lo=1800, hi=5500), 0, gain=0.012, send=0.7)
    for i, (bass, voicing) in enumerate(chords):
        t0 = i * 10.0
        tr.place(S.strings(bass, 12.5, attack=3, release=3.5, bright=0.15), t0 - 1, gain=0.16, send=0.5)
        for j, m in enumerate(voicing[1:]):
            tr.place(S.choir(m, 12.5, 'oo', 'ah' if i % 4 == 2 else 'oo', attack=3, release=4), t0 - 1,
                     pan=(j / 3 - 0.5) * 1.0, gain=0.10, send=0.65)
        for j, m in enumerate(voicing[-2:]):
            tr.place(S.strings(m + 12, 12.5, attack=3.5, release=4, bright=0.35), t0 - 1, pan=(j - 0.5) * 0.8, gain=0.05, send=0.7)
        # glints: celesta from the chord, more in the second pass
        t, end = t0 + S.rng.uniform(0.5, 1.5), t0 + 10
        while t < end:
            tr.place(S.celesta(int(S.rng.choice(voicing[2:])) + 24, 3), t, pan=S.rng.uniform(-0.7, 0.7), gain=0.05, send=0.8)
            t += S.rng.uniform(0.9, 1.6) if i >= 4 else S.rng.uniform(1.8, 3.2)
        if i % 4 == 0:
            tr.place(S.bell(voicing[0] + 24, 9, decay=0.6), t0, pan=0.3, gain=0.05, send=0.8)
    return tr.render(rt60=5.5, wet_gain=1.2, target_db=-19.0, width=0.8, tone='light')


# ---------------------------------------------------------------- end
def end():
    S.seed(505)
    L = 72.0
    tr = Track(L)
    chords = [(38, [50, 53, 57, 62, 65]), (34, [46, 50, 53, 58, 62]), (41, [48, 53, 57, 60, 65]),
              (36, [48, 52, 55, 60, 64]), (31, [43, 50, 55, 58, 62]), (33, [45, 52, 57, 61, 64])]
    melody = [69, 65, 65, 64, 62, 61]
    tr.place(wind_loop(L, lo=120, hi=500), 0, gain=0.02, send=0.5)
    for i, (bass, voicing) in enumerate(chords):
        t0 = i * 12.0
        tr.place(S.strings(bass, 14.5, attack=3, release=4, bright=0.15), t0 - 1, gain=0.22, send=0.35)
        tr.place(S.strings(bass + 12, 14.5, attack=3.5, release=4, bright=0.2), t0 - 1, pan=-0.2, gain=0.10, send=0.4)
        for j, m in enumerate(voicing[1:4]):
            tr.place(S.choir(m, 14, 'mm', 'oo', attack=4, release=4, voices=3, breath=0.02), t0 - 1, pan=(j - 1) * 0.6, gain=0.05, send=0.6)
        # piano: a slow broken chord, then the melody note
        for k, dt in enumerate([0.0, 1.6, 3.1, 4.8, 6.6]):
            m = voicing[k % len(voicing)] + (12 if k >= 3 else 0)
            tr.place(S.piano(m, 6.0, soft=0.7), t0 + dt + S.rng.uniform(-0.08, 0.08), pan=-0.15 + 0.08 * k, gain=0.22, send=0.5)
        tr.place(S.piano(melody[i] + 12, 7.0, soft=0.55), t0 + 8.4, pan=0.1, gain=0.26, send=0.55)
        if i in (0, 3):
            tr.place(S.bell(bass + 12, 10, decay=0.5), t0, pan=-0.35, gain=0.08, send=0.7)
    return tr.render(rt60=5.0, wet_gain=1.1, target_db=-19.5, tone='light')


TRACKS = {'title': title, 'combat': combat, 'boss': boss, 'shrine': shrine, 'end': end}
