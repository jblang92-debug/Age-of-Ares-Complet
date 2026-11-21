// Défenses dessinées en code, dans un style science-fiction :
// - murs : poteaux reliés par des panneaux, avec un liseré lumineux aux couleurs du camp ;
// - portes : deux pylônes et un champ d'énergie qui s'efface quand une unité alliée approche ;
// - tourelles (sol, anti-aérienne, sentinelle) : la tête pivote vers la cible, les canons reculent à chaque tir.
import * as THREE from 'three';
import type { Sim, Building } from '../sim/sim';
import { TURRETS } from '../data/rules';

const CAP = 900;
const metal = (c: number, r = 0.42, m = 0.65) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, flatShading: true });
const glow = (c: number) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
const DARK = metal(0x2b3038, 0.5, 0.7), MID = metal(0x6c7682, 0.38, 0.7), LIGHT = metal(0xb4bec8, 0.32, 0.55);
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent?: THREE.Object3D) => {
  const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; parent?.add(o); return o;
};

/** Écart des pylônes d'une porte, de part et d'autre de son centre. */
export const GATE_HALF = 2.75;

// ---------------------------------------------------------------- Murs
export type WallNode = { id: number; x: number; z: number; y: number; grow: number; vis: number; color: THREE.Color; gate: boolean; dx: number; dz: number; /** Barrière ionique allumée pour ce camp. */ ion?: boolean; /** 1 : palissade, 2 : muraille, 3 et plus : mur moderne. */ style?: number };

/** Voile de la barrière ionique : dégradé qui s'efface vers le haut, traversé de lignes d'énergie. */
function veilTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 16; c.height = 128; const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 128, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 16, 128);
  g.fillStyle = 'rgba(255,255,255,0.55)'; for (let y = 6; y < 128; y += 14) g.fillRect(0, y, 16, 2);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

/** Murs des âges anciens : pièces posées une à une le long du mur (pieux, créneaux), à intervalle régulier. */
type Piece = { geo: THREE.BufferGeometry; mat: THREE.Material; colored?: boolean };
const WOOD = new THREE.MeshStandardMaterial({ color: 0x7a5534, roughness: 0.85, flatShading: true });
const WOOD_D = new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.9, flatShading: true });
const STONE = new THREE.MeshStandardMaterial({ color: 0xa29d92, roughness: 0.9, flatShading: true });
const STONE_D = new THREE.MeshStandardMaterial({ color: 0x7f7a70, roughness: 0.95, flatShading: true });
const TEAM = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
/** Style d'un mur : poteaux, pans (étirés sur la longueur), pièces répétées (tous les `step` m). */
interface WallStyle { posts: Piece[]; spans: Piece[]; reps: Piece[]; step: number }
const STYLES: WallStyle[] = [
  // 1 : palissade de pieux taillés en pointe, traverse, poteaux cerclés aux couleurs du camp.
  { posts: [{ geo: new THREE.CylinderGeometry(0.36, 0.42, 3.1, 7).translate(0, 1.55, 0), mat: WOOD_D }, { geo: new THREE.ConeGeometry(0.36, 0.55, 7).translate(0, 3.37, 0), mat: WOOD_D }, { geo: new THREE.CylinderGeometry(0.39, 0.39, 0.28, 7).translate(0, 2.3, 0), mat: TEAM(), colored: true }],
    spans: [{ geo: new THREE.BoxGeometry(1, 0.16, 0.16).translate(0, 1.7, 0.27), mat: WOOD_D }, { geo: new THREE.BoxGeometry(1, 0.16, 0.16).translate(0, 0.8, 0.27), mat: WOOD_D }],
    reps: [{ geo: new THREE.CylinderGeometry(0.22, 0.26, 2.7, 6).translate(0, 1.35, 0), mat: WOOD }, { geo: new THREE.ConeGeometry(0.22, 0.45, 6).translate(0, 2.92, 0), mat: WOOD }], step: 0.46 },
  // 2 : muraille de pierre, chemin de ronde, créneaux ; tours carrées avec bandeau aux couleurs du camp.
  { posts: [{ geo: new THREE.BoxGeometry(1.25, 3.5, 1.25).translate(0, 1.75, 0), mat: STONE_D }, { geo: new THREE.BoxGeometry(1.45, 0.3, 1.45).translate(0, 3.6, 0), mat: STONE }, { geo: new THREE.BoxGeometry(1.29, 0.35, 1.29).translate(0, 2.7, 0), mat: TEAM(), colored: true }],
    spans: [{ geo: new THREE.BoxGeometry(1, 2.8, 0.85).translate(0, 1.4, 0), mat: STONE }, { geo: new THREE.BoxGeometry(1, 0.22, 1.05).translate(0, 2.85, 0), mat: STONE_D }],
    reps: [{ geo: new THREE.BoxGeometry(0.34, 0.42, 0.22).translate(0, 3.17, 0.42), mat: STONE }, { geo: new THREE.BoxGeometry(0.34, 0.42, 0.22).translate(0, 3.17, -0.42), mat: STONE }], step: 0.7 },
];

