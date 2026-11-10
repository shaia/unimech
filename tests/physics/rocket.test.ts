import { describe, expect, it } from 'vitest';
import { G } from '~/physics/constants';
import {
  apexHeight,
  beltPower,
  blindLeakVelocity,
  burnTime,
  burnout,
  coastingCart,
  grainOnBelt,
  gravityLoss,
  height,
  integrateBurn,
  liftoffMass,
  liftoffTime,
  massRatioFor,
  padForce,
  parcelMomentum,
  parcelRocket,
  rk4MassStep,
  sandForce,
  thrust,
  tsiolkovsky,
  variableMassAcceleration,
  velocity,
  type MassState,
  type Rocket,
} from '~/physics/rocket';
import { relativeError } from '~/physics/vec';

/** The figure's default rocket: u = 2000 m/s, 10 000 → 2000 kg at 100 kg/s. */
const FIG: Rocket = { m0: 10000, m1: 2000, u: 2000, rate: 100 };
const LAUNCH: Rocket = { ...FIG, g: G };

describe('analytic limits', () => {
  it('in free space the speed at burn-out is Tsiolkovsky’s u ln(m₀/m₁), and the rocket lifts off at once', () => {
    expect(liftoffTime(FIG)).toBe(0);
    expect(relativeError(burnout(FIG).v, 2000 * Math.log(5))).toBeLessThan(1e-14);
    expect(relativeError(velocity(FIG, 40), tsiolkovsky(2000, 10000, 6000))).toBeLessThan(1e-14);
  });

  it('as g → 0 the vertical launch tends to Tsiolkovsky, with a loss g t_b that vanishes linearly', () => {
    for (const g of [1e-2, 1e-5, 1e-8]) {
      const r: Rocket = { ...FIG, g };
      expect(relativeError(burnout(r).v, tsiolkovsky(FIG.u, FIG.m0, FIG.m1))).toBeLessThan(2 * (g * burnTime(r)) / burnout(FIG).v);
      expect(relativeError(gravityLoss(r), g * burnTime(r))).toBeLessThan(1e-12);
    }
  });

  it('as the burn rate → ∞ in gravity, the speed at burn-out approaches the free-space Δv (the loss g t_b → 0)', () => {
    const free = tsiolkovsky(FIG.u, FIG.m0, FIG.m1);
    let prev = Infinity;
    for (const rate of [1e2, 1e3, 1e4, 1e7]) {
      const r: Rocket = { ...LAUNCH, rate };
      const gap = free - burnout(r).v;
      expect(relativeError(gap, (G * (FIG.m0 - FIG.m1)) / rate)).toBeLessThan(1e-9);
      expect(gap).toBeLessThan(prev);
      prev = gap;
    }
    expect(prev / free).toBeLessThan(1e-5);
  });

  it('a short burn (Δm ≪ m₀) gives the one-push result Δv ≈ u Δm/m₀, with a relative correction ½ Δm/m₀', () => {
    for (const x of [1e-2, 1e-4]) {
      const dv = tsiolkovsky(3000, 1, 1 - x);
      expect(relativeError(dv, 3000 * x)).toBeLessThan(0.51 * x);
      expect(relativeError(dv, 3000 * x)).toBeGreaterThan(0.49 * x);
    }
  });

  it('just after lift-off the rocket climbs as ½ (uμ/m₀ − g) t², the initial net force over the initial mass', () => {
    const a0 = thrust(LAUNCH) / LAUNCH.m0 - G;
    for (const t of [1e-3, 1e-1]) {
      expect(relativeError(height(LAUNCH, t), 0.5 * a0 * t * t)).toBeLessThan(0.02 * t);
      expect(relativeError(velocity(LAUNCH, t), a0 * t)).toBeLessThan(0.02 * t);
    }
  });

  it('a mass ratio of e gives Δv = u: the rocket can go faster than its own exhaust', () => {
    expect(relativeError(tsiolkovsky(2000, Math.E, 1), 2000)).toBeLessThan(1e-15);
    expect(relativeError(massRatioFor(2000 * Math.log(5), 2000), 5)).toBeLessThan(1e-14);
  });

  it('with thrust below the weight of even the dry rocket it never leaves the pad: v = y = 0, the pad carries the rest', () => {
    const weak: Rocket = { ...LAUNCH, rate: 8 }; // thrust 16 000 N < m₁ g = 19 600 N
    expect(liftoffTime(weak)).toBe(Infinity);
    expect(burnout(weak)).toMatchObject({ v: 0, y: 0, lifted: false });
    expect(relativeError(padForce(weak, 100), (FIG.m0 - 800) * G - 16000)).toBeLessThan(1e-12);
    expect(velocity(weak, 500)).toBe(0);
  });

  it('with thrust between the dry and the full weight it waits on the pad until M = uμ/g, then lifts with zero acceleration', () => {
    const late: Rocket = { ...LAUNCH, rate: 40 }; // 80 000 N: lifts at M = 8163 kg
    const tl = liftoffTime(late);
    expect(relativeError(liftoffMass(late), 80000 / G)).toBeLessThan(1e-14);
    expect(relativeError(tl, (FIG.m0 - 80000 / G) / 40)).toBeLessThan(1e-14);
    expect(velocity(late, tl)).toBe(0);
    expect(Math.abs(padForce(late, tl * (1 - 1e-9)))).toBeLessThan(1e-3);
    // after lift-off: Tsiolkovsky from the lift-off mass, less g times the time in flight
    const tb = burnTime(late);
    expect(relativeError(burnout(late).v, 2000 * Math.log(liftoffMass(late) / FIG.m1) - G * (tb - tl))).toBeLessThan(1e-13);
  });
});

