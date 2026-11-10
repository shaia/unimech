import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  angleFromRise,
  ballisticPendulum,
  bulletSpeedFromRise,
  bulletThrough,
  collide,
  compare,
  contactForce,
  energyOnlySpeed,
  externalImpulseEstimate,
  freeSpringCompression,
  keptEnergyFraction,
  riseFromAngle,
  stage2,
  stickThenSlide,
  stickThenSpring,
  stuckVelocity,
  type Setup,
} from '~/physics/ballistic';
import { relativeError } from '~/physics/vec';

/** The three scenes of the lesson's figure (src/sims/BallisticPendulum.tsx defaults). */
const PEND: Setup = { scene: 'pendulum', m: 0.012, M: 1.5, v: 300, L: 1.2 };
const FLOOR: Setup = { scene: 'floor', m: 0.012, M: 1.5, v: 300, muk: 0.3 };
const SPRING: Setup = { scene: 'spring', m: 0.5, M: 1.5, v: 4, k: 300 };
const NO_EXT = (s: Setup): Setup => ({ ...s, g: 0, k: s.scene === 'spring' ? 0 : s.k });

describe('analytic limits', () => {
  it('as the collision time Δt → 0 the finite model recovers the staged answer in every scene', () => {
    for (const s of [PEND, FLOOR, SPRING]) {
      const errs = [1e-3, 1e-4, 1e-5].map((dt) => Math.abs(compare(s, dt).error));
      expect(errs[2]).toBeLessThan(1e-4);
      expect(errs[2]).toBeLessThan(errs[1]);
      expect(errs[1]).toBeLessThan(errs[0]);
    }
  });

  it('a target much heavier than the projectile barely moves: h, d and x → 0 as M → ∞', () => {
    const big = 1e6;
    expect(ballisticPendulum(0.01, big, 300).h).toBeLessThan(1e-6);
    expect(stickThenSlide(0.01, big, 300, 0.3).d).toBeLessThan(1e-6);
    expect(stickThenSpring(0.01, big, 300, 300).x).toBeLessThan(1e-2 * 300 * Math.sqrt(0.01 / 300));
  });

  it('a target much lighter than the projectile takes the projectile on unchanged: V → v and K is kept as M → 0', () => {
    expect(relativeError(stuckVelocity(1, 5, 1e-9), 5)).toBeLessThan(1e-8);
    expect(relativeError(keptEnergyFraction(1, 1e-9), 1)).toBeLessThan(1e-8);
    // the pendulum's rise then becomes the projectile's own rise, v²/2g
    expect(relativeError(ballisticPendulum(1, 1e-9, 3).h, 9 / (2 * G))).toBeLessThan(1e-8);
  });

  it('the pendulum is read backwards exactly: v from h inverts h from v', () => {
    const { h } = ballisticPendulum(0.01, 2, 199);
    expect(relativeError(bulletSpeedFromRise(0.01, 2, h), 199)).toBeLessThan(1e-12);
    expect(relativeError(angleFromRise(1.2, riseFromAngle(1.2, 37)), 37)).toBeLessThan(1e-12);
  });

  it('energy conservation across the collision underestimates the bullet speed by √(m/(m + M))', () => {
    const m = 0.01;
    const M = 2;
    expect(relativeError(energyOnlySpeed(m, M, 0.05) / bulletSpeedFromRise(m, M, 0.05), Math.sqrt(m / (m + M)))).toBeLessThan(1e-12);
  });

  it('a bullet that leaves with its entry speed moves nothing; one that is stopped is the ballistic pendulum', () => {
    expect(bulletThrough(0.005, 1, 400, 400).V).toBe(0);
    // vOut equal to the common speed is the stuck case
    const V = stuckVelocity(0.005, 400, 1);
    expect(relativeError(bulletThrough(0.005, 1, 400, V).V, V)).toBeLessThan(1e-12);
  });

  it('a spring between two free carts stores K_rel = ½μv²; against a wall (m₂ → ∞) the whole ½m₁v²', () => {
    const x = freeSpringCompression(2, 3, 1, 600);
    expect(relativeError(0.5 * 600 * x * x, 0.5 * (2 / 3) * 9)).toBeLessThan(1e-12);
    expect(relativeError(freeSpringCompression(2, 3, 1e12, 600), 3 * Math.sqrt(2 / 600))).toBeLessThan(1e-9);
  });
});