export class WallViews {
  private posts: THREE.InstancedMesh; private caps: THREE.InstancedMesh;
  private veil: THREE.InstancedMesh; private veilMat: THREE.MeshBasicMaterial;
  private panels: THREE.InstancedMesh; private stripes: THREE.InstancedMesh; private feet: THREE.InstancedMesh; private skirts!: THREE.InstancedMesh;
  /** Âges anciens : [style][pièce] instanciée. */
  private old: { posts: THREE.InstancedMesh[]; spans: THREE.InstancedMesh[]; reps: THREE.InstancedMesh[] }[];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3(); private p = new THREE.Vector3(); private up = new THREE.Vector3(0, 1, 0);

  constructor(scene: THREE.Scene) {
    const inst = (g: THREE.BufferGeometry, mat: THREE.Material, colored = false, cap = CAP) => {
      const i = new THREE.InstancedMesh(g, mat, cap); i.castShadow = true; i.receiveShadow = true; i.frustumCulled = false; i.count = 0;
      if (colored) i.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      scene.add(i); return i;
    };
    this.posts = inst(new THREE.CylinderGeometry(0.34, 0.42, 2.7, 6).translate(0, 1.35, 0), DARK);
    this.caps = inst(new THREE.CylinderGeometry(0.2, 0.26, 0.14, 6).translate(0, 2.77, 0), glow(0xffffff), true);
    this.feet = inst(new THREE.CylinderGeometry(0.55, 0.62, 0.36, 6).translate(0, 0.18, 0), MID);
    this.panels = inst(new THREE.BoxGeometry(1, 2.3, 0.5).translate(0, 1.15, 0), LIGHT);
    this.skirts = inst(new THREE.BoxGeometry(1, 0.5, 0.7).translate(0, 0.25, 0), DARK);
    this.stripes = inst(new THREE.BoxGeometry(1, 0.12, 0.54).translate(0, 1.85, 0), glow(0xffffff), true);
    this.old = STYLES.map((st) => ({
      posts: st.posts.map((pc) => inst(pc.geo, pc.mat, pc.colored)),
      spans: st.spans.map((pc) => inst(pc.geo, pc.mat, pc.colored)),
      reps: st.reps.map((pc) => inst(pc.geo, pc.mat, pc.colored, CAP * 8)),
    }));
    this.veilMat = new THREE.MeshBasicMaterial({ map: veilTexture(), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    this.veil = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 6).translate(0, 2.4 + 3, 0), this.veilMat, CAP);
    this.veil.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    this.veil.frustumCulled = false; this.veil.count = 0; this.veil.renderOrder = 5; scene.add(this.veil);
  }

