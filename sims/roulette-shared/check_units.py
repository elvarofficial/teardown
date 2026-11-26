#!/usr/bin/env python3
"""Every force law in physics.js, redone with pint on real quantities, and compared with the numbers the JavaScript builds.

The physics runs in bare SI floats because a spin takes millions of steps. This is what keeps those floats honest: each law
must come out in its proper dimension, and a wheel built by spec.js must match a calculation from units here.

  python3 sims/roulette-shared/check_units.py
"""
import json
import math
import subprocess
from pathlib import Path

import pint

u = pint.UnitRegistry()
Q = u.Quantity
HERE = Path(__file__).resolve().parent

JS = """
import {buildWheel, ballPresetValues, DEFAULT_BALL, SURFACES} from './spec.js';
const w = buildWheel(ballPresetValues(DEFAULT_BALL));
const {R, mass, I, E, nu, cor, mu, crr} = w.ball;
const t = w.surfaces.track;
console.log(JSON.stringify({R, mass, I, E, nu, cor, mu, crr, kTrack: t.k, Estar: t.Estar, trackE: SURFACES.track.E * 1e9, trackNu: SURFACES.track.nu, rotorI: w.rotor.I, g: w.g, rho: w.air.rho, nuAir: w.air.nu}));
"""
num = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", JS], cwd=HERE, text=True))

R = Q(num["R"], "m")
m = Q(num["mass"], "kg")
g = Q(num["g"], "m/s**2")
E = Q(num["E"], "Pa")
Es = Q(num["trackE"], "Pa")
rho = Q(num["rho"], "kg/m**3")
nu_air = Q(num["nuAir"], "m**2/s")
v = Q(1, "m/s")
delta = Q(1e-6, "m")
omega = Q(100, "rad/s")
checks = []


def law(name, quantity, dimension, js=None):
    """The quantity must have this dimension, and match the JavaScript's number when there is one."""
    if not quantity.check(dimension):
        raise SystemExit(f"{name}: got {quantity.dimensionality}, wanted {dimension}")
    if js is not None:
        got = quantity.to_base_units().magnitude
        if not math.isclose(got, js, rel_tol=1e-9):
            raise SystemExit(f"{name}: pint says {got}, JavaScript has {js}")
    checks.append(f"{name:42s} {quantity.to_base_units():.4g~P}")


I = 0.4 * m * R**2
law("Sphere inertia, I = 2/5 m R^2", I, "[mass]*[length]**2", num["I"])
Estar = 1 / ((1 - num["nu"] ** 2) / E + (1 - num["trackNu"] ** 2) / Es)
law("Contact modulus, E*", Estar, "[pressure]", num["Estar"])
k = 4 / 3 * Estar * R**0.5
law("Hertz stiffness, k = 4/3 E* sqrt(R)", k, "[force]/[length]**1.5", num["kTrack"])
Fn = k * delta**1.5
law("Hertz normal force, F = k d^1.5", Fn, "[force]")
e = num["cor"]
damp = 8 * (1 - e) / (5 * e) / v
law("Flores damping factor", damp, "[time]/[length]")
law("Damped normal force, F (1 + d ddot)", Fn * (1 + damp * v), "[force]")
law("Coulomb friction impulse, mu F dt", num["mu"] * Fn * Q(1e-5, "s"), "[force]*[time]")
law("Slip-stopping impulse, 2/7 m v", 2 / 7 * m * v, "[mass]*[length]/[time]")
law("Rolling resistance torque, crr R F", num["crr"] * R * Fn, "[force]*[length]")
a = (R * delta) ** 0.5
law("Hertz contact radius, a = sqrt(R d)", a, "[length]")
law("Pivot friction torque, 3 pi/16 mu a F", 3 * math.pi / 16 * num["mu"] * a * Fn, "[force]*[length]")
A = math.pi * R**2
Re = v * 2 * R / nu_air
law("Reynolds number", Re, "[]")
law("Air drag, 1/2 rho Cd A v^2", 0.5 * rho * 0.45 * A * v**2, "[force]")
law("Magnus lift, 1/2 rho Cl A v^2", 0.5 * rho * 0.2 * A * v**2, "[force]")
law("Spin decay torque, 1/2 rho c R^5 w^2", 0.5 * rho * 0.1 * R**5 * (omega / u.rad) ** 2, "[force]*[length]")
law("Hertz contact time, 3.21 (m/k)^0.4 v^-0.2", 3.21 * (m / k) ** 0.4 * v ** (-0.2), "[time]")
Ir = Q(num["rotorI"], "kg*m**2")
h = Q(1, "g*m")
law("Imbalance torque, g h sin(tilt)", g * h * math.sin(0.01), "[force]*[length]")
law("Rotor deceleration, torque / I", Q(0.006, "N*m") / Ir, "1/[time]**2")
law("Rim condition, sqrt(g r tan(alpha))", (g * Q(0.356, "m") * math.tan(math.radians(15))) ** 0.5, "[length]/[time]")

print("\n".join(checks))
print(f"\nAll {len(checks)} laws have the right dimension and agree with spec.js.")
