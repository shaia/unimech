import { describe, expect, it } from 'vitest';
import { AU, D_EARTH_MOON, G_NEWTON, M_EARTH, M_MOON, M_SUN, R_EARTH } from '~/physics/constants';
import {
  PLANETS,
  arealVelocity,
  arealVelocityOfState,
  ellipseArea,
  equalTimeSectors,
  minorAxisFraction,
  nearHalfFraction,
  orbitEnergy,
  planetA,
  planetT,
  sectorArea,
  sectorAreaExact,
  stateAt,
  semiLatusRectum,
  semiMajorFromEnergy,
  semiMinorAxis,
  specificOrbitEnergy,
  timeBetween,
  twoBodyPeriod,
} from '~/physics/kepler';
import { circularSpeed, elementsFromState, ellipseAtTime, orbitalPeriod, radiusAt, stepKepler, visViva, type PlanarState } from '~/physics/orbit';
import { relativeError } from '~/physics/vec';

const GM_S = G_NEWTON * M_SUN;
const GM_E = G_NEWTON * M_EARTH;

/** One period of an orbit started at the periapsis, integrated by RK4 in `steps` steps. */
function integrateOrbit(GM: number, a: number, e: number, steps: number): PlanarState[] {
  const rp = a * (1 - e);
  let s: PlanarState = { r: [rp, 0], v: [0, visViva(GM, rp, a)] };
  const T = orbitalPeriod(GM, a);
  const out = [s];
  for (let i = 0; i < steps; i++) {
    s = stepKepler(GM, s, T / steps);
    out.push(s);
  }
  return out;
}

describe('analytic limits', () => {
  it('a circle (e = 0) sweeps the sector ½a²Δθ and covers equal angles in equal times', () => {
    const a = 2 * R_EARTH;
    expect(relativeError(sectorArea(a, 0, 0.3, 1.7), 0.5 * a * a * 1.4)).toBeLessThan(1e-12);
    const T = orbitalPeriod(GM_E, a);
    expect(relativeError(timeBetween(GM_E, a, 0, 0, 1), T / (2 * Math.PI))).toBeLessThan(1e-12);
  });

  it('on a circle the areal velocity is ½ a v and the energy is −½ m v² (twice the kinetic energy, negative)', () => {
    const a = 7e6;
    const v = circularSpeed(GM_E, a);
    expect(relativeError(arealVelocity(GM_E, a, 0), 0.5 * a * v)).toBeLessThan(1e-14);
    expect(relativeError(orbitEnergy(G_NEWTON, M_EARTH, 1000, a), -0.5 * 1000 * v * v)).toBeLessThan(1e-14);
  });

  it('the polar orbit r(θ) is the ellipse (x + ae)²/a² + y²/b² = 1, with the centre of force at a focus', () => {
    const a = 3, e = 0.6;
    const b = semiMinorAxis(a, e);
    const p = semiLatusRectum(a, e);
    for (const th of [0, 0.7, 2, Math.PI, 4.5]) {
      const r = radiusAt(p, e, th);
      const x = r * Math.cos(th), y = r * Math.sin(th);
      expect(Math.abs((x + a * e) ** 2 / (a * a) + (y * y) / (b * b) - 1)).toBeLessThan(1e-12);
    }
    expect(relativeError(a * a - b * b, (a * e) ** 2)).toBeLessThan(1e-12);
    expect(relativeError(b * b, a * p)).toBeLessThan(1e-12);
  });

  it('from the periapsis to an end of the minor axis takes T(1/4 − e/2π); the near half (θ from −90° to 90°) ½ − 2e/π for small e', () => {
    const a = 2.2 * AU, e = 0.85;
    const T = orbitalPeriod(GM_S, a);
    // the end of the minor axis: x = −ae from the focus, so cos θ = −e·(r/a)… found where r = a (both foci equally far)
    const thB = Math.acos(-e);
    expect(relativeError(radiusAt(semiLatusRectum(a, e), e, thB), a)).toBeLessThan(1e-12);
    expect(relativeError(timeBetween(GM_S, a, e, 0, thB), T * minorAxisFraction(e))).toBeLessThan(1e-12);
    expect(relativeError(timeBetween(GM_S, a, e, -Math.PI / 2, Math.PI / 2), T * nearHalfFraction(e))).toBeLessThan(1e-12);
    const small = 0.017;
    expect(Math.abs(nearHalfFraction(small) - (0.5 - (2 * small) / Math.PI))).toBeLessThan(1e-5);
  });

  it('two bodies (1 orbiting, 2 the centre): with m₁ → 0 the period is Kepler’s 2π√(a³/Gm₂); a heavier body 1 shortens it', () => {
    const a = D_EARTH_MOON;
    expect(relativeError(twoBodyPeriod(G_NEWTON, 1e-6, M_EARTH, a), orbitalPeriod(GM_E, a))).toBeLessThan(1e-12);
    expect(twoBodyPeriod(G_NEWTON, M_MOON, M_EARTH, a)).toBeLessThan(orbitalPeriod(GM_E, a));
  });
});

