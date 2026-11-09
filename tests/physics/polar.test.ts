import { describe, expect, it } from 'vitest';
import {
  accelTerms,
  acceleration,
  arealRate,
  fromPolarComponents,
  numericState,
  pathComponents,
  polarAcceleration,
  polarBasis,
  polarMotion,
  polarVelocity,
  position,
  presetDuration,
  velocity,
  type PolarMotion,
  type PresetName,
  type PresetParams,
} from '~/physics/polar';
import { len, relativeError, type Vec2 } from '~/physics/vec';

const P: PresetParams = { r0: 1.2, omega: 1.5, u: 0.4 };
const PRESETS: PresetName[] = ['circle', 'spin-up', 'radial', 'bug', 'bead', 'spiral', 'line', 'pull'];

/** Cartesian velocity and acceleration of a motion by central differences of its position. */
function cartesianDerivatives(m: PolarMotion, t: number, h: number): { v: Vec2; a: Vec2 } {
  const x = (s: number) => position(m(s));
  const [xp, x0, xm] = [x(t + h), x(t), x(t - h)];
  return {
    v: [(xp[0] - xm[0]) / (2 * h), (xp[1] - xm[1]) / (2 * h)],
    a: [(xp[0] - 2 * x0[0] + xm[0]) / (h * h), (xp[1] - 2 * x0[1] + xm[1]) / (h * h)],
  };
}
/** |a − b| relative to the larger vector, or to `scale` when both are near zero (a motion with a = 0). */
const vecError = (a: Vec2, b: Vec2, scale = 0) => len([a[0] - b[0], a[1] - b[1]]) / Math.max(len(a), len(b), scale, 1e-300);

describe('analytic limits', () => {
  it('the polar unit vectors are orthonormal, and θ̂ is r̂ turned by +90°', () => {
    for (const th of [0, 0.7, 2.5, -1.1]) {
      const { rHat, thetaHat } = polarBasis(th);
      expect(len(rHat)).toBeCloseTo(1, 14);
      expect(len(thetaHat)).toBeCloseTo(1, 14);
      expect(rHat[0] * thetaHat[0] + rHat[1] * thetaHat[1]).toBeCloseTo(0, 14);
      expect(rHat[0] * thetaHat[1] - rHat[1] * thetaHat[0]).toBeCloseTo(1, 14); // r̂ × θ̂ = +ẑ
    }
  });

  it('dr̂/dt = θ̇ θ̂ and dθ̂/dt = −θ̇ r̂ (finite differences of the unit vectors along θ(t))', () => {
    const th = (t: number) => 0.3 + 1.7 * t + 0.4 * t * t;
    const thd = (t: number) => 1.7 + 0.8 * t;
    const t = 0.9;
    const h = 1e-5;
    const [bp, bm, b0] = [polarBasis(th(t + h)), polarBasis(th(t - h)), polarBasis(th(t))];
    const drHat: Vec2 = [(bp.rHat[0] - bm.rHat[0]) / (2 * h), (bp.rHat[1] - bm.rHat[1]) / (2 * h)];
    const dthHat: Vec2 = [(bp.thetaHat[0] - bm.thetaHat[0]) / (2 * h), (bp.thetaHat[1] - bm.thetaHat[1]) / (2 * h)];
    expect(vecError(drHat, [thd(t) * b0.thetaHat[0], thd(t) * b0.thetaHat[1]])).toBeLessThan(1e-8);
    expect(vecError(dthHat, [-thd(t) * b0.rHat[0], -thd(t) * b0.rHat[1]])).toBeLessThan(1e-8);
  });

  it('constant r reduces to circular motion: v = rθ̇ along θ̂, a_r = −rθ̇² = −v²/r, a_θ = rθ̈', () => {
    const s = polarMotion('spin-up', P)(1.3);
    const v = polarVelocity(s);
    const a = polarAcceleration(s);
    expect(v.vr).toBe(0);
    expect(relativeError(a.ar, -(v.vth ** 2) / s.r)).toBeLessThan(1e-12);
    expect(relativeError(a.ath, s.r * P.omega)).toBeLessThan(1e-12);
  });

  it('constant θ reduces to motion along a line through O: v = ṙ r̂ and a = r̈ r̂', () => {
    const s = polarMotion('radial', P)(2);
    expect(polarVelocity(s)).toEqual({ vr: P.u, vth: 0 });
    expect(polarAcceleration(s)).toEqual({ ar: 0, ath: 0 });
  });

  it('constant velocity along a line that misses O has zero acceleration, although r̈ ≠ 0 and θ̈ ≠ 0', () => {
    const m = polarMotion('line', P);
    for (const t of [0.5, 3, 5.5]) {
      const s = m(t);
      const terms = accelTerms(s);
      expect(Math.abs(terms.radial)).toBeGreaterThan(1e-3);
      expect(Math.abs(polarAcceleration(s).ar)).toBeLessThan(1e-12);
      expect(Math.abs(polarAcceleration(s).ath)).toBeLessThan(1e-12);
      expect(relativeError(len(velocity(s)), P.u)).toBeLessThan(1e-12);
    }
  });

  it('a uniform circle through the origin, r = 2R cos θ with θ̇ = ω/2: |v| = Rω and |a| = Rω² (example 1.4.5)', () => {
    const R = 0.5;
    const w = 4;
    const th = (t: number) => -1 + (w / 2) * t;
    const s = numericState((t) => 2 * R * Math.cos(th(t)), th, 0.6, 1e-4);
    expect(relativeError(len(velocity(s)), R * w)).toBeLessThan(1e-7);
    expect(relativeError(len(acceleration(s)), R * w * w)).toBeLessThan(1e-6);
    // the polar θ-component is not the tangential one: here a_t = 0 but a_θ ≠ 0
    expect(Math.abs(pathComponents(s).at)).toBeLessThan(1e-5);
    expect(Math.abs(polarAcceleration(s).ath)).toBeGreaterThan(1);
  });
});

