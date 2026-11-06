/**
 * Ink shader for the course's 3D figures: a hand-inked look made of three parts.
 *  1. Toon bands: the light falls on a few flat tones, not a smooth gradient.
 *  2. Hatching: screen-space diagonal lines whose weight follows the darkness, cross-hatched in
 *     the deepest shade. Hatch lines stay a fixed number of pixels apart whatever the zoom,
 *     like pen strokes on a page.
 *  3. Outline: an inverted hull (the mesh pushed out along its normals, back faces only).
 *
 * Reusable: nothing here knows about charges or Gauss. Colours are passed in by the caller,
 * read from the CSS tokens (`readPalette`), so dark mode works. Import this file only from
 * code that is itself lazy-loaded: it pulls in three.js.
 */

import * as THREE from 'three';

export interface InkOptions {
  /** the lit colour of the surface */
  color: THREE.ColorRepresentation;
  /** the pen colour used for hatching */
  ink: THREE.ColorRepresentation;
  /** distance between hatch lines in CSS pixels */
  hatchGap?: number;
  /** direction towards the light, in view space */
  light?: THREE.Vector3;
  /**
   * 'solid' paints the whole surface; 'veil' keeps only the hatch strokes and a faint tint, so
   * a closed surface can be drawn without hiding what is inside it.
   */
  mode?: 'solid' | 'veil';
}

const vertex = /* glsl */ `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uInk;
uniform vec3 uLight;
uniform float uGap;
uniform float uVeil;
uniform float uPixelRatio;
varying vec3 vNormal;

// 1 where a diagonal stroke of relative weight w passes through this pixel
float stroke(float coord, float w) {
  float d = abs(fract(coord) - 0.5) * 2.0;
  return step(d, w);
}

void main() {
  vec3 n = normalize(vNormal);
  float rim = smoothstep(0.55, 0.92, 1.0 - abs(n.z));
  if (!gl_FrontFacing) n = -n;
  float lit = dot(n, normalize(uLight)) * 0.5 + 0.5;
  // three flat tones
  float tone = floor(lit * 3.0 + 0.5) / 3.0;
  float dark = 1.0 - tone;
  float px = gl_FragCoord.x / uPixelRatio;
  float py = gl_FragCoord.y / uPixelRatio;
  float wA = mix(clamp(dark * 1.3 - 0.1, 0.0, 0.85), clamp(dark * 0.9 - 0.3, 0.0, 0.45), uVeil);
  float a = stroke((px + py) / uGap, wA);
  float b = stroke((px - py) / uGap, clamp(dark * 1.6 - 0.8, 0.0, 0.85) * (1.0 - uVeil));
  float hatch = max(max(a, b), uVeil * rim);
  vec3 base = mix(uColor, uInk, 0.18 * dark);
  vec3 col = mix(base, uInk, hatch * 0.9);
  float alpha = mix(1.0, max(hatch * 0.7, 0.05 + 0.03 * dark), uVeil);
  gl_FragColor = vec4(col, alpha);
}`;

export function createInkMaterial(o: InkOptions): THREE.ShaderMaterial {
  const veil = o.mode === 'veil';
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uColor: { value: new THREE.Color(o.color) },
      uInk: { value: new THREE.Color(o.ink) },
      uLight: { value: (o.light ?? new THREE.Vector3(-0.5, 0.8, 0.6)).clone() },
      uGap: { value: o.hatchGap ?? 6 },
      uVeil: { value: veil ? 1 : 0 },
      uPixelRatio: { value: 1 },
    },
    transparent: veil,
    depthWrite: !veil,
    side: veil ? THREE.DoubleSide : THREE.FrontSide,
  });
}

/** Update an ink material's colours (theme change) without rebuilding it. */
export function setInkColors(m: THREE.ShaderMaterial, color: THREE.ColorRepresentation, ink: THREE.ColorRepresentation) {
  (m.uniforms.uColor.value as THREE.Color).set(color);
  (m.uniforms.uInk.value as THREE.Color).set(ink);
}

/** Tell every ink material the renderer's pixel ratio, so hatch spacing stays in CSS pixels. */
export function setInkPixelRatio(m: THREE.ShaderMaterial, ratio: number) {
  m.uniforms.uPixelRatio.value = ratio;
}

const outlineVertex = /* glsl */ `
uniform float uWidth;
void main() {
  vec3 p = position + normalize(normal) * uWidth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const outlineFragment = /* glsl */ `
uniform vec3 uInk;
void main() { gl_FragColor = vec4(uInk, 1.0); }`;

/** Back-face hull material: `width` is in the mesh's own units. */
export function createOutlineMaterial(ink: THREE.ColorRepresentation, width: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: outlineVertex,
    fragmentShader: outlineFragment,
    uniforms: { uInk: { value: new THREE.Color(ink) }, uWidth: { value: width } },
    side: THREE.BackSide,
  });
}

/** Add an ink outline to a mesh as a child, so it follows the mesh's transform. */
export function addInkOutline(mesh: THREE.Mesh, ink: THREE.ColorRepresentation, width: number): THREE.Mesh {
  const outline = new THREE.Mesh(mesh.geometry, createOutlineMaterial(ink, width));
  outline.name = 'ink-outline';
  mesh.add(outline);
  return outline;
}

/** Recolour the outline added by `addInkOutline`. */
export function setOutlineColor(mesh: THREE.Mesh, ink: THREE.ColorRepresentation) {
  const o = mesh.getObjectByName('ink-outline') as THREE.Mesh | undefined;
  if (o) ((o.material as THREE.ShaderMaterial).uniforms.uInk.value as THREE.Color).set(ink);
}
