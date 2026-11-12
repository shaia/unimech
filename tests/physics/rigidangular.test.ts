import { describe, expect, it } from 'vitest';
import { hitPivoted, ring, rodCentre, rodEnd, spinChange, stickToFreeRod } from '~/physics/rigidbody';
import {
  couple,
  coupleState,
  keFromL,
  pointAtRest,
  pullWork,
  pullWorkByIntegral,
  strike,
  strikeHeat,
  strikeState,
  turntableInertia,
  type Strike,
} from '~/physics/rigidangular';
import { relativeError } from '~/physics/vec';

const rod = (over: Partial<Strike>): Strike => ({ m: 0.3, v: 4, M: 1.5, L: 1.2, s: 1.2, mount: 'pivot', e: 0, ...over });

describe('analytic limits', () => {
  it('a particle that sticks to a pinned rod gives the shared model’s ω = m v s/(I_P + m s²), and so does an elastic one', () => {
    for (const s of [0.3, 0.8, 1.2]) {
      const stick = strike(rod({ s }));
      const ref = hitPivoted(0.3, 4, s, rodEnd(1.5, 1.2), false);
      expect(relativeError(stick.omega, ref.omega)).toBeLessThan(1e-13);
      expect(relativeError(stick.vAfter, ref.vAfter)).toBeLessThan(1e-13);
      const el = strike(rod({ s, e: 1 }));
      const refEl = hitPivoted(0.3, 4, s, rodEnd(1.5, 1.2), true);
      expect(relativeError(el.omega, refEl.omega)).toBeLessThan(1e-13);
      expect(relativeError(el.vAfter, refEl.vAfter)).toBeLessThan(1e-13);
    }
  });

  it('a particle that sticks to a free rod gives the shared model’s ω (about the CM of rod + particle)', () => {
    for (const s of [0, 0.2, 0.9, 1.2]) {
      const r = strike(rod({ s, mount: 'free' }));
      const ref = stickToFreeRod(0.3, 4, 1.5, 1.2, s - 0.6);
      expect(relativeError(r.omega, ref.omega)).toBeLessThan(1e-12);
      // the CM of the whole moves at m v/(m + M)
      const Vcm = (1.5 * r.u + 0.3 * r.vAfter) / 1.8;
      expect(relativeError(Vcm, ref.Vcm)).toBeLessThan(1e-13);
    }
  });

  it('a free rod spins as if pinned at its centre with the reduced mass μ = mM/(m + M) in place of m', () => {
    const m = 0.3;
    const M = 1.5;
    const mu = (m * M) / (m + M);
    const b = 0.6;
    const r = strike(rod({ mount: 'free', s: 1.2 }));
    expect(relativeError(r.omega, (mu * 4 * b) / (rodCentre(M, 1.2) + mu * b * b))).toBeLessThan(1e-13);
  });

  it('a light particle (m ≪ M) on the end of a free rod spins it twice as fast as on a rod pinned at the far end', () => {
    const light = { m: 1e-6, s: 1.2 };
    const ratio = strike(rod({ ...light, mount: 'free' })).omega / strike(rod({ ...light, mount: 'pivot' })).omega;
    expect(relativeError(ratio, 2)).toBeLessThan(1e-5);
  });

  it('a hit through the centre of a free rod only slides it; a hit at the pin of a pinned rod bounces the particle back as from a wall', () => {
    const centre = strike(rod({ mount: 'free', s: 0.6 }));
    expect(centre.omega).toBe(0);
    const wall = strike(rod({ s: 0, e: 1 }));
    expect(wall.omega).toBe(0);
    expect(relativeError(wall.vAfter, -4)).toBeLessThan(1e-14);
  });

  it('the pin gives no impulse when the hit lands at 2ℓ/3 below it, for any particle, sticking or elastic', () => {
    for (const m of [0.1, 0.3, 1.2]) {
      for (const e of [0, 1]) {
        const r = strike(rod({ m, e, s: 0.8 }));
        expect(Math.abs(r.pivotImpulse)).toBeLessThan(1e-13);
      }
    }
    expect(strike(rod({ s: 1.2 })).pivotImpulse).toBeGreaterThan(0); // farther than 2ℓ/3 the pin pushes along the hit
    expect(strike(rod({ s: 0.4 })).pivotImpulse).toBeLessThan(0); // nearer, it pushes against it
  });

  it('just after a hit at the end of a free rod the point at rest lies inside the rod, and the far end moves backwards', () => {
    const S = rod({ mount: 'free', s: 1.2, m: 1e-6 });
    const r = strike(S);
    // m ≪ M: the point at rest is 2ℓ/3 from the struck end, ℓ/3 below the top end
    expect(relativeError(pointAtRest(S, r) ?? NaN, 0.4)).toBeLessThan(1e-5);
    const farEnd = r.u - r.omega * (S.L / 2);
    expect(farEnd).toBeLessThan(0);
  });
});

