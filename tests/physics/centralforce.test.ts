import { describe, expect, it } from 'vitest';
import { AU, G_NEWTON, M_SUN } from '~/physics/constants';
import {
  apsidalAngle,
  circularOrbit,
  circularOrbits,
  effective,
  freePotential,
  harmonicPotential,
  keplerPotential,
  nearCircularApsidalAngle,
  radialPeriod,
  radialTurningPoints,
  sampleOrbit,
  traceOrbit,
  yukawaPotential,
  type CentralPotential,
  type Trace,
} from '~/physics/centralforce';
import { circularRadius, ellipseAtTime, orbitalPeriod, turningRadii } from '~/physics/orbit';
import { relativeError } from '~/physics/vec';

const GM = G_NEWTON * M_SUN;
const KEPLER = keplerPotential(GM);
const YUKAWA = yukawaPotential(GM, 3 * AU);
const R_LO = 0.01 * AU;
const R_HI = 50 * AU;
const H = 4.5e15; // m²/s, a near-Earth orbit around the Sun

/** The largest relative drift of ½ṙ² + u_eff(r) along a trace. */
function energyDrift(pot: CentralPotential, h: number, eps: number, tr: Trace): number {
  return Math.max(...tr.samples.map((s) => Math.abs(0.5 * s.rdot * s.rdot + effective(pot, h, s.r) - eps))) / Math.abs(eps);
}

describe('analytic limits', () => {
  it('the minimum of u_eff under gravity is the circular orbit h²/GM of orbit.ts', () => {
    const rc = circularOrbit(KEPLER, H, R_LO, R_HI);
    expect(rc).not.toBeNull();
    expect(relativeError(rc as number, circularRadius(GM, H))).toBeLessThan(1e-10);
  });

  it('the turning points of u_eff = ε under gravity are the roots of orbit.ts (periapsis and apoapsis)', () => {
    const eps = -3e8;
    const mine = radialTurningPoints(KEPLER, H, eps, R_LO, R_HI);
    const ref = turningRadii(GM, H, eps);
    expect(mine).toHaveLength(2);
    expect(relativeError(mine[0], ref[0])).toBeLessThan(1e-10);
    expect(relativeError(mine[1], ref[1])).toBeLessThan(1e-10);
  });

  it('every Kepler ellipse turns through exactly π from periapsis to apoapsis (it closes)', () => {
    for (const eps of [-4e8, -3e8, -1e8, -2e7]) {
      const [rp, ra] = radialTurningPoints(KEPLER, H, eps, R_LO, 1e4 * AU);
      expect(relativeError(apsidalAngle(KEPLER, H, eps, rp, ra), Math.PI)).toBeLessThan(1e-6);
    }
  });

  it('the radial period of a Kepler ellipse is the orbital period 2π√(a³/GM), a = (r_p + r_a)/2', () => {
    const eps = -2.5e8;
    const [rp, ra] = radialTurningPoints(KEPLER, H, eps, R_LO, R_HI);
    expect(relativeError(radialPeriod(KEPLER, H, eps, rp, ra), orbitalPeriod(GM, 0.5 * (rp + ra)))).toBeLessThan(1e-6);
  });

  it('a spring force (u = ½ω²r²) closes too, turning through π/2 between apsides, with radial period π/ω', () => {
    const w = 2e-7;
    const spring = harmonicPotential(w);
    const h = 1e15;
    const rc = circularOrbit(spring, h, R_LO, R_HI) as number;
    const eps = 1.5 * effective(spring, h, rc);
    const [rp, ra] = radialTurningPoints(spring, h, eps, R_LO, R_HI);
    expect(relativeError(apsidalAngle(spring, h, eps, rp, ra), Math.PI / 2)).toBeLessThan(1e-6);
    expect(relativeError(radialPeriod(spring, h, eps, rp, ra), Math.PI / w)).toBeLessThan(1e-6);
    expect(relativeError(nearCircularApsidalAngle(spring, rc), Math.PI / 2)).toBeLessThan(1e-12);
  });

  it('a force that weakens faster than 1/r² turns through more than π, tending to π/√(3 + ru″/u′) near the circle', () => {
    const rc = circularOrbit(YUKAWA, H, R_LO, R_HI) as number;
    const umin = effective(YUKAWA, H, rc);
    const limit = nearCircularApsidalAngle(YUKAWA, rc);
    expect(limit).toBeGreaterThan(Math.PI);
    const errs = [0.1, 0.01].map((f) => {
      const eps = umin * (1 - f);
      const [rp, ra] = radialTurningPoints(YUKAWA, H, eps, R_LO, R_HI);
      return relativeError(apsidalAngle(YUKAWA, H, eps, rp, ra), limit);
    });
    expect(errs[1]).toBeLessThan(errs[0]);
    expect(errs[1]).toBeLessThan(1e-3);
  });

  it('a free body (no force) still has the h²/(2r²) term: its closest approach is h/√(2ε), on a straight line', () => {
    const free = freePotential();
    const eps = 2e8;
    const tr = traceOrbit(free, H, eps, { rLo: R_LO, rHi: R_HI, tEnd: 0, rEscape: 5 * AU });
    const b = H / Math.sqrt(2 * eps);
    expect(tr.bound).toBe(false);
    expect(relativeError(tr.rp, b)).toBeLessThan(1e-10);
    // on a straight line at distance b from the centre: r cos θ = b everywhere
    for (const s of tr.samples.filter((_, i) => i % 50 === 0)) expect(relativeError(s.r * Math.cos(s.theta), b)).toBeLessThan(1e-7);
  });
});

