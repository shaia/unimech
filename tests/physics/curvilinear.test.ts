import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  angleBetween,
  averageAcceleration,
  centralDifference,
  centripetalFromOmega,
  centripetalFromSpeed,
  chordDeltaV,
  circlePath,
  cross2,
  curvatureCentre,
  curvatureRadius,
  cycloidPath,
  ellipsePath,
  omegaFromFrequency,
  omegaFromRpm,
  parabolaPath,
  periodOf,
  projectilePath,
  tangentNormal,
  type CurvePath,
} from '~/physics/curvilinear';
import { dist, dot, len, relativeError, sub, type Vec2 } from '~/physics/vec';

const sample = (T: number, n = 16) => Array.from({ length: n }, (_, i) => (T * (i + 0.5)) / n);
const vecErr = (a: Vec2, b: Vec2) => len(sub(a, b)) / len(b);

describe('analytic limit: uniform circular motion', () => {
  const R = 3;
  const w = 0.5;
  const c: Vec2 = [1, -2];
  const p = circlePath(R, w, 0, 0.3, c, 20);
  it('a_t vanishes and a⊥ = ω²R = v²/R at every instant', () => {
    for (const t of sample(20)) {
      const s = tangentNormal(p.v(t), p.a(t));
      expect(Math.abs(s.aT) / len(p.a(t))).toBeLessThan(1e-12);
      expect(relativeError(s.aN, centripetalFromOmega(w, R))).toBeLessThan(1e-12);
      expect(relativeError(s.aN, centripetalFromSpeed(s.speed, R))).toBeLessThan(1e-12);
    }
  });
  it('a = −ω²(r − c): the acceleration points at the centre of the circle', () => {
    for (const t of sample(20)) {
      const toCentre = sub(c, p.r(t));
      expect(relativeError(dot(p.a(t), toCentre) / (len(p.a(t)) * len(toCentre)), 1)).toBeLessThan(1e-12);
    }
  });
  it('the radius of curvature of a circle is its radius, and the centre of curvature is its centre', () => {
    for (const t of sample(20)) {
      expect(relativeError(curvatureRadius(p, t), R)).toBeLessThan(1e-12);
      expect(dist(curvatureCentre(p, t)!, c) / R).toBeLessThan(1e-12);
    }
  });
  it('the speed is ωR at every instant (conservation of speed)', () => {
    for (const t of sample(20)) expect(relativeError(len(p.v(t)), w * R)).toBeLessThan(1e-12);
  });
});

describe('analytic limit: circular motion with constant angular acceleration', () => {
  const R = 0.5;
  const alpha = 2.0;
  const p = circlePath(R, 0, alpha);
  it('a_t = αR is constant and a⊥ = ω²R with ω = αt (bank Q-1.3-alpha-total: 1.0, 2.0, 2.24 m/s² at t = 1 s)', () => {
    const s = tangentNormal(p.v(1), p.a(1));
    expect(relativeError(s.aT, 1.0)).toBeLessThan(1e-12);
    expect(relativeError(s.aN, 2.0)).toBeLessThan(1e-12);
    expect(relativeError(len(p.a(1)), Math.sqrt(5))).toBeLessThan(1e-12);
  });
  it('the radius of curvature is still R: speeding up does not change the shape of the path', () => {
    for (const t of sample(3)) expect(relativeError(curvatureRadius(p, t), R)).toBeLessThan(1e-12);
  });
  it('a_c = a_t (a at 45° to v) when the wheel has turned ½ rad, whatever α (bank Q-1.3-half-radian)', () => {
    for (const al of [0.6, 4, 14]) {
      const q = circlePath(1.3, 0, al);
      const t45 = 1 / Math.sqrt(al); // ω² = α
      const s = tangentNormal(q.v(t45), q.a(t45));
      expect(relativeError(s.aN, s.aT)).toBeLessThan(1e-12);
      expect(relativeError(0.5 * al * t45 * t45, 0.5)).toBeLessThan(1e-12);
    }
  });
  it('slowing down (α < 0 with ω > 0) gives a negative a_t, of size |α|R', () => {
    const q = circlePath(3, 1, -0.15);
    for (const t of sample(6)) expect(relativeError(tangentNormal(q.v(t), q.a(t)).aT, -0.45)).toBeLessThan(1e-12);
  });
  it('from rest all of a is tangential: a_t = |a|, a⊥ = 0, ρ reported as 0 (no tangent yet)', () => {
    const s = tangentNormal(p.v(0), p.a(0));
    expect(relativeError(s.aT, alpha * R)).toBeLessThan(1e-12);
    expect(s.aN).toBe(0);
    expect(s.rho).toBe(0);
  });
});