  /** `pairs` : liaisons entre poteaux (ou entre un poteau et un pylône de porte). */
  update(nodes: Map<number, WallNode>, pairs: [number, number][]) {
    const { m, q, s, p } = this;
    let nP = 0, nS = 0, nV = 0;
    const oP = this.old.map(() => 0), oS = this.old.map(() => 0), oR = this.old.map(() => 0);
    for (const n of nodes.values()) {
      if (n.gate || n.vis === 0 || nP >= CAP) continue;
      m.compose(p.set(n.x, n.y - 0.1, n.z), q.identity(), s.set(1, n.grow, 1));
      const st = (n.style ?? 3) - 1;
      if (st < this.old.length) {
        if (oP[st] >= CAP) continue;
        for (const im of this.old[st].posts) { im.setMatrixAt(oP[st], m); if (im.instanceColor) im.setColorAt(oP[st], n.color); }
        oP[st]++; continue;
      }
      this.posts.setMatrixAt(nP, m); this.feet.setMatrixAt(nP, m); this.caps.setMatrixAt(nP, m); this.caps.setColorAt(nP, n.color);
      nP++;
    }
    for (const [a, b] of pairs) {
      const A = nodes.get(a), B = nodes.get(b);
      if (!A || !B || A.vis === 0 || B.vis === 0 || nS >= CAP) continue;
      // Un pylône de porte : on s'arrête au pylône du côté du poteau.
      let ax = A.x, az = A.z, bx = B.x, bz = B.z;
      if (B.gate) { const sg = (A.x - B.x) * B.dx + (A.z - B.z) * B.dz >= 0 ? 1 : -1; bx = B.x + B.dx * GATE_HALF * sg; bz = B.z + B.dz * GATE_HALF * sg; }
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
      if (L < 0.05) continue;
      q.setFromAxisAngle(this.up, Math.atan2(-dz, dx));
      const st = (A.style ?? 3) - 1, y0 = Math.min(A.y, B.y) - 0.1, gr = Math.min(A.grow, B.grow);
      if (st < this.old.length) {
        const O = this.old[st], step = STYLES[st].step;
        if (oS[st] < CAP) { m.compose(p.set((ax + bx) / 2, y0, (az + bz) / 2), q, s.set(L, gr, 1)); for (const im of O.spans) im.setMatrixAt(oS[st], m); oS[st]++; }
        // Pieux ou créneaux, un tous les `step` mètres, entre les deux poteaux.
        const k = Math.max(1, Math.round(L / step));
        for (let i = 0; i < k && oR[st] < CAP * 8; i++) {
          const t = (i + 0.5) / k, px = ax + dx * t, pz = az + dz * t;
          m.compose(p.set(px, y0 - (st === 0 ? (i % 3) * 0.08 : 0), pz), q, s.set(1, gr * (st === 0 ? 1 - (i % 2) * 0.07 : 1), 1));
          for (const im of O.reps) im.setMatrixAt(oR[st], m); oR[st]++;
        }
        continue;
      }
      m.compose(p.set((ax + bx) / 2, y0, (az + bz) / 2), q, s.set(L, gr, 1));
      this.panels.setMatrixAt(nS, m); this.skirts.setMatrixAt(nS, m); this.stripes.setMatrixAt(nS, m); this.stripes.setColorAt(nS, A.color);
      nS++;
      if (A.ion && B.ion && A.grow >= 1 && B.grow >= 1 && nV < CAP) {
        // Voile ionique : de poteau à poteau, et jusqu'au milieu de la porte (il la couvre aussi).
        const vx = B.x - ax, vz = B.z - az, VL = Math.hypot(vx, vz);
        m.compose(p.set((ax + B.x) / 2, Math.min(A.y, B.y) - 0.1, (az + B.z) / 2), q.setFromAxisAngle(this.up, Math.atan2(-vz, vx)), s.set(VL + 0.2, 1, 1));
        this.veil.setMatrixAt(nV, m); this.veil.setColorAt(nV, A.color); nV++;
      }
    }
    this.veil.count = nV; this.veil.instanceMatrix.needsUpdate = true; if (this.veil.instanceColor) this.veil.instanceColor.needsUpdate = true;
    if (nV) { const t = performance.now() / 1000; this.veilMat.opacity = 0.45 + 0.12 * Math.sin(t * 3.1); this.veilMat.map!.offset.y = (t * 0.25) % 1; }
    for (const i of [this.posts, this.feet, this.caps]) { i.count = nP; i.instanceMatrix.needsUpdate = true; }
    for (const i of [this.panels, this.skirts, this.stripes]) { i.count = nS; i.instanceMatrix.needsUpdate = true; }
    if (this.caps.instanceColor) this.caps.instanceColor.needsUpdate = true;
    if (this.stripes.instanceColor) this.stripes.instanceColor.needsUpdate = true;
    this.old.forEach((O, st) => {
      for (const [list, n] of [[O.posts, oP[st]], [O.spans, oS[st]], [O.reps, oR[st]]] as [THREE.InstancedMesh[], number][])
        for (const im of list) { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    });
  }
}

/** Liaisons entre poteaux voisins d'un même camp, et entre un poteau et la porte qu'il borde. */
export function wallPairs(sim: Sim): { pairs: [number, number][]; dirs: Map<number, [number, number]> } {
  const walls = sim.buildings.filter((b) => b.kind === 'mur'), gates = sim.buildings.filter((b) => b.kind === 'porte');
  const H = new Map<number, Building[]>(), key = (x: number, z: number) => ((Math.floor(x / 3) + 512) << 10) | (Math.floor(z / 3) + 512);
  for (const w of walls) { const k = key(w.x, w.z); let a = H.get(k); if (!a) H.set(k, a = []); a.push(w); }
  const near = (x: number, z: number, r: number, owner: number) => {
    const out: Building[] = [], kx = Math.floor(x / 3), kz = Math.floor(z / 3), n = Math.ceil(r / 3);
    for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) for (const w of H.get(((kx + dx + 512) << 10) | (kz + dz + 512)) ?? []) if (w.owner === owner && Math.hypot(w.x - x, w.z - z) < r) out.push(w);
    return out;
  };
  const pairs: [number, number][] = [];
  for (const w of walls) for (const v of near(w.x, w.z, 2.7, w.owner)) if (v.id > w.id) pairs.push([w.id, v.id]);
  const dirs = new Map<number, [number, number]>();
  for (const g of gates) {
    const ns = near(g.x, g.z, 4.2, g.owner).sort((a, b) => Math.hypot(a.x - g.x, a.z - g.z) - Math.hypot(b.x - g.x, b.z - g.z));
    let dx = 1, dz = 0;
    if (ns.length) { const a = ns[0], l = Math.hypot(a.x - g.x, a.z - g.z) || 1; dx = (a.x - g.x) / l; dz = (a.z - g.z) / l; }
    dirs.set(g.id, [dx, dz]);
    // Un poteau de chaque côté de la porte est relié à son pylône.
    for (const sg of [1, -1]) {
      const side = ns.filter((w) => ((w.x - g.x) * dx + (w.z - g.z) * dz) * sg > 0.3);
      if (side.length) pairs.push([side[0].id, g.id]);
    }
  }
  return { pairs, dirs };
}

