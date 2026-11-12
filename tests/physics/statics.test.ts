import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  armFoot,
  beamTipPosition,
  ladderMaxClimb,
  ladderMinAngle,
  leverArm,
  netForce,
  netTorque,
  pushedCrate,
  roughWallMinAngle,
  roughWallThresholdForces,
  shiftTorque,
  solveBeam,
  solveLadder,
  tipHeight,
  torqueAbout,
  type Ladder,
  type PointForce,
} from '~/physics/statics';
import { relativeError, type Vec2 } from '~/physics/vec';

const deg = (d: number) => (d * Math.PI) / 180;
/** points scattered over and around the scenes, including points off the body */
const POINTS: Vec2[] = [
  [0, 0],
  [3, 4],
  [-2, 7],
  [10, -3],
  [1.234, 0.567],
];
const LADDER: Ladder = { L: 5, M: 15, m: 75, s: 2, theta: deg(65), mu: 0.3 };

describe('balance: ΣF = 0 and Στ = 0 about every point', () => {
  it('a ladder in equilibrium has zero net force and zero net torque about every point, on it or off it', () => {
    for (const s of [0, 1.3, 2.5, 5]) {
      const sol = solveLadder({ ...LADDER, s });
      const F = netForce(sol.forces);
      const scale = sol.N1;
      expect(Math.hypot(F[0], F[1]) / scale).toBeLessThan(1e-12);
      for (const P of [...POINTS, sol.A, sol.B, sol.C, sol.Q]) expect(Math.abs(netTorque(sol.forces, P)) / (scale * LADDER.L)).toBeLessThan(1e-12);
    }
  });

  it('a beam on two supports has zero net force and zero net torque about every point', () => {
    const sol = solveBeam({ L: 4, M: 30, a: 0.5, b: 2.5, loads: [{ id: 'box', m: 40, x: 1.5 }] });
    const F = netForce(sol.forces);
    expect(Math.abs(F[1]) / sol.N1).toBeLessThan(1e-12);
    for (const P of POINTS) expect(Math.abs(netTorque(sol.forces, P)) / (70 * G * 4)).toBeLessThan(1e-12);
  });

  it('a couple has zero net force and the same torque Fd about every point', () => {
    const couple: PointForce[] = [
      { id: 'a', at: [0, 0], F: [0, -10] },
      { id: 'b', at: [2, 0], F: [0, 10] },
    ];
    for (const P of POINTS) expect(relativeError(netTorque(couple, P), 20)).toBeLessThan(1e-12);
  });

  it('the change-of-point identity τ_B = τ_A + (r_A − r_B) × ΣF holds for forces that do not balance', () => {
    const fs: PointForce[] = [
      { id: 'a', at: [1, 2], F: [3, -1] },
      { id: 'b', at: [-0.5, 0.7], F: [-0.4, 2.2] },
      { id: 'c', at: [2.5, -1], F: [1.1, 0.3] },
    ];
    const A: Vec2 = [0.3, -0.8];
    for (const B of POINTS) expect(relativeError(shiftTorque(netTorque(fs, A), A, B, netForce(fs)), netTorque(fs, B))).toBeLessThan(1e-12);
  });

  it('the lever arm is the distance from the point to the line of action: |τ| = |F| d, and the arm is perpendicular to F', () => {
    const f: PointForce = { id: 'x', at: [1, 1], F: [3, 4] };
    const P: Vec2 = [-2, 3];
    const foot = armFoot(f, P);
    const d = leverArm(f, P);
    expect(relativeError(Math.hypot(foot[0] - P[0], foot[1] - P[1]), d)).toBeLessThan(1e-12);
    expect(Math.abs((foot[0] - P[0]) * 3 + (foot[1] - P[1]) * 4)).toBeLessThan(1e-12);
    expect(relativeError(Math.abs(torqueAbout(f, P)), 5 * d)).toBeLessThan(1e-12);
    // moving the force along its own line changes neither the arm nor the torque
    const moved: PointForce = { ...f, at: [1 + 0.3 * 3, 1 + 0.3 * 4] };
    expect(relativeError(torqueAbout(moved, P), torqueAbout(f, P))).toBeLessThan(1e-12);
  });
});

