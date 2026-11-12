import { describe, expect, it } from 'vitest';
import { G_NEWTON, M_EARTH, R_EARTH } from '~/physics/constants';
import {
  coneCutAngle,
  coneEccentricity,
  coneSection,
  conicGeometry,
  inPlane,
  integrateTrajectory,
  launch,
  positionAt,
  sampleConic,
  sidewaysEccentricity,
  uOfTheta,
} from '~/physics/conics';
import { circularSpeed, escapeSpeed, orbitalPeriod, radiusAt } from '~/physics/orbit';
import { relativeError } from '~/physics/vec';

const GM = G_NEWTON * M_EARTH;
const R0 = 1.0e7;

describe('analytic limits', () => {
  it('a circle (e = 0) has a = b = p, its centre on the focus and no asymptotes', () => {
    const g = conicGeometry(2e7, 0);
    expect(g.kind).toBe('circle');
    expect(g.a).toBe(2e7);
    expect(g.b).toBe(2e7);
    expect(g.centreX === 0).toBe(true);
    expect(g.thetaInf).toBeNull();
  });

  it('an ellipse has r_p + r_a = 2a, r_a − r_p = 2c (the focus is ae from the centre) and b² = a²(1 − e²)', () => {
    const g = conicGeometry(1.5e7, 0.6);
    expect(relativeError(g.rp + g.ra, 2 * g.a)).toBeLessThan(1e-14);
    expect(relativeError(g.ra - g.rp, 2 * g.c)).toBeLessThan(1e-14);
    expect(relativeError(g.b * g.b, g.a * g.a * (1 - 0.36))).toBeLessThan(1e-14);
    // every point is 2a from the two foci together (the gardener's ellipse)
    const f2 = 2 * g.centreX;
    for (const [x, y] of sampleConic(g.p, g.e, 1e12, 40)) expect(relativeError(Math.hypot(x, y) + Math.hypot(x - f2, y), 2 * g.a)).toBeLessThan(1e-12);
  });

  it('a parabola has its asymptote angle at π; a hyperbola deflects by χ with sin(χ/2) = 1/e, and e → ∞ is a straight line', () => {
    expect(conicGeometry(1e7, 1).thetaInf).toBe(Math.PI);
    const h = conicGeometry(1e7, 2);
    expect(relativeError(h.thetaInf ?? 0, (2 * Math.PI) / 3)).toBeLessThan(1e-14);
    expect(relativeError(Math.sin((h.deflection ?? 0) / 2), 0.5)).toBeLessThan(1e-14);
    expect(conicGeometry(1e7, 1e6).deflection ?? 1).toBeLessThan(3e-6);
    // the hyperbola's points satisfy |r − r′| = 2|a| with the second focus at −2ae
    const f2 = 2 * h.centreX;
    for (const [x, y] of sampleConic(h.p, h.e, 1e9, 40)) expect(relativeError(Math.hypot(x - f2, y) - Math.hypot(x, y), 2 * Math.abs(h.a))).toBeLessThan(1e-9);
  });

  it('a sideways launch at the circular speed is a circle, at the escape speed a parabola, and e = |β² − 1| in between', () => {
    expect(launch(GM, R0, circularSpeed(GM, R0)).el.kind).toBe('circle');
    expect(relativeError(launch(GM, R0, escapeSpeed(GM, R0)).el.e, 1)).toBeLessThan(1e-12);
    for (const beta of [0.5, 0.9, 1.2, 1.6]) {
      const L = launch(GM, R0, beta * circularSpeed(GM, R0));
      expect(relativeError(L.el.e, sidewaysEccentricity(beta))).toBeLessThan(1e-12);
      // faster than circular: the launch point is the periapsis; slower: the apoapsis
      expect(L.launchAt).toBe(beta > 1 ? 'periapsis' : 'apoapsis');
      expect(relativeError(beta > 1 ? L.geo.rp : L.geo.ra, R0)).toBeLessThan(1e-12);
    }
  });

  it('a cone cut perpendicular to its axis is a circle, parallel to a generator a parabola (e = cos β / cos α)', () => {
    const alpha = Math.PI / 3;
    expect(coneEccentricity(alpha, Math.PI / 2)).toBeLessThan(1e-15);
    expect(relativeError(coneEccentricity(alpha, alpha), 1)).toBeLessThan(1e-15);
    expect(relativeError(coneCutAngle(1, alpha) ?? 0, alpha)).toBeLessThan(1e-15);
    expect(coneCutAngle(2.5, alpha)).toBeNull();
    const ring = coneSection(alpha, Math.PI / 2, 1, 10);
    expect(ring.length).toBe(1);
    const r0 = Math.hypot(ring[0][0][0], ring[0][0][1]);
    for (const P of ring[0]) expect(relativeError(Math.hypot(P[0], P[1]), r0)).toBeLessThan(1e-12);
  });
});

