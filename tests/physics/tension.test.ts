import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  atwood,
  blockTrain,
  contactLost,
  dipNormal,
  elevatorNormal,
  hangingExtension,
  hangingRope,
  hangingTensionAtDepth,
  heavySpringExtension,
  humpNormal,
  humpTakeoffSpeed,
  inclinePush,
  parallelK,
  pulledRope,
  ropeOverEdge,
  ropeOverPeg,
  ropeTension,
  seriesK,
  springChainExtension,
  springForce,
  tensionFromDensity,
  whirledRopeTension,
} from '~/physics/tension';
import { relativeError } from '~/physics/vec';

const close = (a: number, b: number, tol = 1e-12) => expect(relativeError(a, b)).toBeLessThan(tol);

describe('analytic limits', () => {
  it('a scale in an elevator reads mg when the elevator does not accelerate, and zero in free fall', () => {
    close(elevatorNormal(60, 0), 60 * G);
    expect(elevatorNormal(60, -G)).toBe(0);
    expect(contactLost(elevatorNormal(60, -G - 1))).toBe(true);
  });

  it('the normal force at the top of a hump tends to mg on a flat road (R → ∞) and vanishes at √(gR)', () => {
    close(humpNormal(1000, 15, 1e12), 1000 * G, 1e-9);
    expect(Math.abs(humpNormal(1000, humpTakeoffSpeed(40), 40))).toBeLessThan(1e-9);
    expect(contactLost(humpNormal(1000, 1.01 * humpTakeoffSpeed(40), 40))).toBe(true);
    close(dipNormal(1000, 0, 40), 1000 * G);
  });

  it('on an incline with no push N = mg cos θ, and on level ground N = mg', () => {
    close(inclinePush(4, 30, 0).N, 4 * G * Math.cos(Math.PI / 6));
    close(inclinePush(4, 0, 0).N, 4 * G);
    close(inclinePush(4, 30, 0).a, -G * Math.sin(Math.PI / 6));
  });

  it('a massless string (m → 0) has the pulling force at every point', () => {
    const r = pulledRope(10, 2, 0, 3);
    for (const s of [0, 1, 2.5, 3]) close(ropeTension(r, s), 10);
  });

  it('a pulled heavy rope: T = F at the pulled end and T = Ma at the block', () => {
    const r = pulledRope(10, 2, 0.5, 3);
    close(ropeTension(r, 3), 10);
    close(ropeTension(r, 0), 2 * r.aEff);
  });

  it('a hanging rope: T = Mg at its bottom, (M + m)g at its top, and zero at a free bottom end', () => {
    const r = hangingRope(1.5, 2, 4);
    close(hangingTensionAtDepth(r, 4), 1.5 * G);
    close(hangingTensionAtDepth(r, 0), 3.5 * G);
    expect(hangingTensionAtDepth(hangingRope(0, 2, 4), 4)).toBe(0);
  });

  it('Atwood: equal masses do not accelerate and T = mg; a vanishing m₁ falls free and T → 0', () => {
    const eq = atwood(3, 3);
    expect(eq.a).toBe(0);
    close(eq.T, 3 * G);
    const light = atwood(1e-9, 3);
    close(light.a, G, 1e-8);
    expect(light.T).toBeLessThan(1e-7);
  });

  it('a heavy spring with no mass of its own stretches mg/k; the chain sum tends to it', () => {
    close(heavySpringExtension(0.5, 0, 50), hangingExtension(0.5, 50));
    close(springChainExtension(0.5, 0, 50, 7), hangingExtension(0.5, 50));
  });

  it('a whirled rope: the tension at the far end is m₂ω²l, and without m₂ it vanishes there', () => {
    close(whirledRopeTension(0.4, 0.2, 1.5, 3, 1.5), 0.2 * 9 * 1.5);
    expect(whirledRopeTension(0.4, 0, 1.5, 3, 1.5)).toBe(0);
  });
});