describe('conservation', () => {
  it('the integrated radial motion keeps ½ṙ² + u_eff(r) = ε over three Kepler periods', () => {
    const eps = -2.5e8;
    const tr = traceOrbit(KEPLER, H, eps, { rLo: R_LO, rHi: R_HI, tEnd: 3 * orbitalPeriod(GM, -GM / (2 * eps)), rEscape: R_HI });
    expect(energyDrift(KEPLER, H, eps, tr)).toBeLessThan(1e-7);
  });

  it('the integrated Kepler motion agrees with the ellipse of Kepler’s equation (orbit.ts) at every instant', () => {
    const eps = -2.5e8;
    const a = -GM / (2 * eps);
    const T = orbitalPeriod(GM, a);
    const tr = traceOrbit(KEPLER, H, eps, { rLo: R_LO, rHi: R_HI, tEnd: T, rEscape: R_HI });
    const e = (tr.ra - tr.rp) / (tr.ra + tr.rp);
    for (const f of [0.1, 0.37, 0.5, 0.81]) {
      const ref = ellipseAtTime(GM, a, e, f * T);
      const mine = sampleOrbit(tr, f * T);
      expect(relativeError(mine.r, ref.r)).toBeLessThan(1e-5);
    }
  });

  it('at the minimum of u_eff the trace is a circle: r stays at the minimum and θ grows at h/r²', () => {
    const rc = circularOrbit(KEPLER, H, R_LO, R_HI) as number;
    const T = (2 * Math.PI * rc * rc) / H;
    const tr = traceOrbit(KEPLER, H, effective(KEPLER, H, rc), { rLo: R_LO, rHi: R_HI, tEnd: T, rEscape: R_HI });
    expect(Math.max(...tr.samples.map((s) => relativeError(s.r, rc)))).toBeLessThan(1e-8);
    expect(relativeError(sampleOrbit(tr, T).theta, 2 * Math.PI)).toBeLessThan(1e-6);
  });

  it('a Yukawa rosette keeps its energy and stays between its two turning points', () => {
    const rc = circularOrbit(YUKAWA, H, R_LO, R_HI) as number;
    const eps = 0.6 * effective(YUKAWA, H, rc);
    const tr = traceOrbit(YUKAWA, H, eps, { rLo: R_LO, rHi: R_HI, tEnd: 20 * orbitalPeriod(GM, rc), rEscape: R_HI });
    expect(energyDrift(YUKAWA, H, eps, tr)).toBeLessThan(1e-6);
    const rs = tr.samples.map((s) => s.r);
    expect(Math.min(...rs)).toBeGreaterThan(tr.rp * (1 - 1e-6));
    expect(Math.max(...rs)).toBeLessThan(tr.ra * (1 + 1e-6));
  });
});

describe('scaling', () => {
  it('the circular radius of any 1/r² attraction grows as h² (twice h, four times r)', () => {
    const r1 = circularOrbit(KEPLER, H, R_LO, R_HI) as number;
    const r2 = circularOrbit(KEPLER, 2 * H, R_LO, R_HI) as number;
    expect(relativeError(r2 / r1, 4)).toBeLessThan(1e-9);
  });

  it('a Yukawa orbit precesses more the farther out it lies (larger h, larger circle)', () => {
    const shift = (h: number) => {
      const rc = circularOrbit(YUKAWA, h, R_LO, R_HI) as number;
      return nearCircularApsidalAngle(YUKAWA, rc) - Math.PI;
    };
    expect(shift(5e15)).toBeGreaterThan(shift(4e15));
    expect(circularOrbits(YUKAWA, 4e15, R_LO, 4 * AU).filter((c) => c.kind === 'min')).toHaveLength(1);
  });
});

describe('convergence', () => {
  it('RK4: a step 2× smaller cuts the energy drift of an eccentric Kepler orbit by about 16×', () => {
    const eps = -1.5e8;
    const T = orbitalPeriod(GM, -GM / (2 * eps));
    const drift = (eta: number) => energyDrift(KEPLER, H, eps, traceOrbit(KEPLER, H, eps, { rLo: R_LO, rHi: R_HI, tEnd: T, rEscape: R_HI, eta }));
    const ratio = drift(0.02) / drift(0.01);
    expect(ratio).toBeGreaterThan(10);
    expect(ratio).toBeLessThan(40);
  });
});
