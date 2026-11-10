/**
 * Several bodies that act on one another (lesson 2.2): a book on a table in an elevator, blocks in a
 * row pushed by a hand, a block stacked on a block, a block on a table pulled by a hanging weight, and a
 * horse pulling a cart. Each scene lists every force twice over: on which body it acts and which agent
 * exerts it, with its third-law partner, so a free-body diagram is just "the forces whose `on` is this
 * body", and the partner of any force can be looked up.
 *
 * MODEL SPECIFICATION
 * - System: a few blocks, each a point body of mass m, and the agents outside the system that act on
 *   them (the Earth, a floor or a table, a hand, the ground, a rope). World axes: x horizontal, to the
 *   right; y up. A third-law pair is two forces of one interaction: F(on A by B) = −F(on B by A).
 * - Dynamics: Newton's second law for each body, ΣF = m·a, componentwise. Bodies that touch, or that a
 *   taut rope joins, share one acceleration magnitude (the constraint). The unknowns (that acceleration
 *   and the forces between the bodies: a contact push, a tension, the static friction that keeps a stack
 *   together, a normal force) solve a linear system, written row by row from the free-body diagrams
 *   and solved by `solveLinear` (Gaussian elimination with partial pivoting). The forces are constant,
 *   so the accelerations are too.
 * - Boundary: the scene is a snapshot: the forces and accelerations at one instant, with the bodies
 *   together (in contact, the rope taut, the stack not slipping).
 * - Ignored: friction between a block and the floor or table (smooth surfaces), except the road's given
 *   resistance on the cart; the masses of ropes and pulleys and the pulley's friction; air resistance;
 *   the bodies' size and rotation (every force acts through the body); the Earth's acceleration (its
 *   partner forces are listed, but the Earth is an agent, not a body of the system).
 * - Valid when: touching blocks push (P ≥ 0), the rope pulls (T ≥ 0), every normal force is ≥ 0, and
 *   the static friction a stack needs is available, |f| ≤ μs·N (`muNeeded` reports |f|/N; it is not
 *   enforced). `ok` lists each condition.
 * - Failure modes: a hand that pulls instead of pushing (F < 0) separates the blocks (P < 0); an
 *   elevator falling faster than g (aUp < −g) gives N < 0, the book leaves the table; a road
 *   resistance larger than the horse's push would need the cart to move backwards (a < 0), which a
 *   resistance never does: the scene reports it as not ok.
 */

import { G } from './constants';

export type Vec2 = [number, number];
export type ForceKind = 'weight' | 'normal' | 'contact' | 'tension' | 'friction' | 'applied';
export type SceneName = 'book' | 'contact' | 'stack' | 'pulley' | 'horse';

export interface SceneBody {
  id: string;
  /** Hebrew name, as the readout and the controls write it */
  name: string;
  /** symbol for the body's mass, "_{…}" marks a subscript */
  massSymbol: string;
  m: number;
  /** acceleration [m/s²] */
  a: Vec2;
}

export interface Force {
  /** `${on}<${by}:${kind}` */
  id: string;
  /** the body (or agent) the force acts on */
  on: string;
  /** the body (or agent) that exerts it */
  by: string;
  kind: ForceKind;
  /** label, "_{…}" marks a subscript; both forces of a pair share it (they have the same magnitude) */
  symbol: string;
  /** [N] */
  vec: Vec2;
  /** id of its third-law partner, which acts on `by` and is exerted by `on` */
  pair: string;
}

export interface Scene {
  name: SceneName;
  bodies: SceneBody[];
  /** agents outside the system: id → Hebrew name */
  agents: Record<string, string>;
  forces: Force[];
  /** the model's conditions (see Valid when), each true when it holds */
  ok: Record<string, boolean>;
  /** |f|/N between stacked blocks: the smallest static friction coefficient that keeps them together */
  muNeeded?: number;
}

/* --------------------------------------------------------------------------- linear algebra */

/**
 * Solve A·x = b by Gaussian elimination with partial pivoting. A is n×n and not changed. Throws on a
 * singular matrix (a scene whose equations do not fix its unknowns).
 */
export function solveLinear(A: readonly (readonly number[])[], b: readonly number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('solveLinear: singular system');
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const k = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j];
    x[r] = s / M[r][r];
  }
  return x;
}

