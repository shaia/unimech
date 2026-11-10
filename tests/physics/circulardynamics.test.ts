import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  bankedDesignSpeed,
  bankedForces,
  bankedSpeedRange,
  bottomMinSpeed,
  chainRideOmega,
  circleStep,
  conicalAngle,
  conicalPendulum,
  dipNormal,
  flatCurveMaxSpeed,
  humpNormal,
  retautTime,
  rotorMinOmega,
  slackAngle,
  stopAngle,
  supportForce,
  supportForceFromBottom,
  topMinSpeed,
  turntableMaxRadius,
  verticalPosition,
  verticalSpeed2,
  verticalVelocity,
} from '~/physics/circulardynamics';
import { centripetalFromSpeed, tangentNormal } from '~/physics/curvilinear';
import { add, dot, len, relativeError, scale, sub, type Vec2 } from '~/physics/vec';

const deg = Math.PI / 180;
/** the value as printed in the bank, to three significant figures */
const sig3 = (x: number) => Number(x.toPrecision(3));

describe('analytic limits: banked and flat curves', () => {
  it('at the design speed v² = gR tanθ the friction needed is zero (bank Q-2.6-banked-design: 16.2 m/s)', () => {
    const v = bankedDesignSpeed(100, 15 * deg);
    expect(sig3(v)).toBe(16.2);
    expect(Math.abs(bankedForces(1, 100, 15 * deg, v).f)).toBeLessThan(1e-12);
  });
  it('the friction changes sign at the design speed: up the slope below it, down the slope above it', () => {
    const v0 = bankedDesignSpeed(80, 20 * deg);
    expect(bankedForces(1, 80, 20 * deg, 0.9 * v0).f).toBeLessThan(0);
    expect(bankedForces(1, 80, 20 * deg, 1.1 * v0).f).toBeGreaterThan(0);
  });
  it('the real forces add up to a horizontal net force m v²/R toward the centre at every speed', () => {
    const th = 20 * deg;
    for (const v of [0, 5, 16.9, 30]) {
      const m = 1200;
      const F = bankedForces(m, 80, th, v);
      // axes: x toward the centre, y up; N tilts toward the centre, f > 0 points down the slope toward the centre
      const Fx = F.N * Math.sin(th) + F.f * Math.cos(th);
      const Fy = F.N * Math.cos(th) - F.f * Math.sin(th) - m * G;
      expect(Math.abs(Fy) / (m * G)).toBeLessThan(1e-12);
      if (v > 0) expect(relativeError(Fx, m * centripetalFromSpeed(v, 80))).toBeLessThan(1e-12);
      else expect(Math.abs(Fx) / (m * G)).toBeLessThan(1e-12);
    }
  });
  it('μs → 0 shrinks the range to the design speed; θ → 0 gives the flat road √(μs g R) (bank Q-2.6-banked-range)', () => {
    const r0 = bankedSpeedRange(100, 25 * deg, 1e-12);
    const v0 = bankedDesignSpeed(100, 25 * deg);
    expect(relativeError(r0.vMin, v0)).toBeLessThan(1e-9);
    expect(relativeError(r0.vMax, v0)).toBeLessThan(1e-9);
    const flat = bankedSpeedRange(50, 0, 0.8);
    expect(flat.vMin).toBe(0);
    expect(relativeError(flat.vMax, flatCurveMaxSpeed(0.8, 50))).toBeLessThan(1e-12);
    expect(relativeError(flatCurveMaxSpeed(0.8, 50), 19.8)).toBeLessThan(0.003);
  });
  it('the bank key: R = 100 m, θ = 25°, μs = 0.20 → 15.5 m/s to 26.8 m/s', () => {
    const r = bankedSpeedRange(100, 25 * deg, 0.2);
    expect(sig3(r.vMin)).toBe(15.5);
    expect(sig3(r.vMax)).toBe(26.8);
  });
  it('at v_max and v_min the friction is exactly μs N', () => {
    const th = 20 * deg;
    const mu = 0.3;
    const r = bankedSpeedRange(80, th, mu);
    for (const v of [r.vMin, r.vMax]) {
      const F = bankedForces(1, 80, th, v);
      expect(relativeError(Math.abs(F.f), mu * F.N)).toBeLessThan(1e-12);
    }
  });
  it('μs ≥ cot θ: no upper speed; μs ≥ tan θ: a parked car holds', () => {
    expect(bankedSpeedRange(80, 60 * deg, 0.6).vMax).toBe(Infinity);
    expect(bankedSpeedRange(80, 20 * deg, 0.4).vMin).toBe(0);
  });
});

