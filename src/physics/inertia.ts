/**
 * Moments of inertia built from pieces (lesson 8.2): a body is cut into n pieces, each piece's mass times the square
 * of its distance from the axis is summed, and the sum Σ mᵢ rᵢ² approaches the integral ∫ r² dm as n grows. The axis
 * can be moved parallel to itself, and the sum shows the parallel-axis theorem I = I_cm + M d². For the
 * perpendicular-axis theorem, the second moments Σ m x², Σ m y², Σ m z² of a plate, a disc and a ring that may have a
 * thickness. The standard results live in `rigidbody.ts`; this module only cuts bodies and sums them.
 *
 * MODEL SPECIFICATION
 * - System: one rigid body of mass M = 1 in body units (results are coefficients of M L² or M R²):
 *   a thin rod along x from 0 to L = 1 with uniform linear density λ = 1; a thin solid cone along x from its tip at 0
 *   to its base at 1, so λ(x) = 3x² (the cross-section grows as x²); a thin ring, a uniform disc and a uniform solid
 *   sphere of radius R = 1 centred at the origin. The axis is parallel to z (perpendicular to the page) and passes
 *   through (a, 0) for the rods, the ring and the disc; for the sphere it is parallel to a diameter, a distance |a|
 *   from it.
 * - Dynamics: none (geometry). I = Σ mᵢ rᵢ² with rᵢ the distance of piece i from the AXIS (not from a point); in the
 *   limit of small pieces I = ∫ r² dm.
 * - Boundary: n pieces of equal width: rod and cone into n segments; the ring into n equal arcs (the first centred at
 *   the top); the disc into n concentric rings of width R/n; the sphere into n slices of thickness 2R/n perpendicular
 *   to the axis. Each piece's mass is exact (its density integrated over it, so Σ mᵢ = M at every n); it sits at
 *   the middle of the piece (the midpoint rule). A disc's ring counts as a thin ring at its middle radius (r² + a²
 *   about the shifted axis); a sphere's slice counts as a thin disc of its middle radius (½ r² + a²).
 * - Ignored: the width of a piece (that is the error of the sum); for the perpendicular-axis bodies, nothing: their
 *   second moments are exact integrals of a box (plate), a solid cylinder (disc) and a thin-walled tube (ring) of
 *   thickness h along z, centred on z = 0.
 * - Valid when: n ≥ 1. The midpoint sum's error falls as 1/n² (rod: Σ = (1 − 1/n²)/12 exactly); the ring's sum is
 *   exact at every n (all its mass is at R). The parallel shift adds exactly M a² minus 2a Σ mᵢxᵢ, and Σ mᵢxᵢ is
 *   the CM of the pieces, exact for every body here except the cone (whose pieces sit at their middles, not at their
 *   own centres of mass).
 * - Failure modes: n < 1 is raised to 1 and a non-integer n rounded up; the sum is not a bound on the integral
 *   (the disc's sums lie below ½; the sphere's one slice gives ½, above ⅖, and two slices 0.375, below it).
 */

export type CutBody = 'rod' | 'cone' | 'ring' | 'disc' | 'sphere';

/** One piece of a cut body. Its contribution about the axis through (a, 0) is m·(own + (x − a)² + y²). */
export interface Piece {
  m: number;
  /** where the piece's mass sits, in the plane perpendicular to the axis */
  x: number;
  y: number;
  /** the piece's own squared distance from a parallel axis through its centre (0 for a point-like piece) */
  own: number;
  /** the piece's extent along the cutting variable: x (rod, cone), angle (ring), radius (disc), z (sphere) */
  lo: number;
  hi: number;
}

const pieceCount = (n: number) => Math.max(1, Math.ceil(n));

/** Cut a body into n pieces (see the MODEL SPECIFICATION). The masses sum to 1. */
export function cut(body: CutBody, n: number): Piece[] {
  const N = pieceCount(n);
  const out: Piece[] = [];
  for (let i = 0; i < N; i++) {
    if (body === 'rod' || body === 'cone') {
      const lo = i / N;
      const hi = (i + 1) / N;
      const m = body === 'rod' ? hi - lo : hi ** 3 - lo ** 3;
      out.push({ m, x: (lo + hi) / 2, y: 0, own: 0, lo, hi });
    } else if (body === 'ring') {
      const mid = Math.PI / 2 + (2 * Math.PI * i) / N;
      out.push({ m: 1 / N, x: Math.cos(mid), y: Math.sin(mid), own: 0, lo: mid - Math.PI / N, hi: mid + Math.PI / N });
    } else if (body === 'disc') {
      const lo = i / N;
      const hi = (i + 1) / N;
      const r = (lo + hi) / 2;
      // σ π R² = 1, so a ring of area π(hi² − lo²) has mass hi² − lo² (= 2 r Δr exactly)
      out.push({ m: hi * hi - lo * lo, x: 0, y: 0, own: r * r, lo, hi });
    } else {
      const lo = -1 + (2 * i) / N;
      const hi = -1 + (2 * (i + 1)) / N;
      const z = (lo + hi) / 2;
      // ρ (4/3)π = 1, so a slice has mass (3/4)∫(1 − z²)dz
      const m = 0.75 * (hi - lo - (hi ** 3 - lo ** 3) / 3);
      out.push({ m, x: 0, y: 0, own: 0.5 * (1 - z * z), lo, hi });
    }
  }
  return out;
}

