/**
 * Two coupled oscillators on a line (lesson 5.5): normal modes, their frequencies and shapes, the general motion as
 * a superposition of the two modes, beats and the transfer of energy between the bodies.
 *
 * MODEL SPECIFICATION
 * - System: two point bodies of masses m₁, m₂ on a frictionless line. An outer spring k₁ joins a wall to body 1, a
 *   coupling spring k_c joins body 1 to body 2, and an outer spring k₂ joins body 2 to the other wall (k₂ = 0 is a
 *   free end; k₁ = k₂ = 0 is a free "molecule"). x₁, x₂ are the displacements from equilibrium, positive along +x
 *   (from body 1 towards body 2). Two pendulums of lengths L₁, L₂ joined by a weak spring are the same system with
 *   k_i = m_i g/L_i (small angles, x_i the horizontal displacement of bob i).
 * - Dynamics: the coupling spring is stretched by x₂ − x₁, so
 *     m₁ẍ₁ = −k₁x₁ + k_c(x₂ − x₁),    m₂ẍ₂ = −k₂x₂ − k_c(x₂ − x₁),
 *   i.e. M ẍ = −K x with M = diag(m₁, m₂) and K = [[k₁ + k_c, −k_c], [−k_c, k₂ + k_c]].
 *   Normal modes x = a cos(ωt + φ) solve (K − ω²M)a = 0, which has a ≠ 0 only when det(K − ω²M) = 0:
 *     ω² = (A + B)/2 ∓ √(((A − B)/2)² + C²),  A = (k₁ + k_c)/m₁, B = (k₂ + k_c)/m₂, C² = k_c²/(m₁m₂),
 *   and the shape a₂/a₁ = (k₁ + k_c − m₁ω²)/k_c. Equal bodies (m, k, k): ω₁² = k/m with (1, 1), ω₂² = (k + 2k_c)/m
 *   with (1, −1). The modes are M-orthogonal, a⁽¹⁾ᵀ M a⁽²⁾ = 0, which gives each mode's share of an initial state.
 *   General motion: x(t) = Σ a⁽ⁿ⁾ (Cₙ cos ωₙt + Sₙ sin ωₙt), Cₙ = a⁽ⁿ⁾ᵀMx₀ / a⁽ⁿ⁾ᵀMa⁽ⁿ⁾, Sₙωₙ = a⁽ⁿ⁾ᵀMv₀ / a⁽ⁿ⁾ᵀMa⁽ⁿ⁾
 *   (a zero mode, ω = 0, moves as Cₙ + Dₙt).
 *   Beats: from (a, 0) at rest the envelope of x₁ is a cos(Δω t/2) for equal bodies, Δω = ω₂ − ω₁; the energy is all
 *   in body 2 first at T_s = π/Δω and back in body 1 at the beat period 2π/Δω. Weak coupling: Δω ≈ k_c/(mω₁).
 * - Boundary: x₁, x₂, v₁, v₂ at t = 0.
 * - Ignored: friction and damping, the springs' masses, motion off the line, nonlinearity of the springs.
 * - Valid when: every spring obeys Hooke's law over the motion (for pendulums, small angles); no damping.
 * - Failure modes: near degeneracy (k_c → 0 with A = B) the mode shapes are undefined; `normalModes` returns the
 *   uncoupled shapes (1, 0) and (0, 1) when the matrix is diagonal. The lower ω² is computed as det/ω²_high so that a
 *   small ω² (free end, molecule) keeps its digits. `transferAmplitude` is the envelope ratio in mass-weighted
 *   coordinates y = √m x; read as an energy share it is exact only for weak coupling.
 */

export interface Coupled {
  m1: number;
  m2: number;
  /** outer spring of body 1 [N/m] (0 = none) */
  k1: number;
  /** outer spring of body 2 [N/m] (0 = free end) */
  k2: number;
  /** coupling spring between the bodies [N/m] */
  kc: number;
}

/** A normal mode: angular frequency [rad/s] and shape (a₁, a₂), scaled so the larger component is 1 in size and a₁ ≥ 0. */
export interface Mode {
  omega: number;
  shape: [number, number];
}

export interface State2 {
  x1: number;
  x2: number;
  v1: number;
  v2: number;
}

/** Equal bodies m on equal outer springs k with a coupling spring k_c. */
export const symmetric = (m: number, k: number, kc: number): Coupled => ({ m1: m, m2: m, k1: k, k2: k, kc });

