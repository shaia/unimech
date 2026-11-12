import { describe, expect, it } from 'vitest';
import { C_LIGHT } from '~/physics/constants';
import {
  addVelocities,
  betaFromDopplerRatio,
  betaFromGamma,
  betaFromRapidity,
  canBeCausal,
  classifyInterval,
  coLocalFrameVelocity,
  contractedLength,
  dilatedTime,
  dopplerFactor,
  dopplerFrequency,
  dopplerWavelength,
  etherTimeDifference,
  etherTimeParallel,
  etherTimePerpendicular,
  fringeShiftOnRotation,
  fringeShiftSmallSpeed,
  fromPrimedDiagram,
  galileo,
  gammaOf,
  gammaSmallSpeed,
  interval,
  inverseLorentz,
  lightClockTick,
  lorentz,
  lorentzGamma,
  poleBarn,
  primedAxes,
  properDistanceBetween,
  properLength,
  properTimeBetween,
  properTimeOfMovingClock,
  rapidity,
  simultaneityShift,
  simultaneousFrameVelocity,
  survivalFraction,
  toPrimedDiagram,
  transverseVelocity,
  twinTrip,
  velocityInFrame,
  worldlineProperTime,
  type Event,
} from '~/physics/relativity';
import { relativeError } from '~/physics/vec';

const c = C_LIGHT;
const close = (a: number, b: number, tol = 1e-12) => expect(relativeError(a, b)).toBeLessThan(tol);

