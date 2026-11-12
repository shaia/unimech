import { describe, expect, it } from 'vitest';
import { instantaneousCentre, pointVelocity, rotationVelocity, uniformAlpha } from '~/physics/rigidbody';
import {
  accelerationAngle,
  accelerationMagnitude,
  alongLine,
  contactVelocity,
  equalComponentsFromRest,
  omegaAfterAngle,
  pointAccelerationVec,
  pointPosition,
  reversalTime,
  rimSpeedAtHeight,
  rollerBetween,
  rollingOmega,
  rollingOnBelt,
  rotate,
  uniformPose,
} from '~/physics/rigidkinematics';
import { len, relativeError, sub, type Vec2 } from '~/physics/vec';

const close = (a: Vec2, b: Vec2, tol = 1e-12) => expect(len(sub(a, b))).toBeLessThan(tol);

describe('analytic limits', () => {
  it('a wheel rolling without slipping has its contact point at rest and its top at 2V, its front point at √2 V heading 45° down', () => {
    const V = 1.2;
    const R = 0.4;
    const w = rollingOmega(V, R);
    close(contactVelocity([V, 0], w, R), [0, 0]);
    close(pointVelocity([V, 0], w, [0, R]), [2 * V, 0]);
    close(pointVelocity([V, 0], w, [R, 0]), [V, -V]);
  });

  it('pure rotation (V = 0) puts the instantaneous centre at the CM; pure translation (ω = 0) has none', () => {
    close(instantaneousCentre([0, 0], 2) as Vec2, [0, 0]);
    expect(instantaneousCentre([0.8, 0.3], 0)).toBeNull();
  });

  it('every point moves as if the body turned about the instantaneous centre: v = ω × (r − r_IC)', () => {
    const V: Vec2 = [0.6, 0.8];
    const w = 2.5;
    const ic = instantaneousCentre(V, w) as Vec2;
    for (const r of [[0.4, 0], [-0.4, 0], [0.1, -0.3]] as Vec2[]) close(pointVelocity(V, w, r), rotationVelocity(w, sub(r, ic)));
    expect(relativeError(len(ic), len(V) / w)).toBeLessThan(1e-14);
  });

  it('the rim speed at height h is 0 on the floor, V at h = R/2 and 2V on top', () => {
    expect(rimSpeedAtHeight(6, 0.35, 0)).toBe(0);
    expect(relativeError(rimSpeedAtHeight(6, 0.35, 0.175), 6)).toBeLessThan(1e-14);
    expect(relativeError(rimSpeedAtHeight(6, 0.35, 0.7), 12)).toBeLessThan(1e-14);
  });

  it('a body that turns about a fixed axis has only centripetal acceleration when α = 0, only tangential when ω = 0', () => {
    close(pointAccelerationVec([0, 0], 3, 0, [0.5, 0]), [-4.5, 0]);
    close(pointAccelerationVec([0, 0], 0, 2, [0.5, 0]), [0, 1]);
    expect(accelerationAngle(3, 0)).toBe(0);
    expect(relativeError(accelerationAngle(0, 2), Math.PI / 2)).toBeLessThan(1e-14);
  });

  it('the contact point of a wheel accelerating while it rolls has acceleration ω²R straight up', () => {
    const R = 0.3;
    const A = 2;
    const V = 6;
    const a = pointAccelerationVec([A, 0], rollingOmega(V, R), rollingOmega(A, R), [0, -R]);
    close(a, [0, (V * V) / R], 1e-12);
  });

  it('a roller on the floor (bottom board at rest) moves at half the speed of the board on top', () => {
    expect(rollerBetween(1, 0, 0.05).V).toBe(0.5);
    expect(rollerBetween(1, -1, 0.05).V).toBe(0);
    expect(rollingOnBelt(0.5, 0.5, 0.25)).toBe(0);
  });
});