describe('analytic limit: projectile', () => {
  it('at the top ρ = v_x²/g (bank Q-1.3-top-parabola: 10.2 m for 20 m/s at 60°)', () => {
    const v0 = 20;
    const th = Math.PI / 3;
    const p = projectilePath([0, 0], [v0 * Math.cos(th), v0 * Math.sin(th)]);
    const tTop = (v0 * Math.sin(th)) / G;
    expect(relativeError(curvatureRadius(p, tTop), (v0 * Math.cos(th)) ** 2 / G)).toBeLessThan(1e-12);
    expect(relativeError(curvatureRadius(p, tTop), 10.2)).toBeLessThan(0.002);
  });
  it('at launch ρ = v₀²/(g cos θ) (bank Q-1.3-launch-curvature: 81.6 m)', () => {
    const p = projectilePath([0, 0], [10, 20 * Math.sin(Math.PI / 3)]);
    expect(relativeError(curvatureRadius(p, 0), 400 / (G * 0.5))).toBeLessThan(1e-12);
    expect(relativeError(curvatureRadius(p, 0), 81.6)).toBeLessThan(0.002);
  });
  it('the path is most curved at the top: ρ is smallest there', () => {
    const p = projectilePath([0, 0], [4, 7]);
    const tTop = 7 / G;
    for (const t of sample(p.duration, 30)) {
      if (Math.abs(t - tTop) > 1e-3) expect(curvatureRadius(p, t)).toBeGreaterThan(curvatureRadius(p, tTop));
    }
  });
  it('the tangential part is −g sinφ on the way up and positive on the way down; at the top a⊥ = g', () => {
    const p = projectilePath([0, 0], [4, 7]);
    expect(tangentNormal(p.v(0.2), p.a(0.2)).aT).toBeLessThan(0);
    expect(tangentNormal(p.v(1.2), p.a(1.2)).aT).toBeGreaterThan(0);
    expect(relativeError(tangentNormal(p.v(7 / G), p.a(7 / G)).aN, G)).toBeLessThan(1e-12);
  });
});