describe('conservation', () => {
  it('the areal velocity ½|r × v| stays at h/2 = πab/T along an RK4 orbit (second law)', () => {
    const a = 1.5e7, e = 0.7;
    const want = arealVelocity(GM_E, a, e);
    expect(relativeError(want * orbitalPeriod(GM_E, a), ellipseArea(a, e))).toBeLessThan(1e-12);
    for (const s of integrateOrbit(GM_E, a, e, 4000)) expect(relativeError(arealVelocityOfState(s.r, s.v), want)).toBeLessThan(1e-6);
  });

  it('the energy ½v² − GM/r stays at −GM/(2a) along the orbit, whatever e (third-law partner: E depends on a only)', () => {
    const a = 1.5e7;
    for (const e of [0, 0.3, 0.8]) {
      for (const s of integrateOrbit(GM_E, a, e, 2000).filter((_, i) => i % 97 === 0)) {
        const eps = 0.5 * (s.v[0] ** 2 + s.v[1] ** 2) - GM_E / Math.hypot(s.r[0], s.r[1]);
        expect(relativeError(eps, specificOrbitEnergy(GM_E, a))).toBeLessThan(1e-6);
      }
    }
  });

  it('a state’s energy gives back its semi-major axis, a = −GM/(2ε), in any direction of the velocity', () => {
    const r: [number, number] = [2e7, 0];
    for (const ang of [0.5, 1.2, Math.PI / 2]) {
      const v: [number, number] = [3500 * Math.cos(ang), 3500 * Math.sin(ang)];
      const eps = 0.5 * 3500 * 3500 - GM_E / 2e7;
      expect(relativeError(semiMajorFromEnergy(GM_E, eps), elementsFromState(GM_E, r, v).a)).toBeLessThan(1e-12);
    }
  });
});

describe('conservation of the evaluated state', () => {
  it('stateAt (Kepler’s equation, no integration) keeps ½|r × v| = h/2 and ½v² − GM/r = −GM/(2a) at every time', () => {
    const a = 1.5e7, e = 0.75;
    const T = orbitalPeriod(GM_E, a);
    for (let k = 0; k <= 20; k++) {
      const s = stateAt(GM_E, a, e, (k * T) / 20);
      expect(relativeError(arealVelocityOfState(s.r, s.v), arealVelocity(GM_E, a, e))).toBeLessThan(1e-10);
      const eps = 0.5 * (s.v[0] ** 2 + s.v[1] ** 2) - GM_E / s.dist;
      expect(relativeError(eps, specificOrbitEnergy(GM_E, a))).toBeLessThan(1e-10);
    }
  });

  it('stateAt agrees with an RK4 integration from the periapsis after a third of a period', () => {
    const a = 1.5e7, e = 0.5;
    const path = integrateOrbit(GM_E, a, e, 3000);
    const s = stateAt(GM_E, a, e, orbitalPeriod(GM_E, a) / 3);
    const q = path[1000];
    expect(Math.hypot(s.r[0] - q.r[0], s.r[1] - q.r[1]) / a).toBeLessThan(1e-7);
  });
});

describe('scaling', () => {
  it('T²/a³ = 4π²/GM for every a and every e (third law)', () => {
    const k = (4 * Math.PI * Math.PI) / GM_S;
    for (const a of [0.4 * AU, AU, 30 * AU]) {
      const T = orbitalPeriod(GM_S, a);
      expect(relativeError((T * T) / a ** 3, k)).toBeLessThan(1e-12);
      // the eccentricity does not enter: the time for a whole turn is the same
      for (const e of [0.2, 0.9]) expect(relativeError(timeBetween(GM_S, a, e, 0, 2 * Math.PI), T)).toBeLessThan(1e-12);
    }
  });

  it('the measured planets lie on T² = 4π²a³/GM_S: within 0.2 % to Jupiter, 1.5 % out to Neptune (tropical periods, perturbations)', () => {
    for (const pl of PLANETS) {
      const model = orbitalPeriod(GM_S, planetA(pl));
      const inner = planetA(pl) < 6 * AU;
      expect(relativeError(planetT(pl), model)).toBeLessThan(inner ? 0.002 : 0.015);
    }
  });

  it('the orbit energy doubles in size when a halves, and scales with each mass', () => {
    const E = orbitEnergy(G_NEWTON, M_SUN, M_EARTH, AU);
    expect(relativeError(orbitEnergy(G_NEWTON, M_SUN, M_EARTH, AU / 2), 2 * E)).toBeLessThan(1e-14);
    expect(relativeError(orbitEnergy(G_NEWTON, M_SUN, 3 * M_EARTH, AU), 3 * E)).toBeLessThan(1e-14);
  });
});

describe('convergence', () => {
  it('the numerical sector area converges to (ab/2)ΔM as the panels are refined (Simpson, about n⁻⁴)', () => {
    const a = 1, e = 0.6;
    const p = semiLatusRectum(a, e);
    const exact = sectorAreaExact(a, e, -0.4, 1.9);
    const err = (n: number) => Math.abs(sectorArea(p, e, -0.4, 1.9, n) - exact);
    expect(err(400)).toBeLessThan(1e-10);
    expect(err(20) / err(40)).toBeGreaterThan(10);
  });

  it('n equal-time sectors have equal areas πab/n and add up to the ellipse (second law, measured)', () => {
    const a = AU, e = 0.6;
    const secs = equalTimeSectors(GM_S, a, e, 8);
    const A = ellipseArea(a, e);
    for (const s of secs) expect(relativeError(s.area, A / 8)).toBeLessThan(1e-9);
    expect(relativeError(secs.at(-1)!.th1, 2 * Math.PI)).toBeLessThan(1e-9);
    // ellipseAtTime, timeBetween and the sector boundaries agree
    const t = secs[3].t1;
    expect(relativeError(timeBetween(GM_S, a, e, 0, ellipseAtTime(GM_S, a, e, t).theta), t)).toBeLessThan(1e-9);
  });
});
