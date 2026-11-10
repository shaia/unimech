import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  angularMomentum,
  centerOfMass,
  cmKineticEnergy,
  cross,
  dumbbellInertia,
  dumbbellState,
  externalTorque,
  externalTorqueAboutCM,
  fieldEnergy,
  flightTime,
  integrate,
  internalTorque,
  internalTorqueAbout,
  kineticEnergy,
  momentum,
  orbitalAngularMomentum,
  reducedMass,
  relativeKineticEnergy,
  rigidState,
  rk4,
  spinAngularMomentum,
  springEnergy,
  type Launch,
  type Rigid,
  type State,
  type System,
} from '~/physics/systemangular';
import { relativeError, sub, type Vec2 } from '~/physics/vec';

/** A deterministic pseudo-random generator (mulberry32), so a failing case can be reproduced. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomCase(r: () => number): { sys: System; s: State; O: Vec2 } {
  const u = () => 4 * r() - 2;
  const sys: System = { m1: 0.1 + 2 * r(), m2: 0.1 + 2 * r(), g: G, k: 50 * r(), d0: 0.2 + r(), shear: u() };
  const s: State = { r1: [u(), u()], v1: [u(), u()], r2: [u(), u()], v2: [u(), u()] };
  return { sys, s, O: [u(), u()] };
}

/** The figure's dumbbell: 0.30 kg and 0.15 kg on a 0.80 m rod. */
const ROD: Rigid = { m1: 0.3, m2: 0.15, d: 0.8, g: G };
const THROW: Launch = { R0: [0, 0], V0: [2.5, 2.5 * Math.sqrt(3)], theta0: 0.3, omega0: 12 };

describe('analytic identities (exact for every state)', () => {
  it('König for angular momentum: L_O = (R − O) × MV + L_rel, for 200 random states and points', () => {
    const r = rng(1);
    for (let i = 0; i < 200; i++) {
      const { sys, s, O } = randomCase(r);
      const L = angularMomentum(sys, s, O);
      const split = orbitalAngularMomentum(sys, s, O) + spinAngularMomentum(sys, s);
      expect(Math.abs(L - split)).toBeLessThan(1e-12 * (1 + Math.abs(L)));
    }
  });

  it('König for kinetic energy: K = ½MV² + K_rel, for 200 random states', () => {
    const r = rng(2);
    for (let i = 0; i < 200; i++) {
      const { sys, s } = randomCase(r);
      expect(relativeError(kineticEnergy(sys, s), cmKineticEnergy(sys, s) + relativeKineticEnergy(sys, s))).toBeLessThan(1e-13);
    }
  });

  it('the angular momentum about the CM does not depend on the point O; L_O changes by (O − O′) × P between two points', () => {
    const r = rng(3);
    for (let i = 0; i < 100; i++) {
      const { sys, s, O } = randomCase(r);
      const O2: Vec2 = [O[0] + 1.7, O[1] - 0.6];
      const dL = angularMomentum(sys, s, O2) - angularMomentum(sys, s, O);
      expect(Math.abs(dL - cross(sub(O, O2), momentum(sys, s)))).toBeLessThan(1e-12 * (1 + Math.abs(dL)));
    }
  });

  it('for two particles the relative parts are those of one particle of mass μ: L_rel = μ r₁₂ × v₁₂, K_rel = ½μ v₁₂²', () => {
    const r = rng(4);
    for (let i = 0; i < 100; i++) {
      const { sys, s } = randomCase(r);
      const mu = reducedMass(sys.m1, sys.m2);
      const rr = sub(s.r1, s.r2);
      const vv = sub(s.v1, s.v2);
      expect(relativeError(spinAngularMomentum(sys, s), mu * cross(rr, vv))).toBeLessThan(1e-11);
      expect(relativeError(relativeKineticEnergy(sys, s), 0.5 * mu * (vv[0] ** 2 + vv[1] ** 2))).toBeLessThan(1e-12);
    }
  });

  it('an internal pair that is equal and opposite has the same torque about every point, (r₁ − r₂) × F₁₂', () => {
    const r = rng(5);
    for (let i = 0; i < 100; i++) {
      const { sys, s, O } = randomCase(r);
      expect(Math.abs(internalTorqueAbout(sys, s, O) - internalTorque(sys, s))).toBeLessThan(1e-12 * (1 + Math.abs(internalTorque(sys, s))));
    }
  });

  it('a central pair (along the line of the particles) has zero torque; the hypothetical non-central pair has torque shear·|r₁₂|', () => {
    const r = rng(6);
    for (let i = 0; i < 100; i++) {
      const { sys, s } = randomCase(r);
      expect(Math.abs(internalTorque({ ...sys, shear: 0 }, s))).toBeLessThan(1e-12);
      const d = Math.hypot(s.r1[0] - s.r2[0], s.r1[1] - s.r2[1]);
      expect(relativeError(internalTorque({ ...sys, k: 0 }, s), (sys.shear ?? 0) * d)).toBeLessThan(1e-12);
    }
  });

  it('a uniform field has no torque about the CM, and about O its torque is that of the whole weight at the CM, (R − O) × Mg', () => {
    const r = rng(7);
    for (let i = 0; i < 100; i++) {
      const { sys, s, O } = randomCase(r);
      const { R, M } = centerOfMass(sys, s);
      expect(Math.abs(externalTorqueAboutCM(sys, s))).toBeLessThan(1e-12);
      expect(relativeError(externalTorque(sys, s, O), cross(sub(R, O), [0, -M * sys.g]))).toBeLessThan(1e-12);
    }
  });
});