describe('analytic limits', () => {
  it('γ of 0.6c is 1.25 and of 0.8c is 5/3', () => {
    close(gammaOf(0.6), 1.25);
    close(gammaOf(0.8), 5 / 3);
    close(lorentzGamma(0.6 * c), 1.25);
  });

  it('γ is 1 at rest and diverges toward c; no frame at or above c', () => {
    expect(gammaOf(0)).toBe(1);
    expect(gammaOf(0.999999)).toBeGreaterThan(700);
    expect(() => gammaOf(1)).toThrow(RangeError);
    expect(() => lorentzGamma(-1.2 * c)).toThrow(RangeError);
  });

  it('γ ≈ 1 + β²/2 at small speeds, with an error of about (3/8)β⁴', () => {
    const b = 1e-2;
    close(gammaOf(b) - gammaSmallSpeed(b), (3 / 8) * b ** 4, 1e-3);
  });

  it('the Lorentz transformation becomes the Galilean one when v ≪ c', () => {
    const e: Event = { t: 2, x: 30 };
    const v = 15;
    const L = lorentz(e, v);
    const G = galileo(e, v);
    close(L.x, G.x, 1e-14);
    close(L.t, G.t, 1e-14);
  });

  it('the event x = 9.0e8 m, t = 2.0 s seen at 0.6c is at x′ = 6.75e8 m, t′ = 0.25 s', () => {
    const p = lorentz({ t: 2, x: 9e8 }, 0.6 * c);
    close(p.x, 6.75e8);
    close(p.t, 0.25);
  });

  it('S′ moving at +v sees the origin of S move at −v', () => {
    const v = 0.6 * c;
    const p1 = lorentz({ t: 1, x: 0 }, v);
    const p2 = lorentz({ t: 3, x: 0 }, v);
    close((p2.x - p1.x) / (p2.t - p1.t), -v);
  });

  it('velocity addition: 0.6c ⊕ 0.6c = 0.882c, and anything ⊕ c = c', () => {
    close(addVelocities(0.6, 0.6, 1), 1.2 / 1.36);
    close(addVelocities(0.9, 1, 1), 1);
    close(addVelocities(1, -0.9, 1), 1);
  });

  it('velocity addition is Galilean at small speeds', () => {
    close(addVelocities(20, 30), 50, 1e-13);
  });

  it('a body at rest in S′ moves at v in S, and velocityInFrame inverts addVelocities', () => {
    close(addVelocities(0, 0.3, 1), 0.3);
    close(velocityInFrame(addVelocities(0.7, 0.5, 1), 0.5, 1), 0.7);
  });

  it('Doppler: approaching at 0.6c doubles the frequency; receding halves it; at rest no shift', () => {
    close(dopplerFactor(0.6), 2);
    close(dopplerFactor(-0.6), 0.5);
    expect(dopplerFactor(0)).toBe(1);
    close(dopplerFrequency(5e14, 0.6), 1e15);
    close(dopplerWavelength(400, -0.8), 1200);
  });

  it('the β that gives a Doppler ratio inverts the Doppler factor', () => {
    for (const b of [-0.9, -0.3, 0.2, 0.75]) close(betaFromDopplerRatio(dopplerFactor(b)), b, 1e-12);
  });

  it('Doppler is first-order classical at small speeds: f/f₀ ≈ 1 + β', () => {
    const b = 1e-4;
    close(dopplerFactor(b) - 1, b, 1e-3);
  });

  it('a transverse velocity seen from a moving frame is slowed by γ when u′ₓ = 0', () => {
    const [ux, uy] = transverseVelocity(0, 0.5, 0.6, 1);
    close(ux, 0.6);
    close(uy, 0.5 / 1.25);
  });

  it('light at any angle in S′ has speed c in S', () => {
    for (const th of [0, 0.4, 1.2, 2.5]) {
      const [ux, uy] = transverseVelocity(Math.cos(th), Math.sin(th), 0.7, 1);
      close(Math.hypot(ux, uy), 1, 1e-12);
    }
  });

  it('the interval classifies timelike, spacelike and lightlike pairs', () => {
    expect(classifyInterval(5, 3, 1)).toBe('timelike');
    expect(classifyInterval(3, 5, 1)).toBe('spacelike');
    expect(classifyInterval(4, -4, 1)).toBe('lightlike');
    expect(classifyInterval(1, c)).toBe('lightlike');
    expect(canBeCausal(3, 5, 1)).toBe(false);
    expect(canBeCausal(4, 4, 1)).toBe(true);
  });

  it('proper time between (Δt = 5, Δx = 3) is 4, and proper distance of a spacelike pair is its rest-frame length', () => {
    close(properTimeBetween(5, 3, 1)!, 4);
    expect(properTimeBetween(3, 5, 1)).toBeNull();
    close(properDistanceBetween(3, 5, 1)!, 4);
    expect(properDistanceBetween(5, 3, 1)).toBeNull();
    expect(properTimeBetween(2, 2, 1)).toBe(0);
  });

  it('the frame that makes a spacelike pair simultaneous moves at c²Δt/Δx; a timelike pair has a co-local frame', () => {
    const v = simultaneousFrameVelocity(3, 5, 1)!;
    close(v, 0.6);
    const d = lorentz({ t: 3, x: 5 }, v, 1);
    expect(Math.abs(d.t)).toBeLessThan(1e-12);
    close(d.x, 4);
    expect(simultaneousFrameVelocity(5, 3, 1)).toBeNull();
    const u = coLocalFrameVelocity(5, 3, 1)!;
    expect(Math.abs(lorentz({ t: 5, x: 3 }, u, 1).x)).toBeLessThan(1e-12);
    expect(coLocalFrameVelocity(3, 5, 1)).toBeNull();
  });

  it('the primed axes: the unit events lie on the calibration hyperbolae and the axes tilt by atan β', () => {
    const { ctUnit, xUnit, angle } = primedAxes(0.6);
    close(ctUnit[1] ** 2 - ctUnit[0] ** 2, 1);
    close(xUnit[0] ** 2 - xUnit[1] ** 2, 1);
    close(ctUnit[0] / ctUnit[1], 0.6);
    close(xUnit[1] / xUnit[0], 0.6);
    close(angle, Math.atan(0.6));
  });

  it('the diagram coordinates invert each other and agree with the Lorentz transformation', () => {
    const [x, ct] = fromPrimedDiagram(2, 3, 0.6);
    const [xp, ctp] = toPrimedDiagram(x, ct, 0.6);
    close(xp, 2);
    close(ctp, 3);
    const e = lorentz({ t: 5, x: 3 }, 0.6, 1);
    const [a, b] = toPrimedDiagram(3, 5, 0.6);
    close(a, e.x);
    close(b, e.t);
  });

  it('the twins: 4 ly at 0.8c takes 10 years at home and 6 on board', () => {
    const tr = twinTrip(4, 0.8, 1);
    close(tr.home, 10);
    close(tr.traveller, 6);
    close(tr.homeAtTurnOutbound, 1.8);
    close(tr.homeAtTurnInbound, 8.2);
  });

  it('the pole and the barn: a 10 m pole at 0.8c is 6 m in the barn; the exit door closes first in the pole frame', () => {
    const pb = poleBarn(10, 8, 0.8 * c);
    close(pb.poleInBarnFrame, 6);
    close(pb.barnInPoleFrame, 4.8);
    expect(pb.fitsInBarnFrame).toBe(true);
    close(pb.doorTimesPoleFrame[1], (-(5 / 3) * 0.8 * 8) / c);
    close(pb.doorPlacesPoleFrame[1], (5 / 3) * 8);
  });

  it('the ether model reduces to the classical Michelson–Morley estimate 2Lβ²/λ', () => {
    const L = 11;
    const v = 3e4;
    const lam = 550e-9;
    close(fringeShiftOnRotation(L, v, lam), fringeShiftSmallSpeed(L, v, lam), 1e-7);
    close(fringeShiftSmallSpeed(L, v, lam), 0.4, 1e-12);
  });

  it('the ether round trips equal the Galilean sums of the legs', () => {
    const L = 2;
    const v = 0.3 * c;
    close(etherTimeParallel(L, v), L / (c - v) + L / (c + v));
    // across: the light aims upstream so that its ground speed across is √(c² − v²)
    close(etherTimePerpendicular(L, v), (2 * L) / Math.sqrt(c * c - v * v));
    expect(etherTimeDifference(L, v)).toBeGreaterThan(0);
  });
});