describe('conservation', () => {
  it('in free space the total momentum of the rocket and all its ejected parcels stays zero (from rest)', () => {
    for (const n of [1, 7, 1000]) {
      const f = parcelRocket(FIG.m0, FIG.m1, FIG.u, n);
      const p = parcelMomentum(f, FIG.m1);
      // compare with the scale of the momenta involved
      expect(Math.abs(p) / (FIG.m1 * f.v[n])).toBeLessThan(1e-12);
    }
  });

  it('the parcel momentum is conserved in a moving frame too, and the rocket’s Δv is the same there (Galilean)', () => {
    const rest = parcelRocket(FIG.m0, FIG.m1, FIG.u, 50);
    const moving = parcelRocket(FIG.m0, FIG.m1, FIG.u, 50, 3000);
    expect(relativeError(parcelMomentum(moving, FIG.m1), FIG.m0 * 3000)).toBeLessThan(1e-12);
    expect(relativeError(moving.v[50] - 3000, rest.v[50])).toBeLessThan(1e-12);
  });

  it('a cart coasting while sand falls into it keeps its horizontal momentum M v', () => {
    const M0 = 300;
    const v0 = 4;
    for (const t of [0, 5, 60]) {
      expect(relativeError((M0 + 6 * t) * coastingCart(M0, v0, 6, t), M0 * v0)).toBeLessThan(1e-14);
    }
  });

  it('on a belt the motor’s power is the kinetic-energy rate plus the heat rate, for any landing speed w', () => {
    for (const w of [0, 0.5, -1]) {
      const p = beltPower(2, 12, w);
      expect(relativeError(p.motor, p.kinetic + p.heat)).toBeLessThan(1e-14);
    }
  });

  it('a grain carried up to speed by friction: the motor’s work equals its kinetic energy plus the heat', () => {
    for (const [v, w, mu] of [[2, 0, 0.5], [1.5, 0.4, 0.1], [3, 0, 0.9]]) {
      const gr = grainOnBelt(v, w, mu, G);
      expect(relativeError(gr.motorWork, gr.kineticGain + gr.heat)).toBeLessThan(1e-13);
      // and per kilogram these are the belt budget's numbers per unit rate
      const b = beltPower(v, 1, w);
      expect(relativeError(gr.motorWork, b.motor)).toBeLessThan(1e-13);
      expect(relativeError(gr.heat, b.heat)).toBeLessThan(1e-13);
    }
  });
});

describe('convergence', () => {
  it('the numerical burn (RK4 with a varying mass) converges to the closed form at fourth order', () => {
    for (const r of [FIG, LAUNCH, { ...LAUNCH, rate: 40 }]) {
      const exact = burnout(r);
      const err = (n: number) => {
        const s = integrateBurn(r, n).at(-1)!;
        return Math.abs(s.v - exact.v) / exact.v;
      };
      const e1 = err(20);
      const e2 = err(40);
      expect(e2).toBeLessThan(1e-6);
      expect(Math.log2(e1 / e2)).toBeGreaterThan(3.7);
      expect(Math.log2(e1 / e2)).toBeLessThan(4.6);
      const yN = integrateBurn(r, 400).at(-1)!;
      expect(relativeError(yN.y, exact.y)).toBeLessThan(1e-10);
      expect(relativeError(yN.m, r.m1)).toBeLessThan(1e-12);
    }
  });

  it('the parcel rocket converges to Tsiolkovsky at first order in the parcel size', () => {
    const exact = tsiolkovsky(FIG.u, FIG.m0, FIG.m1);
    const err = (n: number) => Math.abs(parcelRocket(FIG.m0, FIG.m1, FIG.u, n).v[n] - exact) / exact;
    for (const n of [100, 1000]) {
      const ratio = err(n) / err(2 * n);
      expect(ratio).toBeGreaterThan(1.95);
      expect(ratio).toBeLessThan(2.05);
    }
    expect(err(10000)).toBeLessThan(1e-3);
  });

  it('the variable-mass equation integrated for the coasting cart (w = 0, dM/dt = +μ) converges to M₀v₀/(M₀ + μt)', () => {
    const M0 = 300;
    const rates = (s: MassState): MassState => ({ y: s.v, v: variableMassAcceleration(s.m, s.v, 0, 6, 0), m: 6 });
    let s: MassState = { y: 0, v: 4, m: M0 };
    for (let i = 0; i < 100; i++) s = rk4MassStep(s, rates, i * 0.5, 0.5);
    expect(relativeError(s.v, coastingCart(M0, 4, 6, 50))).toBeLessThan(1e-9);
  });
});