describe('analytic limits', () => {
  it('a rigid dumbbell has L_rel = Iω and K_rel = ½Iω² with I = μd²; equal masses give I = md²/2', () => {
    const s = dumbbellState(ROD.m1, ROD.m2, ROD.d, [1, 2], [3, -1], 0.7, 12);
    const sys: System = { m1: ROD.m1, m2: ROD.m2, g: G };
    const I = dumbbellInertia(ROD.m1, ROD.m2, ROD.d);
    expect(relativeError(I, 0.1 * 0.64)).toBeLessThan(1e-14);
    expect(relativeError(spinAngularMomentum(sys, s), I * 12)).toBeLessThan(1e-13);
    expect(relativeError(relativeKineticEnergy(sys, s), 0.5 * I * 144)).toBeLessThan(1e-13);
    expect(relativeError(dumbbellInertia(0.5, 0.5, 0.4), 0.5 * 0.4 * 0.4 / 2)).toBeLessThan(1e-14);
  });

  it('as one mass grows without bound, μ → the other mass and the CM goes to the heavy one (I → m₁d²)', () => {
    expect(relativeError(dumbbellInertia(0.3, 3e8, 0.8), 0.3 * 0.64)).toBeLessThan(1e-8);
    const s = dumbbellState(0.3, 3e8, 0.8, [0, 0], [0, 0], 0, 1);
    expect(Math.hypot(...s.r2)).toBeLessThan(1e-8);
  });

  it('the CM of the thrown dumbbell flies the projectile parabola and lands after 2V₀ᵧ/g, its spin unchanged', () => {
    const T = flightTime(THROW.V0, G);
    const s = rigidState(ROD, THROW, T);
    const sys: System = { m1: ROD.m1, m2: ROD.m2, g: G };
    const { R } = centerOfMass(sys, s);
    expect(Math.abs(R[1])).toBeLessThan(1e-12);
    expect(relativeError(R[0], 2.5 * T)).toBeLessThan(1e-14);
    expect(relativeError(spinAngularMomentum(sys, s), spinAngularMomentum(sys, rigidState(ROD, THROW, 0)))).toBeLessThan(1e-13);
  });

  it('about the launch point the CM part is L = −½MgVₓt², and its rate is the weight’s torque −MgX', () => {
    const sys: System = { m1: ROD.m1, m2: ROD.m2, g: G };
    const M = ROD.m1 + ROD.m2;
    for (const t of [0.2, 0.5, 0.8]) {
      const s = rigidState(ROD, THROW, t);
      expect(relativeError(orbitalAngularMomentum(sys, s, [0, 0]), -0.5 * M * G * 2.5 * t * t)).toBeLessThan(1e-12);
      expect(relativeError(externalTorque(sys, s, [0, 0]), -M * G * 2.5 * t)).toBeLessThan(1e-12);
    }
  });

  it('with no field the total angular momentum about any fixed point is constant (spring, RK4)', () => {
    const sys: System = { m1: 0.3, m2: 0.15, g: 0, k: 60, d0: 0.8 };
    const s0 = dumbbellState(0.3, 0.15, 0.8, [0, 0], [2, 1], 0, 12);
    const states = integrate(sys, s0, 1, 50, 20);
    for (const O of [[0, 0], [3, -2]] as Vec2[]) {
      const L0 = angularMomentum(sys, s0, O);
      for (const s of states) expect(relativeError(angularMomentum(sys, s, O), L0)).toBeLessThan(1e-9);
    }
  });
});

