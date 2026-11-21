// Brouillard de guerre (affichage seulement : la simulation et l'IA n'en tiennent pas compte).
// Grille de 2 m : 0 = jamais vu, 1 = déjà exploré, 2 = vu en ce moment par une unité ou un bâtiment du joueur.
// Le rendu assombrit tout ce qui est hors de vue : chaque matériau de la scène reçoit quelques lignes de shader
// qui lisent une petite texture de visibilité selon la position (x, z) du pixel.
import * as THREE from 'three';
import type { Sim } from '../sim/sim';
import type { TerrainMap } from '../mapgen/terrain';

const CELL = 2;
/** Distance de vue, en mètres. */
const SIGHT: Record<string, number> = { ouvrier: 11, fantassin: 13, antiblindage: 13, ingenieur: 11, eclaireur: 20, blinde: 14, artillerie: 16, drone: 19, intercepteur: 18, navette: 15 };
const BSIGHT: Record<string, number> = { centre: 20, tourelle: 18, tourelleAA: 18, mur: 4, porte: 6 };

export class FogOfWar {
  readonly n: number;
  private state: Uint8Array;
  private shown: Float32Array;
  private data: Uint8Array<ArrayBuffer>;
  readonly tex: THREE.DataTexture;
  private uni: { fowTex: { value: THREE.Texture }; fowOn: { value: number }; fowXf: { value: THREE.Vector4 } };
  private acc = 1;
  private patchAcc = 1;
  enabled = false;

  constructor(private map: TerrainMap, private sim: Sim, private player = 0) {
    this.n = Math.ceil((map.ext * 2) / CELL);
    const N = this.n * this.n;
    this.state = new Uint8Array(N); this.shown = new Float32Array(N); this.data = new Uint8Array(N * 4);
    this.tex = new THREE.DataTexture(this.data, this.n, this.n, THREE.RGBAFormat);
    this.tex.magFilter = THREE.LinearFilter; this.tex.minFilter = THREE.LinearFilter; this.tex.needsUpdate = true;
    const S = this.n * CELL;
    this.uni = { fowTex: { value: this.tex }, fowOn: { value: 0 }, fowXf: { value: new THREE.Vector4(map.ext / S, map.ext / S, 1 / S, 1 / S) } };
  }

  setEnabled(on: boolean) { this.enabled = on; this.uni.fowOn.value = on ? 1 : 0; if (on) { this.acc = 1; this.update(0); this.shown.forEach((_, i) => { this.shown[i] = this.state[i] === 2 ? 1 : 0; }); this.push(); } }

  private cell(x: number, z: number): number {
    const i = Math.floor((x + this.map.ext) / CELL), j = Math.floor((z + this.map.ext) / CELL);
    return i < 0 || j < 0 || i >= this.n || j >= this.n ? -1 : j * this.n + i;
  }
  /** 0 jamais vu, 1 exploré, 2 visible. Sans brouillard : tout est visible. */
  at(x: number, z: number): number { if (!this.enabled) return 2; const c = this.cell(x, z); return c < 0 ? 0 : this.state[c]; }
  visible(x: number, z: number): boolean { return this.at(x, z) === 2; }

  private stamp(x: number, z: number, r: number) {
    const n = this.n, ci = (x + this.map.ext) / CELL, cj = (z + this.map.ext) / CELL, rc = r / CELL;
    const i0 = Math.max(0, Math.floor(ci - rc)), i1 = Math.min(n - 1, Math.ceil(ci + rc)), j0 = Math.max(0, Math.floor(cj - rc)), j1 = Math.min(n - 1, Math.ceil(cj + rc));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - ci, dz = j + 0.5 - cj;
      if (dx * dx + dz * dz <= rc * rc) this.state[j * n + i] = 2;
    }
  }

  /** Recalcule la vue (5 fois par seconde) et fond doucement la texture vers l'état voulu. */
  update(dt: number) {
    if (!this.enabled) return;
    this.acc += dt;
    if (this.acc >= 0.2) {
      this.acc = 0;
      const s = this.state;
      for (let i = 0; i < s.length; i++) if (s[i] === 2) s[i] = 1;
      const k = this.sim.storm ? 0.6 : 1;   // la tempête réduit la vue
      for (const u of this.sim.units) if (!this.sim.foe(u.owner, this.player)) this.stamp(u.x, u.z, (SIGHT[u.kind] ?? 12) * k);
      for (const b of this.sim.buildings) if (!this.sim.foe(b.owner, this.player)) this.stamp(b.x, b.z, (BSIGHT[b.kind] ?? 13) + b.r * 0.5);
    }
    const k = Math.min(1, dt * 4);
    let changed = false;
    for (let i = 0; i < this.shown.length; i++) {
      const t = this.state[i] === 2 ? 1 : this.state[i] === 1 ? 0.45 : 0;
      const d = t - this.shown[i];
      if (d > 0.004 || d < -0.004) { this.shown[i] += d * k; changed = true; }
    }
    if (changed) this.push();
  }
  private push() {
    const d = this.data;
    for (let i = 0; i < this.shown.length; i++) { const v = Math.round(this.shown[i] * 255); d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
    this.tex.needsUpdate = true;
  }

  /** Ajoute la lecture du brouillard aux matériaux de la scène (une seule fois par matériau). Appelé régulièrement : de nouveaux modèles apparaissent en cours de partie. */
  patch(scene: THREE.Scene, dt: number) {
    this.patchAcc += dt;
    if (this.patchAcc < 1) return;
    this.patchAcc = 0;
    scene.traverse((o) => {
      const mats = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mats) return;
      for (const m of Array.isArray(mats) ? mats : [mats]) this.patchMaterial(m);
    });
  }
  private patchMaterial(m: THREE.Material) {
    if (m.userData.fow || (m as THREE.MeshBasicMaterial).fog === false || (m as THREE.ShaderMaterial).isShaderMaterial) return;
    m.userData.fow = true;
    const uni = this.uni, prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      if (!sh.vertexShader.includes('#include <project_vertex>') || !sh.fragmentShader.includes('#include <fog_fragment>')) return;
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = 'varying vec2 vFowW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vec4 fowP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fowP = instanceMatrix * fowP;
        #endif
        vFowW = (modelMatrix * fowP).xz;`);
      sh.fragmentShader = 'varying vec2 vFowW;\nuniform sampler2D fowTex;\nuniform float fowOn;\nuniform vec4 fowXf;\n' + sh.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>
        if (fowOn > 0.5) {
          float fowV = texture2D(fowTex, vFowW * fowXf.zw + fowXf.xy).r;
          vec3 fowC = gl_FragColor.rgb;
          float fowG = dot(fowC, vec3(0.3, 0.55, 0.15));
          fowC = mix(vec3(fowG) * vec3(0.85, 0.9, 1.05), fowC, smoothstep(0.5, 0.95, fowV));
          gl_FragColor.rgb = fowC * mix(0.09, 1.0, fowV);
        }`);
    };
    m.customProgramCacheKey = () => prevKey.call(m) + '|fow';
    m.needsUpdate = true;
  }
}