// ---------------------------------------------------------------- Porte
/** Porte des âges anciens : deux tours (bois ou pierre), un linteau et deux battants qui s'ouvrent pour le camp. */
function makeOldGate(color: number, style: number): THREE.Group {
  const g = new THREE.Group(), wood = style === 1, H = wood ? 4.4 : 4.8;
  const body = wood ? WOOD_D : STONE_D, trim = wood ? WOOD : STONE;
  const team = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  for (const sx of [-GATE_HALF, GATE_HALF]) {
    if (wood) {
      for (const [ox, oz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) mesh(new THREE.CylinderGeometry(0.24, 0.28, H, 6).translate(sx + ox, H / 2, oz), body, g);
      mesh(new THREE.BoxGeometry(1.4, 0.18, 1.4).translate(sx, H - 0.9, 0), trim, g);
      mesh(new THREE.ConeGeometry(1.15, 1.2, 4).rotateY(Math.PI / 4).translate(sx, H + 0.6, 0), WOOD, g);
    } else {
      mesh(new THREE.BoxGeometry(1.5, H, 1.5).translate(sx, H / 2, 0), body, g);
      mesh(new THREE.BoxGeometry(1.7, 0.3, 1.7).translate(sx, H + 0.15, 0), trim, g);
      for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) mesh(new THREE.BoxGeometry(0.4, 0.45, 0.4).translate(sx + ox, H + 0.5, oz), trim, g);
    }
    mesh(new THREE.BoxGeometry(wood ? 1.0 : 1.54, 0.45, wood ? 1.0 : 1.54).translate(sx, H * 0.62, 0), team, g);   // bandeau du camp
  }
  mesh(new THREE.BoxGeometry(GATE_HALF * 2, wood ? 0.5 : 0.9, wood ? 0.6 : 1.2).translate(0, H - (wood ? 0.3 : 0.45), 0), trim, g);
  // Battants : pivotent sur les tours (ouverts quand une unité du camp approche).
  const leaves = new THREE.Group(); g.add(leaves); g.userData.leaves = leaves;
  const lw = GATE_HALF - (wood ? 0.6 : 0.75), lh = H - (wood ? 0.6 : 1.0);
  for (const sg of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sg * (GATE_HALF - (wood ? 0.6 : 0.75)), 0, 0); leaves.add(pivot);
    mesh(new THREE.BoxGeometry(lw, lh, 0.22).translate(-sg * lw / 2, lh / 2, 0), WOOD, pivot);
    for (const y of [0.25, 0.7]) mesh(new THREE.BoxGeometry(lw * 0.96, 0.14, 0.26).translate(-sg * lw / 2, lh * y, 0), WOOD_D, pivot);
    pivot.userData.sg = sg;
  }
  g.userData.gate = true;
  return g;
}