/** The stiffness matrix K of M ẍ = −K x. */
export function stiffness(s: Coupled): [[number, number], [number, number]] {
  return [
    [s.k1 + s.kc, -s.kc],
    [-s.kc, s.k2 + s.kc],
  ];
}

/** The two squared mode frequencies ω², ascending, from det(K − ω²M) = 0. */
export function modeOmegaSquared(s: Coupled): [number, number] {
  const A = (s.k1 + s.kc) / s.m1;
  const B = (s.k2 + s.kc) / s.m2;
  const C2 = (s.kc * s.kc) / (s.m1 * s.m2);
  const hi = (A + B) / 2 + Math.sqrt(((A - B) / 2) ** 2 + C2);
  const det = A * B - C2;
  const lo = hi > 0 ? det / hi : 0;
  return [Math.max(0, lo), hi];
}

function normalise(a1: number, a2: number): [number, number] {
  const big = Math.max(Math.abs(a1), Math.abs(a2));
  let u: [number, number] = [a1 / big, a2 / big];
  if (u[0] < 0 || (u[0] === 0 && u[1] < 0)) u = [-u[0], -u[1]];
  return [u[0] === 0 ? 0 : u[0], u[1] === 0 ? 0 : u[1]];
}

/** The shape of the mode with squared frequency w2: a null vector of K − ω²M, from whichever row is better conditioned. */
function shapeAt(s: Coupled, w2: number, which: 0 | 1): [number, number] {
  const r1: [number, number] = [s.kc, s.k1 + s.kc - s.m1 * w2]; // from row 1: (k₁ + k_c − m₁ω²)a₁ = k_c a₂
  const r2: [number, number] = [s.k2 + s.kc - s.m2 * w2, s.kc]; // from row 2: k_c a₁ = (k₂ + k_c − m₂ω²)a₂
  const n1 = Math.hypot(r1[0], r1[1]);
  const n2 = Math.hypot(r2[0], r2[1]);
  const scale = Math.max(s.k1 + s.kc, s.k2 + s.kc, 1e-300);
  if (Math.max(n1, n2) < 1e-12 * scale) return which === 0 ? [1, 0] : [0, 1]; // uncoupled and degenerate
  return n1 >= n2 ? normalise(r1[0], r1[1]) : normalise(r2[0], r2[1]);
}

/** Both normal modes, lower frequency first. */
export function normalModes(s: Coupled): [Mode, Mode] {
  const [lo, hi] = modeOmegaSquared(s);
  if (s.kc === 0) {
    // uncoupled: each body is its own mode
    const w1 = s.k1 / s.m1;
    const w2 = s.k2 / s.m2;
    const a: Mode = { omega: Math.sqrt(w1), shape: [1, 0] };
    const b: Mode = { omega: Math.sqrt(w2), shape: [0, 1] };
    return w1 <= w2 ? [a, b] : [b, a];
  }
  return [
    { omega: Math.sqrt(lo), shape: shapeAt(s, lo, 0) },
    { omega: Math.sqrt(hi), shape: shapeAt(s, hi, 1) },
  ];
}

/** Equal bodies: ω₁ = √(k/m) (in phase) and ω₂ = √((k + 2k_c)/m) (opposite). */
export function symmetricFrequencies(m: number, k: number, kc: number): [number, number] {
  return [Math.sqrt(k / m), Math.sqrt((k + 2 * kc) / m)];
}

/** Each mode's coefficients in x(t) = Σ a⁽ⁿ⁾(Cₙ cos ωₙt + Sₙ sin ωₙt), from the initial state (M-orthogonality). */
export function modeCoefficients(s: Coupled, s0: State2, modes: [Mode, Mode] = normalModes(s)): { C: number; S: number }[] {
  return modes.map(({ omega, shape: [a1, a2] }) => {
    const norm = s.m1 * a1 * a1 + s.m2 * a2 * a2;
    const C = (s.m1 * a1 * s0.x1 + s.m2 * a2 * s0.x2) / norm;
    const D = (s.m1 * a1 * s0.v1 + s.m2 * a2 * s0.v2) / norm;
    // a zero mode (free molecule) drifts: S holds the velocity coefficient D itself
    return { C, S: omega > 0 ? D / omega : D };
  });
}

