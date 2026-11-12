import { describe, expect, it } from 'vitest';
import { G_NEWTON, M_EARTH, R_EARTH } from '~/physics/constants';
import { gravityForce, gravityPotential } from '~/physics/orbit';
import {
  enclosedMass,
  ringPull,
  shellField,
  shellPotential,
  shellRings,
  shellSum,
  sphereEnergy,
  sphereField,
  sphereForce,
  spherePotential,
  sphereSum,
} from '~/physics/shell';
import { relativeError } from '~/physics/vec';

// normalised units for the shape of the laws: G = M = R = 1
const U1 = { Gn: 1, M: 1, R: 1 };

describe('analytic limits', () => {
  it('outside a shell the summed rings pull like a point mass at the centre, GM/r²', () => {
    for (const r of [1.2, 1.6, 2.5, 7]) {
      const s = shellSum(U1.Gn, U1.M, U1.R, r, 40000);
      expect(relativeError(s.g, 1 / (r * r))).toBeLessThan(1e-5);
      expect(relativeError(s.g, shellField(1, 1, 1, r))).toBeLessThan(1e-5);
    }
  });

  it('inside a shell the summed rings cancel at every point, not only at the centre', () => {
    for (const r of [0, 0.15, 0.4, 0.65, 0.85]) {
      const s = shellSum(1, 1, 1, r, 40000);
      // the cancellation is between two finite sums: compare with their size
      expect(Math.abs(s.g)).toBeLessThan(1e-5 * Math.max(1, s.inward));
      expect(shellField(1, 1, 1, r)).toBe(0);
    }
  });

  it('off centre inside, the near rings pull outward and the far rings inward, in equal measure', () => {
    const s = shellSum(1, 1, 1, 0.7, 4000);
    expect(s.outward).toBeGreaterThan(0.1);
    expect(relativeError(s.inward, s.outward)).toBeLessThan(1e-5);
  });

  it('the shell potential is −GM/r outside and the constant −GM/R inside (the rings summed agree)', () => {
    for (const r of [0, 0.3, 0.9, 1.1, 3]) {
      const s = shellSum(1, 1, 1, r, 40000);
      expect(relativeError(s.u, shellPotential(1, 1, 1, r))).toBeLessThan(1e-5);
    }
    expect(shellPotential(1, 1, 1, 0.2)).toBe(-1);
    expect(relativeError(shellPotential(1, 1, 1, 4), -0.25)).toBeLessThan(1e-15);
  });

  it('on the shell the field is the mean of the two sides, GM/(2R²)', () => {
    expect(relativeError(shellField(1, 1, 1, 1), 0.5)).toBeLessThan(1e-15);
  });

  it('inside a uniform sphere g = GMr/R³: zero at the centre, GM/R² at the surface', () => {
    expect(sphereField(1, 1, 1, 0)).toBe(0);
    for (const r of [0.1, 0.37, 0.8, 1]) expect(relativeError(sphereField(1, 1, 1, r), r)).toBeLessThan(1e-14);
    const gs = (G_NEWTON * M_EARTH) / R_EARTH ** 2;
    expect(relativeError(sphereField(G_NEWTON, M_EARTH, R_EARTH, R_EARTH), gs)).toBeLessThan(1e-14);
  });

  it('a uniform sphere summed as shells of rings gives GMr/R³ inside and GM/r² outside', () => {
    for (const r of [0.33, 0.62, 1.4]) {
      const s = sphereSum(1, 1, 1, r, 300, 600);
      expect(relativeError(s.g, sphereField(1, 1, 1, r))).toBeLessThan(5e-3);
    }
  });

  it('the uniform sphere potential −GM(3R² − r²)/(2R³) is −3GM/(2R) at the centre and −GM/R at the surface', () => {
    expect(relativeError(spherePotential(1, 1, 1, 0), -1.5)).toBeLessThan(1e-15);
    expect(relativeError(spherePotential(1, 1, 1, 1), -1)).toBeLessThan(1e-15);
    expect(relativeError(spherePotential(1, 1, 1, 1 - 1e-12), -1)).toBeLessThan(1e-11);
  });

  it('outside a sphere the force and the energy are the point-mass law of orbit.ts', () => {
    const m = 1000;
    for (const r of [R_EARTH, 2 * R_EARTH, 7.3e7]) {
      expect(relativeError(sphereForce(G_NEWTON, M_EARTH, m, R_EARTH, r), gravityForce(G_NEWTON, M_EARTH, m, r))).toBeLessThan(1e-14);
      expect(relativeError(sphereEnergy(G_NEWTON, M_EARTH, m, R_EARTH, r), gravityPotential(G_NEWTON, M_EARTH, m, r))).toBeLessThan(1e-14);
    }
  });

  it('near the surface the change of −GMm/r over a small height h is mgh with g = GM/R²', () => {
    const m = 50;
    const h = 100;
    const dU = sphereEnergy(G_NEWTON, M_EARTH, m, R_EARTH, R_EARTH + h) - sphereEnergy(G_NEWTON, M_EARTH, m, R_EARTH, R_EARTH);
    const gs = (G_NEWTON * M_EARTH) / R_EARTH ** 2;
    expect(relativeError(dU, m * gs * h)).toBeLessThan(2 * (h / R_EARTH));
  });
});