describe('analytic limits: conical pendulum and its relatives', () => {
  it('ω² = g/(L cosθ) and T = mg/cosθ (bank Q-2.6-conical: L = 1.0 m, 30° → 1.87 s)', () => {
    const c = conicalPendulum(1, 30 * deg);
    expect(sig3(c.period)).toBe(1.87);
    expect(relativeError(c.tensionPerWeight, 1 / Math.cos(30 * deg))).toBeLessThan(1e-12);
  });
  it('θ → 0: the period tends to the small-swing pendulum period 2π√(L/g)', () => {
    const c = conicalPendulum(1, 1e-6);
    expect(relativeError(c.period, 2 * Math.PI * Math.sqrt(1 / G))).toBeLessThan(1e-10);
  });
  it('conicalAngle inverts conicalPendulum, and below ω = √(g/L) the only solution is θ = 0', () => {
    for (const th of [10, 40, 60, 80]) expect(relativeError(conicalAngle(1.3, conicalPendulum(1.3, th * deg).omega), th * deg)).toBeLessThan(1e-12);
    expect(conicalAngle(1, 0.99 * Math.sqrt(G))).toBe(0);
  });
  it('the radial and vertical components of the tension give mg and m ω² r', () => {
    const L = 0.7;
    const th = 50 * deg;
    const c = conicalPendulum(L, th);
    const T = c.tensionPerWeight * G; // per kg
    expect(relativeError(T * Math.cos(th), G)).toBeLessThan(1e-12);
    expect(relativeError(T * Math.sin(th), c.omega * c.omega * c.radius)).toBeLessThan(1e-12);
  });
  it('a chain ride with d = 0 is a conical pendulum', () => {
    expect(relativeError(chainRideOmega(0, 5, 40 * deg), conicalPendulum(5, 40 * deg).omega)).toBeLessThan(1e-12);
  });
});

describe('analytic limits: vertical circle', () => {
  const R = 0.8;
  it('a string needs √(gR) at the top (bank Q-2.6-vertical-top: 2.80 m/s), a rod nothing', () => {
    expect(relativeError(topMinSpeed(R, 'string'), 2.8)).toBeLessThan(0.003);
    expect(topMinSpeed(R, 'rod')).toBe(0);
    // at that speed the tension at the top vanishes: gravity alone is the radial force
    expect(Math.abs(supportForce(1, G * R, R, Math.PI))).toBeLessThan(1e-12);
  });
  it('the bottom speed √(5gR) on a string (6.26 m/s) leaves exactly √(gR) at the top, and the tension at the bottom is 6mg', () => {
    const vb = bottomMinSpeed(R, 'string');
    expect(sig3(vb)).toBe(6.26);
    expect(relativeError(verticalSpeed2(vb, R, Math.PI), G * R)).toBeLessThan(1e-12);
    expect(relativeError(supportForceFromBottom(1, vb, R, 0), 6 * G)).toBeLessThan(1e-12);
  });
  it('on a rod √(4gR) at the bottom just stops at the top', () => {
    expect(Math.abs(verticalSpeed2(bottomMinSpeed(R, 'rod'), R, Math.PI))).toBeLessThan(1e-12);
    expect(stopAngle(bottomMinSpeed(R, 'rod'), R)).toBeCloseTo(Math.PI, 12);
  });
  it('the string goes slack where T = 0, and only for 2gR < v_b² < 5gR', () => {
    const vb = 7;
    const ps = slackAngle(vb, 1.2)!;
    expect(Math.abs(supportForceFromBottom(1, vb, 1.2, ps))).toBeLessThan(1e-12);
    expect(slackAngle(Math.sqrt(2 * G * 1.2) * 0.999, 1.2)).toBeNull();
    expect(slackAngle(Math.sqrt(5 * G * 1.2) * 1.001, 1.2)).toBeNull();
  });
  it('a ball released from rest at the horizontal has T = 3mg cosφ: 3mg at the bottom, for any R', () => {
    for (const r of [0.3, 0.9, 2]) {
      const vb = Math.sqrt(2 * G * r);
      for (const phi of [0, 0.4, 1.2]) expect(relativeError(supportForceFromBottom(1, vb, r, phi), 3 * G * Math.cos(phi))).toBeLessThan(1e-12);
    }
  });
  it('hump and dip: N = m(g ∓ v²/R), and the car leaves the road at v = √(gR)', () => {
    expect(relativeError(humpNormal(1000, 15, 40), 4180)).toBeLessThan(0.003);
    expect(relativeError(dipNormal(1000, 15, 40), 15400)).toBeLessThan(0.003);
    expect(Math.abs(humpNormal(1, Math.sqrt(G * 40), 40))).toBeLessThan(1e-12);
  });
  it('rotor and turntable: the friction limits ω² R ≤ μs g and μs ω² R ≥ g', () => {
    const w = rotorMinOmega(0.4, 2.5);
    expect(relativeError(0.4 * w * w * 2.5, G)).toBeLessThan(1e-12);
    const r = turntableMaxRadius(0.25, 4.712);
    expect(relativeError(4.712 * 4.712 * r, 0.25 * G)).toBeLessThan(1e-12);
  });
});

