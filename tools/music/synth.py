"""tools/music/synth.py — the instruments of the procedural score (0.108).

Everything is numpy: wavetable oscillators (a band-limited single cycle
built from harmonics, read at the note's phase; two tables blended for
brightness), additive partials for bells, filtered noise for drums and
air. Every function returns a mono float array at SR (or a stereo pair
for ensembles) that mix.Track places in time and space.
"""
import numpy as np
from scipy.signal import butter, sosfilt

SR = 44100
TABLE = 2048
rng = np.random.default_rng(7)


def seed(n):
    global rng
    rng = np.random.default_rng(n)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def times(n):
    return np.arange(n) / SR


def env(points, n):
    """Piecewise-linear envelope from [(seconds, level), ...]."""
    ts, ls = zip(*points)
    return np.interp(times(n), ts, ls)


def adsr(n, a, r, peak=1.0, sustain=1.0):
    dur = n / SR
    a = min(a, dur * 0.5)
    r = min(r, dur - a)
    return env([(0, 0), (a, peak), (max(a, dur - r), peak * sustain), (dur, 0)], n)


def lowpass(x, hz, order=2):
    return sosfilt(butter(order, min(hz, SR * 0.45), 'low', fs=SR, output='sos'), x)


def highpass(x, hz, order=2):
    return sosfilt(butter(order, hz, 'high', fs=SR, output='sos'), x)


def bandpass(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, min(hi, SR * 0.45)], 'band', fs=SR, output='sos'), x)


# ---- wavetables ---------------------------------------------------------

def table(amps, phases=None):
    """One cycle from harmonic amplitudes amps[k-1] (k = 1..)."""
    x = np.arange(TABLE + 1) / TABLE
    out = np.zeros(TABLE + 1)
    for k, a in enumerate(amps, start=1):
        if a:
            ph = phases[k - 1] if phases is not None else 0.0
            out += a * np.sin(2 * np.pi * k * x + ph)
    peak = np.max(np.abs(out)) or 1.0
    return out / peak