describe('conservation', () => {
  const SPRING: System = { m1: 0.3, m2: 0.15, g: G, k: 60, d0: 0.8 };
  const S0 = dumbbellState(0.3, 0.15, 0.8, [0, 0], [2.5, 2.5 * Math.sqrt(3)], 0.3, 12);

  it('with a central internal force in a uniform field, the angular momentum about the CM stays constant', () => {
    const states = integrate(SPRING, S0, 0.9, 90, 20);
    const L0 = spinAngularMomentum(SPRING, S0);
    for (const s of states) expect(relativeError(spinAngularMomentum(SPRING, s), L0)).toBeLessThan(1e-9);
  });

  it('…while ω and K_rel do change: the spring stretches, ω drops, and K_rel trades with the spring energy', () => {
    const states = integrate(SPRING, S0, 0.9, 90, 20);
    const dist = (s: State) => Math.hypot(s.r1[0] - s.r2[0], s.r1[1] - s.r2[1]);
    expect(Math.max(...states.map(dist))).toBeGreaterThan(0.9);
    const Krel = states.map((s) => relativeKineticEnergy(SPRING, s));
    expect(Math.min(...Krel)).toBeLessThan(0.9 * Krel[0]);
    const E = (s: State) => kineticEnergy(SPRING, s) + springEnergy(SPRING, s) + fieldEnergy(SPRING, s);
    for (const s of states) expect(relativeError(E(s), E(S0))).toBeLessThan(1e-9);
  });

  it('the total angular momentum about a fixed point changes only by the external torque: ΔL_O = −Mg[(X₀ − Oₓ)t + ½Vₓt²]', () => {
    const O: Vec2 = [1.2, -0.4];
    const M = 0.45;
    const t1 = 0.9;
    const states = integrate(SPRING, S0, t1, 90, 20);
    states.forEach((s, i) => {
      const t = (i * t1) / 90;
      const expected = angularMomentum(SPRING, S0, O) - M * G * ((0 - O[0]) * t + 0.5 * 2.5 * t * t);
      expect(Math.abs(angularMomentum(SPRING, s, O) - expected)).toBeLessThan(1e-9);
    });
  });

  it('a non-central internal pair leaves the momentum alone (the CM still flies its parabola) but spins the system: ΔL_rel = ∫ shear·|r₁₂| dt', () => {
    const sys: System = { ...SPRING, shear: 1.0 };
    const t1 = 0.8;
    const n = 400;
    const states = integrate(sys, S0, t1, n, 4);
    const { R } = centerOfMass(sys, states[n]);
    expect(relativeError(R[0], 2.5 * t1)).toBeLessThan(1e-10);
    expect(Math.abs(R[1] - (2.5 * Math.sqrt(3) * t1 - 0.5 * G * t1 * t1))).toBeLessThan(1e-10);
    // Simpson on the samples of the torque
    const h = t1 / n;
    let I = 0;
    states.forEach((s, i) => {
      const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      I += w * internalTorque(sys, s);
    });
    I *= h / 3;
    expect(relativeError(spinAngularMomentum(sys, states[n]) - spinAngularMomentum(sys, S0), I)).toBeLessThan(1e-6);
  });

  it('the rigid dumbbell under the non-central pair: ω grows at α = shear/(μd), and the RK4 spring tends to it as k grows', () => {
    const rigid: Rigid = { ...ROD, shear: 1.0 };
    const t1 = 0.6;
    const L = (s: State) => spinAngularMomentum({ m1: ROD.m1, m2: ROD.m2, g: G }, s);
    const I = dumbbellInertia(ROD.m1, ROD.m2, ROD.d);
    expect(relativeError(L(rigidState(rigid, THROW, t1)), I * (12 + (1.0 / (0.1 * 0.8)) * t1))).toBeLessThan(1e-13);
    // a stiff spring with the same pair, launched with the spring at its natural length
    const s0 = rigidState(rigid, THROW, 0);
    const errs = [2e3, 2e4].map((k) => {
      const st = integrate({ m1: ROD.m1, m2: ROD.m2, g: G, k, d0: ROD.d, shear: 1.0 }, s0, t1, 60, 200)[60];
      return relativeError(L(st), L(rigidState(rigid, THROW, t1)));
    });
    expect(errs[1]).toBeLessThan(errs[0]);
    expect(errs[1]).toBeLessThan(0.01);
  });
});