describe('conservation', () => {
  it('pulling the masses in keeps L = Iω and agrees with the shared spinChange', () => {
    const I1 = turntableInertia(0.5, 1, 0.45);
    const I2 = turntableInertia(0.5, 1, 0.1);
    const w2 = spinChange(I1, 2, I2);
    expect(relativeError(I2 * w2, I1 * 2)).toBeLessThan(1e-14);
  });

  it('the work of the pull is the gain in kinetic energy L²/(2I)', () => {
    const L = turntableInertia(0.5, 1, 0.45) * 2;
    const I1 = turntableInertia(0.5, 1, 0.45);
    const I2 = turntableInertia(0.5, 1, 0.1);
    expect(relativeError(pullWork(L, I1, I2), keFromL(L, I2) - keFromL(L, I1))).toBeLessThan(1e-14);
    expect(pullWork(L, I1, I2)).toBeGreaterThan(0);
    expect(pullWork(L, I2, I1)).toBeLessThan(0); // letting the masses out: the strings do negative work
  });

  it('a ring dropped on the platform keeps L and turns kinetic energy into heat ½ I₁I₂/(I₁ + I₂) ω²', () => {
    const I1 = turntableInertia(0.5, 1, 0.45);
    const I2 = ring(2, 0.48);
    const c = couple(I1, 2, I2, 0);
    expect(relativeError(c.omegaF * (I1 + I2), I1 * 2)).toBeLessThan(1e-14);
    expect(relativeError(c.heat, (0.5 * I1 * I2 * 4) / (I1 + I2))).toBeLessThan(1e-13);
  });

  it('while the ring slips, the total angular momentum stays I₁ω₁ at every instant, and the slip ends at ω_f', () => {
    const I1 = turntableInertia(0.5, 1, 0.45);
    const I2 = ring(2, 0.48);
    const c = couple(I1, 2, I2, 0);
    const end = coupleState(I1, 2, I2, 0, 0.6, 100);
    for (const t of [0, 0.3, 0.7, end.tSlip, 5]) {
      const st = coupleState(I1, 2, I2, 0, 0.6, t);
      expect(relativeError(I1 * st.omega1 + I2 * st.omega2, c.L)).toBeLessThan(1e-13);
    }
    expect(relativeError(end.omega1, c.omegaF)).toBeLessThan(1e-13);
    expect(relativeError(end.omega2, c.omegaF)).toBeLessThan(1e-13);
  });

  it('a pinned rod keeps the angular momentum about the pin but not the momentum; a free rod keeps both', () => {
    for (const e of [0, 0.5, 1]) {
      for (const s of [0.2, 0.7, 1.2]) {
        const p = strike(rod({ e, s }));
        expect(relativeError(p.L1, p.L0)).toBeLessThan(1e-13);
        expect(relativeError(p.p1 - p.p0, p.pivotImpulse)).toBeLessThan(1e-13);
        const f = strike(rod({ e, s, mount: 'free' }));
        expect(Math.abs(f.L1 - f.L0)).toBeLessThan(1e-13);
        expect(relativeError(f.p1, f.p0)).toBeLessThan(1e-13);
      }
    }
  });

  it('an elastic hit keeps the kinetic energy; a sticking one loses ½ v²/(1/m + k)', () => {
    for (const mount of ['pivot', 'free'] as const) {
      const el = strike(rod({ mount, e: 1, s: 1.0 }));
      expect(relativeError(el.K1, el.K0)).toBeLessThan(1e-13);
      const S = rod({ mount, e: 0, s: 1.0 });
      const st = strike(S);
      expect(relativeError(st.K0 - st.K1, strikeHeat(S))).toBeLessThan(1e-13);
    }
  });

  it('a stuck particle rides with the rod: its velocity just after is the velocity of the hit point', () => {
    for (const mount of ['pivot', 'free'] as const) {
      const S = rod({ mount, s: 0.9 });
      const r = strike(S);
      const dt = 1e-6;
      const a = strikeState(S, r, 0);
      const b = strikeState(S, r, dt);
      expect(relativeError((b.particle[0] - a.particle[0]) / dt, r.vAfter)).toBeLessThan(1e-5);
    }
  });
});

describe('scaling', () => {
  it('ω, J and the after-velocities grow in proportion to the particle’s speed', () => {
    const a = strike(rod({ v: 4, mount: 'free', s: 1.0, e: 1 }));
    const b = strike(rod({ v: 8, mount: 'free', s: 1.0, e: 1 }));
    expect(relativeError(b.omega, 2 * a.omega)).toBeLessThan(1e-14);
    expect(relativeError(b.J, 2 * a.J)).toBeLessThan(1e-14);
    expect(relativeError(b.vAfter, 2 * a.vAfter)).toBeLessThan(1e-14);
  });

  it('an elastic hit gives the rod twice the impulse of a sticking one', () => {
    for (const mount of ['pivot', 'free'] as const) {
      const st = strike(rod({ mount, s: 1.1 }));
      const el = strike(rod({ mount, s: 1.1, e: 1 }));
      expect(relativeError(el.J, 2 * st.J)).toBeLessThan(1e-14);
    }
  });

  it('at fixed L the kinetic energy scales as 1/I: halving I doubles K', () => {
    expect(relativeError(keFromL(3, 0.4), 2 * keFromL(3, 0.8))).toBeLessThan(1e-14);
  });
});

describe('convergence', () => {
  it('the integral of the pull, ∫ n m ω² r (−dr), converges on L²/2 (1/I₂ − 1/I₁) at second order', () => {
    const I0 = 0.5;
    const L = turntableInertia(I0, 1, 0.45) * 2;
    const exact = pullWork(L, turntableInertia(I0, 1, 0.45), turntableInertia(I0, 1, 0.1));
    const e1 = relativeError(pullWorkByIntegral(I0, 1, 2, L, 0.45, 0.1, 50), exact);
    const e2 = relativeError(pullWorkByIntegral(I0, 1, 2, L, 0.45, 0.1, 100), exact);
    expect(e2).toBeLessThan(1e-4);
    expect(e1 / e2).toBeGreaterThan(3.5);
    expect(e1 / e2).toBeLessThan(4.5);
  });
});
