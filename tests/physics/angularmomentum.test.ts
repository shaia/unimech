import { describe, expect, it } from 'vitest';
import {
  angularMomentum,
  angularMomentumZ,
  arealVelocity,
  circularSpeed,
  cross2,
  footOfPerpendicular,
  freePosition,
  integrate,
  inverseSquareForce,
  leverArm,
  orbitEnergy,
  pulledPuck,
  pulledStringForce,
  springForce,
  sweptArea,
  torque,
  torqueZ,
  triangleArea,
  type Sample,
} from '~/physics/angularmomentum';
import { G } from '~/physics/constants';
import { gravity, type Body } from '~/physics/motion';
import { len, relativeError, sub, type Vec2, type Vec3 } from '~/physics/vec';

const xy = (v: Vec3): Vec2 => [v[0], v[1]];
const Lz = (s: Sample, m: number, about: Vec2 = [0, 0]) => angularMomentumZ(xy(s.pos), xy(s.vel), m, about);
const maxDrift = (path: Sample[], m: number, about: Vec2 = [0, 0]) => {
  const L0 = Lz(path[0], m, about);
  return Math.max(...path.map((s) => relativeError(Lz(s, m, about), L0)));
};

/** The spring orbit of figure 3.7ב: m = 0.50 kg, k = 2.0 N/m, from (1.0, 0) m at (0, 1.0) m/s. */
const SPRING: Body = { m: 0.5, pos: [1, 0, 0], vel: [0, 1, 0] };
const K_SPRING = 2;
/** An inverse-square orbit: m = 0.50 kg, k = 0.50 N·m², from (1.0, 0) m at (0, 0.70) m/s (an ellipse). */
const KEPLER: Body = { m: 0.5, pos: [1, 0, 0], vel: [0, 0.7, 0] };
const K_INV = 0.5;

describe('analytic limits', () => {
  it('the planar formula L_z = m(x v_y − y v_x) is the z-component of r × p, and τ_z of r × F', () => {
    const pos: Vec3 = [0.7, -1.3, 0];
    const vel: Vec3 = [2.1, 0.4, 0];
    const O: Vec3 = [0.2, 0.5, 0];
    const L = angularMomentum(pos, vel, 1.7, O);
    expect(Math.abs(L[0])).toBe(0);
    expect(Math.abs(L[1])).toBe(0);
    expect(relativeError(L[2], angularMomentumZ([0.7, -1.3], [2.1, 0.4], 1.7, [0.2, 0.5]))).toBeLessThan(1e-15);
    const F: Vec3 = [-3, 5, 0];
    expect(relativeError(torque(pos, F, O)[2], torqueZ([0.7, -1.3], [-3, 5], [0.2, 0.5]))).toBeLessThan(1e-15);
  });

  it('|L| = p·d: the angular momentum is the momentum times its lever arm about O', () => {
    const pos: Vec2 = [-1.5, -0.2];
    const vel: Vec2 = [0.8, 0.3];
    const m = 0.4;
    for (const O of [[0, 0], [0.4, 1.1], [-2, 3]] as Vec2[]) {
      const d = leverArm(pos, vel, O);
      expect(relativeError(Math.abs(angularMomentumZ(pos, vel, m, O)), m * len(vel) * d)).toBeLessThan(1e-14);
      // the foot of the perpendicular lies on the line and is d from O
      const f = footOfPerpendicular(pos, vel, O);
      expect(Math.abs(cross2(sub(f, pos), vel))).toBeLessThan(1e-14);
      expect(relativeError(len(sub(f, O)), d)).toBeLessThan(1e-12);
    }
  });

  it('about a point on the line of motion the angular momentum is zero', () => {
    const pos: Vec2 = [-6, 2];
    const vel: Vec2 = [12, 5];
    expect(angularMomentumZ(pos, vel, 0.16, freePosition(pos, vel, 1))).toBe(0);
  });

  it('the areal velocity is L/(2m): the area swept along an orbit equals (L/2m)·t', () => {
    const path = integrate(SPRING, springForce(K_SPRING), 1.3, 1e-3);
    const A = sweptArea(path.map((s) => xy(s.pos)));
    const L = Lz(path[0], SPRING.m);
    expect(relativeError(A, arealVelocity(L, SPRING.m) * 1.3)).toBeLessThan(1e-6);
    // and over a whole period of the spring orbit, the area of the ellipse π a b (a = 1.0 m, b = v₀/ω = 0.5 m)
    const T = 2 * Math.PI * Math.sqrt(SPRING.m / K_SPRING);
    const full = integrate(SPRING, springForce(K_SPRING), T, 1e-3);
    expect(relativeError(sweptArea(full.map((s) => xy(s.pos))), Math.PI * 1 * 0.5)).toBeLessThan(1e-6);
  });

  it('a puck on a string pulled through a hole keeps r·v_θ: v_θ ∝ 1/r and θ̇ ∝ 1/r²', () => {
    const puck = pulledPuck(0.3, 0.6, 0.8, 0.05);
    for (const t of [0, 3, 6, 9]) {
      const r = puck.r(t);
      expect(relativeError(r * puck.vTheta(r), 0.6 * 0.8)).toBeLessThan(1e-14);
      // L about the hole from the Cartesian position and velocity
      expect(relativeError(angularMomentumZ(puck.position(t), puck.velocity(t), 0.3), puck.L)).toBeLessThan(1e-12);
    }
    expect(relativeError(puck.vTheta(0.3), 2 * 0.8)).toBeLessThan(1e-14);
  });

  it('the pulled-string tension L²/(m r³) integrated with RK4 gives a constant radial speed, r = r₀ − u t', () => {
    const m = 0.3;
    const r0 = 0.6;
    const v0 = 0.8;
    const u = 0.05;
    const puck = pulledPuck(m, r0, v0, u);
    const path = integrate({ m, pos: [r0, 0, 0], vel: [-u, v0, 0] }, pulledStringForce(puck.L, m), 9, 5e-4);
    for (const s of path.filter((_, i) => i % 2000 === 0)) {
      expect(relativeError(len(xy(s.pos)), puck.r(s.t))).toBeLessThan(1e-8);
      // the polar angle, compared modulo 2π
      expect(Math.abs(wrap(Math.atan2(s.pos[1], s.pos[0]) - puck.theta(s.t)))).toBeLessThan(1e-7);
    }
  });

  it('the work the string does while pulling the puck in equals the gain in kinetic energy', () => {
    const m = 0.3;
    const puck = pulledPuck(m, 0.6, 0.8, 0.05);
    // ∫ T dr from r₁ to r₀ with T = L²/(m r³), by the trapezoid rule
    const r1 = 0.15;
    const n = 20000;
    let W = 0;
    for (let i = 0; i < n; i++) {
      const a = r1 + ((0.6 - r1) * i) / n;
      const b = r1 + ((0.6 - r1) * (i + 1)) / n;
      W += 0.5 * (b - a) * (puck.L ** 2 / (m * a ** 3) + puck.L ** 2 / (m * b ** 3));
    }
    expect(relativeError(W, puck.kinetic(r1) - puck.kinetic(0.6))).toBeLessThan(1e-7);
  });
});

