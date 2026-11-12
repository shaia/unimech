import { describe, expect, it } from 'vitest';
import {
  doorInPoleFrame,
  eventAtProperTime,
  homeNow,
  homeSignals,
  poleBarnScene,
  properTimeTicks,
  smoothTripWorldline,
  travellerSignals,
  twinScene,
} from '~/physics/paradoxes';
import { classifyInterval, gammaOf, interval, lorentz, poleBarn, worldlineProperTime } from '~/physics/relativity';
import { relativeError } from '~/physics/vec';

// Twins in light-years and years (c = 1); the pole and barn in metres with c = 1 (ct in metres) unless stated.

describe('analytic limits', () => {
  it('the traveller ages 2L/(γv) and Earth 2L/v: 8.00 and 10.0 years for 3 light-years at 0.6c', () => {
    const s = twinScene(3, 0.6, 1);
    expect(relativeError(worldlineProperTime(s.home, 1), 10)).toBeLessThan(1e-12);
    expect(relativeError(worldlineProperTime(s.traveller, 1), 8)).toBeLessThan(1e-12);
    expect(relativeError(s.trip.traveller, 8)).toBeLessThan(1e-12);
    expect(relativeError(s.tauTurn, 4)).toBeLessThan(1e-12);
  });

  it('at the turnaround the outbound frame calls Earth reading 3.2 years "now" and the inbound frame 6.8: a jump of 2vL/c²', () => {
    const s = twinScene(3, 0.6, 1);
    const before = homeNow(s, s.tauTurn);
    const after = homeNow(s, s.tauTurn + 1e-9);
    expect(relativeError(before.home, 3.2)).toBeLessThan(1e-9);
    expect(relativeError(after.home, 6.8)).toBeLessThan(1e-7);
    expect(relativeError(s.jump, 2 * 0.6 * 3)).toBeLessThan(1e-12);
    expect(relativeError(before.home, s.trip.homeAtTurnOutbound)).toBeLessThan(1e-12);
  });

  it('as v → 0 the twins age alike and the jump vanishes', () => {
    const s = twinScene(3, 1e-4, 1);
    expect(relativeError(s.trip.traveller, s.trip.home)).toBeLessThan(1e-8);
    expect(s.jump / s.trip.home).toBeLessThan(1e-7);
  });

  it('in the pole frame the exit door acts γvLbarn/c² before the entrance door: 22.2 ns for a 5.0 m barn at 0.8c', () => {
    const c = 3.0e8;
    const s = poleBarnScene(6, 5, 0.8 * c, c);
    expect(relativeError(s.doorGapPole, (gammaOf(0.8) * 0.8 * 5) / c)).toBeLessThan(1e-12);
    expect(Number((s.doorGapPole * 1e9).toPrecision(3))).toBe(22.2);
    // the same gap as relativity.ts's poleBarn, whose pole sits elsewhere: the gap depends only on the doors
    const pb = poleBarn(6, 5, 0.8 * c, c);
    expect(relativeError(s.doorGapPole, pb.doorTimesPoleFrame[0] - pb.doorTimesPoleFrame[1])).toBeLessThan(1e-12);
  });

  it('as v → 0 the doors act together in both frames', () => {
    const s = poleBarnScene(6, 5, 1e-6, 1);
    expect(Math.abs(s.doorGapPole)).toBeLessThan(1e-5);
  });

  it('a pole that just fits (Lpole/γ = Lbarn) is touched by both doors in both frames', () => {
    const b = Math.sqrt(1 - (5 / 6) ** 2);
    const s = poleBarnScene(6, 5, b, 1);
    expect(Math.abs(s.clearanceBarn)).toBeLessThan(1e-12);
    expect(Math.abs(s.clearancePole)).toBeLessThan(1e-12);
  });
});

