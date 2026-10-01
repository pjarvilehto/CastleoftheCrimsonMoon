"""tools/music/mix.py — placing sounds, the hall, the loop and the master (0.108).

A Track is a stereo dry buffer plus a reverb send, exactly one loop
(`length` seconds) long and CIRCULAR: place() adds a sound at a time and
pan (equal power), and whatever runs past the loop's end continues from
its start. render() runs the hall reverb on the send and folds the reverb
tail back onto the start the same way — notes held over the end and
reverb tails continue into the next pass, so the loop has no seam (0.114:
the first version wrapped long sounds to the wrong place and cut reverb
tails, leaving small edges at the seam and 10 s in) — then masters it: subsonic
high-pass, gentle compression, a soft limiter, and a level matched to the
target (median 0.5s RMS), ending at -1 dBFS peak at most.
"""
import numpy as np
from scipy.signal import fftconvolve
from synth import SR, lowpass, highpass

# Frequency balance (0.113): the first renders were all sub-bass — the
# 400 Hz-2.5 kHz range, where laptop and phone speakers live, sat 10-18 dB
# under the old beds. Band edges (Hz) and target levels (dB relative to the
# loudest band), modelled on how the old beds sit; 'light' for the beds
# without drums.
BANDS = [20, 60, 150, 400, 1000, 2500, 6000, 16000]
TARGETS = {
    'dark': [-7, 0, -3, -8, -14, -21, -30],
    'light': [-12, -4, 0, -2, -9, -17, -27],
}


def hall_ir(rt60=4.5, predelay=0.03, damp_hz=3500, width=1.0, seed=3):
    """Synthetic concert-hall impulse response (stereo): sparse early
    reflections, then decorrelated noise decaying at rt60, with the highs
    dying faster than the lows."""
    r = np.random.default_rng(seed)
    n = int((rt60 * 1.2 + predelay) * SR)
    t = np.arange(n) / SR
    out = []
    for ch in range(2):
        noise = r.normal(0, 1, n)
        lows = lowpass(noise, 900) * np.exp(-6.9 * t / (rt60 * 1.15))
        highs = highpass(noise, 900) * np.exp(-6.9 * t / (rt60 * 0.55))
        tail = lowpass(lows + highs, damp_hz)
        tail[: int(predelay * SR)] = 0
        er = np.zeros(n)
        for _ in range(14):
            k = int(r.uniform(predelay * 0.4, predelay + 0.09) * SR)
            er[k] += r.uniform(-1, 1) * 0.6
        ir = tail * np.minimum(1, (t - predelay).clip(0) / 0.06) + er
        out.append(ir / np.sqrt(np.sum(ir ** 2)))
    L, R = out
    mid, side = (L + R) / 2, (L - R) / 2 * width
    return mid + side, mid - side


class Track:
    def __init__(self, length, tempo=None):
        self.length = length
        self.n = int(length * SR)
        self.dry = np.zeros((2, self.n))
        self.wet = np.zeros((2, self.n))
        self.beat = 60.0 / tempo if tempo else None

    def at(self, bar, beat=0.0, beats_per_bar=4):
        return (bar * beats_per_bar + beat) * self.beat

    def _add(self, buf, ch, start, x):
        """x into the circular buffer from `start`, wrapping round the loop."""
        pos = start
        while len(x):
            k = min(len(x), self.n - pos)
            buf[ch, pos:pos + k] += x[:k]
            x, pos = x[k:], 0

    def place(self, sound, when, pan=0.0, gain=1.0, send=0.3):
        """sound: mono array or (L, R). when: seconds (wrapped into the loop)."""
        if isinstance(sound, tuple):
            L, R = sound
        else:
            L = R = sound
        a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
        L, R = L * np.cos(a) * gain * 1.414, R * np.sin(a) * gain * 1.414
        start = int((when % self.length) * SR) % self.n
        for ch, x in ((0, L), (1, R)):
            self._add(self.dry, ch, start, x * (1 - send * 0.5))
            self._add(self.wet, ch, start, x * send)

    def _fold(self, x):
        """A linear result (longer than the loop) folded round the loop."""
        out = np.zeros(self.n)
        for k in range(0, len(x), self.n):
            seg = x[k:k + self.n]
            out[: len(seg)] += seg
        return out

    def render(self, rt60=4.5, wet_gain=1.0, target_db=-18.0, width=0.85, tone='dark'):
        irL, irR = hall_ir(rt60, width=width)
        # circular reverb: the full tail of every note, folded round the loop
        verbL = self._fold(fftconvolve(self.wet[0], irL) + fftconvolve(self.wet[1], irL * 0.25))
        verbR = self._fold(fftconvolve(self.wet[1], irR) + fftconvolve(self.wet[0], irR * 0.25))
        out = self.dry + np.vstack([verbL, verbR]) * wet_gain
        out = match_bands(out, TARGETS[tone])
        return master(out, target_db)