describe('analytic limits', () => {
  it('a bare ladder against a smooth wall slips below tan θ = 1/(2μ_s): 51.3° for μ_s = 0.40', () => {
    const th = ladderMinAngle(10, 0, 0, 0.4);
    expect(relativeError(Math.tan(th), 1 / 0.8)).toBeLessThan(1e-12);
    expect(relativeError((th * 180) / Math.PI, 51.34)).toBeLessThan(1e-3);
  });

  it('with a rough wall the threshold of a bare ladder is tan θ = (1 − μ_s μ_w)/(2μ_s), and μ_w → 0 returns the smooth wall', () => {
    expect(relativeError(Math.tan(roughWallMinAngle(10, 0, 0, 0.5, 0.3)), (1 - 0.15) / 1)).toBeLessThan(1e-12);
    expect(relativeError(roughWallMinAngle(10, 70, 0.6, 0.35, 1e-12), ladderMinAngle(10, 70, 0.6, 0.35))).toBeLessThan(1e-9);
  });

  it('at the rough-wall threshold the forces balance and the torque about the foot vanishes', () => {
    const M = 12;
    const m = 0;
    const mu1 = 0.5;
    const mu2 = 0.3;
    const th = roughWallMinAngle(M, m, 0, mu1, mu2);
    const W = (M + m) * G;
    const { N1, f, N2, fw } = roughWallThresholdForces(W, mu1, mu2);
    expect(Math.abs(N1 + fw - W) / W).toBeLessThan(1e-12);
    expect(Math.abs(f - N2) / W).toBeLessThan(1e-12);
    const L = 4;
    const tauFoot = -N2 * L * Math.sin(th) - fw * L * Math.cos(th) + M * G * (L / 2) * Math.cos(th);
    expect(Math.abs(tauFoot) / (W * L)).toBeLessThan(1e-12);
  });

  it('with a person on a rough-wall ladder, at roughWallMinAngle both frictions are at their maximum and the torque about the foot vanishes', () => {
    const M = 10;
    const m = 60;
    const sFrac = 0.75;
    const L = 4;
    const mu1 = 0.4;
    const mu2 = 0.2;
    const th = roughWallMinAngle(M, m, sFrac, mu1, mu2);
    const W = (M + m) * G;
    const { N1, f, N2, fw } = roughWallThresholdForces(W, mu1, mu2);
    expect(Math.abs(N1 + fw - W) / W).toBeLessThan(1e-12);
    expect(Math.abs(f - N2) / W).toBeLessThan(1e-12);
    const tauFoot = -N2 * L * Math.sin(th) - fw * L * Math.cos(th) + G * Math.cos(th) * (M * (L / 2) + m * sFrac * L);
    expect(Math.abs(tauFoot) / (W * L)).toBeLessThan(1e-12);
  });

  it('a person standing at the foot adds no torque about the foot: the needed friction is the empty ladder’s', () => {
    const a = solveLadder({ ...LADDER, s: 0 });
    const b = solveLadder({ ...LADDER, m: 0, s: 0 });
    expect(relativeError(a.f, b.f)).toBeLessThan(1e-12);
    expect(a.N1).toBeGreaterThan(b.N1);
  });

  it('a nearly vertical ladder needs almost no friction, and the needed friction grows as the person climbs', () => {
    expect(solveLadder({ ...LADDER, theta: deg(89.999) }).f / (90 * G)).toBeLessThan(1e-4);
    let last = -1;
    for (let s = 0; s <= 5; s += 0.5) {
      const f = solveLadder({ ...LADDER, s }).f;
      expect(f).toBeGreaterThan(last);
      last = f;
    }
  });

  it('a beam with a symmetric load shares it equally; a support under the centre carries it all', () => {
    const sym = solveBeam({ L: 4, M: 30, a: 1, b: 3, loads: [{ id: 'box', m: 20, x: 2 }] });
    expect(relativeError(sym.N1, sym.N2)).toBeLessThan(1e-12);
    const under = solveBeam({ L: 4, M: 30, a: 0, b: 2, loads: [] });
    expect(Math.abs(under.N1) / (30 * G)).toBeLessThan(1e-12);
    expect(relativeError(under.N2, 30 * G)).toBeLessThan(1e-12);
  });

  it('the bank’s overhanging beam: N₂ = 661.5 N, N₁ = 24.5 N, and N₁ = 0 for a 25 kg box', () => {
    const sol = solveBeam({ L: 6, M: 50, a: 0, b: 4, loads: [{ id: 'box', m: 20, x: 6 }] });
    expect(relativeError(sol.N2, 661.5)).toBeLessThan(1e-12);
    expect(relativeError(sol.N1, 24.5)).toBeLessThan(1e-12);
    expect(Math.abs(solveBeam({ L: 6, M: 50, a: 0, b: 4, loads: [{ id: 'box', m: 25, x: 6 }] }).N1)).toBeLessThan(1e-9);
  });

  it('a beam tips about the support beyond which the load sits once that load passes beamTipPosition', () => {
    const beam = { L: 4, M: 30, a: 0.5, b: 2.5 };
    const xt = beamTipPosition(beam, 40);
    expect(solveBeam({ ...beam, loads: [{ id: 'box', m: 40, x: xt - 0.01 }] }).tips).toBe('none');
    expect(solveBeam({ ...beam, loads: [{ id: 'box', m: 40, x: xt + 0.01 }] }).tips).toBe('left');
    expect(Math.abs(solveBeam({ ...beam, loads: [{ id: 'box', m: 40, x: xt }] }).N1)).toBeLessThan(1e-9);
  });

  it('a crate pushed at h = w/(2μ_s) tips and slides at the same push', () => {
    const w = 0.6;
    const mu = 0.4;
    const c = pushedCrate(20, w, tipHeight(w, mu), 1, mu);
    expect(relativeError(c.tipF, c.slideF)).toBeLessThan(1e-12);
    expect(pushedCrate(20, w, 1.2 * tipHeight(w, mu), 1, mu).first).toBe('tip');
    expect(pushedCrate(20, w, 0.8 * tipHeight(w, mu), 1, mu).first).toBe('slide');
  });
});