def harmonics_for(f0, top_hz):
    return max(1, int(min(top_hz, SR * 0.42) // f0))


def saw_table(f0, top_hz, tilt=1.0):
    k = np.arange(1, harmonics_for(f0, top_hz) + 1)
    return table(1.0 / k ** tilt, rng.uniform(0, 2 * np.pi, len(k)))


def phase_of(f0, n, vib_rate=0.0, vib_depth=0.0, drift=0.0):
    """Cumulative phase (in cycles) with vibrato and slow random drift."""
    t = times(n)
    f = np.full(n, f0)
    if vib_depth:
        f = f * (1 + vib_depth * np.sin(2 * np.pi * vib_rate * t + rng.uniform(0, 6.28)))
    if drift:
        wander = np.interp(t, np.linspace(0, t[-1] + 1e-9, 6), rng.normal(0, 1, 6))
        f = f * (1 + drift * wander)
    return np.cumsum(f) / SR + rng.uniform(0, 1)


def read(tab, phase):
    return np.interp((phase % 1.0) * TABLE, np.arange(TABLE + 1), tab)


def wt_voice(f0, n, dark, bright, bright_env, **ph):
    p = phase_of(f0, n, **ph)
    a, b = read(dark, p), read(bright, p)
    return a + (b - a) * bright_env


# ---- sustained instruments ----------------------------------------------

def strings(m, dur, attack=2.0, release=3.0, voices=3, bright=0.35, swell=None, top=6000):
    """String-section note: detuned saw ensemble, slow bow, vibrato.
    Returns (left, right)."""
    n = int(dur * SR)
    f0 = midi(m)
    dark, brt = saw_table(f0, min(top, 1800), 1.4), saw_table(f0, top, 1.0)
    e = adsr(n, attack, release)
    benv = np.clip(bright * (0.6 + 0.4 * (swell if swell is not None else e)), 0, 1)
    L, R = np.zeros(n), np.zeros(n)
    for v in range(voices):
        cents = rng.uniform(-9, 9)
        x = wt_voice(f0 * 2 ** (cents / 1200), n, dark, brt, benv, vib_rate=rng.uniform(4.6, 5.6), vib_depth=0.0018, drift=0.0012)
        off = int(rng.uniform(0, 0.08) * SR)
        x = np.concatenate([np.zeros(off), x[: n - off]])
        pan = (v / max(1, voices - 1) - 0.5) * 0.8
        L += x * np.cos((pan + 1) * np.pi / 4)
        R += x * np.sin((pan + 1) * np.pi / 4)
    return L * e / voices, R * e / voices


VOWELS = {  # formants (Hz, bandwidth, gain)
    'oo': [(320, 80, 1.0), (800, 100, 0.35), (2400, 160, 0.06)],
    'oh': [(450, 80, 1.0), (850, 100, 0.5), (2500, 160, 0.08)],
    'ah': [(720, 90, 1.0), (1200, 110, 0.6), (2600, 160, 0.15)],
    'mm': [(250, 60, 1.0), (1000, 200, 0.06), (2300, 200, 0.02)],
}


def vowel_table(f0, vowel):
    k = np.arange(1, harmonics_for(f0, 5000) + 1)
    fk = k * f0
    amps = np.zeros(len(k))
    for f, bw, g in VOWELS[vowel]:
        amps += g * np.exp(-0.5 * ((fk - f) / bw) ** 2)
    amps += 0.02 / k  # a little glottal floor
    return table(amps, rng.uniform(0, 2 * np.pi, len(k)))


def choir(m, dur, vowel='oo', vowel2=None, attack=2.5, release=3.0, voices=4, breath=0.04):
    """Choir note: formant-shaped ensemble with slow vibrato, a touch of
    breath noise. vowel2: morph target over the note. Returns (L, R)."""
    n = int(dur * SR)
    f0 = midi(m)
    t1, t2 = vowel_table(f0, vowel), vowel_table(f0, vowel2 or vowel)
    morph = np.clip(times(n) / max(dur, 1e-3), 0, 1)
    e = adsr(n, attack, release)
    L, R = np.zeros(n), np.zeros(n)
    for v in range(voices):
        cents = rng.uniform(-12, 12)
        x = wt_voice(f0 * 2 ** (cents / 1200), n, t1, t2, morph, vib_rate=rng.uniform(4.2, 5.2), vib_depth=0.003, drift=0.002)
        pan = (v / max(1, voices - 1) - 0.5) * 0.9
        L += x * np.cos((pan + 1) * np.pi / 4)
        R += x * np.sin((pan + 1) * np.pi / 4)
    if breath:
        lo, hi = VOWELS[vowel][0][0] * 0.7, VOWELS[vowel][1][0] * 1.4
        noise = bandpass(rng.normal(0, 1, n), lo, hi) * breath
        L, R = L + noise, R + noise
    return L * e / voices, R * e / voices


def organ(m, dur, stops=(0.5, 1.0, 0.0, 0.45, 0.25, 0.0, 0.18, 0.12), attack=0.08, release=0.6):
    """Pipe organ: harmonic drawbars (16', 8', 5 1/3', 4', 2 2/3', ...),
    a slow chorus between two ranks. Returns (L, R)."""
    n = int(dur * SR)
    f0 = midi(m)
    ratios = [0.5, 1, 1.5, 2, 3, 4, 5, 6]
    amps = np.zeros(13)
    for r, a in zip(ratios, stops):
        if r >= 1 and r * f0 < SR * 0.4:
            amps[int(round(r)) - 1] += a
    sub = 0.5 * f0
    t = table(amps)
    e = adsr(n, attack, release)
    left = read(t, phase_of(f0 * 2 ** (-2 / 1200), n)) + stops[0] * np.sin(2 * np.pi * phase_of(sub, n))
    right = read(t, phase_of(f0 * 2 ** (2 / 1200), n)) + stops[0] * np.sin(2 * np.pi * phase_of(sub, n))
    return left * e * 0.5, right * e * 0.5


def brass(m, dur, attack=1.2, release=1.5, bright=0.7):
    """Low brass swell: brightness follows loudness, like a horn section."""
    n = int(dur * SR)
    f0 = midi(m)
    dark, brt = saw_table(f0, 900, 1.6), saw_table(f0, 5000, 0.9)
    e = adsr(n, attack, release)
    L = wt_voice(f0 * 2 ** (-4 / 1200), n, dark, brt, np.clip(e * bright, 0, 1), vib_rate=5, vib_depth=0.0008)
    R = wt_voice(f0 * 2 ** (4 / 1200), n, dark, brt, np.clip(e * bright, 0, 1), vib_rate=5.3, vib_depth=0.0008)
    return L * e, R * e


def drone(m, dur, level=1.0):
    """A dark sustained bass: sine + a soft saw, slowly breathing."""
    n = int(dur * SR)
    f0 = midi(m)
    t = times(n)
    breath = 0.8 + 0.2 * np.sin(2 * np.pi * 0.07 * t + rng.uniform(0, 6))
    x = 0.7 * np.sin(2 * np.pi * phase_of(f0, n, drift=0.0008)) + 0.3 * lowpass(read(saw_table(f0, 1500), phase_of(f0, n)), 400)
    return x * breath * adsr(n, 3.0, 3.0) * level


def tremolo_strings(m, dur, rate=11.0, **kw):
    L, R = strings(m, dur, attack=kw.pop('attack', 1.0), **kw)
    am = 0.55 + 0.45 * np.sin(2 * np.pi * rate * times(len(L)))
    return L * am, R * am


# ---- struck / plucked -----------------------------------------------------

def pluck(m, dur=0.35, bright=0.8):
    """Short low-string spiccato / pizz: bright attack, quick decay."""
    n = int(dur * SR)
    f0 = midi(m)
    dark, brt = saw_table(f0, 1200, 1.5), saw_table(f0, 5000, 1.0)
    t = times(n)
    e = np.minimum(1, t / 0.006) * np.exp(-t / (dur * 0.35))
    return wt_voice(f0, n, dark, brt, np.clip(bright * np.exp(-t / 0.08), 0, 1)) * e


BELL = [(0.5, 0.35, 0.35), (1.0, 1.0, 0.6), (1.19, 0.5, 0.9), (1.5, 0.35, 1.2), (2.0, 0.45, 1.6),
        (2.52, 0.25, 2.4), (3.0, 0.2, 3.0), (4.2, 0.12, 4.5), (5.4, 0.08, 6.0)]


def bell(m, dur=6.0, partials=BELL, decay=1.0):
    """Tubular / church bell: inharmonic partials, highs fade first."""
    n = int(dur * SR)
    f0, t = midi(m), times(n)
    x = np.zeros(n)
    for r, a, d in partials:
        if r * f0 < SR * 0.4:
            x += a * np.sin(2 * np.pi * r * f0 * t + rng.uniform(0, 6.28)) * np.exp(-t * d * decay)
    return x * np.minimum(1, t / 0.002) / 2.5


def celesta(m, dur=3.0):
    parts = [(1, 1.0, 1.4), (2, 0.35, 2.5), (3, 0.12, 4.0), (4.07, 0.08, 6.0)]
    return bell(m, dur, parts) * 1.6


def piano(m, dur=5.0, soft=0.6):
    """Felt piano: slightly stretched harmonics, highs fade fast, a soft
    hammer thump. soft: 0 bright .. 1 muffled."""
    n = int(dur * SR)
    f0, t = midi(m), times(n)
    x = np.zeros(n)
    for k in range(1, 16):
        fk = f0 * k * (1 + 0.0004 * k * k)
        if fk > SR * 0.4:
            break
        a = (1 / k ** (1.2 + soft)) * np.exp(-t * (0.5 + 0.35 * k * (1 + soft)))
        x += a * np.sin(2 * np.pi * fk * t + rng.uniform(0, 6.28))
    thump = lowpass(rng.normal(0, 1, n), 600) * np.exp(-t / 0.02) * 0.15
    return (x + thump) * np.minimum(1, t / 0.004)


# ---- percussion and air ---------------------------------------------------

def taiko(size=1.0, dur=2.2):
    """Big drum: pitched skin dropping in pitch + a low noise thud."""
    n = int(dur * SR)
    t = times(n)
    f_end, f_start = 42 / size, 95 / size
    f = f_end + (f_start - f_end) * np.exp(-t / 0.045)
    skin = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.45 * size))
    over = 0.25 * np.sin(2 * np.pi * np.cumsum(f * 2.3) / SR) * np.exp(-t / 0.12)
    thud = lowpass(rng.normal(0, 1, n), 380) * np.exp(-t / 0.035) * 0.6
    return (skin + over + thud) * np.minimum(1, t / 0.0015)


