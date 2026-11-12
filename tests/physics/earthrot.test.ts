import { describe, expect, it } from 'vitest';
import { G, OMEGA_EARTH, R_EARTH } from '~/physics/constants';
import {
  coriolisTurnAngle,
  coriolisTurnRate,
  criticalOmega,
  dropFromRest,
  foldPlane,
  foucaultEnergy,
  foucaultExact,
  foucaultPlaneAngle,
  foucaultStep,
  foucaultSwings,
  horizontalDeflection,
  parcelPath,
  rossbyNumber,
  spinAbout,
  verticalOmega,
  type ParcelField,
  type Planar,
} from '~/physics/earthrot';
import { effectiveGravityEarth, fallDeflectionEast, foucaultRate } from '~/physics/rotating';
import { relativeError } from '~/physics/vec';

const deg = Math.PI / 180;
/** a 20 m pendulum: ω₀ = √(g/ℓ) */
const W0 = Math.sqrt(G / 20);

/** Least-squares slope of the swing azimuths (unwrapped) against time. */
function planeRate(sw: { t: number; azimuth: number }[]): number {
  let prev = sw[0].azimuth;
  let off = 0;
  const pts = sw.map((s) => {
    let a = s.azimuth + off;
    while (a - prev > Math.PI / 2) {
      a -= Math.PI;
      off -= Math.PI;
    }
    while (a - prev < -Math.PI / 2) {
      a += Math.PI;
      off += Math.PI;
    }
    prev = a;
    return [s.t, a] as const;
  });
  const n = pts.length;
  const mt = pts.reduce((q, p) => q + p[0], 0) / n;
  const ma = pts.reduce((q, p) => q + p[1], 0) / n;
  const num = pts.reduce((q, p) => q + (p[0] - mt) * (p[1] - ma), 0);
  const den = pts.reduce((q, p) => q + (p[0] - mt) ** 2, 0);
  return num / den;
}