export function makeGate(color: number, style = 3): THREE.Group {
  if (style <= 2) return makeOldGate(color, style);
  // Porte large (5 m de passage) et haute (4,6 m) : les mechs passent dessous.
  const g = new THREE.Group(), gl = glow(color), H = 4.6;
  mesh(new THREE.BoxGeometry(GATE_HALF * 2 + 0.9, 0.14, 1.4).translate(0, 0.07, 0), DARK, g);
  for (const sx of [-GATE_HALF, GATE_HALF]) {
    mesh(new THREE.BoxGeometry(0.9, H, 1.05).translate(sx, H / 2, 0), DARK, g);
    mesh(new THREE.BoxGeometry(1.06, 0.6, 1.2).translate(sx, 0.3, 0), MID, g);
    mesh(new THREE.BoxGeometry(1.02, 0.32, 1.15).translate(sx, H - 0.05, 0), LIGHT, g);
    mesh(new THREE.BoxGeometry(0.12, H - 1.0, 1.1).translate(sx - Math.sign(sx) * 0.46, H / 2, 0), gl, g);   // lumière tournée vers le passage
  }
  mesh(new THREE.BoxGeometry(GATE_HALF * 2 + 0.5, 0.3, 0.7).translate(0, H + 0.15, 0), LIGHT, g);
  mesh(new THREE.BoxGeometry(GATE_HALF * 2 - 0.7, 0.07, 0.74).translate(0, H - 0.02, 0), gl, g);
  // Émetteur au sol et barreaux d'énergie (bien visibles vus d'en haut) : ils se rétractent à l'ouverture.
  mesh(new THREE.BoxGeometry(GATE_HALF * 2 - 0.9, 0.05, 0.22).translate(0, 0.17, 0), gl, g);
  const bars = new THREE.Group(); g.add(bars); g.userData.bars = bars;
  for (const y of [0.75, 1.6, 2.45, 3.3, 4.1]) { const r = mesh(new THREE.CylinderGeometry(0.08, 0.08, GATE_HALF * 2 - 0.9, 6).rotateZ(Math.PI / 2).translate(0, y, 0), gl, bars); r.castShadow = false; }
  const field = new THREE.Mesh(new THREE.PlaneGeometry(GATE_HALF * 2 - 0.9, H - 0.4).translate(0, H / 2, 0),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  g.add(field); g.userData.field = field; g.userData.gate = true;
  return g;
}

// ---------------------------------------------------------------- Tourelles
export const TURRET_KINDS = new Set(['tourelle', 'tourelleAA', 'sentinelle']);
/** Les tourelles sont surélevées : leur tête domine les murs (poteaux de 2,9 m). */
export const TURRET_LIFT = 1.7;

export function makeTurret(kind: string, color: number): THREE.Group {
  const g = new THREE.Group(), gl = glow(color), aa = kind === 'tourelleAA';
  // Socle : plinthe octogonale, anneau lumineux, haut fût (la tête passe au-dessus des murs et tire par-dessus).
  const L = TURRET_LIFT;
  mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.5, 8).translate(0, 0.25, 0), DARK, g);
  const ring = mesh(new THREE.TorusGeometry(1.12, 0.07, 6, 32).rotateX(Math.PI / 2).translate(0, 0.53, 0), gl, g); ring.castShadow = false;
  mesh(new THREE.CylinderGeometry(0.62, 0.95, 1.15 + L, 8).translate(0, 0.5 + (1.15 + L) / 2, 0), MID, g);
  for (let k = 0; k < 4; k++) mesh(new THREE.BoxGeometry(0.42, 1.1 + L * 0.7, 0.3).translate(0.82, 0.5 + (1.1 + L * 0.7) / 2, 0), DARK, g).rotation.y = k * Math.PI / 2 + Math.PI / 4;   // contreforts
  const band = mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.12, 8).translate(0, 0.95 + L * 0.6, 0), gl, g); band.castShadow = false;
  const yaw = new THREE.Group(); yaw.position.y = 1.62 + L; g.add(yaw);
  mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.18, 12).translate(0, 0.02, 0), DARK, yaw);
  const pitch = new THREE.Group(); yaw.add(pitch);
  const barrels: THREE.Object3D[] = [];
  if (!aa) {
    // Tête anti-sol : carénage incliné et deux canons à rail.
    pitch.position.set(0, 0.42, 0.1);
    mesh(new THREE.BoxGeometry(1.45, 0.72, 1.55), LIGHT, pitch);
    mesh(new THREE.BoxGeometry(1.1, 0.3, 1.0).translate(0, 0.48, -0.15), DARK, pitch);
    mesh(new THREE.BoxGeometry(1.5, 0.5, 0.5).translate(0, -0.05, 0.85), MID, pitch);
    for (const sx of [-0.77, 0.77]) mesh(new THREE.BoxGeometry(0.06, 0.16, 1.1).translate(sx, 0.12, 0), gl, pitch);
    for (const sx of [-1, 1]) { const w = mesh(new THREE.BoxGeometry(0.22, 0.62, 1.7), MID, pitch); w.position.set(sx * 0.86, -0.05, -0.05); w.rotation.z = sx * 0.4; }   // ailettes de blindage
    mesh(new THREE.BoxGeometry(0.5, 0.1, 0.06).translate(0, 0.2, 0.79), gl, pitch);                  // visée
    for (const sx of [-0.3, 0.3]) {
      const b = new THREE.Group(); b.position.set(sx, 0, 0.7); pitch.add(b); barrels.push(b);
      mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.0, 8).rotateX(Math.PI / 2).translate(0, 0, 1.0), DARK, b);
      mesh(new THREE.BoxGeometry(0.34, 0.16, 1.3).translate(0, 0.12, 0.7), MID, b);
      mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8).rotateX(Math.PI / 2).translate(0, 0, 1.95), MID, b);
      const tip = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 8).rotateX(Math.PI / 2).translate(0, 0, 2.13), gl, b); tip.castShadow = false;
    }
    g.userData.muzzleY = 2.05 + L;
  } else {
    // Tête anti-aérienne : nacelles de missiles de part et d'autre, radar tournant au sommet.
    pitch.position.set(0, 0.45, 0);
    mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.75, 8), LIGHT, pitch);
    mesh(new THREE.BoxGeometry(2.3, 0.22, 0.5), DARK, pitch);
    for (const sx of [-1.0, 1.0]) {
      const pod = new THREE.Group(); pod.position.set(sx, 0.05, 0.1); pitch.add(pod); barrels.push(pod);
      mesh(new THREE.BoxGeometry(0.62, 0.7, 1.45), MID, pod);
      mesh(new THREE.BoxGeometry(0.66, 0.16, 1.5).translate(0, 0.36, 0), DARK, pod);
      for (let i = 0; i < 4; i++) { const t = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 6).rotateX(Math.PI / 2).translate((i % 2 - 0.5) * 0.28, (Math.floor(i / 2) - 0.5) * 0.28, 0.74), gl, pod); t.castShadow = false; }
    }
    const mast = new THREE.Group(); mast.position.set(0, 0.55, -0.35); pitch.add(mast);
    mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 6).translate(0, 0.25, 0), DARK, mast);
    const dish = new THREE.Group(); dish.position.y = 0.55; mast.add(dish);
    mesh(new THREE.CylinderGeometry(0.5, 0.12, 0.16, 12).rotateX(-1.1), LIGHT, dish);
    mesh(new THREE.SphereGeometry(0.07, 6, 4).translate(0, 0.12, 0.2), gl, dish);
    g.userData.dish = dish;
    g.userData.muzzleY = 2.2 + L;
  }
  if (kind === 'sentinelle') g.scale.setScalar(1.18);
  Object.assign(g.userData, { yaw, pitch, barrels, recoil: 0, aimYaw: Math.random() * 6.28, lastShot: -1e9, aa, kind });
  return g;
}