describe('analytic limit: other curves', () => {
  it('parabola r = (bt, ct²): ρ = b²/(2c) at the vertex, 22.4 m at t = 2 s for b = 2, c = 1 (bank Q-1.3-general-curve)', () => {
    const p = parabolaPath(2, 1);
    expect(relativeError(curvatureRadius(p, 0), 2)).toBeLessThan(1e-12);
    expect(relativeError(curvatureRadius(p, 2), 20 ** 1.5 / 4)).toBeLessThan(1e-12);
    expect(relativeError(curvatureRadius(p, 2), 22.4)).toBeLessThan(0.002);
  });
  it('ellipse: ρ = B²/A at the ends of the major axis and A²/B at the ends of the minor axis', () => {
    const A = 5;
    const B = 3;
    const w = 0.5;
    const p = ellipsePath(A, B, w);
    expect(relativeError(curvatureRadius(p, 0), (B * B) / A)).toBeLessThan(1e-12);
    expect(relativeError(curvatureRadius(p, Math.PI / 2 / w), (A * A) / B)).toBeLessThan(1e-12);
  });
  it('ellipse: v × a = ABω³ at every instant (the parameter sweeps equal areas)', () => {
    const p = ellipsePath(5, 3, 0.5);
    for (const t of sample(p.duration)) expect(relativeError(cross2(p.v(t), p.a(t)), 5 * 3 * 0.5 ** 3)).toBeLessThan(1e-12);
  });
  it('ellipse with A = B is the uniform circle', () => {
    const p = ellipsePath(2, 2, 1.5);
    for (const t of sample(p.duration)) {
      const s = tangentNormal(p.v(t), p.a(t));
      expect(Math.abs(s.aT) / s.aN).toBeLessThan(1e-12);
      expect(relativeError(s.rho, 2)).toBeLessThan(1e-12);
    }
  });
  it('cycloid: at the top of the rim the speed is 2ωR, a⊥ = ω²R, so ρ = 4R, not R', () => {
    const R = 0.35;
    const w = 4;
    const p = cycloidPath(R, w);
    const tTop = Math.PI / w;
    const s = tangentNormal(p.v(tTop), p.a(tTop));
    expect(relativeError(s.speed, 2 * w * R)).toBeLessThan(1e-12);
    expect(relativeError(s.aN, w * w * R)).toBeLessThan(1e-12);
    expect(relativeError(s.rho, 4 * R)).toBeLessThan(1e-12);
  });
  it('a straight line has ρ = ∞, no normal part and no centre of curvature', () => {
    // a straight path speeding up: a is parallel to v
    const straight: CurvePath = { r: (t) => [0.6 * t * t, 0.8 * t * t], v: (t) => [1.2 * t, 1.6 * t], a: () => [1.2, 1.6], duration: 1 };
    const s = tangentNormal(straight.v(0.5), straight.a(0.5));
    expect(s.rho).toBe(Infinity);
    expect(s.aN).toBe(0);
    expect(relativeError(s.aT, 2)).toBeLessThan(1e-12);
    expect(curvatureCentre(straight, 0.5)).toBeNull();
  });
});

describe('consistency: the split rebuilds a, and the analytic derivatives match the paths', () => {
  const paths: [string, CurvePath][] = [
    ['speeding circle', circlePath(3, 0.2, 0.12)],
    ['ellipse', ellipsePath(5, 3, 0.5)],
    ['projectile', projectilePath([-5, -3], [4, 7])],
    ['cycloid', cycloidPath(1, 1)],
  ];
  for (const [name, p] of paths) {
    it(`${name}: a_t T̂ + a⊥ N̂ = a, the two parts are perpendicular, and a⊥ = v²/ρ`, () => {
      for (const t of sample(p.duration * 0.9, 9)) {
        const s = tangentNormal(p.v(t), p.a(t));
        expect(vecErr([s.tangential[0] + s.normal[0], s.tangential[1] + s.normal[1]], p.a(t))).toBeLessThan(1e-12);
        expect(Math.abs(dot(s.tangential, s.normal))).toBeLessThan(1e-9 * len(p.a(t)) ** 2);
        expect(relativeError(s.aN, (s.speed * s.speed) / s.rho)).toBeLessThan(1e-12);
      }
    });
    it(`${name}: v is the derivative of r and a the derivative of v (central differences)`, () => {
      for (const t of sample(p.duration * 0.9, 7)) {
        const sv = Math.max(len(p.v(t)), 1);
        const sa = Math.max(len(p.a(t)), 1);
        expect(len(sub(centralDifference(p.r, t, 1e-4), p.v(t))) / sv).toBeLessThan(1e-6);
        expect(len(sub(centralDifference(p.v, t, 1e-4), p.a(t))) / sa).toBeLessThan(1e-6);
      }
    });
  }
  it('a_t is the rate of change of the speed, d|v|/dt', () => {
    const p = ellipsePath(5, 3, 0.5);
    for (const t of sample(p.duration, 9)) {
      const h = 1e-5;
      const dSpeed = (len(p.v(t + h)) - len(p.v(t - h))) / (2 * h);
      const aT = tangentNormal(p.v(t), p.a(t)).aT;
      expect(Math.abs(dSpeed - aT) / len(p.a(t))).toBeLessThan(1e-6);
    }
  });
});