describe('scaling', () => {
  it('L_rel ∝ ω and ∝ d², K_rel ∝ ω² (rigid dumbbell)', () => {
    const sys: System = { m1: 0.3, m2: 0.15, g: G };
    const at = (d: number, w: number) => dumbbellState(0.3, 0.15, d, [0, 0], [1, 1], 0.2, w);
    expect(relativeError(spinAngularMomentum(sys, at(0.8, 24)), 2 * spinAngularMomentum(sys, at(0.8, 12)))).toBeLessThan(1e-13);
    expect(relativeError(spinAngularMomentum(sys, at(1.6, 12)), 4 * spinAngularMomentum(sys, at(0.8, 12)))).toBeLessThan(1e-13);
    expect(relativeError(relativeKineticEnergy(sys, at(0.8, 24)), 4 * relativeKineticEnergy(sys, at(0.8, 12)))).toBeLessThan(1e-13);
  });

  it('a central spring pulling two spinning particles to half their distance (RK4): L_rel unchanged, the line turns at ω ∝ 1/d², ω × 4 and K_rel × 4 at the inner turning point', () => {
    // Equal masses (μ = 0.10 kg) start 1.0 m apart with ḋ = 0, the line turning at 3 rad/s, so L_rel = μd²ω = 0.30.
    // A spring of natural length 0 and k = 4L_rel²/μ makes ½L_rel²/(μd²) + ½kd² equal at d = 1.0 and d = 0.5:
    // the spring pulls them in to half their distance and lets them out again.
    const mu = 0.1;
    const L0 = mu * 1.0 * 1.0 * 3;
    const sys: System = { m1: 0.2, m2: 0.2, g: 0, k: (4 * L0 * L0) / mu, d0: 0 };
    const s0 = dumbbellState(0.2, 0.2, 1.0, [0.4, -0.3], [0.5, 0.2], 0, 3);
    const tEnd = 0.6;
    const n = 6000;
    const h = tEnd / n;
    const states = integrate(sys, s0, tEnd, n, 4);
    const line = (s: State) => sub(s.r1, s.r2);
    const d = states.map((s) => Math.hypot(...line(s)));
    // the angular momentum about the CM is conserved by the dynamics
    for (const s of states) expect(relativeError(spinAngularMomentum(sys, s), L0)).toBeLessThan(1e-9);
    // ω measured from the turning of the line alone (central differences of its angle), not from L_rel
    for (let i = 1; i < n; i += 50) {
      const a = line(states[i - 1]);
      const b = line(states[i + 1]);
      const omega = Math.atan2(cross(a, b), a[0] * b[0] + a[1] * b[1]) / (2 * h);
      expect(relativeError(omega * d[i] ** 2, 3 * 1.0 ** 2)).toBeLessThan(1e-5);
    }
    // the inner turning point: half the distance, four times the rate, four times K_rel
    const iMin = d.indexOf(Math.min(...d));
    expect(iMin).toBeGreaterThan(0);
    expect(iMin).toBeLessThan(n);
    expect(relativeError(d[iMin], 0.5)).toBeLessThan(1e-6);
    const a = line(states[iMin - 1]);
    const b = line(states[iMin + 1]);
    const omegaMin = Math.atan2(cross(a, b), a[0] * b[0] + a[1] * b[1]) / (2 * h);
    expect(relativeError(omegaMin, 12)).toBeLessThan(1e-5);
    expect(relativeError(relativeKineticEnergy(sys, states[iMin]), 4 * relativeKineticEnergy(sys, s0))).toBeLessThan(1e-6);
  });
});

describe('convergence', () => {
  it('RK4 on the spring dumbbell converges at fourth order: halving dt cuts the error about 16 times', () => {
    const sys: System = { m1: 0.3, m2: 0.15, g: G, k: 60, d0: 0.8, shear: 0.5 };
    const s0 = dumbbellState(0.3, 0.15, 0.8, [0, 0], [2.5, 4], 0.3, 12);
    const t1 = 0.5;
    const run = (n: number) => {
      let s = s0;
      for (let i = 0; i < n; i++) s = rk4(sys, s, t1 / n);
      return s;
    };
    const ref = run(20000);
    const err = (n: number) => Math.hypot(run(n).r1[0] - ref.r1[0], run(n).r1[1] - ref.r1[1]);
    const ratio = err(50) / err(100);
    expect(ratio).toBeGreaterThan(12);
    expect(ratio).toBeLessThan(20);
  });
});
