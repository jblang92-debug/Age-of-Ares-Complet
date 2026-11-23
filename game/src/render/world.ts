import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// Scène : lumière de fin de journée, terrain, bases, gisements et décor.
import * as THREE from 'three';
import type { TerrainMap } from '../mapgen/terrain';
import type { MapObjects } from '../mapgen/objects';
import { slopeAt } from '../mapgen/terrain';
import { mulberry32 } from '../core/rng';
import { buildTerrainMesh } from './terrainMesh';
import { iceGeometry, iceMaterial } from './ice';
import { berryBush, bushMaterial, fishShoal } from './flora';
import { preload, spawn, instanced, surfacePoints } from './assets';
import { UNIT_MODELS, WATER_Y } from './units';
import { BUILDING_MODELS } from './buildings';

export type Quality = 'basse' | 'moyenne' | 'haute';

// Arbres et buisson Quaternius « Stylized Nature MegaKit » (CC0), allégés pour le téléphone (scripts/lodtree.mjs).
const NATURE_TREES = ['nature/CommonTree_1.json', 'nature/CommonTree_2.json', 'nature/CommonTree_3.json', 'nature/CommonTree_4.json', 'nature/CommonTree_5.json', 'nature/Pine_1.json', 'nature/Pine_2.json', 'nature/Pine_3.json', 'nature/Pine_4.json'];
const NATURE_BUSH = 'nature/Bush_Common.json';
const MODELS = [
  'kaykit/landingpad_large.json', 'kaykit/lander_A.json', 'kaykit/basemodule_A.json', 'kaykit/basemodule_B.json',
  'kaykit/basemodule_garage.json', 'kaykit/roofmodule_solarpanels.json', 'kaykit/solarpanel.json',
  'kaykit/windturbine_tall.json', 'kaykit/cargo_B_stacked.json', 'kaykit/cargo_A.json', 'kaykit/containers_A.json',
  'kaykit/drill_structure.json', 'kaykit/structure_tall.json', 'kaykit/lights.json', 'kaykit/spacetruck.json',
  'kaykit/cargodepot_A.json', 'kaykit/rock_A.json', 'kaykit/rock_B.json',
  'kenney/tower-square-bottom-a.json', 'kenney/weapon-turret.json', 'kenney/weapon-cannon.json',
  'kaykit/basemodule_C.json', 'kaykit/basemodule_D.json', 'kaykit/basemodule_E.json', 'kaykit/cargodepot_B.json', 'kaykit/windturbine_low.json', 'quat/GeodesicDome.json', 'quat/Navette.json',
  'quat/Rock_1.json', 'quat/Rock_2.json', 'quat/Rock_3.json', 'quat/Rock_4.json',
  'quat/Rock_Large_1.json', 'quat/Rock_Large_2.json', 'quat/Rock_Large_3.json',
  ...NATURE_TREES, NATURE_BUSH,
  ...['Resource_Tree1', 'Resource_Tree2', 'Resource_PineTree', 'Resource_Rock_1', 'Resource_Rock_2', 'Resource_Rock_3', 'Resource_Gold_1', 'Resource_Gold_2', 'Resource_Gold_3'].map((m) => `antique/${m}.json`),
];