describe('convergence: Δv/Δt approaches a as Δt → 0', () => {
  const p = circlePath(3, 0.5, 0, 0, [0, 0], 20);
  const t = 1.0;
  const err = (dt: number) => vecErr(averageAcceleration(p, t, dt), p.a(t));
  it('the error of Δv/Δt falls in proportion to Δt (first order)', () => {
    expect(relativeError(err(0.02) / err(0.01), 2)).toBeLessThan(0.05);
    expect(err(1e-4)).toBeLessThan(1e-4);
  });
  it('on a uniform circle |Δv|/Δt = 2v sin(ωΔt/2)/Δt tends to v²/R', () => {
    const v = 1.5;
    const R = 3;
    const w = v / R;
    for (const dt of [1, 0.1, 0.01]) {
      expect(relativeError(chordDeltaV(v, w * dt), len(sub(p.v(t + dt), p.v(t))))).toBeLessThan(1e-12);
    }
    const ratio = (dt: number) => chordDeltaV(v, w * dt) / dt;
    expect(relativeError(ratio(1e-3), (v * v) / R)).toBeLessThan(1e-7);
    // the deficit is (ωΔt)²/24 relative: second order in Δt
    expect(relativeError(1 - ratio(0.2) / ((v * v) / R), (w * 0.2) ** 2 / 24)).toBeLessThan(0.01);
  });
  it('the direction of Δv turns toward the centre as Δt shrinks: its angle to −r̂ goes to 0 like ωΔt/2', () => {
    const toCentre: Vec2 = sub([0, 0], p.r(t));
    for (const dt of [0.4, 0.04]) {
      expect(relativeError(angleBetween(sub(p.v(t + dt), p.v(t)), toCentre), (0.5 * dt) / 2)).toBeLessThan(1e-9);
    }
  });
});

describe('scaling: centripetal acceleration', () => {
  it('doubling ω at the same radius quadruples a⊥; doubling R at the same speed halves it', () => {
    const a = (R: number, w: number) => tangentNormal(circlePath(R, w).v(0.3), circlePath(R, w).a(0.3)).aN;
    expect(relativeError(a(2, 2) / a(2, 1), 4)).toBeLessThan(1e-12);
    expect(relativeError(a(2, 2) / a(4, 1), 2)).toBeLessThan(1e-12);
  });
  it('ρ of a projectile at a given point scales as v₀² (same angle, same shape blown up)', () => {
    const rhoTop = (v0: number) => curvatureRadius(projectilePath([0, 0], [v0 * 0.6, v0 * 0.8]), (v0 * 0.8) / G);
    expect(relativeError(rhoTop(20) / rhoTop(10), 4)).toBeLessThan(1e-12);
  });
});

describe('numbers of circular motion', () => {
  it('3000 rpm is 314 rad/s; at 10 cm that is 9.87·10³ m/s², about 1000 g (bank Q-1.3-centrifuge)', () => {
    const w = omegaFromRpm(3000);
    expect(relativeError(w, 314.16)).toBeLessThan(1e-4);
    expect(relativeError(centripetalFromOmega(w, 0.1), 9870)).toBeLessThan(0.001);
    expect(relativeError(omegaFromFrequency(50), w)).toBeLessThan(1e-12);
  });
  it('the period is 2π/ω, and ω·T is one full turn', () => {
    expect(relativeError(periodOf(0.5) * 0.5, 2 * Math.PI)).toBeLessThan(1e-12);
    expect(relativeError(periodOf(-0.5), periodOf(0.5))).toBeLessThan(1e-12);
  });
});