const wrap = (th: number) => Math.atan2(Math.sin(th), Math.cos(th));

describe('conservation', () => {
  it('a free particle has a constant angular momentum about every fixed point', () => {
    const pos0: Vec2 = [-1.5, -0.2];
    const vel: Vec2 = [0.8, 0.3];
    for (const O of [[0, 0], [1, 1], [-3, 0.5], [0.4, -2]] as Vec2[]) {
      const L0 = angularMomentumZ(pos0, vel, 0.4, O);
      for (const t of [0.5, 2, 4.7]) {
        expect(relativeError(angularMomentumZ(freePosition(pos0, vel, t), vel, 0.4, O), L0)).toBeLessThan(1e-13);
      }
    }
  });

  it('a free particle sweeps equal areas about any point in equal times', () => {
    const pos0: Vec2 = [-1.5, -0.2];
    const vel: Vec2 = [0.8, 0.3];
    const O: Vec2 = [0.3, 0.9];
    const areas = [0, 1, 2, 3].map((i) => triangleArea(O, freePosition(pos0, vel, i), freePosition(pos0, vel, i + 1)));
    for (const A of areas) expect(relativeError(A, areas[0])).toBeLessThan(1e-13);
    expect(relativeError(areas[0], arealVelocity(angularMomentumZ(pos0, vel, 1, O), 1))).toBeLessThan(1e-13);
  });

  it('under a central force the angular momentum about the centre is conserved (spring and inverse square)', () => {
    expect(maxDrift(integrate(SPRING, springForce(K_SPRING), 10, 1e-3), SPRING.m)).toBeLessThan(1e-9);
    expect(maxDrift(integrate(KEPLER, inverseSquareForce(K_INV), 10, 1e-3), KEPLER.m)).toBeLessThan(1e-8);
  });

  it('under a central force the motion stays in the plane through the centre perpendicular to L', () => {
    // start out of the x–y plane: r₀ and v₀ span a tilted plane
    const body: Body = { m: 0.5, pos: [1, 0, 0.4], vel: [0, 0.6, 0.3] };
    const L0 = angularMomentum(body.pos, body.vel, body.m);
    for (const F of [springForce(K_SPRING), inverseSquareForce(K_INV)]) {
      const path = integrate(body, F, 8, 1e-3);
      for (const s of path) {
        const along = (s.pos[0] * L0[0] + s.pos[1] * L0[1] + s.pos[2] * L0[2]) / Math.hypot(...L0);
        expect(Math.abs(along)).toBeLessThan(1e-9);
      }
    }
  });

  it('about a point that is not the centre the angular momentum is not conserved', () => {
    const path = integrate(SPRING, springForce(K_SPRING), 3, 1e-3);
    expect(maxDrift(path, SPRING.m, [0.6, -0.8])).toBeGreaterThan(0.3);
  });

  it('a circular orbit at the circular speed keeps its radius (spring and inverse square)', () => {
    for (const [law, F, k] of [['spring', springForce(K_SPRING), K_SPRING], ['inverse-square', inverseSquareForce(K_INV), K_INV]] as const) {
      const v = circularSpeed(law, k, 0.5, 0.8);
      const path = integrate({ m: 0.5, pos: [0.8, 0, 0], vel: [0, v, 0] }, F, 5, 1e-3);
      for (const s of path) expect(relativeError(len(xy(s.pos)), 0.8)).toBeLessThan(1e-8);
      expect(relativeError(orbitEnergy(law, k, 0.5, path.at(-1)!.pos, path.at(-1)!.vel), orbitEnergy(law, k, 0.5, path[0].pos, path[0].vel))).toBeLessThan(1e-9);
    }
  });
});

