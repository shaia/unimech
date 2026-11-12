import { describe, expect, it } from 'vitest';
import { G_NEWTON, M_EARTH, M_SUN, AU, R_EARTH, YEAR } from '~/physics/constants';
import {
  apsides,
  circularRadius,
  circularSpeed,
  eccentricity,
  effectivePotential,
  elementsFromState,
  ellipseAtTime,
  escapeSpeed,
  hohmann,
  orbitalPeriod,
  radiusAt,
  reducedMass,
  semiMajorFromPeriod,
  stepKepler,
  turningRadii,
  visViva,
  type PlanarState,
} from '~/physics/orbit';
import { relativeError } from '~/physics/vec';

const GM_E = G_NEWTON * M_EARTH;
const GM_S = G_NEWTON * M_SUN;

describe('analytic limits', () => {
  it('a body launched sideways at the circular speed stays on a circle (e = 0, a = r)', () => {
    const r = 2 * R_EARTH;
    const el = elementsFromState(GM_E, [r, 0], [0, circularSpeed(GM_E, r)]);
    expect(el.kind).toBe('circle');
    expect(relativeError(el.a, r)).toBeLessThan(1e-12);
  });

  it('at the escape speed the orbit is a parabola (ε = 0, e = 1); faster, a hyperbola', () => {
    const r = R_EARTH;
    const vesc = escapeSpeed(GM_E, r);
    expect(elementsFromState(GM_E, [r, 0], [0, vesc]).e).toBeCloseTo(1, 12);
    expect(elementsFromState(GM_E, [r, 0], [0, 1.2 * vesc]).kind).toBe('hyperbola');
    expect(relativeError(escapeSpeed(GM_E, r), Math.SQRT2 * circularSpeed(GM_E, r))).toBeLessThan(1e-15);
  });

  it('a radial launch (h = 0) has e = 1 but is classified by its energy, with a = −GM/(2ε)', () => {
    const r = R_EARTH;
    const v = 0.8 * escapeSpeed(GM_E, r);
    const el = elementsFromState(GM_E, [r, 0], [v, 0]);
    expect(el.kind).toBe('ellipse');
    expect(relativeError(el.a, -GM_E / (2 * el.eps))).toBeLessThan(1e-15);
    expect(elementsFromState(GM_E, [r, 0], [1.2 * escapeSpeed(GM_E, r), 0]).kind).toBe('hyperbola');
  });

  it('the minimum of the effective potential is the circular orbit r = h²/GM', () => {
    const h = 5e10;
    const rc = circularRadius(GM_E, h);
    const du = (effectivePotential(GM_E, h, rc * (1 + 1e-6)) - effectivePotential(GM_E, h, rc * (1 - 1e-6))) / (2e-6 * rc);
    expect(Math.abs(du * rc) / Math.abs(effectivePotential(GM_E, h, rc))).toBeLessThan(1e-8);
  });

  it('the turning radii of the effective potential are the apsides of the conic', () => {
    const el = elementsFromState(GM_E, [7e6, 0], [0, 9000]);
    const [r1, r2] = turningRadii(GM_E, el.h, el.eps);
    const { rp, ra } = apsides(el.p, el.e);
    expect(relativeError(r1, rp)).toBeLessThan(1e-10);
    expect(relativeError(r2, ra)).toBeLessThan(1e-10);
    expect(relativeError(eccentricity(GM_E, el.eps, el.h), el.e)).toBeLessThan(1e-10);
  });

  it('a light body around a heavy one has μ → m', () => {
    expect(relativeError(reducedMass(1, 1e30), 1)).toBeLessThan(1e-15);
    expect(reducedMass(2, 2)).toBe(1);
  });
});

describe('conservation', () => {
  it('RK4 along an ellipse keeps ε and h and passes through r(θ) = p/(1 + e cos θ)', () => {
    const s0: PlanarState = { r: [7e6, 0], v: [0, 9000] };
    const el = elementsFromState(GM_E, s0.r, s0.v);
    let s = s0;
    const T = orbitalPeriod(GM_E, el.a);
    const n = 20000;
    for (let i = 0; i < n / 3; i++) s = stepKepler(GM_E, s, T / n);
    const now = elementsFromState(GM_E, s.r, s.v);
    expect(relativeError(now.eps, el.eps)).toBeLessThan(1e-9);
    expect(relativeError(now.h, el.h)).toBeLessThan(1e-9);
    const theta = Math.atan2(s.r[1], s.r[0]) - el.periapsisAngle;
    expect(relativeError(Math.hypot(s.r[0], s.r[1]), radiusAt(el.p, el.e, theta))).toBeLessThan(1e-8);
  });

  it('vis-viva gives the speed everywhere on the orbit from r and a alone', () => {
    const el = elementsFromState(GM_E, [7e6, 0], [0, 9000]);
    const { ra } = apsides(el.p, el.e);
    // at apoapsis the speed is h/ra
    expect(relativeError(visViva(GM_E, ra, el.a), el.h / ra)).toBeLessThan(1e-10);
  });
});

describe('scaling', () => {
  it('Kepler III: one astronomical unit around the Sun takes one year (to the constants’ 3 figures)', () => {
    expect(relativeError(orbitalPeriod(GM_S, AU), YEAR)).toBeLessThan(5e-3);
    expect(relativeError(semiMajorFromPeriod(GM_S, orbitalPeriod(GM_S, 2.3 * AU)), 2.3 * AU)).toBeLessThan(1e-14);
  });

  it('the period depends on a only: two ellipses with equal a and different e take the same time', () => {
    const a = 1e7;
    const rp1 = a * (1 - 0.1);
    const rp2 = a * (1 - 0.6);
    const e1 = elementsFromState(GM_E, [rp1, 0], [0, visViva(GM_E, rp1, a)]);
    const e2 = elementsFromState(GM_E, [rp2, 0], [0, visViva(GM_E, rp2, a)]);
    expect(relativeError(orbitalPeriod(GM_E, e1.a), orbitalPeriod(GM_E, e2.a))).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('Kepler’s equation matches the integrated orbit at a quarter period, and the Hohmann burns land on the target circle', () => {
    const rp = 7e6;
    const s0: PlanarState = { r: [rp, 0], v: [0, 9000] };
    const el = elementsFromState(GM_E, s0.r, s0.v);
    const T = orbitalPeriod(GM_E, el.a);
    let s = s0;
    const n = 40000;
    for (let i = 0; i < n / 4; i++) s = stepKepler(GM_E, s, T / n);
    const kep = ellipseAtTime(GM_E, el.a, el.e, T / 4);
    expect(relativeError(Math.hypot(s.r[0], s.r[1]), kep.r)).toBeLessThan(1e-8);
    expect(Math.abs(Math.atan2(s.r[1], s.r[0]) - kep.theta)).toBeLessThan(1e-8);

    const r1 = R_EARTH + 3e5;
    const r2 = 4.22e7;
    const tr = hohmann(GM_E, r1, r2);
    const after = elementsFromState(GM_E, [r1, 0], [0, circularSpeed(GM_E, r1) + tr.dv1]);
    expect(relativeError(apsides(after.p, after.e).ra, r2)).toBeLessThan(1e-10);
  });
});