/* --------------------------------------------------------------------------- building scenes */

const neg = (v: Vec2): Vec2 => [-v[0], -v[1]];
const fid = (on: string, by: string, kind: ForceKind) => `${on}<${by}:${kind}`;

/** Push a force on `on` by `by` and its third-law partner on `by` by `on`. */
function interact(list: Force[], on: string, by: string, kind: ForceKind, symbol: string, vec: Vec2) {
  const a = fid(on, by, kind);
  const b = fid(by, on, kind);
  list.push({ id: a, on, by, kind, symbol, vec, pair: b });
  list.push({ id: b, on: by, by: on, kind, symbol, vec: neg(vec), pair: a });
}

const EARTH = 'כדור הארץ';

/* ------------------------------------------------------------------ book on a table, in an elevator */

export interface BookParams {
  /** book [kg] */
  mBook: number;
  /** table [kg] */
  mTable: number;
  /** the elevator's acceleration, up positive [m/s²]; 0 = a room at rest */
  aUp: number;
  g?: number;
}

/**
 * A book on a table, the table on the floor of an elevator that accelerates upward at aUp. Unknowns:
 * N₁ (table on book) and N₂ (floor on table). Book: N₁ − m g = m aUp; table: N₂ − N₁ − M g = M aUp.
 */
export function bookScene(p: BookParams): Scene {
  const g = p.g ?? G;
  const { mBook: m, mTable: M, aUp } = p;
  const [N1, N2] = solveLinear(
    [
      [1, 0],
      [-1, 1],
    ],
    [m * (g + aUp), M * (g + aUp)],
  );
  const forces: Force[] = [];
  interact(forces, 'book', 'earth', 'weight', 'mg', [0, -m * g]);
  interact(forces, 'book', 'table', 'normal', 'N_{1}', [0, N1]);
  interact(forces, 'table', 'earth', 'weight', 'Mg', [0, -M * g]);
  interact(forces, 'table', 'floor', 'normal', 'N_{2}', [0, N2]);
  return {
    name: 'book',
    bodies: [
      { id: 'book', name: 'הספר', massSymbol: 'm', m, a: [0, aUp] },
      { id: 'table', name: 'השולחן', massSymbol: 'M', m: M, a: [0, aUp] },
    ],
    agents: { earth: EARTH, floor: 'הרצפה' },
    forces,
    ok: { 'N₁ ≥ 0': N1 >= 0, 'N₂ ≥ 0': N2 >= 0 },
  };
}

/* ------------------------------------------------------------------ blocks in a row, pushed by a hand */

export interface ContactParams {
  /** masses from left to right [kg] (2 or more) */
  masses: number[];
  /** the hand's push [N] */
  F: number;
  /** the side the hand pushes from: 'left' pushes the first block to the right */
  side: 'left' | 'right';
  g?: number;
}

const CONTACT_SYMBOL = ['P', 'Q', 'R', 'S'];

/**
 * Blocks in a row on a smooth floor, a hand pushing the end one horizontally. Unknowns: the
 * acceleration a (x component) and the push P_k between block k and block k+1 (positive = they push).
 * Block k: P_{k−1} − P_k (+ F on the pushed end) = m_k a.
 */