/** Σ mᵢ rᵢ² about the axis through (a, 0), parallel to the body's own axis. */
export function pieceSum(pieces: readonly Piece[], a: number): number {
  let s = 0;
  for (const p of pieces) s += p.m * (p.own + (p.x - a) ** 2 + p.y * p.y);
  return s;
}

/** Total mass of the pieces (1 at every n: the cutting conserves mass). */
export const pieceMass = (pieces: readonly Piece[]) => pieces.reduce((s, p) => s + p.m, 0);

/** The x of the body's centre of mass: ½ for the rod, ¾ for the cone (∫ x·3x² dx), 0 for the round bodies. */
export function centreOfMass(body: CutBody): number {
  if (body === 'rod') return 0.5;
  if (body === 'cone') return 0.75;
  return 0;
}

/** The exact I about the CM, as a coefficient of M L² (rods) or M R² (round bodies). */
export function exactAboutCM(body: CutBody): number {
  switch (body) {
    case 'rod':
      return 1 / 12;
    case 'cone':
      return 3 / 80; // 3/5 − (3/4)²
    case 'ring':
      return 1;
    case 'disc':
      return 1 / 2;
    case 'sphere':
      return 2 / 5;
  }
}

/** The exact I about the parallel axis through (a, 0): I_cm + M d², d = |a − X_cm|. */
export const exactInertia = (body: CutBody, a: number) => exactAboutCM(body) + (a - centreOfMass(body)) ** 2;

/** Relative error of the n-piece sum against the integral, about the axis through (a, 0). */
export const sumError = (body: CutBody, n: number, a: number) => {
  const exact = exactInertia(body, a);
  return (pieceSum(cut(body, n), a) - exact) / exact;
};

/**
 * A thin spherical shell (M = R = 1) cut by planes perpendicular to the axis into n rings of equal polar-angle
 * width; ring i (polar angle θ from the axis) has mass (cos θ₀ − cos θ₁)/2 and radius sin θ about the axis.
 * The sum tends to 2/3 (lesson 8.2, the shell from rings).
 */
export function shellRingSum(n: number): number {
  const N = pieceCount(n);
  let s = 0;
  for (let i = 0; i < N; i++) {
    const t0 = (Math.PI * i) / N;
    const t1 = (Math.PI * (i + 1)) / N;
    const m = (Math.cos(t0) - Math.cos(t1)) / 2;
    s += m * Math.sin((t0 + t1) / 2) ** 2;
  }
  return s;
}

// ---------------------------------------------------------------- perpendicular-axis theorem

export type FlatBody = 'plate' | 'disc' | 'ring';

/**
 * Σ m x², Σ m y², Σ m z² of a body of mass 1 centred at the origin, flat in the xy plane but with thickness h along
 * z: a square plate of side 1 (a box 1 × 1 × h), a disc of radius 1 (a solid cylinder of height h), a ring of radius 1
 * (a thin-walled tube of height h).
 */
export function secondMoments(body: FlatBody, h: number): { xx: number; yy: number; zz: number } {
  const inPlane = body === 'plate' ? 1 / 12 : body === 'disc' ? 1 / 4 : 1 / 2;
  return { xx: inPlane, yy: inPlane, zz: (h * h) / 12 };
}

/** I about the x, y and z axes through the centre: I_x = Σ m(y² + z²), I_y = Σ m(x² + z²), I_z = Σ m(x² + y²). */
export function axisMoments(body: FlatBody, h: number) {
  const s = secondMoments(body, h);
  return { Ix: s.yy + s.zz, Iy: s.xx + s.zz, Iz: s.xx + s.yy, excess: 2 * s.zz };
}

// ---------------------------------------------------------------- bodies of the worked examples

/** A uniform flat washer (annulus, inner radius R1, outer R2) about its axis: ½ M (R1² + R2²). */
export const washer = (M: number, R1: number, R2: number) => 0.5 * M * (R1 * R1 + R2 * R2);

/** A uniform solid cylinder (radius R, length L) about a diameter through its centre: M R²/4 + M L²/12. */
export const cylinderAboutDiameter = (M: number, R: number, L: number) => (M * R * R) / 4 + (M * L * L) / 12;

/** A uniform square plate (side a) about an axis in its plane through its centre: M a²/12 for every direction. */
export const squareInPlane = (M: number, a: number) => (M * a * a) / 12;
