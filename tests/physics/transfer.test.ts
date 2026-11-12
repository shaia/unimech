import { describe, expect, it } from 'vitest';
import { G, G_NEWTON, M_EARTH, M_SUN, R_EARTH, AU } from '~/physics/constants';
import { apsides, circularSpeed, elementsFromState, escapeSpeed, hohmann, orbitalPeriod, type PlanarState } from '~/physics/orbit';
import {
  apsisState,
  biEllipticTotal,
  escapeBurn,
  hitsBody,
  hohmannSpeeds,
  invariants,
  launchState,
  phaseAngle,
  propagate,
  radialMaxRadius,
  stateAt,
  synodicPeriod,
  tangentialBurn,
} from '~/physics/transfer';
import { relativeError } from '~/physics/vec';

const GM_E = G_NEWTON * M_EARTH;
const GM_S = G_NEWTON * M_SUN;
const circle = (GM: number, r: number): PlanarState => ({ r: [r, 0], v: [0, circularSpeed(GM, r)] });

describe('analytic limits', () => {
  it('the first Hohmann burn puts the apoapsis exactly on the outer circle', () => {
    const r1 = 2 * R_EARTH;
    const r2 = 5 * R_EARTH;
    const H = hohmannSpeeds(GM_E, r1, r2);
    const s = tangentialBurn(circle(GM_E, r1), H.dv1);
    const el = elementsFromState(GM_E, s.r, s.v);
    const { rp, ra } = apsides(el.p, el.e);
    expect(relativeError(rp, r1)).toBeLessThan(1e-12);
    expect(relativeError(ra, r2)).toBeLessThan(1e-12);
  });

  it('the second Hohmann burn, forward, at the apoapsis leaves a circle of radius r₂', () => {
    const r1 = 2 * R_EARTH;
    const r2 = 5 * R_EARTH;
    const H = hohmannSpeeds(GM_E, r1, r2);
    expect(H.dv2).toBeGreaterThan(0);
    const s1 = tangentialBurn(circle(GM_E, r1), H.dv1);
    const apo = apsisState(GM_E, elementsFromState(GM_E, s1.r, s1.v), 'apo');
    expect(apo).not.toBeNull();
    const s2 = tangentialBurn(apo as PlanarState, H.dv2);
    const el = elementsFromState(GM_E, s2.r, s2.v);
    expect(el.e).toBeLessThan(1e-9);
    expect(relativeError(el.a, r2)).toBeLessThan(1e-12);
  });

  it('a transfer inward needs two backward burns of the same sizes as the transfer outward', () => {
    const up = hohmannSpeeds(GM_E, 2 * R_EARTH, 5 * R_EARTH);
    const down = hohmannSpeeds(GM_E, 5 * R_EARTH, 2 * R_EARTH);
    expect(down.dv1).toBeLessThan(0);
    expect(down.dv2).toBeLessThan(0);
    expect(relativeError(-down.dv1, up.dv2)).toBeLessThan(1e-12);
    expect(relativeError(-down.dv2, up.dv1)).toBeLessThan(1e-12);
  });

  it('the forward burn (√2 − 1)v_c turns a circular orbit into a parabola (ε = 0)', () => {
    const r = 3 * R_EARTH;
    const s = tangentialBurn(circle(GM_E, r), escapeBurn(GM_E, r));
    expect(Math.abs(invariants(GM_E, s).eps) / (GM_E / r)).toBeLessThan(1e-14);
    expect(relativeError(escapeBurn(GM_E, r), (Math.SQRT2 - 1) * circularSpeed(GM_E, r))).toBeLessThan(1e-14);
  });

  it('as r₂ → r₁ both Hohmann burns vanish, and as r₂ → ∞ the first becomes the escape burn and the second vanishes', () => {
    const small = hohmannSpeeds(1, 1, 1 + 1e-6);
    expect(small.total).toBeLessThan(1e-6);
    const far = hohmannSpeeds(1, 1, 1e12);
    expect(relativeError(far.dv1, escapeBurn(1, 1))).toBeLessThan(1e-5);
    expect(far.dv2).toBeLessThan(1e-5);
  });

  it('the phase angle vanishes for equal orbits and is 74.6° for r₂ = 2.5 r₁', () => {
    expect(Math.abs(phaseAngle(1, 1))).toBeLessThan(1e-15);
    expect(relativeError((phaseAngle(2, 5) * 180) / Math.PI, 74.58)).toBeLessThan(1e-3);
    expect(phaseAngle(5, 2)).toBeLessThan(0);
  });

  it('a slow radial launch rises v₀²/2g, as near a flat Earth; at the escape speed it never stops', () => {
    const v0 = 100;
    const h = radialMaxRadius(GM_E, R_EARTH, v0) - R_EARTH;
    expect(relativeError(h, (v0 * v0) / (2 * (GM_E / (R_EARTH * R_EARTH))))).toBeLessThan(1e-4);
    expect(relativeError(GM_E / (R_EARTH * R_EARTH), G)).toBeLessThan(2e-3);
    expect(radialMaxRadius(GM_E, R_EARTH, escapeSpeed(GM_E, R_EARTH) * 1.000001)).toBe(Number.POSITIVE_INFINITY);
  });

  it('a body launched at the circular speed at any angle above the horizontal has the circular a but hits the planet inside it', () => {
    const r = 2 * R_EARTH;
    const s = launchState(r, circularSpeed(GM_E, r), Math.PI / 4);
    const el = elementsFromState(GM_E, s.r, s.v);
    expect(relativeError(el.a, r)).toBeLessThan(1e-12);
    expect(hitsBody(el, r * 0.8)).toBe(true);
  });
});

