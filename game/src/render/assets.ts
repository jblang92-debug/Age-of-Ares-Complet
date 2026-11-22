// Chargement et mise en cache des modèles .gltf, avec mise à l'échelle par taille cible.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export const BASE = import.meta.env.BASE_URL;
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);   // modèles compressés (EXT_meshopt_compression)
// Textures chargées par <img> : fonctionne partout, y compris dans une page aux règles réseau strictes.
loader.register((parser) => {
  (parser as any).textureLoader = new THREE.TextureLoader((parser as any).options.manager);
  return { name: 'TEXTURES_PAR_IMG' } as any;
});

let glbServed: boolean | null = null;
/** Charge un .gltf (stocké en .json, géométrie incluse) et le remet au format binaire GLB en mémoire. */
async function loadGltf(url: string): Promise<GLTF> {
  // Les modèles sont livrés en .glb compressé (meshopt + textures WebP) ; le nom .json reste celui du code.
  if (url.endsWith('.json') && glbServed !== false) {
    const glbUrl = url.slice(0, -5) + '.glb';
    const r = await fetch(glbUrl).catch(() => null);
    if (r?.ok) { glbServed = true; return loader.parseAsync(await r.arrayBuffer(), glbUrl.slice(0, glbUrl.lastIndexOf('/') + 1)); }
    if (glbServed === null) glbServed = false;   // hébergement sans .glb : on ne les demande plus
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  const dir = url.slice(0, url.lastIndexOf('/') + 1);
  // Hébergements qui ne servent pas les .glb : le même fichier, encodé en base64 dans un .json.
  if (typeof json.glb === 'string') { const raw = atob(json.glb), b = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) b[i] = raw.charCodeAt(i); return loader.parseAsync(b.buffer, dir); }
  const bufs = json.buffers as { uri?: string; byteLength: number }[] | undefined;
  if (!bufs || bufs.length !== 1 || !bufs[0].uri?.startsWith('data:')) return loader.parseAsync(JSON.stringify(json), dir);
  const raw = atob(bufs[0].uri.slice(bufs[0].uri.indexOf(',') + 1));
  delete bufs[0].uri;
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jLen = (text.length + 3) & ~3, bLen = (raw.length + 3) & ~3;
  const glb = new Uint8Array(12 + 8 + jLen + 8 + bLen);
  const dv = new DataView(glb.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, glb.length, true);
  dv.setUint32(12, jLen, true); dv.setUint32(16, 0x4e4f534a, true);
  glb.fill(0x20, 20, 20 + jLen); glb.set(text, 20);
  const o = 20 + jLen;
  dv.setUint32(o, bLen, true); dv.setUint32(o + 4, 0x004e4942, true);
  for (let i = 0; i < raw.length; i++) glb[o + 8 + i] = raw.charCodeAt(i);
  return loader.parseAsync(glb.buffer, dir);
}
const cache = new Map<string, GLTF>();

export async function preload(paths: string[], onProgress?: (done: number, total: number) => void): Promise<void> {
  let done = 0;
  await Promise.all(paths.map(async (p) => {
    try {
      const gltf = await loadGltf(BASE + 'assets/models/' + p);
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
      });
      cache.set(p, gltf);
    } catch (e) { console.warn('Modèle introuvable :', p, e); }
    onProgress?.(++done, paths.length);
  }));
}

export function has(path: string): boolean { return cache.has(path); }
/** Sommets (avec normales) d'un modèle chargé, dans son repère : pour poser des détails dessus (baies sur un buisson). */
export function surfacePoints(path: string): { p: THREE.Vector3; n: THREE.Vector3 }[] {
  const g = cache.get(path); if (!g) return [];
  g.scene.updateMatrixWorld(true); const out: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
  // Même recadrage que instanced() : largeur ramenée à 1 m, posé sur le sol, centré.
  const box = new THREE.Box3().setFromObject(g.scene), size = box.getSize(new THREE.Vector3()), norm = 1 / Math.max(size.x, size.z, 1e-3);
  const rc = new THREE.Matrix4().makeScale(norm, norm, norm).multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  g.scene.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const P = m.geometry.attributes.position, N = m.geometry.attributes.normal, nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
    const M = new THREE.Matrix4().multiplyMatrices(rc, m.matrixWorld);
    for (let i = 0; i < P.count; i++) out.push({ p: new THREE.Vector3().fromBufferAttribute(P, i).applyMatrix4(M), n: N ? new THREE.Vector3().fromBufferAttribute(N, i).applyMatrix3(nm).normalize() : new THREE.Vector3(0, 1, 0) }); });
  return out;
}
export function animations(path: string): THREE.AnimationClip[] { return cache.get(path)?.animations ?? []; }