export function contactScene(p: ContactParams): Scene {
  const g = p.g ?? G;
  const n = p.masses.length;
  if (n < 2) throw new Error('contactScene: at least two blocks');
  const Fx = p.side === 'left' ? p.F : -p.F;
  // unknowns x = [a, P_1, …, P_{n−1}]
  const A: number[][] = [];
  const b: number[] = [];
  for (let k = 0; k < n; k++) {
    const row = new Array<number>(n).fill(0);
    row[0] = -p.masses[k];
    if (k > 0) row[k] += 1; // pushed to the right by the block on its left
    if (k < n - 1) row[k + 1] -= 1; // pushed to the left by the block on its right
    A.push(row);
    b.push(-((p.side === 'left' && k === 0) || (p.side === 'right' && k === n - 1) ? Fx : 0));
  }
  const x = solveLinear(A, b);
  const a = x[0];
  const P = x.slice(1);
  const ids = p.masses.map((_, k) => `b${k + 1}`);
  const forces: Force[] = [];
  const ok: Record<string, boolean> = {};
  ids.forEach((id, k) => {
    interact(forces, id, 'earth', 'weight', `m_{${k + 1}}g`, [0, -p.masses[k] * g]);
    interact(forces, id, 'floor', 'normal', `N_{${k + 1}}`, [0, p.masses[k] * g]);
  });
  const pushed = p.side === 'left' ? 0 : n - 1;
  interact(forces, ids[pushed], 'hand', 'applied', 'F', [Fx, 0]);
  for (let k = 0; k < n - 1; k++) {
    // block k+1 pushes block k to the left; the partner pushes block k+1 to the right
    interact(forces, ids[k], ids[k + 1], 'contact', CONTACT_SYMBOL[k] ?? `P_{${k + 1}}`, [-P[k], 0]);
    ok[`${CONTACT_SYMBOL[k] ?? `P${k + 1}`} ≥ 0`] = P[k] >= 0;
  }
  return {
    name: 'contact',
    bodies: ids.map((id, k) => ({ id, name: `גוש ${k + 1}`, massSymbol: `m_{${k + 1}}`, m: p.masses[k], a: [a, 0] as Vec2 })),
    agents: { earth: EARTH, floor: 'הרצפה', hand: 'היד' },
    forces,
    ok,
  };
}

/* ------------------------------------------------------------------ block A on block B */

export interface StackParams {
  /** top block A [kg] */
  mA: number;
  /** bottom block B [kg] */
  mB: number;
  /** horizontal pull to the right [N] */
  F: number;
  /** which block the pull acts on */
  on: 'A' | 'B';
  g?: number;
}

/**
 * Block A on block B, B on a smooth floor; a horizontal pull F on one of them; the two move together.
 * Unknowns: a and f, the friction of B on A (x component). A: f (+ F) = m_A a; B: −f (+ F) = m_B a.
 */
export function stackScene(p: StackParams): Scene {
  const g = p.g ?? G;
  const onA = p.on === 'A';
  const [a, f] = solveLinear(
    [
      [-p.mA, 1],
      [-p.mB, -1],
    ],
    [onA ? -p.F : 0, onA ? 0 : -p.F],
  );
  const NAB = p.mA * g;
  const forces: Force[] = [];
  interact(forces, 'A', 'earth', 'weight', 'm_{A}g', [0, -p.mA * g]);
  interact(forces, 'A', 'B', 'normal', 'N_{1}', [0, NAB]);
  interact(forces, 'A', 'B', 'friction', 'f', [f, 0]);
  interact(forces, 'B', 'earth', 'weight', 'm_{B}g', [0, -p.mB * g]);
  interact(forces, 'B', 'floor', 'normal', 'N_{2}', [0, (p.mA + p.mB) * g]);
  interact(forces, p.on, 'hand', 'applied', 'F', [p.F, 0]);
  return {
    name: 'stack',
    bodies: [
      { id: 'A', name: 'גוש A', massSymbol: 'm_{A}', m: p.mA, a: [a, 0] },
      { id: 'B', name: 'גוש B', massSymbol: 'm_{B}', m: p.mB, a: [a, 0] },
    ],
    agents: { earth: EARTH, floor: 'הרצפה', hand: 'היד' },
    forces,
    ok: { 'N₁ ≥ 0': NAB >= 0 },
    muNeeded: Math.abs(f) / NAB,
  };
}

/* ------------------------------------------------------------------ block on a table, hanging weight */

export interface PulleyParams {
  /** block on the table [kg] */
  M: number;
  /** hanging weight [kg] */
  m: number;
  g?: number;
}

/**
 * A block M on a smooth table, tied by a light rope over a light, frictionless pulley at the table's
 * edge to a hanging weight m. Unknowns: a (the block to the right, the weight down) and T.
 * Block: T = M a; weight, positive down: m g − T = m a.
 */
