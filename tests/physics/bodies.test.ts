import { describe, expect, it } from 'vitest';
import {
  bookScene,
  contactScene,
  externalForces,
  freeBody,
  horseScene,
  internalForces,
  netForce,
  partnerOf,
  pulleyScene,
  solveLinear,
  stackScene,
  type Scene,
} from '~/physics/bodies';
import { G } from '~/physics/constants';
import { relativeError } from '~/physics/vec';

const EXACT = 1e-9;
const close = (a: number, b: number) => expect(relativeError(a, b)).toBeLessThan(EXACT);
const tiny = (x: number, scale: number) => expect(Math.abs(x)).toBeLessThan(EXACT * scale);
const accel = (s: Scene, id: string) => s.bodies.find((b) => b.id === id)!.a;
const forceOn = (s: Scene, on: string, by: string, kind: string) => s.forces.find((f) => f.id === `${on}<${by}:${kind}`)!;

const SCENES: [string, Scene][] = [
  ['book at rest', bookScene({ mBook: 1.0, mTable: 10, aUp: 0 })],
  ['book in an elevator', bookScene({ mBook: 1.0, mTable: 10, aUp: 2.0 })],
  ['two blocks pushed from the left', contactScene({ masses: [3, 1], F: 12, side: 'left' })],
  ['three blocks pushed from the right', contactScene({ masses: [3, 2, 1], F: 12, side: 'right' })],
  ['a stack pulled by the bottom', stackScene({ mA: 1, mB: 3, F: 8, on: 'B' })],
  ['a stack pulled by the top', stackScene({ mA: 2, mB: 6, F: 12, on: 'A' })],
  ['a table and a hanging weight', pulleyScene({ M: 4, m: 1 })],
  ['a horse and a cart', horseScene({ mHorse: 500, mCart: 300, Fground: 1200, fRoad: 400 })],
];

describe('the third law, in every scene', () => {
  it.each(SCENES)('%s: every force has a partner equal and opposite, on the agent that exerts it', (_, s) => {
    for (const f of s.forces) {
      const q = partnerOf(s, f.id);
      expect(q.on).toBe(f.by);
      expect(q.by).toBe(f.on);
      expect(q.kind).toBe(f.kind);
      tiny(q.vec[0] + f.vec[0], 1e3);
      tiny(q.vec[1] + f.vec[1], 1e3);
    }
  });

  it.each(SCENES)('%s: no free-body diagram holds both forces of a pair', (_, s) => {
    for (const b of s.bodies) {
      const ids = new Set(freeBody(s, b.id).map((f) => f.id));
      for (const f of freeBody(s, b.id)) expect(ids.has(f.pair)).toBe(false);
    }
  });

  it.each(SCENES)('%s: on every diagram each force has a named agent, and the body never acts on itself', (_, s) => {
    for (const b of s.bodies) for (const f of freeBody(s, b.id)) expect(f.by).not.toBe(b.id);
  });
});

describe('conservation: the second law and the internal forces', () => {
  it.each(SCENES)('%s: the net force on every body equals m·a', (_, s) => {
    for (const b of s.bodies) {
      const F = netForce(s, b.id);
      tiny(F[0] - b.m * b.a[0], 1e3);
      tiny(F[1] - b.m * b.a[1], 1e3);
    }
  });

  it.each(SCENES)('%s: the forces the bodies exert on one another add to zero, so Σ external = Σ m·a', (_, s) => {
    const internal = internalForces(s).reduce((acc, f) => [acc[0] + f.vec[0], acc[1] + f.vec[1]], [0, 0]);
    tiny(internal[0], 1e3);
    tiny(internal[1], 1e3);
    const ext = externalForces(s).reduce((acc, f) => [acc[0] + f.vec[0], acc[1] + f.vec[1]], [0, 0]);
    const ma = s.bodies.reduce((acc, b) => [acc[0] + b.m * b.a[0], acc[1] + b.m * b.a[1]], [0, 0]);
    tiny(ext[0] - ma[0], 1e3);
    tiny(ext[1] - ma[1], 1e3);
  });
});

