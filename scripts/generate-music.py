#!/usr/bin/env python
"""Generate ForgeBuzz's background music in code, then upload it to Supabase.

Why generate instead of licensing: the reels post 5-7x/day to a brand account
and may one day run as paid ads. Synthesized audio has no Content-ID or
copyright exposure at all -- the same reason the existing tracks are CC0.

The tracks are written to LOOP SEAMLESSLY, because lib/mux.ts feeds them to
ffmpeg with `-stream_loop -1` to cover the clip length. So: no fade-in, no
fade-out, a whole number of chord cycles, and the tail is cross-faded back over
the head so the wrap point is inaudible.

Tone note: these are major-key and calming, to match @forgee.buzz's light
"did you know" content. (The same engine written for the book reels uses a dark
D-minor progression -- deliberately not reused here; it sounded funereal under a
sunlight fact.)

Usage:
    python scripts/generate-music.py            # render mp3s to scripts/out/
    python scripts/generate-music.py --upload   # render, then push to Supabase

Requires: numpy, scipy, and ffmpeg on PATH.
"""
import os, re, sys, wave, subprocess, shutil
import numpy as np
from scipy.signal import fftconvolve

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
ENV = os.path.join(os.path.dirname(HERE), ".env.local")
FFMPEG = shutil.which("ffmpeg") or "ffmpeg"


def note(n):
    return 440.0 * 2 ** ((n - 69) / 12.0)


# ---------------------------------------------------------------------------
# Six tracks. Varied progression shape, chord length, register and voicing, so
# the random pick in lib/music.ts doesn't keep serving the same mood.
#
# Every track is >= 60s on purpose. mux.ts clamps the clip to 60s, so a track at
# least that long is never actually looped -- which sidesteps the fact that mp3
# is not gapless (encoder padding would tick audibly at each wrap). The seamless
# construction below is kept anyway as a safety net.
TRACKS = [
    dict(name="synth-sunrise", chord_len=6.5, cycles=3, pluck=True,  bell=False,
         prog=[[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]]),   # C  I-vi-IV-V
    dict(name="synth-drift",   chord_len=7.5, cycles=2, pluck=False, bell=False,
         prog=[[53, 57, 60, 65], [58, 62, 65, 70], [50, 57, 62, 65], [55, 60, 64, 67]]),   # F  I-IV-vi-V
    dict(name="synth-meadow",  chord_len=6.0, cycles=3, pluck=True,  bell=False,
         prog=[[52, 59, 64, 67], [48, 55, 60, 64], [55, 59, 62, 67], [50, 57, 62, 66]]),   # G  vi-IV-I-V
    dict(name="synth-bloom",   chord_len=6.5, cycles=3, pluck=False, bell=True,
         prog=[[50, 57, 62, 66], [57, 61, 64, 69], [59, 62, 66, 71], [55, 59, 62, 67]]),   # D  I-V-vi-IV
    dict(name="synth-clear",   chord_len=7.0, cycles=3, pluck=False, bell=False,
         prog=[[57, 61, 64, 69], [61, 64, 68, 73], [62, 66, 69, 74], [64, 68, 71, 76]]),   # A  I-iii-IV-V
    dict(name="synth-hush",    chord_len=7.5, cycles=2, pluck=True,  bell=False,
         prog=[[46, 53, 58, 62], [51, 58, 63, 67], [46, 53, 58, 62], [53, 57, 60, 65]]),   # Bb I-IV-I-V
]

XFADE = 1.8          # chord overlap
LOOPFADE = 2.0       # tail wrapped back over the head


# ---------------------------------------------------------------------------
def _pad(freqs, dur):
    """Warm major pad: three detuned oscillators per note, five partials."""
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    out = np.zeros_like(t)
    for f in freqs:
        for det in (-0.0022, 0.0, 0.0027):
            fd = f * (1 + det)
            for p in range(1, 6):
                amp = 1.0 / (p ** 1.6)
                swell = 0.6 + 0.4 * (1 - np.exp(-t / (1.2 + 0.4 * p)))
                out += amp * swell * np.sin(2 * np.pi * fd * p * t + p * 0.6)
    out *= 1.0 + 0.05 * np.sin(2 * np.pi * 0.09 * t)
    return out / (len(freqs) * 3 * 2.4)


def _pluck(freqs, dur, every=1.6):
    """Soft arpeggio -- gives the 'gentle piano' character of the CC0 set."""
    n = int(SR * dur)
    out = np.zeros(n)
    order = [freqs[i % len(freqs)] * (2.0 if i >= len(freqs) else 1.0)
             for i in range(len(freqs) + 2)]
    for k, f in enumerate(order):
        s = int(SR * (0.25 + k * every))
        if s >= n:
            break
        ln = min(int(SR * 2.4), n - s)
        tt = np.linspace(0, ln / SR, ln, endpoint=False)
        env = np.exp(-tt * 1.5) * (1 - np.exp(-tt * 90))
        v = (np.sin(2 * np.pi * f * tt)
             + 0.28 * np.sin(2 * np.pi * f * 2 * tt)
             + 0.10 * np.sin(2 * np.pi * f * 3 * tt))
        out[s:s + ln] += env * v * 0.16
    return out