describe('conservation', () => {
  it('rigidity: two points of the body have equal velocity components along the line that joins them', () => {
    const V: Vec2 = [0.7, -0.4];
    const w = -1.8;
    const rA: Vec2 = [0.3, 0.2];
    const rB: Vec2 = [-0.5, 0.6];
    const [a, b] = alongLine(rA, pointVelocity(V, w, rA), rB, pointVelocity(V, w, rB));
    expect(relativeError(a, b)).toBeLessThan(1e-13);
  });

  it('uniform motion keeps every distance in the body: the ends of a rod stay a rod length apart', () => {
    for (const t of [0, 0.3, 1.7]) {
      const { R, phi } = uniformPose([0.1, -0.2], 0.4, [0.9, 0.5], 2.2, t);
      expect(relativeError(len(sub(pointPosition(R, phi, [0.5, 0]), pointPosition(R, phi, [-0.5, 0]))), 1)).toBeLessThan(1e-14);
    }
  });

  it('constant α: ω² − 2αθ stays ω₀² along the motion', () => {
    for (const t of [0.5, 2, 6]) {
      const { theta, omega } = uniformAlpha(0, 3, -0.75, t);
      expect(relativeError(omega * omega - 2 * -0.75 * theta, 9)).toBeLessThan(1e-13);
      expect(relativeError(omegaAfterAngle(3, -0.75, theta) as number, Math.abs(omega))).toBeLessThan(1e-12);
    }
  });
});

describe('scaling', () => {
  it('rotation velocity grows linearly with the distance from the CM; centripetal acceleration with ω²', () => {
    expect(relativeError(len(rotationVelocity(2, [0.8, 0])), 2 * len(rotationVelocity(2, [0.4, 0])))).toBeLessThan(1e-14);
    expect(relativeError(accelerationMagnitude(4, 0, 0.5), 4 * accelerationMagnitude(2, 0, 0.5))).toBeLessThan(1e-14);
  });

  it('from rest, a_c reaches a_t after half a radian, whatever α', () => {
    for (const alpha of [0.5, 4, 30]) {
      const { t, dphi } = equalComponentsFromRest(alpha);
      expect(relativeError(dphi, 0.5)).toBeLessThan(1e-14);
      const w = alpha * t;
      expect(relativeError(w * w, alpha)).toBeLessThan(1e-14);
    }
  });

  it('a body slowing at constant α stops after ω₀/|α| and turns back', () => {
    expect(relativeError(reversalTime(3, -0.75) as number, 4)).toBeLessThan(1e-14);
    expect(reversalTime(3, 0.75)).toBeNull();
    expect(reversalTime(3, 0)).toBeNull();
  });
});

describe('convergence', () => {
  it('the derivative of a point’s position along the uniform motion converges (O(h²)) to V + ω × r', () => {
    const R0: Vec2 = [0.2, -0.1];
    const V: Vec2 = [0.9, 0.5];
    const w = 2.2;
    const b: Vec2 = [0.5, 0.1];
    const t = 0.6;
    const at = (s: number) => {
      const { R, phi } = uniformPose(R0, 0.3, V, w, s);
      return pointPosition(R, phi, b);
    };
    const { phi } = uniformPose(R0, 0.3, V, w, t);
    const exact = pointVelocity(V, w, rotate(b, phi));
    const err = (h: number) => {
      const p = at(t + h);
      const m = at(t - h);
      return len(sub([(p[0] - m[0]) / (2 * h), (p[1] - m[1]) / (2 * h)], exact));
    };
    const e1 = err(1e-2);
    const e2 = err(5e-3);
    expect(e1).toBeLessThan(1e-3);
    expect(e1 / e2).toBeGreaterThan(3.9);
    expect(e1 / e2).toBeLessThan(4.1);
  });

  it('the second difference of a point’s position under constant α converges to A + α × r − ω² r', () => {
    const b: Vec2 = [0.5, 0];
    const at = (s: number) => pointPosition([0, 0], uniformAlpha(0, 1.5, 0.8, s).theta, b);
    const t = 1.2;
    const { theta, omega } = uniformAlpha(0, 1.5, 0.8, t);
    const exact = pointAccelerationVec([0, 0], omega, 0.8, rotate(b, theta));
    const err = (h: number) => {
      const p = at(t + h);
      const q = at(t);
      const m = at(t - h);
      return len(sub([(p[0] - 2 * q[0] + m[0]) / (h * h), (p[1] - 2 * q[1] + m[1]) / (h * h)], exact));
    };
    const e1 = err(1e-2);
    const e2 = err(5e-3);
    expect(e1 / e2).toBeGreaterThan(3.8);
    expect(e1 / e2).toBeLessThan(4.2);
  });
});