describe('scaling', () => {
  it('Δv is proportional to the exhaust speed, and squaring the mass ratio doubles it', () => {
    expect(relativeError(tsiolkovsky(4000, 10, 2), 2 * tsiolkovsky(2000, 10, 2))).toBeLessThan(1e-15);
    expect(relativeError(tsiolkovsky(2000, 25, 1), 2 * tsiolkovsky(2000, 5, 1))).toBeLessThan(1e-15);
  });

  it('in free space Δv does not depend on the burn rate, and the distance covered during the burn is ∝ 1/μ', () => {
    const a = burnout({ ...FIG, rate: 50 });
    const b = burnout({ ...FIG, rate: 200 });
    expect(relativeError(a.v, b.v)).toBeLessThan(1e-14);
    expect(relativeError(a.y, 4 * b.y)).toBeLessThan(1e-13);
  });

  it('the force on a cart at constant speed is v dM/dt: doubling either doubles it, and its power goes as v²', () => {
    expect(sandForce(2, 10)).toBe(20);
    expect(relativeError(sandForce(4, 10), 2 * sandForce(2, 10))).toBeLessThan(1e-15);
    expect(relativeError(beltPower(4, 10).motor, 4 * beltPower(2, 10).motor)).toBeLessThan(1e-15);
  });

  it('half the motor’s power becomes heat, whatever the friction coefficient: a slide 10 times shorter at 10 times the force', () => {
    const slow = grainOnBelt(2, 0, 0.05, G);
    const fast = grainOnBelt(2, 0, 0.5, G);
    expect(relativeError(slow.heat, fast.heat)).toBeLessThan(1e-14);
    expect(relativeError(slow.slide, 10 * fast.slide)).toBeLessThan(1e-14);
    expect(relativeError(fast.heat, 0.5 * fast.motorWork)).toBeLessThan(1e-14);
  });

  it('F = d(Mv)/dt written blindly predicts that a leaking cart speeds up; the true velocity is constant', () => {
    const v = blindLeakVelocity(300, 4, 6, 25); // M from 300 to 150 kg
    expect(relativeError(v, 8)).toBeLessThan(1e-14);
    // the variable-mass equation with w = v (the sand leaves with the cart's velocity) gives no acceleration
    expect(variableMassAcceleration(150, 4, 0, -6, 4)).toBe(0);
  });

  it('the apex of a vertical launch agrees with RK4 through the burn (varying mass) and the coast to v = 0', () => {
    const burn = integrateBurn(LAUNCH, 400).at(-1)!;
    // the coast has constant acceleration −g, which RK4 integrates exactly: N steps of v_b/(g N) land on v = 0
    const N = 50;
    const dt = burn.v / G / N;
    const coast = (s: MassState): MassState => ({ y: s.v, v: -G, m: 0 });
    let s: MassState = { y: burn.y, v: burn.v, m: burn.m };
    for (let i = 0; i < N; i++) s = rk4MassStep(s, coast, i * dt, dt);
    expect(Math.abs(s.v) / burn.v).toBeLessThan(1e-12);
    expect(relativeError(s.y, apexHeight(LAUNCH))).toBeLessThan(1e-9);
    // and the closed-form height at the apex time is the apex
    const b = burnout(LAUNCH);
    expect(relativeError(height(LAUNCH, b.t + b.v / G), apexHeight(LAUNCH))).toBeLessThan(1e-12);
  });

  it('the apex falls linearly with the burn time, H = (u ln R)²/(2g) − u t_b (R ln R/(R − 1) − 1), while the rocket lifts off at once', () => {
    // ex-3-6-5: u = 1500 m/s, 600 → 300 kg (R = 2); lift-off at once needs t_b < u (m₀ − m₁)/(m₀ g) = 76.5 s
    const u = 1500;
    const R = 2;
    const top = (u * Math.log(R)) ** 2 / (2 * G);
    const slope = u * ((R * Math.log(R)) / (R - 1) - 1);
    const H = (tb: number) => apexHeight({ m0: 600, m1: 300, u, rate: 300 / tb, g: G });
    for (const tb of [10, 20, 40, 60]) {
      expect(liftoffTime({ m0: 600, m1: 300, u, rate: 300 / tb, g: G })).toBe(0);
      expect(relativeError(H(tb), top - slope * tb)).toBeLessThan(1e-12);
    }
    // equal steps in t_b lose equal heights, and an instant burn throws the rocket to (u ln R)²/(2g)
    expect(relativeError(H(10) - H(20), H(40) - H(50))).toBeLessThan(1e-9);
    expect(relativeError(H(1e-6), top)).toBeLessThan(1e-7);
  });
});