describe('consistency: dL/dt = τ', () => {
  it('about a point that is not the centre, the numerical dL_O/dt equals τ_O = (C − O) × F', () => {
    const O: Vec2 = [0.6, -0.8];
    for (const [body, F] of [[SPRING, springForce(K_SPRING)], [KEPLER, inverseSquareForce(K_INV)]] as const) {
      const dt = 1e-4;
      const path = integrate(body, F, 2, dt);
      for (const i of [3000, 9000, 15000]) {
        const dL = (Lz(path[i + 1], body.m, O) - Lz(path[i - 1], body.m, O)) / (2 * dt);
        const f = F(path[i].pos, path[i].vel, path[i].t);
        const tau = torqueZ(xy(path[i].pos), xy(f), O);
        expect(relativeError(dL, tau)).toBeLessThan(1e-6);
        // the same torque, as the force applied at the centre: (C − O) × F
        expect(relativeError(tau, cross2(sub([0, 0], O), xy(f)))).toBeLessThan(1e-12);
      }
    }
  });

  it('a projectile: L_z about the launch point is −½ m g v_x t², and its rate is the torque of gravity, −m g x', () => {
    const m = 0.4;
    const v0: Vec3 = [12 * Math.cos((50 * Math.PI) / 180), 12 * Math.sin((50 * Math.PI) / 180), 0];
    const path = integrate({ m, pos: [0, 0, 0], vel: v0 }, gravity(m, G), 1.5, 1e-3);
    for (const s of path.filter((_, i) => i % 250 === 0 && i > 0)) {
      expect(relativeError(Lz(s, m), -0.5 * m * G * v0[0] * s.t ** 2)).toBeLessThan(1e-10);
      expect(relativeError(torqueZ(xy(s.pos), [0, -m * G]), -m * G * s.pos[0])).toBeLessThan(1e-14);
    }
  });
});

describe('scaling', () => {
  it('L is proportional to the mass and to the speed; moving O by Δ changes L by −Δ × p', () => {
    const pos: Vec2 = [0.7, 0.2];
    const vel: Vec2 = [-0.3, 1.1];
    const L1 = angularMomentumZ(pos, vel, 1, [0.1, -0.4]);
    expect(relativeError(angularMomentumZ(pos, vel, 3, [0.1, -0.4]), 3 * L1)).toBeLessThan(1e-14);
    expect(relativeError(angularMomentumZ(pos, [vel[0] * 2, vel[1] * 2], 1, [0.1, -0.4]), 2 * L1)).toBeLessThan(1e-14);
    const L0 = angularMomentumZ(pos, vel, 1);
    // L_O' = L_O + (O − O') × p, with O at the origin and O' = (0.1, −0.4)
    expect(relativeError(L1, L0 + cross2([-0.1, 0.4], vel))).toBeLessThan(1e-14);
  });
});

describe('convergence', () => {
  it('RK4: halving the step cuts the drift of L about the centre of an eccentric orbit by about 2⁴', () => {
    const T = 8;
    const e1 = maxDrift(integrate(KEPLER, inverseSquareForce(K_INV), T, 0.02), KEPLER.m);
    const e2 = maxDrift(integrate(KEPLER, inverseSquareForce(K_INV), T, 0.01), KEPLER.m);
    expect(e1).toBeGreaterThan(1e-9);
    const ratio = e1 / e2;
    expect(ratio).toBeGreaterThan(10);
    expect(ratio).toBeLessThan(40);
  });
});