describe('conservation: the tangential second law reproduces v²(φ) and the radial law holds everywhere', () => {
  it('RK4 of φ̈ = −(g/R) sin φ keeps φ̇²R² = v_b² − 2gR(1 − cos φ) along a full loop', () => {
    const R = 1;
    const vb = 7.5;
    let phi = 0;
    let w = vb / R;
    const dt = 1e-3;
    for (let i = 0; i < 2000; i++) {
      [phi, w] = circleStep(phi, w, R, dt);
      expect(relativeError(w * w * R * R, verticalSpeed2(vb, R, phi))).toBeLessThan(1e-8);
    }
  });
  it('the weight plus the string force has radial component m v²/R and tangential −mg sin φ at every angle', () => {
    const R = 1.2;
    const vb = 8;
    for (let k = 0; k < 24; k++) {
      const phi = (k * 2 * Math.PI) / 24;
      const r = verticalPosition(R, phi);
      const inward = scale(r, -1 / R);
      const Fs = supportForceFromBottom(1, vb, R, phi);
      const F = add([0, -G], scale(inward, Fs));
      const v = verticalVelocity(Math.sqrt(verticalSpeed2(vb, R, phi)), phi);
      const split = tangentNormal(v, F);
      expect(relativeError(dot(F, inward), centripetalFromSpeed(len(v), R))).toBeLessThan(1e-12);
      expect(Math.abs(split.aT + G * Math.sin(phi))).toBeLessThan(1e-12);
    }
  });
});

describe('scaling', () => {
  it('the design speed grows as √R and does not depend on the mass', () => {
    expect(relativeError(bankedDesignSpeed(400, 0.3) / bankedDesignSpeed(100, 0.3), 2)).toBeLessThan(1e-12);
    const a = bankedForces(1000, 80, 0.3, 12);
    const b = bankedForces(2000, 80, 0.3, 12);
    expect(relativeError(b.f / a.f, 2)).toBeLessThan(1e-12);
    expect(relativeError(b.N / a.N, 2)).toBeLessThan(1e-12);
  });
  it('the conical pendulum period depends only on the height L cos θ', () => {
    const h = 0.6;
    for (const L of [0.7, 1, 3]) expect(relativeError(conicalPendulum(L, Math.acos(h / L)).period, 2 * Math.PI * Math.sqrt(h / G))).toBeLessThan(1e-12);
  });
  it('every minimum speed of the vertical circle scales as √(gR)', () => {
    for (const s of ['string', 'rod'] as const) expect(relativeError(bottomMinSpeed(4, s) / bottomMinSpeed(1, s), 2)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('RK4 on the circle: halving dt cuts the error in v² about 16-fold', () => {
    const R = 1;
    const vb = 5;
    const run = (dt: number) => {
      let phi = 0;
      let w = vb / R;
      for (let t = 0; t < 1 - 1e-12; t += dt) [phi, w] = circleStep(phi, w, R, dt);
      return Math.abs(w * w * R * R - verticalSpeed2(vb, R, phi));
    };
    const e1 = run(0.02);
    const e2 = run(0.01);
    expect(e1 / e2).toBeGreaterThan(10);
    expect(e1 / e2).toBeLessThan(40);
  });
});

describe('analytic limits: the free flight after the string goes slack', () => {
  it('leaving the top horizontally at u < √(gR), the string is taut again after t = 2√(gR − u²)/g (free fall 2√(R/g) at u = 0)', () => {
    // From the top (0, R) the projectile is at (−u t, R − g t²/2); |p|² = R² gives t² (u² − gR + g² t²/4) = 0.
    const R = 1.2;
    for (const f of [0, 0.5, 0.9]) {
      const u = f * Math.sqrt(G * R);
      const expected = (2 * Math.sqrt(G * R - u * u)) / G;
      expect(relativeError(retautTime([0, R], [-u, 0], R), expected)).toBeLessThan(1e-9);
    }
    expect(relativeError(retautTime([0, R], [0, 0], R), 2 * Math.sqrt(R / G))).toBeLessThan(1e-9);
  });
});

describe('consistency: the retaut time solves its defining condition', () => {
  it('after the string goes slack the projectile is back at distance R at the retaut time', () => {
    const R = 1.2;
    const vb = 7;
    const ps = slackAngle(vb, R)!;
    const p0 = verticalPosition(R, ps);
    const v0 = verticalVelocity(Math.sqrt(verticalSpeed2(vb, R, ps)), ps);
    const t = retautTime(p0, v0, R);
    const p: Vec2 = [p0[0] + v0[0] * t, p0[1] + v0[1] * t - 0.5 * G * t * t];
    expect(relativeError(len(p), R)).toBeLessThan(1e-9);
    // in between it is inside the circle: the string is slack
    const pm: Vec2 = [p0[0] + v0[0] * t * 0.5, p0[1] + v0[1] * t * 0.5 - 0.125 * G * t * t];
    expect(len(sub(pm, [0, 0]))).toBeLessThan(R);
  });
});