describe('conservation', () => {
  it('the integrated trajectory satisfies the orbit equation: u = 1/r obeys d²u/dθ² + u = GM/h² along the path', () => {
    const L = launch(GM, R0, 1.25 * circularSpeed(GM, R0));
    const { samples } = integrateTrajectory(GM, L.state, { tMax: orbitalPeriod(GM, L.el.a), rMax: 1e12, rMin: 1, eta: 0.002 });
    const pts = samples.map((s) => ({ th: Math.atan2(s.y, s.x), u: 1 / Math.hypot(s.x, s.y) })).filter((q) => q.th > 0.2 && q.th < 2.8);
    const target = (GM / (L.el.h * L.el.h)) as number;
    // second derivative by finite differences on the integrator's (slightly non-uniform) grid, at a spread of points;
    // the three-point formula is first order in the spacing's asymmetry, so the stencil is kept to neighbours
    for (let k = 10; k < pts.length - 10; k += Math.floor(pts.length / 12)) {
      const a = pts[k - 1];
      const b = pts[k];
      const c = pts[k + 1];
      const d2 = (2 * ((c.u - b.u) / (c.th - b.th) - (b.u - a.u) / (b.th - a.th))) / (c.th - a.th);
      expect(relativeError(d2 + b.u, target)).toBeLessThan(1e-5);
    }
  });

  it('the integrated hyperbola stays on r = p/(1 + e cos θ) until it leaves, and never turns past the asymptote', () => {
    const L = launch(GM, R0, 1.6 * circularSpeed(GM, R0));
    const { samples, hit } = integrateTrajectory(GM, L.state, { tMax: 1e7, rMax: 40 * R0, rMin: 1 });
    expect(hit).toBe('escaped');
    for (const s of samples.filter((_, i) => i % 50 === 0)) {
      const th = Math.atan2(s.y, s.x);
      expect(relativeError(Math.hypot(s.x, s.y), radiusAt(L.el.p, L.el.e, th))).toBeLessThan(1e-7);
      expect(th).toBeLessThan(L.geo.thetaInf ?? 0);
    }
  });

  it('the cut of the cone at β is a conic of eccentricity cos β / cos α (its in-plane axes give e)', () => {
    const alpha = Math.PI / 3;
    const beta = 1.2; // > α: an ellipse
    const [curve] = coneSection(alpha, beta, 1, 100, 2000);
    const pts = curve.map((P) => inPlane(beta, P));
    const s = pts.map((q) => q[0]);
    const a = (Math.max(...s) - Math.min(...s)) / 2;
    const b = Math.max(...pts.map((q) => Math.abs(q[1])));
    expect(relativeError(Math.sqrt(1 - (b * b) / (a * a)), coneEccentricity(alpha, beta))).toBeLessThan(1e-4);
  });
});

describe('scaling', () => {
  it('the shape of a sideways launch depends only on β = v₀/v_circ: the same β around a heavier centre gives the same e, and p scales with r₀', () => {
    const a = launch(GM, R0, 1.3 * circularSpeed(GM, R0));
    const b = launch(4 * GM, 3 * R0, 1.3 * circularSpeed(4 * GM, 3 * R0));
    expect(relativeError(a.el.e, b.el.e)).toBeLessThan(1e-12);
    expect(relativeError(b.el.p, 3 * a.el.p)).toBeLessThan(1e-12);
  });

  it('the same speed in another direction keeps ε (so a) and lowers h (so raises e)', () => {
    const v = 0.9 * circularSpeed(GM, R0);
    const side = launch(GM, R0, v);
    const tilt = launch(GM, R0, v, 0.5);
    expect(relativeError(side.el.a, tilt.el.a)).toBeLessThan(1e-12);
    expect(tilt.el.e).toBeGreaterThan(side.el.e);
    expect(tilt.launchAt).toBe('other');
  });
});

describe('convergence', () => {
  it('the adaptive integrator closes an ellipse after one period, better as η shrinks (fourth order)', () => {
    const L = launch(GM, R_EARTH * 1.1, 1.3 * circularSpeed(GM, R_EARTH * 1.1));
    const T = orbitalPeriod(GM, L.el.a);
    const miss = (eta: number) => {
      const { samples } = integrateTrajectory(GM, L.state, { tMax: T, rMax: 1e12, rMin: 1, eta });
      const end = positionAt(samples, T);
      return Math.hypot(end[0] - L.state.r[0], end[1] - L.state.r[1]) / L.state.r[0];
    };
    const m1 = miss(0.02);
    const m2 = miss(0.01);
    expect(m2).toBeLessThan(1e-4);
    expect(m1 / m2).toBeGreaterThan(8);
  });

  it('u(θ) = (1 + e cos θ)/p is 1/r(θ) exactly', () => {
    for (const th of [0, 0.7, 2, 3]) expect(relativeError(uOfTheta(1e7, 0.4, th), 1 / radiusAt(1e7, 0.4, th))).toBeLessThan(1e-15);
  });
});