describe('analytic limits', () => {
  it('Gaussian elimination solves a system that needs a row swap', () => {
    const x = solveLinear(
      [
        [0, 2, 1],
        [1, 1, 1],
        [3, 0, -1],
      ],
      [5, 6, 0],
    );
    // the first pivot is zero; the solution is (1.4, 0.4, 4.2): check by substitution
    close(x[0], 1.4);
    close(2 * x[1] + x[2], 5);
    close(x[0] + x[1] + x[2], 6);
    tiny(3 * x[0] - x[2], 1);
  });

  it('a singular system is refused, not answered', () => {
    expect(() =>
      solveLinear(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toThrow();
  });

  it('two blocks pushed from the left: a = F/(m₁+m₂), P = m₂F/(m₁+m₂) = 3 N for 3 kg + 1 kg and 12 N', () => {
    const s = contactScene({ masses: [3, 1], F: 12, side: 'left' });
    close(accel(s, 'b1')[0], 3);
    close(forceOn(s, 'b2', 'b1', 'contact').vec[0], 3);
  });

  it('pushed from the other side the push between the blocks becomes m₁F/(m₁+m₂) = 9 N', () => {
    const s = contactScene({ masses: [3, 1], F: 12, side: 'right' });
    close(accel(s, 'b1')[0], -3);
    close(forceOn(s, 'b1', 'b2', 'contact').vec[0], -9);
  });

  it('the book: N₁ = m(g + a) and the floor N₂ = (m + M)(g + a); at rest N₁ = mg', () => {
    const rest = bookScene({ mBook: 1, mTable: 10, aUp: 0 });
    close(forceOn(rest, 'book', 'table', 'normal').vec[1], G);
    const up = bookScene({ mBook: 1, mTable: 10, aUp: 2 });
    close(forceOn(up, 'book', 'table', 'normal').vec[1], G + 2);
    close(forceOn(up, 'table', 'floor', 'normal').vec[1], 11 * (G + 2));
  });

  it('an elevator in free fall (aUp = −g): every normal force vanishes', () => {
    const s = bookScene({ mBook: 1, mTable: 10, aUp: -G });
    tiny(forceOn(s, 'book', 'table', 'normal').vec[1], 10);
    tiny(forceOn(s, 'table', 'floor', 'normal').vec[1], 100);
  });

  it('the table and the hanging weight: a = mg/(M+m), T = Mmg/(M+m) < mg', () => {
    const s = pulleyScene({ M: 3, m: 1 });
    close(accel(s, 'block')[0], G / 4);
    close(forceOn(s, 'block', 'rope', 'tension').vec[0], (3 * G) / 4);
    expect(forceOn(s, 'weight', 'rope', 'tension').vec[1]).toBeLessThan(G);
  });

  it('a very heavy block on the table holds the weight almost at rest: T → mg, a → 0', () => {
    const s = pulleyScene({ M: 1e9, m: 1 });
    close(forceOn(s, 'weight', 'rope', 'tension').vec[1], G * (1 - 1e-9));
    expect(accel(s, 'block')[0]).toBeLessThan(1e-8);
  });

  it('a massless block on the table lets the weight fall freely: T → 0, a → g', () => {
    const s = pulleyScene({ M: 1e-9, m: 1 });
    expect(forceOn(s, 'block', 'rope', 'tension').vec[0]).toBeLessThan(1e-7);
    close(accel(s, 'weight')[1], -G * (1 - 1e-9));
  });

  it('the stack pulled by B: A is pushed forward by the friction f = m_A a; pulled by A, B is', () => {
    const byB = stackScene({ mA: 1, mB: 3, F: 8, on: 'B' });
    close(accel(byB, 'A')[0], 2);
    close(forceOn(byB, 'A', 'B', 'friction').vec[0], 2);
    close(byB.muNeeded!, 2 / (1 * G));
    const byA = stackScene({ mA: 2, mB: 6, F: 12, on: 'A' });
    close(accel(byA, 'B')[0], 1.5);
    close(forceOn(byA, 'B', 'A', 'friction').vec[0], 9);
    close(forceOn(byA, 'A', 'B', 'friction').vec[0], -9);
  });

  it('the horse and the cart: a = (F − f)/(m₁+m₂), T = m₂a + f; at a = 0 the harness carries just f', () => {
    const s = horseScene({ mHorse: 500, mCart: 300, Fground: 1200, fRoad: 400 });
    close(accel(s, 'horse')[0], 1);
    close(forceOn(s, 'cart', 'horse', 'tension').vec[0], 700);
    const steady = horseScene({ mHorse: 500, mCart: 300, Fground: 400, fRoad: 400 });
    tiny(accel(steady, 'cart')[0], 1);
    close(forceOn(steady, 'cart', 'horse', 'tension').vec[0], 400);
  });
});

describe('scaling', () => {
  it('every force between the blocks grows in proportion to the push F', () => {
    const s1 = contactScene({ masses: [3, 2, 1], F: 6, side: 'left' });
    const s2 = contactScene({ masses: [3, 2, 1], F: 18, side: 'left' });
    for (const f of internalForces(s1)) close(s2.forces.find((x) => x.id === f.id)!.vec[0], 3 * f.vec[0]);
  });

  it('in a pushed row the push between two blocks is (mass ahead of the cut)·a, from either side', () => {
    const masses = [3, 2, 1];
    for (const side of ['left', 'right'] as const) {
      const s = contactScene({ masses, F: 12, side });
      const a = Math.abs(accel(s, 'b1')[0]);
      close(a, 2);
      const P = Math.abs(forceOn(s, 'b2', 'b1', 'contact').vec[0]);
      const Q = Math.abs(forceOn(s, 'b3', 'b2', 'contact').vec[0]);
      if (side === 'left') {
        close(P, (2 + 1) * a);
        close(Q, 1 * a);
      } else {
        close(P, 3 * a);
        close(Q, (3 + 2) * a);
      }
    }
  });

  it('a row of n equal blocks carries F·(n − k)/n across the k-th cut: the linear tension of a uniform rope', () => {
    for (const n of [2, 5, 20, 100]) {
      const s = contactScene({ masses: new Array(n).fill(1), F: 10, side: 'left' });
      for (let k = 1; k < n; k++) close(forceOn(s, `b${k + 1}`, `b${k}`, 'contact').vec[0], (10 * (n - k)) / n);
    }
  });

  it('the acceleration does not depend on which side is pushed, only on the total mass', () => {
    const L = contactScene({ masses: [5, 1, 2], F: 16, side: 'left' });
    const R = contactScene({ masses: [5, 1, 2], F: 16, side: 'right' });
    close(accel(L, 'b2')[0], 2);
    close(accel(R, 'b2')[0], -2);
  });
});
