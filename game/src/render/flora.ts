// Végétation dessinée en code : buisson de baies (nourriture des âges anciens).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Buisson de baies, environ 1,4 m de large, couleurs par sommet (un seul maillage, pour l'instanciation). */
export function berryBush(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const col = (g0: THREE.BufferGeometry, c: number) => {
    const g = g0.index ? g0.toNonIndexed() : g0, n = g.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(c);
    for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g;
  };
  const blobs = [[0, 0.45, 0, 0.55], [0.38, 0.35, 0.1, 0.42], [-0.35, 0.33, -0.05, 0.44], [0.05, 0.38, 0.36, 0.4], [-0.05, 0.36, -0.36, 0.4], [0.05, 0.78, 0, 0.38]];
  for (const [x, y, z, r] of blobs) parts.push(col(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), 0x3d7a32));
  for (let i = 0; i < 22; i++) {
    const b = blobs[i % blobs.length], t = rnd() * 6.28, p = rnd() * 1.3;
    const x = b[0] + Math.cos(t) * Math.sin(p) * b[3], y = b[1] + Math.cos(p) * b[3] * 0.95, z = b[2] + Math.sin(t) * Math.sin(p) * b[3];
    if (y < 0.25) continue;
    parts.push(col(new THREE.IcosahedronGeometry(0.055, 0).translate(x, y, z), i % 5 === 0 ? 0x7a1a4a : 0xd8243a));
  }
  return mergeGeometries(parts)!;
}
export const bushMaterial = () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