/** Anime les tourelles : visée de l'ennemi le plus proche à portée, balayage au repos, recul des canons. */
export function animateTurret(sim: Sim, b: Building, g: THREE.Group, dt: number, now: number) {
  const d = g.userData, T = TURRETS[b.kind as keyof typeof TURRETS] as { portee: number; air: boolean } | undefined;
  if (!T || !b.done) return;
  let tx = 0, tz = 0, ty = 0, found = false, bd = T.portee + (sim.players[b.owner].research.has('portee') ? 2 : 0);
  if (now - d.lastShot < 1500) { tx = d.shotX; tz = d.shotZ; ty = d.shotAir ? 3 : 0; found = true; }
  else for (const v of sim.units) {
    if (!sim.foe(v.owner, b.owner) || v.hp <= 0 || v.fly !== T.air) continue;
    const dd = Math.hypot(v.x - b.x, v.z - b.z) - v.radius;
    if (dd < bd) { bd = dd; tx = v.x; tz = v.z; ty = v.fly ? 3 : 0; found = true; }
  }
  const want = found ? Math.atan2(tx - b.x, tz - b.z) : d.aimYaw + Math.sin(now * 0.0004 + b.id) * 0.9;
  let cur = d.yaw.rotation.y, diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
  const turn = (found ? 4.5 : 0.8) * dt;
  cur += Math.max(-turn, Math.min(turn, diff));
  d.yaw.rotation.y = cur;
  const pitchWant = d.aa ? -0.55 - (found ? 0.2 : 0) : found ? -Math.atan2(ty - 0.5, Math.max(2, Math.hypot(tx - b.x, tz - b.z))) * 0.5 : 0;
  d.pitch.rotation.x += (pitchWant - d.pitch.rotation.x) * Math.min(1, dt * 5);
  d.recoil = Math.max(0, d.recoil - dt * 5);
  d.barrels.forEach((o: THREE.Object3D, i: number) => {
    // Les deux canons tirent en alternance.
    const r = i === d.side ? d.recoil : d.recoil * 0.25;
    o.userData.z0 ??= o.position.z; o.position.z = o.userData.z0 - r * 0.42;
  });
  if (d.dish) d.dish.rotation.y += dt * 2.2;
}

export function turretFired(g: THREE.Group, x1: number, z1: number, air: boolean, now: number) {
  const d = g.userData;
  d.recoil = 1; d.side = ((d.side ?? 0) + 1) % 2; d.lastShot = now; d.shotX = x1; d.shotZ = z1; d.shotAir = air;
}
