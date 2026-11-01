"""Score for the ERPNext ingress explorer: a cool bed (Dm9, 92 bpm) under the whole business day, a quiet motor for
the till that never stops, a soft tick on every hourly ecommerce pull, a low thump when the field phone syncs and a
deeper one when the nightly Tally import lands, and a click on every camera move.

    python run_sfx.py sims/erp-shared/score.py

Times mirror erp-shared/film.js and erp-shared/kin.js: the film clock is the business hour, one second per hour.
"""

import os

from sfx.score_kit import airy, bed, chords, hz, motor, thud
from sfx.synth import blip, click

TIMELINE = "../erp-film/timeline.json"
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "erp-score.wav")
TARGET_LUFS = -14.0
SEED = 29

CHORDS = chords("Dm9:D3 F3 A3 C4 E4/D2", "Am7:A2 C3 E3 G3/A1", "Fmaj7:F2 A3 C4 E3/F1", "Cmaj7:C3 E3 G3 B3/C2")
MOTIF = [(0.5, hz("F4")), (1.5, hz("A4")), (2.5, hz("C5"))]
CLICKS = (4.2, 8.2, 12.2, 16.2, 20.2, 22.4)
# the ecommerce storefront pushes its orders on the hour, and one film second is one hour
FLUSHES = tuple(float(h) for h in range(1, 25))
FIELD = (13.0, 15.5, 19.5)
TALLY = 21.0


def score(mix, tl):
    dur = tl["duration"]
    left, right, low, drums = bed(dur, 92, CHORDS, MOTIF, motif_voice="epiano", kicks=(0, 2.5), snares=(), hats=8, swing=0.0, keys_vel=0.7, keys_lp=3600)
    mix.put_stereo(0, left, right, 0.12)
    mix.put(0, low, 0.12)
    mix.put(0, drums, 0.04)
    # the till never stops: a quiet motor under the whole day
    mix.put(0, motor(dur, 148, 1100, 13), 0.028)
    # the hourly pull
    for t in FLUSHES:
        mix.put(t, blip(hz("A5"), 0.05, 0.02), 0.018)
    # the field phone finds signal
    for t in FIELD:
        mix.put(t, thud(118, 0.09, 0.32), 0.035)
    # the nightly import lands
    mix.put(TALLY, thud(68, 0.4, 1.3), 0.06)
    mix.put(TALLY, airy(1.8, 280, 1700, 0.6), 0.02)
    # every camera move gets a click
    for t in CLICKS:
        mix.put(t, click(2400, 0.025), 0.055)
    # and a soft air under each move
    for t in (4.2, 8.2, 12.2, 16.2, 20.2):
        mix.put(t, airy(1.2, 700, 1500, 0.6), 0.016)