describe('conservation (what every frame agrees on)', () => {
  it("the traveller's account adds up to Earth's: outbound reading + jump + inbound ageing = 2L/v", () => {
    for (const [L, b] of [
      [3, 0.6],
      [4, 0.8],
      [12, 0.96],
      [1, 0.2],
    ]) {
      const s = twinScene(L, b, 1);
      const legEarth = s.tauTurn / s.gamma; // Earth's clock is slow by γ in each of her frames
      expect(relativeError(s.trip.homeAtTurnOutbound, legEarth)).toBeLessThan(1e-12);
      expect(relativeError(legEarth + s.jump + legEarth, s.trip.home)).toBeLessThan(1e-12);
    }
  });

  it("the signals each twin receives count the other's age: 10 from Earth, 8 from the traveller (3 ly, 0.6c)", () => {
    const s = twinScene(3, 0.6, 1);
    const fromHome = homeSignals(s, 1);
    expect(fromHome).toHaveLength(10);
    expect(fromHome.filter((g) => g.leg === 'out')).toHaveLength(2);
    expect(fromHome.filter((g) => g.leg === 'in')).toHaveLength(8);
    const fromTraveller = travellerSignals(s, 1);
    expect(fromTraveller).toHaveLength(8);
    // Earth sees the turnaround at L/v + L/c = 8 years: 4 signals before it, 4 after
    expect(fromTraveller.filter((g) => g.tauReceive <= 8 + 1e-9)).toHaveLength(4);
  });

  it('every signal runs along a light line and lands on the receiving worldline', () => {
    const s = twinScene(3, 0.6, 1);
    for (const g of [...homeSignals(s, 0.5), ...travellerSignals(s, 0.5)]) {
      const dt = g.receive.t - g.emit.t;
      const dx = g.receive.x - g.emit.x;
      expect(classifyInterval(dt, dx, 1)).toBe('lightlike');
      // the last signal is sent at the meeting itself, where sender and receiver coincide
      expect(dt).toBeGreaterThanOrEqual(0);
    }
    for (const g of homeSignals(s, 0.5)) {
      const tau = worldlineProperTime([{ t: 0, x: 0 }, ...(g.leg === 'in' ? [s.turn] : []), g.receive], 1);
      expect(relativeError(g.tauReceive, tau)).toBeLessThan(1e-9);
    }
  });

  it('the received rates are the Doppler factors: 1/D outbound, D inbound, with D = √((1+β)/(1−β))', () => {
    const s = twinScene(3, 0.6, 1);
    const D = Math.sqrt(1.6 / 0.4);
    const sig = homeSignals(s, 1);
    const out = sig.filter((g) => g.leg === 'out');
    const inn = sig.filter((g) => g.leg === 'in');
    expect(relativeError(out[1].tauReceive - out[0].tauReceive, D)).toBeLessThan(1e-12);
    expect(relativeError(inn[1].tauReceive - inn[0].tauReceive, 1 / D)).toBeLessThan(1e-12);
  });

  it('whether a door touches the pole is the same in both frames, for every speed', () => {
    for (let b = 0.05; b < 0.99; b += 0.01) {
      const s = poleBarnScene(6, 5, b, 1);
      expect(s.hitsPoleFrame).toEqual(s.hitsBarnFrame);
      expect(s.hitsBarnFrame[0]).toBe(!s.fitsInBarnFrame);
    }
  });

  it('the door events keep their interval: spacelike, s² = −Lbarn², so their order can differ between frames', () => {
    const s = poleBarnScene(6, 5, 0.8, 1);
    const [a, b] = s.doorsPole;
    expect(relativeError(interval(b.t - a.t, b.x - a.x, 1), -25)).toBeLessThan(1e-12);
    expect(classifyInterval(b.t - a.t, b.x - a.x, 1)).toBe('spacelike');
  });

  it("in the pole frame each door's event lies γ·(clearance in S) outside the pole: 1.17 m for 6.0 m in 5.0 m at 0.8c", () => {
    const s = poleBarnScene(6, 5, 0.8, 1);
    expect(relativeError(s.clearanceBarn, 0.7)).toBeLessThan(1e-12);
    expect(relativeError(s.clearancePole, s.gamma * 0.7)).toBeLessThan(1e-12);
    expect(relativeError(s.rearPole - s.doorsPole[0].x, s.doorsPole[1].x - s.frontPole)).toBeLessThan(1e-12);
    // the exit door's worldline in S′ passes its own event and moves at −v
    expect(relativeError(doorInPoleFrame(s, 1, s.doorsPole[1].t), s.doorsPole[1].x)).toBeLessThan(1e-12);
    const later = lorentz({ t: 2, x: 5 }, 0.8, 1);
    expect(relativeError(doorInPoleFrame(s, 1, later.t), later.x)).toBeLessThan(1e-12);
  });
});

describe('scaling', () => {
  it('at a fixed speed the age gap and the jump grow in proportion to the distance', () => {
    const a = twinScene(3, 0.6, 1);
    const b = twinScene(6, 0.6, 1);
    expect(relativeError(b.trip.home - b.trip.traveller, 2 * (a.trip.home - a.trip.traveller))).toBeLessThan(1e-12);
    expect(relativeError(b.jump, 2 * a.jump)).toBeLessThan(1e-12);
  });

  it('the pole-frame door gap grows in proportion to the barn length', () => {
    const a = poleBarnScene(6, 5, 0.8, 1);
    const b = poleBarnScene(12, 10, 0.8, 1);
    expect(relativeError(b.doorGapPole, 2 * a.doorGapPole)).toBeLessThan(1e-12);
  });
});

describe('convergence', () => {
  it('proper-time ticks fall on the worldline and the last one is the whole proper time', () => {
    const s = twinScene(3, 0.6, 1);
    const ticks = properTimeTicks(s.traveller, 1, 1);
    expect(ticks).toHaveLength(9);
    expect(relativeError(ticks[4].e.t, 5)).toBeLessThan(1e-12);
    expect(relativeError(ticks[4].e.x, 3)).toBeLessThan(1e-12);
    const e = eventAtProperTime(s.traveller, 6, 1);
    expect(relativeError(e.t, 7.5)).toBeLessThan(1e-12);
    expect(relativeError(e.x, 1.5)).toBeLessThan(1e-12);
  });

  it("a turnaround of duration Δ changes the traveller's age by less than Δ, and the instantaneous result is its limit", () => {
    const L = 3;
    const v = 0.6;
    const tau0 = (2 * L) / (gammaOf(v) * v);
    let prev = Infinity;
    for (const turn of [1, 0.1, 0.01]) {
      const tau = worldlineProperTime(smoothTripWorldline(L, v, turn, 2000), 1);
      const d = Math.abs(tau - tau0);
      expect(d).toBeLessThan(turn);
      expect(d).toBeLessThan(prev);
      prev = d;
    }
    expect(prev).toBeLessThan(0.01);
  });

  it('the sampled proper time of a finite turn converges as the turn is cut into more pieces', () => {
    const errs = [50, 200, 800].map((n) => worldlineProperTime(smoothTripWorldline(3, 0.6, 1, n), 1));
    expect(Math.abs(errs[2] - errs[1])).toBeLessThan(Math.abs(errs[1] - errs[0]));
  });
});