describe('scaling', () => {
  it('the threshold angle does not depend on g, on L, or on the masses’ scale', () => {
    const base = ladderMinAngle(15, 75, 0.8, 0.3);
    expect(relativeError(ladderMinAngle(30, 150, 0.8, 0.3), base)).toBeLessThan(1e-12);
    const a = solveLadder({ ...LADDER, theta: base, s: 4 });
    const b = solveLadder({ ...LADDER, L: 10, s: 8, theta: base, g: 1.6 });
    expect(relativeError(a.f / a.fMax, 1)).toBeLessThan(1e-12);
    expect(relativeError(b.f / b.fMax, 1)).toBeLessThan(1e-12);
  });

  it('every force on the ladder is proportional to g and to the masses together', () => {
    const a = solveLadder(LADDER);
    const b = solveLadder({ ...LADDER, M: 2 * LADDER.M, m: 2 * LADDER.m, g: 3 * G });
    for (const k of ['N1', 'f', 'N2'] as const) expect(relativeError(b[k], 6 * a[k])).toBeLessThan(1e-12);
  });

  it('ladderMaxClimb and ladderMinAngle are inverse: at θ_min for s/L the person can climb exactly to s/L', () => {
    for (const frac of [0.2, 0.5, 0.9]) {
      const th = ladderMinAngle(15, 75, frac, 0.3);
      expect(relativeError(ladderMaxClimb(15, 75, th, 0.3), frac)).toBeLessThan(1e-12);
    }
  });
});

describe('convergence', () => {
  it('bisection on "f needed = μ_s N₁" converges to the closed-form threshold angle', () => {
    let lo = deg(1);
    let hi = deg(89);
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (solveLadder({ ...LADDER, s: 4, theta: mid }).slips) lo = mid;
      else hi = mid;
    }
    expect(relativeError(hi, ladderMinAngle(15, 75, 0.8, 0.3))).toBeLessThan(1e-12);
  });
});