/** The closed-form motion at time t: the superposition of the two normal modes. */
export function motion(s: Coupled, s0: State2, t: number, modes: [Mode, Mode] = normalModes(s)): State2 {
  const co = modeCoefficients(s, s0, modes);
  const out: State2 = { x1: 0, x2: 0, v1: 0, v2: 0 };
  modes.forEach(({ omega, shape: [a1, a2] }, n) => {
    const { C, S } = co[n];
    let q: number;
    let qd: number;
    if (omega > 0) {
      const c = Math.cos(omega * t);
      const sn = Math.sin(omega * t);
      q = C * c + S * sn;
      qd = omega * (-C * sn + S * c);
    } else {
      q = C + S * t;
      qd = S;
    }
    out.x1 += a1 * q;
    out.x2 += a2 * q;
    out.v1 += a1 * qd;
    out.v2 += a2 * qd;
  });
  return out;
}

/** Energies: each body with its own outer spring, the coupling spring, and the total (conserved). */
export function energies(s: Coupled, st: State2): { E1: number; E2: number; Ec: number; E: number } {
  const E1 = 0.5 * s.m1 * st.v1 * st.v1 + 0.5 * s.k1 * st.x1 * st.x1;
  const E2 = 0.5 * s.m2 * st.v2 * st.v2 + 0.5 * s.k2 * st.x2 * st.x2;
  const d = st.x2 - st.x1;
  const Ec = 0.5 * s.kc * d * d;
  return { E1, E2, Ec, E: E1 + E2 + Ec };
}

/** Beats: Δω = ω₂ − ω₁, the transfer time T_s = π/Δω (first maximum of body 2 from (a, 0) at rest) and the beat period 2π/Δω. */
export function beats(s: Coupled): { dOmega: number; transferTime: number; beatPeriod: number; meanOmega: number } {
  const [a, b] = normalModes(s);
  const dOmega = b.omega - a.omega;
  return {
    dOmega,
    transferTime: dOmega > 0 ? Math.PI / dOmega : Number.POSITIVE_INFINITY,
    beatPeriod: dOmega > 0 ? (2 * Math.PI) / dOmega : Number.POSITIVE_INFINITY,
    meanOmega: (a.omega + b.omega) / 2,
  };
}

/** Weak-coupling splitting of equal bodies, Δω ≈ k_c/(mω₁) (from √(1 + ε) ≈ 1 + ε/2). */
export const weakSplitting = (m: number, k: number, kc: number) => kc / (m * Math.sqrt(k / m));

/**
 * Started from (a, 0) at rest, the largest envelope of body 2 relative to a, in mass-weighted coordinates
 * y = √m x: sin 2θ = 2C/√((A − B)² + 4C²). It is 1 for identical oscillators (complete transfer) and small when the
 * oscillators differ by much more than the coupling (detuning). Read as an energy share, sin²2θ, for weak coupling.
 */
export function transferAmplitude(s: Coupled): number {
  const A = (s.k1 + s.kc) / s.m1;
  const B = (s.k2 + s.kc) / s.m2;
  const C = s.kc / Math.sqrt(s.m1 * s.m2);
  const den = Math.hypot(A - B, 2 * C);
  return den > 0 ? (2 * C) / den : 1;
}

/** The accelerations of M ẍ = −K x. */
export function accel(s: Coupled, x1: number, x2: number): [number, number] {
  const f = s.kc * (x2 - x1);
  return [(-s.k1 * x1 + f) / s.m1, (-s.k2 * x2 - f) / s.m2];
}

/** RK4 integration of the coupled equations (the independent check of the closed form). */
export function integrateCoupled(s: Coupled, s0: State2, T: number, dt: number): State2 {
  const n = Math.max(1, Math.round(T / dt));
  const h = T / n;
  let y = [s0.x1, s0.x2, s0.v1, s0.v2];
  const f = (q: number[]) => {
    const [a1, a2] = accel(s, q[0], q[1]);
    return [q[2], q[3], a1, a2];
  };
  for (let i = 0; i < n; i++) {
    const k1 = f(y);
    const k2 = f(y.map((v, j) => v + 0.5 * h * k1[j]));
    const k3 = f(y.map((v, j) => v + 0.5 * h * k2[j]));
    const k4 = f(y.map((v, j) => v + h * k3[j]));
    y = y.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
  }
  return { x1: y[0], x2: y[1], v1: y[2], v2: y[3] };
}