describe('conservation', () => {
  const s0: PlanarState = { r: [7e6, 1e6], v: [-1500, 8200] };
  const el = elementsFromState(GM_E, s0.r, s0.v);

  it('every point of the conic built by stateAt has the orbit’s energy and angular momentum', () => {
    for (let phi = 0; phi < 2 * Math.PI; phi += 0.37) {
      const s = stateAt(GM_E, el, phi);
      const inv = invariants(GM_E, s);
      expect(relativeError(inv.eps, el.eps)).toBeLessThan(1e-12);
      expect(relativeError(inv.h, el.h)).toBeLessThan(1e-12);
    }
  });

  it('the speed at a distance r depends only on a (vis-viva): every launch direction at one speed gives the same a', () => {
    const r = 2 * R_EARTH;
    const a0 = elementsFromState(GM_E, launchState(r, 7000, 0).r, launchState(r, 7000, 0).v).a;
    for (const alpha of [0.2, 0.6, 1.0, 1.4]) {
      const s = launchState(r, 7000, alpha);
      expect(relativeError(elementsFromState(GM_E, s.r, s.v).a, a0)).toBeLessThan(1e-12);
    }
  });

  it('a burn changes the energy by v·Δv + Δv²/2 and keeps the position', () => {
    const dv = 350;
    const s1 = tangentialBurn(s0, dv);
    const v = Math.hypot(s0.v[0], s0.v[1]);
    expect(s1.r).toEqual(s0.r);
    expect(relativeError(invariants(GM_E, s1).eps - invariants(GM_E, s0).eps, v * dv + (dv * dv) / 2)).toBeLessThan(1e-9);
  });

  it('both Hohmann burns add energy: ε rises from −GM/2r₁ through −GM/(r₁ + r₂) to −GM/2r₂', () => {
    const r1 = 2 * R_EARTH;
    const r2 = 5 * R_EARTH;
    const H = hohmannSpeeds(GM_E, r1, r2);
    const s1 = tangentialBurn(circle(GM_E, r1), H.dv1);
    expect(relativeError(invariants(GM_E, s1).eps, -GM_E / (r1 + r2))).toBeLessThan(1e-12);
    const apo = apsisState(GM_E, elementsFromState(GM_E, s1.r, s1.v), 'apo') as PlanarState;
    const s2 = tangentialBurn(apo, H.dv2);
    expect(relativeError(invariants(GM_E, s2).eps, -GM_E / (2 * r2))).toBeLessThan(1e-12);
  });

  it('propagating over one period returns to the start with ε and h unchanged', () => {
    const T = orbitalPeriod(GM_E, el.a);
    const { s } = propagate(GM_E, s0, T);
    expect(relativeError(invariants(GM_E, s).eps, el.eps)).toBeLessThan(1e-9);
    expect(relativeError(invariants(GM_E, s).h, el.h)).toBeLessThan(1e-9);
    expect(Math.hypot(s.r[0] - s0.r[0], s.r[1] - s0.r[1]) / 7e6).toBeLessThan(1e-6);
  });

  it('half a Hohmann period after the first burn the craft is at the apoapsis, on the outer circle', () => {
    const r1 = 2 * R_EARTH;
    const r2 = 5 * R_EARTH;
    const H = hohmannSpeeds(GM_E, r1, r2);
    const { s } = propagate(GM_E, tangentialBurn(circle(GM_E, r1), H.dv1), H.time);
    expect(relativeError(Math.hypot(s.r[0], s.r[1]), r2)).toBeLessThan(1e-8);
    expect(relativeError(s.r[0], -r2)).toBeLessThan(1e-8);
  });
});