describe('conservation (invariants)', () => {
  it('the interval is the same in every frame', () => {
    const e: Event = { t: 3.2, x: -1.7e8 };
    for (const b of [-0.9, -0.2, 0.3, 0.6, 0.95]) {
      const p = lorentz(e, b * c);
      close(interval(p.t, p.x), interval(e.t, e.x), 1e-12);
    }
  });

  it('the inverse transformation undoes the transformation', () => {
    const e: Event = { t: -4, x: 2.3e9 };
    const back = inverseLorentz(lorentz(e, 0.7 * c), 0.7 * c);
    close(back.t, e.t);
    close(back.x, e.x);
  });

  it('a light signal x = ct moves at c in every frame', () => {
    for (const b of [-0.8, 0.5, 0.99]) {
      const p = lorentz({ t: 2, x: 2 * c }, b * c);
      close(p.x, c * p.t);
    }
  });

  it('a light clock ticks at γ·2L₀/c whether it lies along or across the motion', () => {
    const L0 = 0.9;
    const v = 0.6 * c;
    const expected = dilatedTime((2 * L0) / c, v);
    close(lightClockTick(L0, v, 'transverse'), expected);
    close(lightClockTick(L0, v, 'longitudinal'), expected);
  });

  it('time dilation and length contraction are each other’s inverse helpers', () => {
    const v = 0.8 * c;
    close(properTimeOfMovingClock(dilatedTime(3, v), v), 3);
    close(properLength(contractedLength(10, v), v), 10);
  });

  it('the muon count is the same computed from the Earth frame and from the muon frame', () => {
    const g = 10;
    const b = betaFromGamma(g);
    const v = b * c;
    const tau = 2.2e-6;
    const H = 1e4;
    const earth = survivalFraction(H / v / g, tau); // Earth: flight time H/v, the muon's clock runs slow by γ
    const muon = survivalFraction(H / g / v, tau); // muon: the atmosphere is contracted to H/γ
    close(earth, muon);
  });

  it('a worldline’s proper time is frame-independent', () => {
    const wl: Event[] = [
      { t: 0, x: 0 },
      { t: 5, x: 4 },
      { t: 10, x: 0 },
    ];
    const tau = worldlineProperTime(wl, 1);
    close(tau, 6);
    const moved = wl.map((e) => lorentz(e, 0.8, 1));
    close(worldlineProperTime(moved, 1), tau);
  });
});

describe('scaling', () => {
  it('rapidities of collinear boosts add', () => {
    close(rapidity(addVelocities(0.5, 0.7, 1)), rapidity(0.5) + rapidity(0.7));
    close(betaFromRapidity(rapidity(0.3)), 0.3);
  });

  it('the simultaneity shift grows linearly with the distance and matches the transformation', () => {
    const v = 0.6 * c;
    const a = lorentz({ t: 0, x: 0 }, v);
    const b = lorentz({ t: 0, x: 1.5e9 }, v);
    close(b.t - a.t, simultaneityShift(1.5e9, v));
    close(simultaneityShift(3e9, v), 2 * simultaneityShift(1.5e9, v));
  });

  it('the ether fringe shift scales as β² and as L', () => {
    const lam = 500e-9;
    close(fringeShiftSmallSpeed(10, 2e4, lam) / fringeShiftSmallSpeed(10, 1e4, lam), 4);
    close(fringeShiftSmallSpeed(20, 1e4, lam) / fringeShiftSmallSpeed(10, 1e4, lam), 2);
  });

  it('the straight worldline is the longest in proper time between two events', () => {
    const straight = worldlineProperTime([{ t: 0, x: 0 }, { t: 10, x: 0 }], 1);
    for (const x of [1, 2, 3, 4.9]) {
      expect(worldlineProperTime([{ t: 0, x: 0 }, { t: 5, x }, { t: 10, x: 0 }], 1)).toBeLessThan(straight);
    }
  });
});

describe('convergence', () => {
  it('a finely broken worldline converges to the integral of dt/γ (uniform acceleration)', () => {
    // hyperbolic motion from rest, proper acceleration a = 1 (c = 1): x = √(1 + t²) − 1, τ = asinh(t)
    const T = 2;
    const pts = (n: number): Event[] =>
      Array.from({ length: n + 1 }, (_, i) => {
        const t = (T * i) / n;
        return { t, x: Math.sqrt(1 + t * t) - 1 };
      });
    const exact = Math.asinh(T);
    const e1 = Math.abs(worldlineProperTime(pts(50), 1) - exact);
    const e2 = Math.abs(worldlineProperTime(pts(100), 1) - exact);
    expect(e2).toBeLessThan(e1 / 3.5);
    close(worldlineProperTime(pts(2000), 1), exact, 1e-6);
  });
});