describe('conservation', () => {
  it('equal-thickness rings have equal mass and together hold the whole shell (hat-box theorem)', () => {
    const rings = shellRings(5, 2, 37);
    expect(relativeError(rings.reduce((t, q) => t + q.m, 0), 5)).toBeLessThan(1e-14);
    expect(rings.every((q) => q.m === rings[0].m)).toBe(true);
  });

  it('the field is minus the slope of the potential energy: g = dU/dr per unit mass, inside and outside, for shell and sphere', () => {
    const d = 1e-6;
    for (const r of [0.3, 0.7, 1.5, 3]) {
      const gSphere = (spherePotential(1, 1, 1, r + d) - spherePotential(1, 1, 1, r - d)) / (2 * d);
      expect(relativeError(gSphere, sphereField(1, 1, 1, r))).toBeLessThan(1e-8);
      const gShell = (shellPotential(1, 1, 1, r + d) - shellPotential(1, 1, 1, r - d)) / (2 * d);
      expect(Math.abs(gShell - shellField(1, 1, 1, r))).toBeLessThan(1e-8);
    }
  });

  it('the layers of a uniform sphere add up to its mass, and the mass inside r is M r³/R³', () => {
    const s = sphereSum(1, 1, 1, 2, 50, 10);
    expect(relativeError(s.layers.reduce((t, l) => t + l.layer.m, 0), 1)).toBeLessThan(1e-13);
    expect(relativeError(enclosedMass(8, 2, 1), 1)).toBeLessThan(1e-15);
    expect(enclosedMass(8, 2, 3)).toBe(8);
  });

  it('the work done against gravity lifting a probe from r₁ to r₂ equals U(r₂) − U(r₁) (a sum of F dr)', () => {
    const m = 1;
    const r1 = 0.4;
    const r2 = 2.6;
    const n = 20000;
    let W = 0;
    for (let k = 0; k < n; k++) {
      const r = r1 + ((k + 0.5) * (r2 - r1)) / n;
      W += sphereForce(1, 1, m, 1, r) * ((r2 - r1) / n);
    }
    expect(relativeError(W, sphereEnergy(1, 1, m, 1, r2) - sphereEnergy(1, 1, m, 1, r1))).toBeLessThan(1e-6);
  });
});

describe('scaling', () => {
  it('outside, doubling the distance quarters the field; inside a uniform sphere, doubling it doubles the field', () => {
    expect(relativeError(shellField(1, 1, 1, 3) / shellField(1, 1, 1, 1.5), 0.25)).toBeLessThan(1e-14);
    expect(relativeError(sphereField(1, 1, 1, 0.8) / sphereField(1, 1, 1, 0.4), 2)).toBeLessThan(1e-14);
  });

  it('the field is proportional to the mass, and a ring pulls in proportion to its mass', () => {
    expect(relativeError(sphereField(1, 3, 1, 2), 3 * sphereField(1, 1, 1, 2))).toBeLessThan(1e-14);
    const ring = { x: 0.2, rho: Math.sqrt(1 - 0.04), m: 1 };
    expect(relativeError(ringPull(1, { ...ring, m: 4 }, 1.3).g, 4 * ringPull(1, ring, 1.3).g)).toBeLessThan(1e-14);
  });

  it('a ring seen from far away pulls like a point mass, G dM/r²', () => {
    const ring = { x: 0.3, rho: 0.5, m: 2 };
    const r = 1e4;
    expect(relativeError(ringPull(1, ring, r).g, 2 / (r - 0.3) ** 2)).toBeLessThan(1e-7);
  });
});

describe('convergence', () => {
  it('the ring sum outside a shell converges to GM/r² as 1/n²', () => {
    const err = (n: number) => Math.abs(shellSum(1, 1, 1, 1.6, n).g - 1 / 1.6 ** 2);
    const ratio = err(40) / err(80);
    expect(ratio).toBeGreaterThan(3.6);
    expect(ratio).toBeLessThan(4.4);
  });

  it('inside, a few rings leave a visible residue that many rings remove', () => {
    const few = Math.abs(shellSum(1, 1, 1, 0.6, 6).g);
    const many = Math.abs(shellSum(1, 1, 1, 0.6, 400).g);
    expect(few).toBeGreaterThan(1e-3);
    expect(many).toBeLessThan(few / 1000);
  });
});