export interface FitOptions { footprint?: number; height?: number; /** Mesure sur la pose réelle du squelette (modèles dont l'armature est mise à l'échelle). */ precise?: boolean }

/** Crée une copie du modèle, posée au sol (y=0 à sa base), à la taille demandée en mètres. */
export function spawn(path: string, fit: FitOptions = {}): THREE.Group {
  const gltf = cache.get(path);
  const holder = new THREE.Group();
  if (!gltf) return holder;
  const obj = cloneSkinned(gltf.scene);
  if (fit.precise) obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, !!fit.precise);
  const size = box.getSize(new THREE.Vector3());
  let s = 1;
  if (fit.height) s = fit.height / Math.max(size.y, 1e-3);
  else if (fit.footprint) s = fit.footprint / Math.max(size.x, size.z, 1e-3);
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  obj.position.set(-cx * s, -box.min.y * s, -cz * s);
  obj.scale.setScalar(s);
  holder.add(obj);
  holder.userData.height = size.y * s;
  return holder;
}

/** Transforme un modèle en lots instanciés : un seul appel de dessin par matériau pour N copies. */
export function instanced(path: string, matrices: THREE.Matrix4[], tint?: THREE.ColorRepresentation, tile = 0): THREE.Group {
  const group = new THREE.Group();
  const gltf = cache.get(path);
  if (!gltf || matrices.length === 0) return group;
  // Par carreaux de `tile` mètres : chaque lot ne couvre qu'une partie de la carte et n'est dessiné que s'il est visible.
  if (tile > 0) {
    const cells = new Map<string, THREE.Matrix4[]>(), v = new THREE.Vector3();
    for (const m of matrices) { v.setFromMatrixPosition(m); const k = Math.floor(v.x / tile) + ':' + Math.floor(v.z / tile); (cells.get(k) ?? cells.set(k, []).get(k)!).push(m); }
    for (const ms of cells.values()) group.add(instanced(path, ms, tint));
    group.traverse((o) => { const im = o as THREE.InstancedMesh; if (im.isInstancedMesh) im.frustumCulled = true; });
    return group;
  }
  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  const norm = 1 / Math.max(size.x, size.z, 1e-3); // taille horizontale ramenée à 1 m
  const recenter = new THREE.Matrix4().makeScale(norm, norm, norm)
    .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const xf = new THREE.Matrix4().multiplyMatrices(recenter, m.matrixWorld), geo = m.geometry.clone();
    // Positions et normales quantifiées (entiers normalisés) : en flottants avant d'y intégrer la transformation, sinon tout
    // ce qui dépasse ±1 serait écrêté (cimes d'arbres plus hautes que larges coupées net).
    for (const k of ['position', 'normal']) { const at = geo.getAttribute(k) as THREE.BufferAttribute | undefined; if (at && !(at.array instanceof Float32Array)) { const f = new Float32Array(at.count * at.itemSize); for (let i = 0; i < at.count; i++) for (let c = 0; c < at.itemSize; c++) f[i * at.itemSize + c] = at.getComponent(i, c); geo.setAttribute(k, new THREE.BufferAttribute(f, at.itemSize)); } }
    geo.applyMatrix4(xf);
    // Échelle négative (miroir) intégrée à la géométrie : on retourne l'ordre des sommets, sinon les faces sont vues de dos.
    if (xf.determinant() < 0) {
      if (geo.index) { const ix = geo.index.array as Uint16Array | Uint32Array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } geo.index.needsUpdate = true; }
      else for (const k in geo.attributes) { const at = geo.attributes[k], n = at.itemSize; for (let i = 0; i < at.count; i += 3) for (let c = 0; c < n; c++) { const t = at.array[(i + 1) * n + c]; (at.array as Float32Array)[(i + 1) * n + c] = at.array[(i + 2) * n + c]; (at.array as Float32Array)[(i + 2) * n + c] = t; } }
    }
    let mat = m.material as THREE.MeshStandardMaterial;
    if (tint) { mat = mat.clone(); mat.color.multiply(new THREE.Color(tint)); }
    const inst = new THREE.InstancedMesh(geo, mat, matrices.length);
    matrices.forEach((mx, i) => inst.setMatrixAt(i, mx));
    inst.castShadow = true; inst.receiveShadow = true;
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  });
  return group;
}