describe('scaling', () => {
  it('Δv/v₁ of a Hohmann transfer depends only on r₂/r₁ (Earth orbits and Sun orbits agree)', () => {
    const e = hohmannSpeeds(GM_E, 7e6, 2.1e7);
    const s = hohmannSpeeds(GM_S, AU, 3 * AU);
    expect(relativeError(e.total / e.v1, s.total / s.v1)).toBeLessThan(1e-12);
  });

  it('the transfer time scales as r^{3/2}: doubling both radii multiplies it by 2√2', () => {
    const a = hohmannSpeeds(GM_E, 7e6, 2e7).time;
    const b = hohmannSpeeds(GM_E, 1.4e7, 4e7).time;
    expect(relativeError(b / a, 2 * Math.SQRT2)).toBeLessThan(1e-12);
  });

  it('hohmannSpeeds agrees with the shared hohmann() of orbit.ts', () => {
    const a = hohmannSpeeds(GM_E, 6.67e6, 4.22e7);
    const b = hohmann(GM_E, 6.67e6, 4.22e7);
    expect(relativeError(a.total, b.total)).toBeLessThan(1e-14);
    expect(relativeError(a.time, b.time)).toBeLessThan(1e-14);
  });

  it('the Hohmann total peaks at r₂/r₁ ≈ 15.58, and beats a bi-elliptic transfer through infinity below r₂/r₁ ≈ 11.94', () => {
    const tot = (x: number) => hohmannSpeeds(1, 1, x).total;
    expect(tot(15.58)).toBeGreaterThan(tot(15.0));
    expect(tot(15.58)).toBeGreaterThan(tot(16.2));
    expect(tot(11.8)).toBeLessThan(biEllipticTotal(1, 1, 11.8, Number.POSITIVE_INFINITY));
    expect(tot(12.1)).toBeGreaterThan(biEllipticTotal(1, 1, 12.1, Number.POSITIVE_INFINITY));
    // a finite r_b approaches the infinite limit from above
    expect(biEllipticTotal(1, 1, 20, 1e6)).toBeGreaterThan(biEllipticTotal(1, 1, 20, Number.POSITIVE_INFINITY));
  });

  it('the synodic period of two equal orbits is infinite and of Earth and a body twice as slow is two years', () => {
    expect(synodicPeriod(1, 1)).toBe(Number.POSITIVE_INFINITY);
    expect(relativeError(synodicPeriod(1, 2), 2)).toBeLessThan(1e-15);
  });
});

describe('convergence', () => {
  it('propagate converges at fourth order: halving the step cuts the energy error about 16-fold', () => {
    const s0: PlanarState = { r: [7e6, 0], v: [0, 9500] };
    const el = elementsFromState(GM_E, s0.r, s0.v);
    const T = orbitalPeriod(GM_E, el.a);
    const err = (frac: number) => Math.abs(invariants(GM_E, propagate(GM_E, s0, T, frac).s).eps - el.eps);
    const ratio = err(0.02) / err(0.01);
    expect(ratio).toBeGreaterThan(10);
    expect(ratio).toBeLessThan(40);
  });

  it('a launch that dips below the surface is stopped there', () => {
    const r = 2 * R_EARTH;
    const s = launchState(r, 7000, Math.PI / 4);
    const el = elementsFromState(GM_E, s.r, s.v);
    expect(hitsBody(el, R_EARTH)).toBe(true);
    const out = propagate(GM_E, s, orbitalPeriod(GM_E, el.a), 2e-3, R_EARTH);
    expect(out.hit).toBe(true);
    expect(Math.hypot(out.s.r[0], out.s.r[1])).toBeLessThan(R_EARTH * 1.001);
  });
});