def band_db(X, freqs):
    """Energy (dB) per BANDS band of a spectrum (both channels)."""
    p = np.sum(np.abs(X) ** 2, axis=0)
    return np.array([10 * np.log10(p[(freqs >= lo) & (freqs < hi)].sum() + 1e-12) for lo, hi in zip(BANDS[:-1], BANDS[1:])])


def match_bands(x, target, limit=10.0, strength=0.8):
    """Nudge the band balance toward `target` (dB re the loudest band):
    a smooth gain curve over log frequency, at most `limit` dB, applied by
    FFT over the whole loop — circular filtering, so the loop point stays
    seamless by construction."""
    X = np.fft.rfft(x, axis=1)
    freqs = np.fft.rfftfreq(x.shape[1], 1 / SR)
    have = band_db(X, freqs)
    have -= have.max()
    want = np.array(target, float)
    gain = np.clip((want - have) * strength, -limit, limit)
    gain -= gain.max()  # cut, never boost the loudest
    centres = np.sqrt(np.array(BANDS[:-1]) * np.array(BANDS[1:]))
    curve_db = np.interp(np.log(np.maximum(freqs, 1)), np.log(centres), gain)
    return np.fft.irfft(X * 10 ** (curve_db / 20), n=x.shape[1], axis=1)


def rms_db(x, win=0.5):
    mono = x.mean(axis=0)
    w = int(win * SR)
    segs = mono[: len(mono) // w * w].reshape(-1, w)
    return 10 * np.log10(np.mean(segs ** 2, axis=1) + 1e-12)


def master(x, target_db=-18.0):
    """Mastering on a LOOP: filters and the compressor see the loop's own
    end before its start (circular padding), so the loop point stays
    seamless."""
    pad = int(3.0 * SR)
    xp = np.concatenate([x[:, -pad:], x], axis=1)
    xp = np.vstack([highpass(c, 28, 4) for c in xp])
    xp = xp - xp.mean(axis=1, keepdims=True)
    # gentle compression: 2:1 above -16 dB on a trailing 300ms RMS envelope
    w = int(0.3 * SR)
    c = np.cumsum(np.concatenate([np.zeros(w), xp.mean(axis=0) ** 2]))
    mono = np.sqrt(np.maximum(c[w:] - c[:-w], 0) / w) + 1e-9
    over = np.clip(20 * np.log10(mono) - (-16), 0, None)
    xp = xp * 10 ** (-over * 0.5 / 20)
    x = xp[:, pad:]
    # level: median 0.5s window to target_db
    x = x * 10 ** ((target_db - np.median(rms_db(x))) / 20)
    # soft limiter at -1 dBFS
    ceiling = 10 ** (-1 / 20)
    return np.tanh(x / ceiling) * ceiling


def save_mp3(x, path, kbps=128):
    import lameenc
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(SR)
    enc.set_channels(2)
    enc.set_quality(2)
    pcm = (np.clip(x.T, -1, 1) * 32767).astype('<i2').tobytes()
    data = enc.encode(pcm) + enc.flush()
    with open(path, 'wb') as f:
        f.write(data)
    return len(data)


def stats(x):
    dbs = rms_db(x)
    med = np.median(dbs)
    L, R = x
    corr = np.sum(L * R) / np.sqrt(np.sum(L ** 2) * np.sum(R ** 2))
    seam = np.abs(np.concatenate([x[:, -SR // 10:], x[:, : SR // 10]], axis=1)).max()
    return {
        'medianDb': round(float(med), 1), 'quietestDb': round(float(dbs.min()), 1),
        'loudestDb': round(float(dbs.max()), 1), 'peakDb': round(float(20 * np.log10(np.abs(x).max())), 1),
        'dipsOver15dB': int(np.sum(dbs < med - 15)), 'stereoCorr': round(float(corr), 2),
        # the loop point should look like any other pair of neighbouring
        # samples: seamRank = share of the loop's sample steps that are
        # smaller than the step across the seam (a click would be ~1.0)
        'seamJump': round(float(np.abs(x[:, 0] - x[:, -1]).max()), 4),
        'seamRank': round(float(np.mean(np.abs(np.diff(x, axis=1)).max(axis=0) < np.abs(x[:, 0] - x[:, -1]).max())), 4),
        'typicalJump': round(float(np.percentile(np.abs(np.diff(x[0])), 99.9)), 4), 'seamPeak': round(float(seam), 2),
    }