def _bell(freqs, dur, every=2.2):
    """Sparse inharmonic chime for a little sparkle."""
    n = int(SR * dur)
    out = np.zeros(n)
    for k, f in enumerate(freqs):
        s = int(SR * (0.6 + k * every))
        if s >= n:
            break
        ln = min(int(SR * 3.2), n - s)
        tt = np.linspace(0, ln / SR, ln, endpoint=False)
        env = np.exp(-tt * 1.1) * (1 - np.exp(-tt * 60))
        v = (np.sin(2 * np.pi * f * 2 * tt)
             + 0.5 * np.sin(2 * np.pi * f * 3.01 * tt)
             + 0.2 * np.sin(2 * np.pi * f * 4.97 * tt))
        out[s:s + ln] += env * v * 0.07
    return out


def _env(n, attack, release):
    e = np.ones(n)
    a, r = min(int(attack * SR), n // 2), min(int(release * SR), n // 2)
    if a:
        e[:a] = np.linspace(0, 1, a)
    if r:
        e[n - r:] = np.linspace(1, 0, r)
    return e


def _reverb(x, seed, decay=2.1, mix=0.34):
    n = int(SR * decay)
    rng = np.random.default_rng(seed)
    ir = rng.standard_normal(n) * np.exp(-np.linspace(0, 6.5, n))
    ir[: int(SR * 0.018)] = 0
    ir /= np.abs(ir).sum() / 16.0
    return (1 - mix) * x + mix * fftconvolve(x, ir)[: len(x)]


def render(spec):
    prog, cl, cycles = spec["prog"], spec["chord_len"], spec["cycles"]
    D = cl * len(prog) * cycles                 # exact loop length
    total = D + LOOPFADE
    buf = np.zeros(int(SR * (total + cl + XFADE + 1)))

    seg_len = cl + XFADE
    k = 0
    while k * cl < total:
        ch = prog[k % len(prog)]
        freqs = [note(m) for m in ch]
        seg = _pad(freqs, seg_len) * _env(int(SR * seg_len), XFADE, XFADE)
        if spec["pluck"]:
            seg += _pluck(freqs, seg_len)
        if spec["bell"]:
            seg += _bell(freqs, seg_len)
        s = int(SR * k * cl)
        buf[s:s + len(seg)] += seg
        k += 1

    x = buf[: int(SR * total)]
    L = _reverb(x, seed=11)
    R = _reverb(x, seed=29)

    # wrap the tail back over the head so the loop point is inaudible
    d, xf = int(SR * D), int(SR * LOOPFADE)
    ramp = np.linspace(0, 1, xf)
    out = []
    for ch in (L, R):
        c = ch[:d].copy()
        c[:xf] = c[:xf] * ramp + ch[d:d + xf] * (1 - ramp)
        out.append(c)

    st = np.stack(out, axis=1)
    st /= (np.abs(st).max() or 1.0)
    st *= 0.80                                   # mux.ts applies volume=0.7 again
    return st, D


def write_mp3(stereo, path_mp3):
    tmp = path_mp3.replace(".mp3", ".wav")
    with wave.open(tmp, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(stereo, -1, 1) * 32767).astype(np.int16).tobytes())
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", tmp,
                    "-codec:a", "libmp3lame", "-b:a", "128k", path_mp3], check=True)
    os.remove(tmp)


def upload(files):
    env = open(ENV, encoding="utf-8-sig").read()
    g = lambda k: re.search(k + r"=(.*)", env).group(1).strip()
    url, key, bucket = g("SUPABASE_URL"), g("SUPABASE_SERVICE_KEY"), g("SUPABASE_BUCKET")
    import requests
    for f in files:
        name = os.path.basename(f)
        r = requests.post(
            f"{url}/storage/v1/object/{bucket}/music/{name}",
            headers={"Authorization": "Bearer " + key,
                     "Content-Type": "audio/mpeg", "x-upsert": "true"},
            data=open(f, "rb").read(), timeout=120)
        print(f"  upload {name:<22} {r.status_code} {'' if r.ok else r.text[:120]}")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    made = []
    for spec in TRACKS:
        st, D = render(spec)
        p = os.path.join(OUT, spec["name"] + ".mp3")
        write_mp3(st, p)
        print(f"  {spec['name']:<16} {D:5.1f}s loop   {os.path.getsize(p)/1024:6.0f} KB")
        made.append(p)
    if "--upload" in sys.argv:
        upload(made)
