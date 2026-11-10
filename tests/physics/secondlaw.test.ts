import { describe, expect, it } from 'vitest';
import { G, OMEGA_EARTH, R_EARTH } from '~/physics/constants';
import { accelerationInFrame } from '~/physics/galilean';
import { rk4Step, type Body } from '~/physics/motion';
import {
  accelerationFromForces,
  carPosition,
  carVelocity,
  constantForceMotion,
  forceFromPolar,
  gravityAtAltitude,
  hangingInVehicle,
  headToTail,
  inclineHorizontalPush,
  netForce,
  puckState,
  reducedGravityFlightTime,
  requiredForce,
  rotatingFrameAcceleration,
  sumOfMagnitudes,
  twoStringHang,
  wallContactTime,
} from '~/physics/secondlaw';
import { len, relativeError, scale, sub, type Vec2 } from '~/physics/vec';

const TOL = 1e-12;
const close = (a: number, b: number, tol = TOL) => expect(relativeError(a, b)).toBeLessThan(tol);
const closeVec = (a: Vec2, b: Vec2, tol = TOL) => {
  const m = Math.max(len(a), len(b));
  expect(m === 0 ? 0 : len(sub(a, b)) / m).toBeLessThan(tol);
};
const deg = Math.PI / 180;

describe('analytic limits', () => {
  it('a car at constant velocity is an inertial frame: a free puck stays at rest in it', () => {
    for (const t of [0, 1, 2.5]) {
      const s = puckState(3, 0, 1, false, t);
      expect(s.xr).toBe(0);
      expect(s.ar).toBe(0);
      expect(s.F).toBe(0);
    }
  });
  it('in an accelerating car a free puck accelerates backward at −A with no force on it, and stays put on the ground', () => {
    const s = puckState(0, 2, 1, false, 1.2);
    expect(s.F).toBe(0);
    expect(s.a).toBe(0);
    expect(s.x).toBe(0);
    close(s.ar, -2);
    close(s.xr, -0.5 * 2 * 1.2 * 1.2);
  });
  it('a puck tied in an accelerating car is at rest in the car while the string pulls it with m·A: ΣF = m a holds only on the ground', () => {
    const m = 1.5;
    const s = puckState(1, 2, m, true, 0.8);
    close(s.F, m * 2);
    close(s.F, m * s.a);
    expect(s.ar).toBe(0);
    expect(s.F).not.toBe(m * s.ar);
  });
  it('a braking car stops at V0/|A| and stays; after that the car frame is inertial again', () => {
    close(carPosition(2, -2, 5), 1);
    expect(carVelocity(2, -2, 5)).toBe(0);
    const s = puckState(2, -2, 1, false, 1.5);
    expect(s.ar).toBe(0);
    close(s.vr, 2);
    close(s.xr, 2 * 1.5 - 1);
  });
  it('the wall: √(2d/A) when accelerating, never at A = 0, and slower after the braking car has stopped', () => {
    close(wallContactTime(0, 2, 2), Math.sqrt(2));
    expect(wallContactTime(3, 0, 2)).toBe(Infinity);
    expect(wallContactTime(0, -2, 2)).toBe(Infinity);
    // V0 = 2, A = −2: stops at 1 s after 1 m of relative slide, then 1 m more at 2 m/s
    close(wallContactTime(2, -2, 2), 1.5);
    // a hard brake: the wall is reached before the stop
    close(wallContactTime(15, -5, 4), Math.sqrt(8 / 5));
  });
  it('a body hanging in a car that does not accelerate hangs straight down with T = m g', () => {
    const h = hangingInVehicle(0);
    expect(h.theta).toBe(0);
    close(h.tensionPerMass, G);
  });
  it('the hanging tilt is atan(a/g) on a level road, and zero downhill when a = g sin α (the vehicle falls freely along the slope)', () => {
    close(hangingInVehicle(2.5).theta, Math.atan(2.5 / G));
    const al = 20 * deg;
    expect(Math.abs(hangingInVehicle(G * Math.sin(al), al).theta)).toBeLessThan(1e-15);
    close(hangingInVehicle(G * Math.sin(al), al).tensionPerMass, G * Math.cos(al));
  });
  it('two strings share the weight equally when the car does not accelerate; the back one goes slack at A = g tan α', () => {
    const h = twoStringHang(2, 40 * deg, 0);
    close(h.front, h.back);
    close(h.front, (2 * G) / (2 * Math.cos(40 * deg)));
    const edge = twoStringHang(2, 40 * deg, G * Math.tan(40 * deg));
    expect(Math.abs(edge.back)).toBeLessThan(1e-12);
    expect(twoStringHang(2, 40 * deg, 9).slack).toBe(true);
  });
  it('on an incline with no push the block slides down at g sin θ, with N = m g cos θ', () => {
    const r = inclineHorizontalPush(2, 0, 30 * deg);
    close(r.a, -G * Math.sin(30 * deg));
    close(r.N, 2 * G * Math.cos(30 * deg));
  });
  it('the bank\'s incline push: 20 N horizontal on 2 kg at 30° gives 3.76 m/s² up the slope and N = 26.97 N', () => {
    const r = inclineHorizontalPush(2, 20, 30 * deg);
    expect(Math.abs(r.a - 3.76)).toBeLessThan(0.005);
    expect(Math.abs(r.N - 26.97)).toBeLessThan(0.005);
  });
  it('the weightless parabola needs a_p = g and keeps its time; a gentler one lasts longer', () => {
    close(reducedGravityFlightTime(25, 0), 25);
    expect(reducedGravityFlightTime(25, 3.7)).toBeGreaterThan(25);
  });
  it('gravity at the surface is g, and the lab at the equator accelerates at ω²R, a fraction of a percent of g', () => {
    close(gravityAtAltitude(0), G);
    const aLab = rotatingFrameAcceleration(OMEGA_EARTH, R_EARTH);
    expect(aLab / G).toBeLessThan(0.005);
    expect(Math.abs(aLab - 0.0339)).toBeLessThan(5e-5);
  });
});

