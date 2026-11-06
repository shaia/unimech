/**
 * Motion of a point body under a prescribed force.
 *
 * MODEL SPECIFICATION
 * - System: one point body of mass m; the force on it is a given function of its position,
 *   velocity and the time. The body does not disturb whatever exerts the force.
 * - Dynamics: Newton's second law, a = F/m, integrated with classical RK4.
 * - Boundary: none; callers stop integration at the ground, a wall or a track's end.
 * - Ignored: rotation and size of the body; anything the force function leaves out.
 * - Valid when: the body can be treated as a point and dt is small against the time over
 *   which the force changes (RK4's error per unit time falls as dt⁴).
 * - Failure modes: a stiff force (a very hard spring) with a large dt blows up; a force that
 *   switches abruptly (static ↔ kinetic friction, a collision) needs the caller to stop at
 *   the switch rather than step across it.
 */

import type { Vec3 } from './vec';

export interface Body {
  pos: Vec3;
  vel: Vec3;
  m: number;
}

/** The net force on the body [N], given its position, velocity and the time. */
export type Force = (pos: Vec3, vel: Vec3, t: number) => Vec3;

/** Constant gravity on a body of mass m, with the world's y axis pointing up. */
export const gravity =
  (m: number, g: number): Force =>
  () => [0, -m * g, 0];

/** One RK4 step of Newton's second law under the net force F. */
export function rk4Step(b: Body, F: Force, t: number, dt: number): Body {
  const acc = (p: Vec3, v: Vec3, tt: number): Vec3 => {
    const f = F(p, v, tt);
    return [f[0] / b.m, f[1] / b.m, f[2] / b.m];
  };
  const p0 = b.pos;
  const v0 = b.vel;
  const a1 = acc(p0, v0, t);
  const p2: Vec3 = [p0[0] + (v0[0] * dt) / 2, p0[1] + (v0[1] * dt) / 2, p0[2] + (v0[2] * dt) / 2];
  const v2: Vec3 = [v0[0] + (a1[0] * dt) / 2, v0[1] + (a1[1] * dt) / 2, v0[2] + (a1[2] * dt) / 2];
  const a2 = acc(p2, v2, t + dt / 2);
  const p3: Vec3 = [p0[0] + (v2[0] * dt) / 2, p0[1] + (v2[1] * dt) / 2, p0[2] + (v2[2] * dt) / 2];
  const v3: Vec3 = [v0[0] + (a2[0] * dt) / 2, v0[1] + (a2[1] * dt) / 2, v0[2] + (a2[2] * dt) / 2];
  const a3 = acc(p3, v3, t + dt / 2);
  const p4: Vec3 = [p0[0] + v3[0] * dt, p0[1] + v3[1] * dt, p0[2] + v3[2] * dt];
  const v4: Vec3 = [v0[0] + a3[0] * dt, v0[1] + a3[1] * dt, v0[2] + a3[2] * dt];
  const a4 = acc(p4, v4, t + dt);
  const pos: Vec3 = [
    p0[0] + (dt / 6) * (v0[0] + 2 * v2[0] + 2 * v3[0] + v4[0]),
    p0[1] + (dt / 6) * (v0[1] + 2 * v2[1] + 2 * v3[1] + v4[1]),
    p0[2] + (dt / 6) * (v0[2] + 2 * v2[2] + 2 * v3[2] + v4[2]),
  ];
  const vel: Vec3 = [
    v0[0] + (dt / 6) * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]),
    v0[1] + (dt / 6) * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]),
    v0[2] + (dt / 6) * (a1[2] + 2 * a2[2] + 2 * a3[2] + a4[2]),
  ];
  return { ...b, pos, vel };
}