const SKY_OLD = new THREE.Color(0xa9c9e2), HAZE_NEW = new THREE.Color(0xd49a72);
const HEMI_OLD = new THREE.Color(0xe8f2ff), HEMI_NEW = new THREE.Color(0xffe4c4), GROUND_OLD = new THREE.Color(0x5a6a3a), GROUND_NEW = new THREE.Color(0x8a4a2c);
const SUN_OLD = new THREE.Color(0xfff0d8), SUN_NEW = new THREE.Color(0xffd3a1);
/** Mer des âges anciens : un grand plan à vagues (deux houles qui se croisent), reflets du ciel, écume près des côtes. */
function makeWater(size: number): THREE.Mesh {
  const g = new THREE.PlaneGeometry(size, size, 1, 1).rotateX(-Math.PI / 2);
  const m = new THREE.MeshStandardMaterial({ color: 0x2a7da0, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.9, depthWrite: false });
  const uniforms = { uTime: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWp;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 p = vWp.xz;
        float w1 = sin(p.x * 0.35 + uTime * 1.3) * cos(p.y * 0.28 - uTime * 0.9);
        float w2 = sin((p.x + p.y) * 0.62 - uTime * 1.9) * 0.5;
        vec3 nW = normalize(vec3(cos(p.x * 0.35 + uTime * 1.3) * 0.12 + w2 * 0.08, 1.0, -sin(p.y * 0.28 - uTime * 0.9) * 0.12 + w2 * 0.08));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        diffuseColor.rgb *= 0.92 + 0.12 * w1;`);
  };
  const mesh = new THREE.Mesh(g, m); mesh.position.y = WATER_Y; mesh.renderOrder = 1; mesh.receiveShadow = true; mesh.userData.uniforms = uniforms;
  return mesh;
}

/** Baies rouges (quelques violettes) sur les sommets du haut et des côtés d'un buisson, dans le repère du modèle. */
function berriesOn(pts: { p: THREE.Vector3; n: THREE.Vector3 }[]): THREE.BufferGeometry {
  let top = 0; for (const q of pts) top = Math.max(top, q.p.y);
  let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Points de l'enveloppe : pour une direction tirée au hasard, le sommet le plus en avant dans cette direction (jamais caché dans le feuillage).
  const ctr = new THREE.Vector3(0, top * 0.4, 0), parts: THREE.BufferGeometry[] = [], used: THREE.Vector3[] = [];
  const r = top * 0.052;
  for (let k = 0; k < 600 && parts.length < 22; k++) {
    const d = new THREE.Vector3(rnd() * 2 - 1, rnd() * 1.1 - 0.15, rnd() * 2 - 1).normalize();
    let best = pts[0], bv = -1e9; for (const q of pts) { const v = q.p.clone().sub(ctr).dot(d); if (v > bv) { bv = v; best = q; } }
    if (best.p.y < top * 0.25) continue;
    const p = best.p.clone().addScaledVector(d, r * 0.35);
    if (used.some((u) => u.distanceTo(p) < r * 2.4)) continue; used.push(p);
    const g = new THREE.IcosahedronGeometry(r, 1).translate(p.x, p.y, p.z), n = g.attributes.position.count, c = new THREE.Color(parts.length % 6 === 0 ? 0x6a1a5a : 0xd61f2c), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); parts.push(g);
  }
  return mergeGeometries(parts)!;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly sun = new THREE.DirectionalLight(0xffd3a1, 3.2);
  private pings: { mesh: THREE.Mesh; t: number }[] = [];
  private resHide = new Map<number, () => void>();
  private crystals: THREE.MeshStandardMaterial | null = null;
  private time = 0;
  private sunDir = new THREE.Vector3(-0.55, 0.62, 0.42).normalize();
  quality: Quality = 'moyenne';

  constructor(canvasParent: HTMLElement, readonly map: TerrainMap, readonly objects: MapObjects) {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasParent.appendChild(r.domElement);

    const haze = new THREE.Color(0xd49a72);
    this.scene.background = haze;
    this.scene.fog = new THREE.FogExp2(haze, 0.0042);
    this.scene.add(new THREE.HemisphereLight(0xffe4c4, 0x8a4a2c, 0.75));
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.5;
    this.scene.add(this.sun, this.sun.target);
    const terrain = buildTerrainMesh(map);
    this.terrainMat = terrain.userData.mat as THREE.MeshStandardMaterial;
    this.scene.add(terrain);
    this.hemi = this.scene.children.find((o) => (o as THREE.HemisphereLight).isHemisphereLight) as THREE.HemisphereLight;
    if (map.voidMask.includes(1)) {
      // Le vide intersidéral : fond noir et champ d'étoiles sous la carte, visible dans les trous du terrain.
      this.scene.background = new THREE.Color(0x05040b);
      const rs = mulberry32(map.seed + 404), pos = new Float32Array(2600 * 3), col = new Float32Array(2600 * 3);
      for (let i = 0; i < 2600; i++) {
        pos[i * 3] = (rs() * 2 - 1) * map.ext * 1.6; pos[i * 3 + 1] = -45 - rs() * 60; pos[i * 3 + 2] = (rs() * 2 - 1) * map.ext * 1.6;
        const b = 0.5 + rs() * 0.5, t = rs(); col[i * 3] = b * (t < 0.2 ? 1 : 0.85); col[i * 3 + 1] = b * 0.88; col[i * 3 + 2] = b * (t > 0.8 ? 1 : 0.9);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
      stars.frustumCulled = false; this.scene.add(stars); this.stars = stars;
      this.water = makeWater(map.ext * 3.4);
      this.scene.add(this.water);
    }
    this.setQuality(this.quality);
  }

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, q === 'haute' ? 2 : q === 'moyenne' ? 1.5 : 1));
    const size = q === 'haute' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.renderer.shadowMap.type = q === 'basse' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.resize();
  }

  resize() {
    const p = this.renderer.domElement.parentElement!;
    this.renderer.setSize(p.clientWidth, p.clientHeight);
  }

  async load(onProgress: (f: number) => void): Promise<void> {
    this.buildEnvironment();
    const all = [...new Set([...MODELS, ...UNIT_MODELS, ...BUILDING_MODELS])];
    await preload(all, (d, t) => onProgress(d / t));
    this.buildBases();
    this.buildResources();
    this.buildRocks();
  }

  /** Ciel de fin de journée généré par le code : sert d'éclairage ambiant et de reflets. */
  private buildEnvironment() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { sunDir: { value: this.sunDir } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 zen = vec3(0.50, 0.42, 0.44), hor = vec3(1.25, 0.72, 0.42), gnd = vec3(0.34, 0.17, 0.10);
          vec3 c = h > 0.0 ? mix(hor, zen, pow(h, 0.55)) : mix(hor * 0.7, gnd, pow(-h, 0.4));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          c += vec3(2.6, 1.7, 0.9) * pow(s, 24.0) + vec3(14.0, 9.0, 5.0) * pow(s, 700.0);
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    const envScene = new THREE.Scene(); envScene.add(sky);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(envScene, 0.03).texture;
    this.scene.environmentIntensity = 0.6;
    pm.dispose(); sky.geometry.dispose();
  }

  private buildBases() {
    for (const o of this.objects.buildings) {
      const g = spawn(o.model, { footprint: o.footprint, height: o.height });
      g.position.set(o.x, this.map.heightAt(o.x, o.z) + (o.dy ?? 0), o.z);
      g.rotation.y = o.rot;
      if (o.roof) { const r = spawn(o.roof.model, { footprint: o.roof.footprint }); r.position.y = g.userData.height; g.add(r); }
      this.decor.add(g);
    }
    this.scene.add(this.decor);
    this.decor.visible = this.epoch < 0 || this.epoch > 0.2;
  }

  /** Gisements des âges anciens (baies, pierre) et de l'ère spatiale (glace, minerai) : on montre ceux de l'époque affichée. */
  private resOld: THREE.Object3D[] = []; private resNew: THREE.Object3D[] = [];
  private buildResources() {
    const R = this.objects.resources, zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const hides = new Map<number, (() => void)[]>();
    const addHide = (i: number, f: () => void) => { let a = hides.get(i); if (!a) hides.set(i, a = []); a.push(f); };
    const mat = (r: typeof R[number], w: number, h: number, sink: number, tilt = true) => {
      const q = new THREE.Quaternion().setFromEuler(tilt ? new THREE.Euler(r.tilt, r.rot, r.tilt * 0.6) : new THREE.Euler(0, r.rot, 0));
      return new THREE.Matrix4().compose(new THREE.Vector3(r.x, this.map.heightAt(r.x, r.z) - sink, r.z), q, new THREE.Vector3(w, h, w));
    };
    /** Instances d'un ou plusieurs modèles pour les gisements d'un type ; chaque bloc peut ensuite disparaître. */
    const fromModels = (kind: string, models: string[], m: (r: typeof R[number]) => THREE.Matrix4, tint?: number): THREE.Object3D => {
      const by = new Map<string, number[]>();
      R.forEach((r, i) => { if (r.kind === kind) { const md = models[Math.floor(Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1 * models.length)]; let a = by.get(md); if (!a) by.set(md, a = []); a.push(i); } });
      const g = new THREE.Group();
      for (const [model, idx] of by) {
        const grp = instanced(model, idx.map((i) => m(R[i])), tint), meshes: THREE.InstancedMesh[] = [];
        grp.traverse((o) => { const im = o as THREE.InstancedMesh; if (im.isInstancedMesh) { im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; meshes.push(im); } });
        idx.forEach((ri, slot) => addHide(ri, () => { for (const im of meshes) { im.setMatrixAt(slot, zero); im.instanceMatrix.needsUpdate = true; } }));
        g.add(grp);
      }
      this.scene.add(g); return g;
    };
    const fromGeo = (kind: string, geo: THREE.BufferGeometry, material: THREE.Material, m: (r: typeof R[number]) => THREE.Matrix4): THREE.InstancedMesh => {
      const idx = R.map((r, i) => r.kind === kind ? i : -1).filter((i) => i >= 0);
      const im = new THREE.InstancedMesh(geo, material, Math.max(1, idx.length)); im.count = idx.length;
      idx.forEach((ri, slot) => { im.setMatrixAt(slot, m(R[ri])); addHide(ri, () => { im.setMatrixAt(slot, zero); im.instanceMatrix.needsUpdate = true; }); });
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; this.scene.add(im); return im;
    };
    const A = 'antique/';
    // Solarite : cristaux lumineux (toutes époques).
    const solMat = this.crystals = new THREE.MeshStandardMaterial({ color: 0xff9a22, emissive: 0xff5200, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.1, flatShading: true });
    fromGeo('solarite', new THREE.OctahedronGeometry(1, 0).translate(0, 0.75, 0), solMat, (r) => mat(r, r.sx, r.sy, 0.3));
    // Nourriture : buissons de baies (âges anciens) / blocs de glace (ère spatiale).
    // Baies : buisson KayKit, garni de baies rouges posées sur son feuillage (mêmes placements, donc toujours sur le buisson).
    const bushAt = (r: typeof R[number]) => mat(r, r.sx * 1.5, r.sx * 1.4, 0.03, false);
    const pts = surfacePoints(NATURE_BUSH);
    if (pts.length) {
      this.resOld.push(fromModels('glace', [NATURE_BUSH], bushAt));
      this.resOld.push(fromGeo('glace', berriesOn(pts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, emissive: 0x3a0000 }), bushAt));
    } else this.resOld.push(fromGeo('glace', berryBush(), bushMaterial(), (r) => mat(r, r.sx * 1.25, r.sx * 1.15, 0.05, false)));
    this.resNew.push(fromGeo('glace', iceGeometry(), iceMaterial(this.renderer), (r) => mat(r, r.sx, r.sy, 0.25)));
    // Poissons : bancs à fleur d'eau (âges anciens ; l'eau devient le vide à l'âge galactique).
    const fish = fromGeo('poisson', fishShoal(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2, transparent: true, opacity: 0.92 }),
      (r) => new THREE.Matrix4().compose(new THREE.Vector3(r.x, WATER_Y + 0.08, r.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.rot, 0)), new THREE.Vector3(1, 1, 1)));
    fish.renderOrder = 2; this.resOld.push(fish);
    // Bois : forêts (toutes époques).
    // Arbres : feuillus et conifères à feuillage découpé (plus naturels que des boules pleines).
    fromModels('arbre', NATURE_TREES, (r) => mat(r, r.sx * 1.5, r.sx * 1.5 * r.sy, 0.12, false));
    // Pierre : rochers gris (âges anciens) / minerai métallique (ère spatiale).
    this.resOld.push(fromModels('minerai', [A + 'Resource_Rock_1.json', A + 'Resource_Rock_2.json', A + 'Resource_Rock_3.json'], (r) => mat(r, r.sx * 1.45, r.sx * 1.25, 0.15, false)));
    const ore = fromModels('minerai', ['quat/Rock_2.json'], (r) => mat(r, r.sx, r.sy, 0.2), 0x6d6470);
    ore.traverse((o) => { const im = o as THREE.InstancedMesh; if (im.isInstancedMesh) { const mt = im.material as THREE.MeshStandardMaterial; mt.metalness = 0.75; mt.roughness = 0.42; } });
    this.resNew.push(ore);
    // Or : filons dorés (toutes époques).
    const gold = fromModels('or', [A + 'Resource_Gold_1.json', A + 'Resource_Gold_2.json', A + 'Resource_Gold_3.json'], (r) => mat(r, r.sx * 1.55, r.sx * 1.15 * r.sy, 0.12, false));
    // Pépites vraiment dorées (le brun d'origine se confondait avec la pierre).
    gold.traverse((o) => { const im = o as THREE.Mesh; if (!im.isMesh) return; for (const m of [im.material].flat() as THREE.MeshStandardMaterial[]) if (/gold/i.test(m.name)) { m.color.setRGB(1, 0.62, 0.08); m.metalness = 0.85; m.roughness = 0.28; m.emissive.setRGB(0.22, 0.13, 0); } });
    for (const [i, fs] of hides) this.resHide.set(i, () => fs.forEach((f) => f()));
    this.showResEpoch(this.epoch < 0 ? 0 : this.epoch);
  }
  private showResEpoch(k: number) { const old = k < 0.5; for (const o of this.resOld) o.visible = old; for (const o of this.resNew) o.visible = !old; }

  /** Fait disparaître un bloc de gisement épuisé. */
  hideResource(index: number) { this.resHide.get(index)?.(); }

  private buildRocks() {
    const lists: Record<string, THREE.Matrix4[]> = {};
    for (const r of this.objects.rocks) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.rot, 0));
      (lists[r.model] ??= []).push(new THREE.Matrix4().compose(new THREE.Vector3(r.x, this.map.heightAt(r.x, r.z) - r.s * 0.08, r.z), q, new THREE.Vector3(r.s, r.s * r.sy, r.s)));
    }
    for (const [model, ms] of Object.entries(lists)) this.scene.add(this.ageRock(instanced(model, ms, model.startsWith('quat') ? 0xc98a62 : 0x8f7868, 40)));
    // Parois : des rochers alignés le long des falaises (hors rampes) pour qu'elles se lisent comme des murs.
    const rng = mulberry32(this.map.seed + 91), cliff: Record<string, THREE.Matrix4[]> = {};
    const mids = ['quat/Rock_1.json', 'quat/Rock_2.json', 'quat/Rock_3.json', 'quat/Rock_4.json'];
    const half = this.map.half;
    for (let z = -half + 2; z < half - 2; z += 2.2) for (let x = -half + 2; x < half - 2; x += 2.2) {
      const px = x + (rng() - 0.5) * 1.2, pz = z + (rng() - 0.5) * 1.2, pick = rng(), sc = 2.3 + rng() * 1.3, sy = 0.8 + rng() * 0.5, rot = rng() * 6.28;
      if (this.map.heightAt(px, pz) < -0.5 || this.map.isVoid(px + 2, pz) || this.map.isVoid(px - 2, pz) || this.map.isVoid(px, pz + 2) || this.map.isVoid(px, pz - 2)) continue;
      if (slopeAt(this.map, px, pz) < 1.05 || this.map.rampNear(px, pz, -1.5) || this.map.rampMask[Math.round(pz + this.map.ext) * this.map.n + Math.round(px + this.map.ext)]) continue;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0));
      (cliff[mids[Math.floor(pick * 4)]] ??= []).push(new THREE.Matrix4().compose(new THREE.Vector3(px, this.map.heightAt(px, pz) - sc * 0.35, pz), q, new THREE.Vector3(sc, sc * sy, sc)));
    }
    for (const [model, ms] of Object.entries(cliff)) this.scene.add(this.ageRock(instanced(model, ms, 0x9c6146, 40)));
  }

  /** Rochers du décor : gris aux âges anciens, ocre martien à l'âge galactique (teinte suivie avec l'époque). */
  private rockMats: { m: THREE.MeshStandardMaterial; o: THREE.Color; n: THREE.Color; map: THREE.Texture | null }[] = [];
  private ageRock(g: THREE.Object3D): THREE.Object3D {
    g.traverse((x) => { const im = x as THREE.Mesh; if (!im.isMesh) return; const m = im.material as THREE.MeshStandardMaterial; if (this.rockMats.some((r) => r.m === m)) return;
      this.rockMats.push({ m, o: new THREE.Color(0x8e8b84), n: m.color.clone(), map: m.map }); });
    this.tintRocks(this.epoch < 0 ? 0 : this.epoch);
    return g;
  }
  /** Aux âges anciens, la texture rousse est retirée (pierre grise unie) ; elle revient avec l'ère spatiale. */
  private tintRocks(k: number) {
    const t = Math.min(1, Math.max(0, (k - 0.3) / 0.6)), old = t < 0.5;
    for (const r of this.rockMats) { const want = old ? null : r.map; if (r.m.map !== want) { r.m.map = want; r.m.needsUpdate = true; } r.m.color.copy(old ? r.o : r.n); }
  }

  /** Repère visuel d'un toucher sur le terrain (servira aux ordres de déplacement). */
  ping(p: THREE.Vector3, color = 0x7dffb0) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, fog: false }));
    mesh.position.copy(p).setY(p.y + 0.25);
    this.scene.add(mesh);
    this.pings.push({ mesh, t: 0 });
  }

  // ---------------------------------------------------------------- époques
  private terrainMat: THREE.MeshStandardMaterial | null = null;
  private hemi: THREE.HemisphereLight | null = null;
  private stars: THREE.Points | null = null;
  private water: THREE.Mesh | null = null;
  /** Décor high-tech posé près des bases (atterrisseur, conteneurs) : caché aux âges anciens. */
  private decor = new THREE.Group();
  /** Époque affichée : 0 = monde ancien (prairies, mer, ciel bleu), 1 = âge galactique (désert, vide intersidéral). Transition douce. */
  private epoch = -1; private epochTarget = 1;
  /** Âge du joueur de cet appareil : chacun voit le monde de son époque (les règles sont les mêmes pour tous). */
  setAge(ere: number, snap = false) { this.epochTarget = ere >= 5 ? 1 : ere >= 3 ? 0.35 + (ere - 3) * 0.2 : 0; if (this.epoch < 0 || snap) this.applyEpoch(this.epoch = this.epochTarget); }
  private applyEpoch(k: number) {
    const green = 1 - Math.min(1, k / 0.75), sea = k >= 0.999 ? 0 : 1 - Math.max(0, (k - 0.75) / 0.25);
    const u = this.terrainMat?.userData.uniforms as Record<string, { value: number }> | undefined;
    if (u) u.uGreen.value = green;
    const haze = this.hazeC.copy(SKY_OLD).lerp(HAZE_NEW, Math.min(1, k * 1.3));
    const f = this.scene.fog as THREE.FogExp2; f.color.copy(haze);
    if (this.water) {
      this.water.visible = sea > 0.01;
      (this.water.material as THREE.MeshStandardMaterial).opacity = 0.9 * sea;
      this.scene.background = sea > 0.5 ? haze.clone() : new THREE.Color(0x05040b).lerp(haze, sea * 2);
      if (this.stars) this.stars.visible = sea < 0.5;
    } else this.scene.background = haze.clone();
    if (this.hemi) { this.hemi.color.copy(HEMI_OLD).lerp(HEMI_NEW, k); this.hemi.groundColor.copy(GROUND_OLD).lerp(GROUND_NEW, k); }
    this.sun.color.copy(SUN_OLD).lerp(SUN_NEW, k);
    this.decor.visible = k > 0.2;
    this.showResEpoch(k); this.tintRocks(k);
  }

  /** Tempête de poussière : 0 = ciel clair, 1 = pleine tempête (transition douce). */
  stormTarget = 0; private stormK = 0;
  private readonly hazeC = new THREE.Color(0xd49a72).clone(); private readonly dustC = new THREE.Color(0xa8622f);
  update(dt: number, focus: THREE.Vector3, camDist: number) {
    this.time += dt;
    if (this.epoch >= 0 && this.epoch !== this.epochTarget) { this.epoch += Math.sign(this.epochTarget - this.epoch) * Math.min(Math.abs(this.epochTarget - this.epoch), dt / 4); this.applyEpoch(this.epoch); }
    if (this.water) { const w = this.water.userData.uniforms as { uTime: { value: number } } | undefined; if (w) w.uTime.value = this.time; }
    if (this.stormK !== this.stormTarget) {
      this.stormK += Math.sign(this.stormTarget - this.stormK) * Math.min(Math.abs(this.stormTarget - this.stormK), dt / 3);
      const f = this.scene.fog as THREE.FogExp2, k = this.stormK;
      f.density = 0.0042 + 0.016 * k; f.color.copy(this.hazeC).lerp(this.dustC, k);
      if (!this.water || this.water.visible) (this.scene.background as THREE.Color).copy(f.color);
      this.sun.intensity = 3.2 * (1 - 0.45 * k);
    }
    if (this.crystals) this.crystals.emissiveIntensity = 0.55 + 0.2 * Math.sin(this.time * 2);
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i]; p.t += dt;
      const k = p.t / 0.6;
      p.mesh.scale.setScalar(0.6 + k * 1.6);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      if (k >= 1) { this.scene.remove(p.mesh); p.mesh.geometry.dispose(); this.pings.splice(i, 1); }
    }
    // L'ombre suit la zone regardée par la caméra.
    const span = camDist * 0.95 + 12;
    const cam = this.sun.shadow.camera;
    if (Math.abs(cam.right - span) > 2) {
      cam.left = -span; cam.right = span; cam.top = span; cam.bottom = -span; cam.near = 10; cam.far = 320;
      cam.updateProjectionMatrix();
    }
    const fx = Math.round(focus.x / 2) * 2, fz = Math.round((focus.z - camDist * 0.12) / 2) * 2;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx, focus.y, fz).addScaledVector(this.sunDir, 150);
    this.sun.target.updateMatrixWorld();
  }
}
