// Scène : lumière de fin de journée, terrain, bases, gisements et décor.
import * as THREE from 'three';
import type { TerrainMap } from '../mapgen/terrain';
import type { MapObjects } from '../mapgen/objects';
import { slopeAt } from '../mapgen/terrain';
import { mulberry32 } from '../core/rng';
import { buildTerrainMesh } from './terrainMesh';
import { iceGeometry, iceMaterial } from './ice';
import { preload, spawn, instanced } from './assets';
import { UNIT_MODELS } from './units';
import { BUILDING_MODELS } from './buildings';

export type Quality = 'basse' | 'moyenne' | 'haute';

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
];

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
    this.scene.add(buildTerrainMesh(map));
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
      stars.frustumCulled = false; this.scene.add(stars);
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
      this.scene.add(g);
    }
  }

  private buildResources() {
    const mats = (kind: string, sink: number) => this.objects.resources.filter((r) => r.kind === kind).map((r) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.tilt, r.rot, r.tilt * 0.6));
      return new THREE.Matrix4().compose(new THREE.Vector3(r.x, this.map.heightAt(r.x, r.z) - sink, r.z), q, new THREE.Vector3(r.sx, r.sy, r.sx));
    });
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const register = (kind: string, meshes: THREE.InstancedMesh[]) => {
      let i = 0;
      this.objects.resources.forEach((r, index) => { if (r.kind === kind) { const slot = i++; this.resHide.set(index, () => { for (const im of meshes) { im.setMatrixAt(slot, zero); im.instanceMatrix.needsUpdate = true; } }); } });
    };
    const sol = mats('solarite', 0.3);
    const solMat = this.crystals = new THREE.MeshStandardMaterial({ color: 0xff9a22, emissive: 0xff5200, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.1, flatShading: true });
    const solMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0).translate(0, 0.75, 0), solMat, sol.length);
    sol.forEach((m, i) => solMesh.setMatrixAt(i, m)); solMesh.castShadow = true; solMesh.frustumCulled = false;
    this.scene.add(solMesh); register('solarite', [solMesh]);
    const ice = mats('glace', 0.25);
    const iceMesh = new THREE.InstancedMesh(iceGeometry(), iceMaterial(this.renderer), ice.length);
    ice.forEach((m, i) => iceMesh.setMatrixAt(i, m)); iceMesh.castShadow = true; iceMesh.receiveShadow = true; iceMesh.frustumCulled = false;
    this.scene.add(iceMesh); register('glace', [iceMesh]);
    const oreGroup = instanced('quat/Rock_2.json', mats('minerai', 0.2), 0x6d6470);
    const oreMeshes: THREE.InstancedMesh[] = [];
    oreGroup.traverse((o) => { const im = o as THREE.InstancedMesh; if (im.isInstancedMesh) { const mt = im.material as THREE.MeshStandardMaterial; mt.metalness = 0.75; mt.roughness = 0.42; im.frustumCulled = false; oreMeshes.push(im); } });
    this.scene.add(oreGroup); register('minerai', oreMeshes);
  }

  /** Fait disparaître un bloc de gisement épuisé. */
  hideResource(index: number) { this.resHide.get(index)?.(); }

  private buildRocks() {
    const lists: Record<string, THREE.Matrix4[]> = {};
    for (const r of this.objects.rocks) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r.rot, 0));
      (lists[r.model] ??= []).push(new THREE.Matrix4().compose(new THREE.Vector3(r.x, this.map.heightAt(r.x, r.z) - r.s * 0.08, r.z), q, new THREE.Vector3(r.s, r.s * r.sy, r.s)));
    }
    for (const [model, ms] of Object.entries(lists)) this.scene.add(instanced(model, ms, model.startsWith('quat') ? 0xc98a62 : 0x8f7868, 40));
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
    for (const [model, ms] of Object.entries(cliff)) this.scene.add(instanced(model, ms, 0x9c6146, 40));
  }

  /** Repère visuel d'un toucher sur le terrain (servira aux ordres de déplacement). */
  ping(p: THREE.Vector3, color = 0x7dffb0) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, fog: false }));
    mesh.position.copy(p).setY(p.y + 0.25);
    this.scene.add(mesh);
    this.pings.push({ mesh, t: 0 });
  }

  /** Tempête de poussière : 0 = ciel clair, 1 = pleine tempête (transition douce). */
  stormTarget = 0; private stormK = 0;
  private readonly hazeC = new THREE.Color(0xd49a72); private readonly dustC = new THREE.Color(0xa8622f);
  update(dt: number, focus: THREE.Vector3, camDist: number) {
    this.time += dt;
    if (this.stormK !== this.stormTarget) {
      this.stormK += Math.sign(this.stormTarget - this.stormK) * Math.min(Math.abs(this.stormTarget - this.stormK), dt / 3);
      const f = this.scene.fog as THREE.FogExp2, k = this.stormK;
      f.density = 0.0042 + 0.016 * k; f.color.copy(this.hazeC).lerp(this.dustC, k);
      (this.scene.background as THREE.Color).copy(f.color);
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