describe('conservation', () => {
  it('without external forces the momentum is conserved across the finite collision, whatever Δt', () => {
    for (const s of [PEND, FLOOR, SPRING].map(NO_EXT)) {
      for (const dt of [1e-4, 0.1, 1]) {
        const c = collide(s, dt);
        expect(relativeError(c.pAfter, c.pBefore)).toBeLessThan(1e-10);
        expect(relativeError(c.tLock, dt)).toBeLessThan(1e-8);
      }
    }
  });

  it('with external forces the momentum changes by exactly their impulse: (m + M)V_lock − m v = J_ext', () => {
    for (const s of [PEND, FLOOR, SPRING]) {
      const c = collide(s, 0.05);
      expect(relativeError(c.pAfter - c.pBefore, c.Jext)).toBeLessThan(1e-8);
      expect(c.Jext).toBeLessThan(0);
    }
  });

  it('in stage 2 the pendulum conserves energy: the top is ½V² + gL(1 − cos φ) above the lowest point', () => {
    const L = 1.2;
    const r = stage2({ ...PEND, L }, 0.03, 2);
    expect(relativeError(r.h as number, L * (1 - Math.cos(0.03 / L)) + 4 / (2 * G))).toBeLessThan(1e-12);
  });

  it('in stage 2 the slide turns all the kinetic energy into the work of friction', () => {
    const r = stickThenSlide(0.012, 1.5, 300, 0.3);
    expect(relativeError(r.frictionWork, r.Kafter)).toBeLessThan(1e-12);
    expect(relativeError(r.Kbefore, r.lostInCollision + r.frictionWork)).toBeLessThan(1e-12);
  });

  it('in stage 2 the spring stores the pair kinetic energy: ½kx² = ½(m + M)V²', () => {
    const r = stickThenSpring(0.5, 1.5, 4, 300);
    expect(relativeError(0.5 * 300 * r.x * r.x, r.Kafter)).toBeLessThan(1e-12);
  });

  it('a perfectly inelastic collision keeps the fraction m/(m + M) of the kinetic energy', () => {
    const r = ballisticPendulum(0.012, 1.5, 300);
    expect(relativeError(r.Kafter / r.Kbefore, keptEnergyFraction(0.012, 1.5))).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('a constant external force (friction) spoils the momentum linearly in Δt: J ≈ μk(m + M)g Δt', () => {
    for (const dt of [1e-4, 1e-3]) {
      const c = collide(FLOOR, dt);
      expect(relativeError(-c.Jext, externalImpulseEstimate(FLOOR, dt))).toBeLessThan(5e-3);
    }
  });

  it('a force that grows from zero (the pendulum, the spring) spoils it quadratically: J ≈ F′V Δt²/6', () => {
    for (const s of [PEND, SPRING]) {
      for (const dt of [1e-4, 1e-3]) {
        const c = collide(s, dt);
        expect(relativeError(-c.Jext, externalImpulseEstimate(s, dt))).toBeLessThan(2e-2);
      }
      const j1 = -collide(s, 1e-4).Jext;
      const j2 = -collide(s, 2e-4).Jext;
      expect(relativeError(j2 / j1, 4)).toBeLessThan(1e-2);
    }
  });

  it('the contact force grows as 1/Δt, and its impulse on the target stays m M v/(m + M)', () => {
    expect(relativeError(contactForce(PEND, 1e-4) / contactForce(PEND, 1e-3), 10)).toBeLessThan(1e-12);
    expect(relativeError(contactForce(PEND, 2e-4) * 2e-4, (0.012 * 1.5 * 300) / 1.512)).toBeLessThan(1e-12);
  });

  it('the stopping distance after the collision falls as (m/(m + M))²', () => {
    const d1 = stickThenSlide(0.01, 1, 300, 0.3).d;
    const d2 = stickThenSlide(0.01, 2, 300, 0.3).d;
    expect(relativeError(d1 / d2, (2.01 / 1.01) ** 2)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('stage 1 converges as the RK4 step shrinks (the lock instant and the momentum at the lock)', () => {
    for (const s of [PEND, SPRING]) {
      const ref = collide(s, 0.2, 4000);
      const coarse = collide(s, 0.2, 40);
      const fine = collide(s, 0.2, 400);
      const eC = Math.abs(coarse.VLock - ref.VLock);
      const eF = Math.abs(fine.VLock - ref.VLock);
      expect(eF).toBeLessThan(1e-9);
      expect(eF).toBeLessThanOrEqual(eC);
      expect(relativeError(fine.tLock, ref.tLock)).toBeLessThan(1e-9);
    }
  });

  it('the friction scene is exact at any step (piecewise-constant forces)', () => {
    const a = collide(FLOOR, 0.1, 20);
    const b = collide(FLOOR, 0.1, 2000);
    expect(relativeError(a.VLock, b.VLock)).toBeLessThan(1e-10);
  });

  it('the pendulum rise time tends to the quarter period (π/2)√(L/g) for small swings', () => {
    const L = 1.2;
    const r = stage2({ ...PEND, L }, 0, 1e-4);
    expect(relativeError(r.T2, (Math.PI / 2) * Math.sqrt(L / G))).toBeLessThan(1e-6);
  });
});