def frame_drum(dur=0.6):
    n = int(dur * SR)
    t = times(n)
    body = np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.07)
    slap = bandpass(rng.normal(0, 1, n), 900, 4000) * np.exp(-t / 0.025) * 0.5
    return (body * 0.6 + slap) * np.minimum(1, t / 0.001)


def boom(dur=5.0):
    """Cinematic sub hit: a falling sine and rumbling low noise."""
    n = int(dur * SR)
    t = times(n)
    f = 30 + 32 * np.exp(-t / 0.25)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 1.4)
    rumble = lowpass(rng.normal(0, 1, n), 140, 4) * np.exp(-t / 1.8) * 1.4
    return (sub + rumble) * np.minimum(1, t / 0.004)


def wind(dur, lo=180, hi=900, level=1.0):
    """Air through the castle: band-limited noise with slow gusts."""
    n = int(dur * SR)
    t = times(n)
    gust = np.interp(t, np.linspace(0, t[-1], 12), 0.4 + 0.6 * rng.random(12))
    x = bandpass(rng.normal(0, 1, n), lo, hi)
    return x / (np.std(x) or 1) * gust * level


def riser(dur=3.0):
    """Noise swell into a downbeat."""
    n = int(dur * SR)
    t = times(n)
    x = highpass(rng.normal(0, 1, n), 1500)
    return x / (np.std(x) or 1) * (t / dur) ** 3 * 0.5