describe('conservation', () => {
  it('|v|² = ṙ² + r²θ̇² for every preset', () => {
    for (const name of PRESETS) {
      const s = polarMotion(name, P)(0.37 * presetDuration(name, P));
      expect(relativeError(len(velocity(s)) ** 2, s.rd ** 2 + (s.r * s.thd) ** 2)).toBeLessThan(1e-12);
    }
  });

  it('a pull only along r̂ (a_θ = 0) keeps r²θ̇ constant', () => {
    const m = polarMotion('pull', P);
    const h0 = arealRate(m(0));
    for (const t of [0.5, 1, 1.7]) {
      expect(Math.abs(polarAcceleration(m(t)).ath)).toBeLessThan(1e-12);
      expect(relativeError(arealRate(m(t)), h0)).toBeLessThan(1e-12);
    }
  });

  it('the free bead keeps a_r = 0 and ṙ² − ω²r² constant (= −ω²r₀²)', () => {
    const m = polarMotion('bead', P);
    for (const t of [0, 0.4, 0.8]) {
      const s = m(t);
      expect(Math.abs(polarAcceleration(s).ar)).toBeLessThan(1e-12 * s.r * P.omega ** 2);
      expect(relativeError(s.rd ** 2 - P.omega ** 2 * s.r ** 2, -(P.omega ** 2) * P.r0 ** 2)).toBeLessThan(1e-10);
    }
  });
});

describe('scaling', () => {
  it('the spiral r = bθ at constant ω has |a| = bω²√(θ² + 4)', () => {
    const m = polarMotion('spiral', P);
    const b = P.r0 / Math.PI;
    for (const t of [1, 3, 5]) {
      const s = m(t);
      expect(relativeError(len(acceleration(s)), b * P.omega ** 2 * Math.sqrt(s.th ** 2 + 4))).toBeLessThan(1e-12);
    }
  });

  it('the bug on a turning rod: a_r scales with r, a_θ = 2uω does not', () => {
    const m = polarMotion('bug', P);
    const [s1, s2] = [m(1), m(4)];
    expect(relativeError(polarAcceleration(s1).ath, 2 * P.u * P.omega)).toBeLessThan(1e-12);
    expect(relativeError(polarAcceleration(s2).ath, 2 * P.u * P.omega)).toBeLessThan(1e-12);
    expect(relativeError(polarAcceleration(s2).ar / polarAcceleration(s1).ar, s2.r / s1.r)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('the polar formulas match Cartesian finite differences of the position, for every preset', () => {
    for (const name of PRESETS) {
      const m = polarMotion(name, P);
      const t = 0.41 * presetDuration(name, P);
      const { v, a } = cartesianDerivatives(m, t, 1e-4);
      // the line preset has a = 0: measure its error against the natural scale of the motion, u²/r₀
      const aScale = Math.max(P.omega ** 2 * P.r0, P.u ** 2 / P.r0);
      expect(vecError(v, velocity(m(t)))).toBeLessThan(1e-6);
      expect(vecError(a, acceleration(m(t)), aScale)).toBeLessThan(1e-5);
    }
  });

  it('the finite-difference error of the acceleration falls as h² (order 2)', () => {
    const m = polarMotion('bead', P);
    const t = 0.6;
    const exact = acceleration(m(t));
    const err = (h: number) => vecError(cartesianDerivatives(m, t, h).a, exact);
    const order = Math.log2(err(0.02) / err(0.01));
    expect(order).toBeGreaterThan(1.9);
    expect(order).toBeLessThan(2.1);
  });

  it('numericState recovers the analytic state of the bug', () => {
    // r and θ are linear in t, so the differences are exact at any h; a large h keeps rounding (ε/h²) small
    const s = numericState((t) => P.r0 + P.u * t, (t) => P.omega * t, 2, 1e-2);
    const exact = polarMotion('bug', P)(2);
    expect(relativeError(polarAcceleration(s).ath, polarAcceleration(exact).ath)).toBeLessThan(1e-8);
    expect(relativeError(polarAcceleration(s).ar, polarAcceleration(exact).ar)).toBeLessThan(1e-6);
  });

  it('fromPolarComponents round-trips: the components of a vector along r̂ and θ̂ rebuild it', () => {
    const th = 2.2;
    const w = fromPolarComponents(3, -4, th);
    const { rHat, thetaHat } = polarBasis(th);
    expect(w[0] * rHat[0] + w[1] * rHat[1]).toBeCloseTo(3, 12);
    expect(w[0] * thetaHat[0] + w[1] * thetaHat[1]).toBeCloseTo(-4, 12);
  });
});