describe('invariance', () => {
  it('the net force does not depend on the order in which the forces are added (head to tail ends at ΣF)', () => {
    const F: Vec2[] = [forceFromPolar(4, 0), forceFromPolar(3, 90 * deg), forceFromPolar(2.5, 200 * deg)];
    const chain = headToTail(F);
    closeVec(chain[chain.length - 1], netForce(F));
    const back = headToTail([F[2], F[0], F[1]]);
    closeVec(back[back.length - 1], netForce(F), 1e-15);
  });
  it('|a| does not depend on the axes: rotating every force by the same angle rotates a and keeps its size', () => {
    const F: Vec2[] = [[3, 4], [-1, 2]];
    const a = accelerationFromForces(F, 2);
    for (const phi of [0.3, 1.2, 2.9]) {
      const rot = (v: Vec2): Vec2 => [v[0] * Math.cos(phi) - v[1] * Math.sin(phi), v[0] * Math.sin(phi) + v[1] * Math.cos(phi)];
      close(len(accelerationFromForces(F.map(rot), 2)), len(a));
    }
  });
  it('a frame moving at constant velocity sees the same a, so ΣF = m a holds there too; an accelerating one does not', () => {
    const m = 2;
    const F: Vec2[] = [[4, 0], [0, 3]];
    const a = accelerationFromForces(F, m);
    closeVec(scale(accelerationInFrame(a, [0, 0]), m), netForce(F));
    const aCar = accelerationInFrame(a, [1.5, 0]);
    expect(len(sub(scale(aCar, m), netForce(F)))).toBeGreaterThan(1);
  });
  it('sum of magnitudes equals |ΣF| for parallel forces and exceeds it otherwise (triangle inequality)', () => {
    close(sumOfMagnitudes([[2, 0], [3, 0]]), len(netForce([[2, 0], [3, 0]])));
    const F: Vec2[] = [[4, 0], [0, 3]];
    close(len(netForce(F)), 5);
    close(sumOfMagnitudes(F), 7);
  });
  it('the unknown force that completes a set gives back the prescribed acceleration', () => {
    const known: Vec2[] = [[3, 1], [-2, 5]];
    const a: Vec2 = [0.7, -1.1];
    const Fx = requiredForce(4, a, known);
    closeVec(accelerationFromForces([...known, Fx], 4), a);
    closeVec(requiredForce(4, [0, 0], known), scale(netForce(known), -1));
  });
});

describe('scaling', () => {
  it('a ∝ 1/m at fixed forces, and a ∝ F at fixed mass', () => {
    const F: Vec2[] = [[3, 4]];
    close(len(accelerationFromForces(F, 1)) / len(accelerationFromForces(F, 4)), 4);
    close(len(accelerationFromForces([scale(F[0], 3)], 2)) / len(accelerationFromForces(F, 2)), 3);
  });
  it('the free puck\'s slide in the car grows as t² and in proportion to A', () => {
    close(puckState(0, 2, 1, false, 2).xr / puckState(0, 2, 1, false, 1).xr, 4);
    close(puckState(0, 3, 1, false, 1).xr / puckState(0, 1, 1, false, 1).xr, 3);
  });
  it('the hanging tension is m·√(g² + a²) on a level road', () => {
    for (const a of [0.5, 2.5, 20]) close(hangingInVehicle(a).tensionPerMass, Math.hypot(G, a));
  });
  it('the reduced-gravity flight time scales as 1/√a_p', () => {
    close(reducedGravityFlightTime(25, G - G / 4), 50);
  });
});

describe('convergence', () => {
  it('RK4 under a constant net force reproduces r0 + v0 t + ½ a t² to round-off', () => {
    const F: Vec2[] = [forceFromPolar(4, 0), forceFromPolar(3, 120 * deg)];
    const Fn = netForce(F);
    const m = 1.5;
    let b: Body = { pos: [0, 0, 0], vel: [2, 0, 0], m };
    const dt = 0.01;
    for (let i = 0; i < 200; i++) b = rk4Step(b, () => [Fn[0], Fn[1], 0], i * dt, dt);
    const exact = constantForceMotion([0, 0], [2, 0], Fn, m, 2);
    closeVec([b.pos[0], b.pos[1]], exact.r, 1e-10);
    closeVec([b.vel[0], b.vel[1]], exact.v, 1e-10);
  });
  it('integrating the free puck in the ground frame and transforming into the car frame gives x\' = −½At²', () => {
    const A = 2;
    let b: Body = { pos: [0, 0, 0], vel: [1, 0, 0], m: 1 };
    const dt = 0.001;
    const n = 1200;
    for (let i = 0; i < n; i++) b = rk4Step(b, () => [0, 0, 0], i * dt, dt);
    const t = n * dt;
    close(b.pos[0] - carPosition(1, A, t), puckState(1, A, 1, false, t).xr, 1e-9);
  });
});
