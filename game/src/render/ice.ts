// Gisement d'eau : un bloc de glace = une dalle givrée et quelques aiguilles de glace translucides.
// Tout est fabriqué dans le code (aucune texture à télécharger) ; un petit reflet de ciel fait briller les facettes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function tint(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const g2 = g.index ? g.toNonIndexed() : g;
  const n = g2.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g2.deleteAttribute('uv');
  return g2;
}

/** Bloc de glace d'environ 1 m de rayon, posé sur y = 0. */
export function iceGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Dalle de base, aplatie et un peu irrégulière (blanc bleuté, givrée).
  const slab = new THREE.DodecahedronGeometry(1, 0).scale(0.9, 0.3, 0.78).rotateY(0.4).translate(0, 0.12, 0);
  parts.push(tint(slab, new THREE.Color(0xa9dcf2)));
  // Aiguilles : prismes à 6 pans terminés en pointe, inclinés vers l'extérieur.
  const spikes: [number, number, number, number, number][] = [
    // x, z, hauteur, rayon, inclinaison
    [0.05, 0.0, 1.55, 0.26, 0.05], [0.42, 0.18, 1.05, 0.2, 0.35], [-0.38, 0.25, 0.95, 0.19, -0.4],
    [0.1, -0.45, 0.85, 0.17, 0.3], [-0.25, -0.3, 1.2, 0.2, -0.25], [0.55, -0.25, 0.6, 0.14, 0.55],
  ];
  const blues = [0x4fb3ea, 0x7cc9f2, 0x3a9fdc, 0x66bdee, 0x48a9e4, 0x8fd3f5];
  spikes.forEach(([x, z, h, r, lean], i) => {
    const body = new THREE.CylinderGeometry(r * 0.92, r, h * 0.72, 6).translate(0, h * 0.36, 0);
    const tip = new THREE.ConeGeometry(r * 0.92, h * 0.28, 6).translate(0, h * 0.72 + h * 0.14, 0);
    const s = mergeGeometries([body.toNonIndexed(), tip.toNonIndexed()])!;
    const dir = Math.atan2(z, x || 0.01);
    s.rotateZ(-lean * Math.cos(dir)).rotateX(lean * Math.sin(dir)).rotateY(i * 1.3).translate(x, 0.1, z);
    parts.push(tint(s, new THREE.Color(blues[i])));
  });
  const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }))!;
  g.computeVertexNormals();
  return g;
}

/** Petit ciel en dégradé, pour que la glace ait quelque chose à refléter. */
function skyEnv(renderer: THREE.WebGLRenderer): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const g = c.getContext('2d')!, grad = g.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, '#9fd2ff'); grad.addColorStop(0.45, '#e9f4ff'); grad.addColorStop(0.55, '#b0623d'); grad.addColorStop(1, '#3a1c12');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 32);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(44, 9, 3, 0, Math.PI * 2); g.fill();   // soleil
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer), env = pm.fromEquirectangular(t).texture;
  pm.dispose(); t.dispose();
  return env;
}

export function iceMaterial(renderer: THREE.WebGLRenderer): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    vertexColors: true, color: 0xffffff, roughness: 0.08, metalness: 0.05,
    emissive: 0x1b7cc4, emissiveIntensity: 0.32, transparent: true, opacity: 0.82,
    envMap: skyEnv(renderer), envMapIntensity: 0.75, flatShading: true,
  });
}