describe('the second law on every piece (conservation of the balance)', () => {
  it('dT/ds = λ·a_eff along a uniform rope: each piece gets exactly its own mass times the acceleration', () => {
    const r = pulledRope(10, 2, 0.5, 3);
    const lambda = r.m / r.L;
    const h = 1e-4;
    for (const s of [0.3, 1.5, 2.7]) {
      const slope = (ropeTension(r, s + h) - ropeTension(r, s - h)) / (2 * h);
      close(slope, lambda * r.aEff, 1e-8);
    }
  });

  it('the part of a pulled rope in front of a cut gets F − T, which is its mass times a', () => {
    const r = pulledRope(10, 2, 0.5, 3);
    const s = 1.2;
    const front = (r.m * (r.L - s)) / r.L;
    close(10 - ropeTension(r, s), front * r.aEff, 1e-12);
  });

  it('Atwood: each body obeys its own second law with the one tension', () => {
    const { a, T } = atwood(2, 5);
    close(T - 2 * G, 2 * a); // m₁ rises
    close(5 * G - T, 5 * a); // m₂ descends
  });

  it('a block train: each block is pulled forward by the tension ahead minus the one behind, mass times a', () => {
    const masses = [1, 2, 3];
    const { a, T } = blockTrain(24, masses);
    const all = [0, ...T, 24];
    masses.forEach((m, i) => close(all[i + 1] - all[i], m * a));
  });

  it('springs in series carry the same force and their extensions add; in parallel the forces add', () => {
    const k1 = 100;
    const k2 = 300;
    const F = 12;
    close(F / k1 + F / k2, F / seriesK(k1, k2));
    const x = 0.05;
    close(k1 * x + k2 * x, parallelK(k1, k2) * x);
  });

  it('the rope over an edge and over a peg: the hanging part obeys its own second law with the edge tension', () => {
    const e = ropeOverEdge(1.2, 2, 0.5);
    close(1.2 * (0.5 / 2) * G - e.Tedge, 1.2 * (0.5 / 2) * e.a); // the hanging part
    const p = ropeOverPeg(0.6, 1.2, 0.8);
    close(0.6 * (0.8 / 1.2) * G - p.Tpeg, 0.6 * (0.8 / 1.2) * p.a); // the descending side
  });
});

describe('scaling', () => {
  it('Hooke: the force is linear in the extension and opposite to it', () => {
    expect(springForce(200, 0.01)).toBe(-2);
    close(springForce(200, -0.03), 3 * -springForce(200, 0.01));
  });

  it('n identical springs: in series k/n, in parallel nk', () => {
    close(seriesK(80, 80, 80), 80 / 3);
    close(parallelK(80, 80, 80), 240);
  });

  it('the tension of a pulled rope is proportional to F; the take-off speed grows as √R', () => {
    const r1 = pulledRope(10, 2, 0.5, 3);
    const r2 = pulledRope(30, 2, 0.5, 3);
    close(ropeTension(r2, 1.7), 3 * ropeTension(r1, 1.7));
    close(humpTakeoffSpeed(160), 2 * humpTakeoffSpeed(40));
  });

  it('the elevator normal force is linear in g + a, and the hanging extension in the load', () => {
    close(elevatorNormal(60, 2) - elevatorNormal(60, 0), 60 * 2);
    close(hangingExtension(1, 250), 2 * hangingExtension(0.5, 250));
  });

  it('the maximum tension of a rope over an edge is mg/4, at x = L/2', () => {
    const m = 1.2;
    const L = 2;
    let best = 0;
    for (let i = 1; i < 400; i++) best = Math.max(best, ropeOverEdge(m, L, (L * i) / 400).Tedge);
    close(best, (m * G) / 4, 1e-12);
  });
});

describe('convergence', () => {
  it('the tension from a sinusoidal density, by the midpoint rule, converges to the closed form at second order', () => {
    // MIT 8.012 (2008) Exam 1 problem 3: λ(z) = λ₀ sin(πz/L), T at z below the mount = (Mg/2)(1 + cos(πz/L)).
    const M = 3;
    const L = 2;
    const lam0 = (Math.PI * M) / (2 * L);
    // s is measured from the free (bottom) end: the depth z = L − s, and λ(s) = λ₀ sin(π(L − s)/L) = λ₀ sin(πs/L)
    const lambda = (s: number) => lam0 * Math.sin((Math.PI * s) / L);
    const z = 0.7;
    const exact = ((M * G) / 2) * (1 + Math.cos((Math.PI * z) / L));
    const e1 = relativeError(tensionFromDensity(lambda, 0, G, L - z, 20), exact);
    const e2 = relativeError(tensionFromDensity(lambda, 0, G, L - z, 40), exact);
    expect(e2).toBeLessThan(e1);
    expect(e1 / e2).toBeGreaterThan(3.6); // ≈ 4: second order
    expect(relativeError(tensionFromDensity(lambda, 0, G, L - z, 2000), exact)).toBeLessThan(1e-6);
  });

  it('a linear density is integrated exactly by the midpoint rule', () => {
    const lambda = (s: number) => 0.4 * (1 + s / 5);
    // T at height y above the free end: g·λ₀(y + y²/(2L))
    close(tensionFromDensity(lambda, 0, G, 3, 3), G * 0.4 * (3 + 9 / 10), 1e-12);
  });

  it('the chain of n small springs converges to (M + m/2)g/k at first order', () => {
    const exact = heavySpringExtension(0.5, 0.2, 50);
    const e1 = relativeError(springChainExtension(0.5, 0.2, 50, 50), exact);
    const e2 = relativeError(springChainExtension(0.5, 0.2, 50, 100), exact);
    expect(e1 / e2).toBeGreaterThan(1.9);
    expect(e1 / e2).toBeLessThan(2.1);
    expect(relativeError(springChainExtension(0.5, 0.2, 50, 1e5), exact)).toBeLessThan(1e-5);
  });
});