describe('analytic limits', () => {
  it('the integrated swing plane of a Foucault pendulum turns at −ω sin λ (clockwise in the north)', () => {
    // ω exaggerated ×200 so the plane turns visibly within a few hundred swings
    const omega = 200 * OMEGA_EARTH;
    for (const latDeg of [60, 30, -45]) {
      const lat = latDeg * deg;
      const wz = verticalOmega(omega, lat);
      const sw = foucaultSwings(1, W0, wz, 600);
      expect(relativeError(planeRate(sw), -foucaultRate(omega, lat))).toBeLessThan(2e-3);
    }
  });

  it('on the equator the plane does not turn', () => {
    const sw = foucaultSwings(1, W0, verticalOmega(200 * OMEGA_EARTH, 0), 300);
    for (const s of sw) expect(Math.abs(s.azimuth)).toBeLessThan(1e-9);
  });

  it('at the pole the plane turns once in 2π/ω, a sidereal day', () => {
    const t = (2 * Math.PI) / OMEGA_EARTH;
    expect(relativeError(Math.abs(foucaultPlaneAngle(OMEGA_EARTH, 90 * deg, t)), 2 * Math.PI)).toBeLessThan(1e-12);
  });

  it('the exact swing released from rest starts at (x₀, 0) at rest and stays on a line that turns at −Ω_z', () => {
    const wz = 0.01;
    const s0 = foucaultExact(2, W0, wz, 0);
    expect(s0.x).toBeCloseTo(2, 14);
    expect(Math.abs(s0.y) + Math.abs(s0.vx) + Math.abs(s0.vy)).toBeLessThan(1e-14);
    // at each turning point (Wt = kπ) the bob lies on the line at azimuth −Ω_z t
    const W = Math.hypot(W0, wz);
    for (let k = 1; k <= 20; k++) {
      const t = (k * Math.PI) / W;
      const s = foucaultExact(2, W0, wz, t);
      expect(Math.abs(foldPlane(Math.atan2(s.y, s.x)) - foldPlane(-wz * t))).toBeLessThan(1e-12);
    }
  });

  it('a dropped body integrated in the Earth frame lands east of the plumb line by (1/3)ωgt³cos λ', () => {
    for (const latDeg of [0, 31.8, 60]) {
      const lat = latDeg * deg;
      const d = dropFromRest(OMEGA_EARTH, lat, 150);
      expect(relativeError(d.east, fallDeflectionEast(OMEGA_EARTH, G, d.t, lat))).toBeLessThan(1e-3);
      // north–south: only terms of order ω², far below the eastward deflection
      expect(Math.abs(d.north)).toBeLessThan(1e-3 * d.east);
    }
  });

  it('at the pole a dropped body is not deflected (ω is parallel to the velocity)', () => {
    const d = dropFromRest(OMEGA_EARTH, 90 * deg, 150);
    expect(Math.hypot(d.east, d.north)).toBeLessThan(1e-9);
  });

  it('a horizontally moving body with no other horizontal force turns at 2ω sin λ, to the right in the north', () => {
    const omega = OMEGA_EARTH;
    const lat = 40 * deg;
    const f: ParcelField = { aP: 0, sense: 1, rCore: 1, wz: verticalOmega(omega, lat), k: 0 };
    const v = 10;
    const T = 3600;
    const path = parcelPath({ x: 0, y: 0, vx: 0, vy: v }, f, T, 200);
    const end = path[path.length - 1];
    const turned = Math.atan2(end.vx, end.vy); // from north toward east: clockwise
    expect(relativeError(turned, coriolisTurnRate(omega, lat) * T)).toBeLessThan(1e-9);
    expect(end.x).toBeGreaterThan(0); // moving north, it drifts east: to its right
  });

  it('with ω = 0 a parcel falls straight into the low and never circles it', () => {
    const f: ParcelField = { aP: 1e-3, sense: 1, rCore: 5e4, wz: 0, k: 1e-5 };
    const path = parcelPath({ x: 4e5, y: 3e5, vx: 0, vy: 0 }, f, 1.5e5, 300);
    for (const s of path) expect(Math.abs(spinAbout(s))).toBeLessThan(1e-6);
  });

  it('the critical rotation makes g_eff vanish on the equator', () => {
    const wc = criticalOmega(G, R_EARTH);
    const ge = effectiveGravityEarth(G, wc, R_EARTH, 0);
    expect(Math.hypot(ge[0], ge[1], ge[2])).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('the Coriolis force does no work: the Foucault energy ½v² + ½ω₀²r² stays constant', () => {
    const wz = 0.01;
    // the exact swing keeps it to rounding
    const e0 = foucaultEnergy(foucaultExact(1, W0, wz, 0), W0);
    for (let k = 1; k <= 50; k++) expect(relativeError(foucaultEnergy(foucaultExact(1, W0, wz, 7.3 * k), W0), e0)).toBeLessThan(1e-12);
    // and the integration keeps it over 200 swings, to its truncation error. RK4 on an oscillator of frequency ν
    // multiplies the amplitude per step by |R(iνh)|, with |R(ix)|² = 1 − x⁶/72 + O(x⁸): the energy falls by
    // x⁶/72 per step, N x⁶/72 over N steps, for the faster of the two modes, ν = W + Ω_z. At 1000 steps a swing
    // that is 1.9e-10 (measured: 0.92 of it); the bound scales as dt⁵ over a fixed time, so at 400 steps a swing
    // it was 1.7e-8, which once failed a fixed 1e-8 tolerance. The test holds the drift between ½ and 2 of the
    // bound: below it, the energy is kept; above ½ of it, the drift is RK4's own loss and not something else.
    const n = 1000 * 200;
    const dt = (2 * Math.PI) / W0 / 1000;
    let s: Planar = { x: 1, y: 0, vx: 0, vy: 0 };
    for (let i = 0; i < n; i++) s = foucaultStep(s, W0, wz, dt);
    const x = (Math.hypot(W0, wz) + wz) * dt;
    const bound = (n * x ** 6) / 72;
    const drift = relativeError(foucaultEnergy(s, W0), e0);
    expect(drift).toBeLessThan(2 * bound);
    expect(drift).toBeGreaterThan(0.5 * bound);
  });

  it('a horizontally moving body keeps its speed while the Coriolis force turns it', () => {
    const f: ParcelField = { aP: 0, sense: 1, rCore: 1, wz: 1e-4, k: 0 };
    const path = parcelPath({ x: 0, y: 0, vx: 7, vy: 0 }, f, 5e4, 200);
    for (const s of path) expect(relativeError(Math.hypot(s.vx, s.vy), 7)).toBeLessThan(1e-9);
  });
});

describe('scaling', () => {
  it('the plane turns in proportion to sin λ: at 30° half as fast as at the pole', () => {
    expect(relativeError(foucaultRate(OMEGA_EARTH, 30 * deg), 0.5 * foucaultRate(OMEGA_EARTH, 90 * deg))).toBeLessThan(1e-12);
  });

  it('the sideways deflection of horizontal motion grows as v t² (first order)', () => {
    const lat = 45 * deg;
    const f: ParcelField = { aP: 0, sense: 1, rCore: 1, wz: verticalOmega(OMEGA_EARTH, lat), k: 0 };
    for (const [v, t] of [
      [100, 10],
      [200, 10],
      [100, 20],
    ] as const) {
      const end = parcelPath({ x: 0, y: 0, vx: 0, vy: v }, f, t, 100).at(-1) as Planar;
      expect(relativeError(end.x, horizontalDeflection(OMEGA_EARTH, lat, v, t))).toBeLessThan(1e-6);
    }
  });

  it('a sink barely turns and a storm turns many times over: the Coriolis turn L/v-scaled, the Rossby ratio inverse', () => {
    const lat = 45 * deg;
    const sink = coriolisTurnAngle(OMEGA_EARTH, lat, 0.3, 0.1);
    const storm = coriolisTurnAngle(OMEGA_EARTH, lat, 5e5, 10);
    expect(sink).toBeLessThan(1e-3);
    expect(storm).toBeGreaterThan(2 * Math.PI * 0.5);
    expect(relativeError(rossbyNumber(0.1, 0.3, OMEGA_EARTH, lat), 1 / sink)).toBeLessThan(1e-12);
    expect(rossbyNumber(1, 1, OMEGA_EARTH, 0)).toBe(Infinity);
  });
});

describe('sense of rotation', () => {
  const field = (wz: number, sense: 1 | -1): ParcelField => ({ aP: 1e-3, sense, rCore: 5e4, wz, k: 2e-5 });
  const spinAfter = (f: ParcelField, start: Planar) => {
    const path = parcelPath(start, f, 1.5e5, 300);
    return spinAbout(path[path.length - 1]);
  };
  const wN = verticalOmega(OMEGA_EARTH, 45 * deg);

  it('air falling into a low in the north circles it counter-clockwise; in the south clockwise', () => {
    for (const start of [
      { x: 4e5, y: 0, vx: 0, vy: 0 },
      { x: 0, y: -4e5, vx: 0, vy: 0 },
      { x: -3e5, y: 3e5, vx: 0, vy: 0 },
    ]) {
      expect(spinAfter(field(wN, 1), start)).toBeGreaterThan(0);
      expect(spinAfter(field(-wN, 1), start)).toBeLessThan(0);
    }
  });

  it('air flowing out of a high in the north circles it clockwise', () => {
    expect(spinAfter(field(wN, -1), { x: 1e5, y: 1e5, vx: 0, vy: 0 })).toBeLessThan(0);
  });
});

describe('convergence', () => {
  it('RK4 on the Foucault equations converges to the exact swing at fourth order', () => {
    const wz = 0.02;
    const T = 40;
    const err = (n: number) => {
      const dt = T / n;
      let s: Planar = { x: 1, y: 0, vx: 0, vy: 0 };
      for (let i = 0; i < n; i++) s = foucaultStep(s, W0, wz, dt);
      const e = foucaultExact(1, W0, wz, T);
      return Math.hypot(s.x - e.x, s.y - e.y);
    };
    const ratio = err(400) / err(800);
    expect(ratio).toBeGreaterThan(12);
    expect(ratio).toBeLessThan(20);
  });
});