export function pulleyScene(p: PulleyParams): Scene {
  const g = p.g ?? G;
  const [a, T] = solveLinear(
    [
      [p.M, -1],
      [p.m, 1],
    ],
    [0, p.m * g],
  );
  const forces: Force[] = [];
  interact(forces, 'block', 'earth', 'weight', 'Mg', [0, -p.M * g]);
  interact(forces, 'block', 'table', 'normal', 'N', [0, p.M * g]);
  interact(forces, 'block', 'rope', 'tension', 'T', [T, 0]);
  interact(forces, 'weight', 'earth', 'weight', 'mg', [0, -p.m * g]);
  interact(forces, 'weight', 'rope', 'tension', 'T', [0, T]);
  return {
    name: 'pulley',
    bodies: [
      { id: 'block', name: 'הגוש', massSymbol: 'M', m: p.M, a: [a, 0] },
      { id: 'weight', name: 'המשקולת', massSymbol: 'm', m: p.m, a: [0, -a] },
    ],
    agents: { earth: EARTH, table: 'השולחן', rope: 'החוט' },
    forces,
    ok: { 'T ≥ 0': T >= 0 },
  };
}

/* ------------------------------------------------------------------ horse and cart */

export interface HorseParams {
  /** horse [kg] */
  mHorse: number;
  /** cart [kg] */
  mCart: number;
  /** the ground's forward push on the horse's hooves [N] */
  Fground: number;
  /** the road's resistance on the cart, backwards [N] */
  fRoad: number;
  g?: number;
}

/**
 * A horse pulls a cart through a harness. The ground pushes the horse forward (F); the road resists the
 * cart (f). Unknowns: a and T, the harness force. Horse: F − T = m_h a; cart: T − f = m_c a.
 */
export function horseScene(p: HorseParams): Scene {
  const g = p.g ?? G;
  const [a, T] = solveLinear(
    [
      [p.mHorse, 1],
      [p.mCart, -1],
    ],
    [p.Fground, -p.fRoad],
  );
  const forces: Force[] = [];
  interact(forces, 'horse', 'earth', 'weight', 'm_{1}g', [0, -p.mHorse * g]);
  interact(forces, 'horse', 'ground', 'normal', 'N_{1}', [0, p.mHorse * g]);
  interact(forces, 'horse', 'ground', 'friction', 'F', [p.Fground, 0]);
  interact(forces, 'horse', 'cart', 'tension', 'T', [-T, 0]);
  interact(forces, 'cart', 'earth', 'weight', 'm_{2}g', [0, -p.mCart * g]);
  interact(forces, 'cart', 'ground', 'normal', 'N_{2}', [0, p.mCart * g]);
  interact(forces, 'cart', 'ground', 'friction', 'f', [-p.fRoad, 0]);
  return {
    name: 'horse',
    bodies: [
      { id: 'horse', name: 'הסוס', massSymbol: 'm_{1}', m: p.mHorse, a: [a, 0] },
      { id: 'cart', name: 'העגלה', massSymbol: 'm_{2}', m: p.mCart, a: [a, 0] },
    ],
    agents: { earth: EARTH, ground: 'הקרקע' },
    forces,
    ok: { 'a ≥ 0': a >= 0, 'T ≥ 0': T >= 0 },
  };
}

/* --------------------------------------------------------------------------- reading a scene */

/** The free-body diagram of one body: every force that acts on it, and only those. */
export const freeBody = (s: Scene, bodyId: string): Force[] => s.forces.filter((f) => f.on === bodyId);

/** The third-law partner of a force. */
export function partnerOf(s: Scene, forceId: string): Force {
  const f = s.forces.find((x) => x.id === forceId);
  const q = f && s.forces.find((x) => x.id === f.pair);
  if (!q) throw new Error(`partnerOf: no force ${forceId} or no partner`);
  return q;
}

/** The vector sum of the forces on a body [N]. */
export function netForce(s: Scene, bodyId: string): Vec2 {
  return freeBody(s, bodyId).reduce<Vec2>((acc, f) => [acc[0] + f.vec[0], acc[1] + f.vec[1]], [0, 0]);
}

/** Whether an id names a body of the system (not an agent). */
export const isBody = (s: Scene, id: string) => s.bodies.some((b) => b.id === id);

/** The external forces on the system: forces on its bodies exerted by agents outside it. */
export const externalForces = (s: Scene): Force[] => s.forces.filter((f) => isBody(s, f.on) && !isBody(s, f.by));

/** The forces that bodies of the system exert on one another (they come in pairs). */
export const internalForces = (s: Scene): Force[] => s.forces.filter((f) => isBody(s, f.on) && isBody(s, f.by));

/** Magnitude of a vector [same unit]. */
export const mag = (v: Vec2) => Math.hypot(v[0], v[1]);
