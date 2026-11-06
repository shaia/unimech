/**
 * Level curves of a scalar function on a rectangle, by marching squares, joined into polylines.
 * Pure geometry, no DOM. Used to draw field lines as level curves of a flux function
 * (src/physics/wireflux.ts), so equally spaced levels give a line density proportional to |B|.
 */

import type { Vec2 } from '~/physics/vec';

export interface ContourBox {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

export interface ContourLine {
  /** the level index k: the curve f = (k + offset)·step */
  k: number;
  points: Vec2[];
  closed: boolean;
}

export interface ContourOptions {
  /** grid cells along x and y */
  nx: number;
  ny: number;
  /** spacing of the levels */
  step: number;
  /** levels sit at (k + offset)·step; 0.5 keeps them off symmetric zero lines */
  offset?: number;
  /** grid nodes where f is not evaluated (inside a wire's core); cells touching them are skipped */
  mask?: (x: number, y: number) => boolean;
  /** stop after this many levels per cell (a guard near singularities) */
  maxLevelsPerCell?: number;
}

/**
 * Level curves f(x, y) = (k + offset)·step over the box. Saddle cells are resolved by the value at
 * the cell centre. Polylines that come back to their start are marked closed.
 */
export function contourLines(f: (x: number, y: number) => number, box: ContourBox, o: ContourOptions): ContourLine[] {
  const { nx, ny, step } = o;
  const off = o.offset ?? 0.5;
  const maxPer = o.maxLevelsPerCell ?? 12;
  const dx = (box.xmax - box.xmin) / nx;
  const dy = (box.ymax - box.ymin) / ny;
  const X = (i: number) => box.xmin + i * dx;
  const Y = (j: number) => box.ymin + j * dy;
  const v = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = X(i);
      const y = Y(j);
      v[j * (nx + 1) + i] = o.mask?.(x, y) ? NaN : f(x, y);
    }
  }
  const at = (i: number, j: number) => v[j * (nx + 1) + i];
  // edge ids: horizontal edge from node (i, j) to (i+1, j) is 2·n(i, j); vertical to (i, j+1) is 2·n(i, j)+1
  const node = (i: number, j: number) => j * (nx + 1) + i;
  type Seg = { a: number; b: number; pa: Vec2; pb: Vec2 };
  const byLevel = new Map<number, Seg[]>();

  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c0 = at(i, j);
      const c1 = at(i + 1, j);
      const c2 = at(i + 1, j + 1);
      const c3 = at(i, j + 1);
      if (Number.isNaN(c0) || Number.isNaN(c1) || Number.isNaN(c2) || Number.isNaN(c3)) continue;
      const lo = Math.min(c0, c1, c2, c3);
      const hi = Math.max(c0, c1, c2, c3);
      const kLo = Math.ceil(lo / step - off);
      const kHi = Math.min(Math.floor(hi / step - off), kLo + maxPer - 1);
      for (let k = kLo; k <= kHi; k++) {
        const L = (k + off) * step;
        const idx = (c0 > L ? 1 : 0) | (c1 > L ? 2 : 0) | (c2 > L ? 4 : 0) | (c3 > L ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        // crossing points on the four edges: 0 bottom, 1 right, 2 top, 3 left
        const t = (a: number, b: number) => (L - a) / (b - a);
        const edge = (e: number): { id: number; p: Vec2 } => {
          switch (e) {
            case 0:
              return { id: 2 * node(i, j), p: [X(i) + t(c0, c1) * dx, Y(j)] };
            case 1:
              return { id: 2 * node(i + 1, j) + 1, p: [X(i + 1), Y(j) + t(c1, c2) * dy] };
            case 2:
              return { id: 2 * node(i, j + 1), p: [X(i) + t(c3, c2) * dx, Y(j + 1)] };
            default:
              return { id: 2 * node(i, j) + 1, p: [X(i), Y(j) + t(c0, c3) * dy] };
          }
        };
        const pairs: [number, number][] = [];
        if (idx === 5 || idx === 10) {
          const centreAbove = (c0 + c1 + c2 + c3) / 4 > L;
          // case 5: corners 0 and 2 above; case 10: corners 1 and 3 above
          const isolate02 = idx === 5 ? !centreAbove : centreAbove;
          if (isolate02) pairs.push([3, 0], [1, 2]);
          else pairs.push([0, 1], [2, 3]);
        } else {
          const crossed: number[] = [];
          if ((idx & 1) !== (idx & 2) >> 1) crossed.push(0);
          if (((idx & 2) >> 1) !== ((idx & 4) >> 2)) crossed.push(1);
          if (((idx & 8) >> 3) !== ((idx & 4) >> 2)) crossed.push(2);
          if ((idx & 1) !== ((idx & 8) >> 3)) crossed.push(3);
          if (crossed.length === 2) pairs.push([crossed[0], crossed[1]]);
        }
        let list = byLevel.get(k);
        if (!list) byLevel.set(k, (list = []));
        for (const [ea, eb] of pairs) {
          const A = edge(ea);
          const B = edge(eb);
          list.push({ a: A.id, b: B.id, pa: A.p, pb: B.p });
        }
      }
    }
  }

  const out: ContourLine[] = [];
  for (const [k, segs] of byLevel) {
    const ends = new Map<number, number[]>();
    segs.forEach((s, n) => {
      for (const id of [s.a, s.b]) {
        const l = ends.get(id);
        if (l) l.push(n);
        else ends.set(id, [n]);
      }
    });
    const used = new Uint8Array(segs.length);
    // follow the chain from edge `id`, leaving segment `from`
    const walk = (startSeg: number, id: number, pts: Vec2[]): number => {
      let cur = startSeg;
      let edgeId = id;
      for (;;) {
        const next = (ends.get(edgeId) ?? []).find((n) => n !== cur && !used[n]);
        if (next === undefined) return edgeId;
        used[next] = 1;
        const s = segs[next];
        if (s.a === edgeId) {
          pts.push(s.pb);
          edgeId = s.b;
        } else {
          pts.push(s.pa);
          edgeId = s.a;
        }
        cur = next;
      }
    };
    for (let n = 0; n < segs.length; n++) {
      if (used[n]) continue;
      used[n] = 1;
      const s = segs[n];
      const fwd: Vec2[] = [s.pa, s.pb];
      const endId = walk(n, s.b, fwd);
      let closed = endId === s.a;
      if (!closed) {
        const back: Vec2[] = [];
        walk(n, s.a, back);
        fwd.unshift(...back.reverse());
      }
      // a closed chain already ends on the crossing point of edge s.a, which is s.pa
      closed = closed && fwd.length > 3;
      out.push({ k, points: fwd, closed });
    }
  }
  return out;
}
