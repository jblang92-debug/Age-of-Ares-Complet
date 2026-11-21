// Effets de combat : traits de tir, explosions (boule de feu, fumée, débris, étincelles, onde de choc, trace au sol),
// morts d'unités et effondrement des bâtiments, barres de vie. Tout est instancié : quelques appels de dessin en tout.
import * as THREE from 'three';

const TR = 128, BARS = 400;
const TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -THREE.MathUtils.degToRad(55));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** Tache douce (dégradé radial) pour le feu, la fumée et les traces au sol. */
function softTexture(kind: 'puff' | 'scorch'): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  if (kind === 'puff') {
    for (let i = 0; i < 7; i++) {
      const x = 32 + (Math.random() - 0.5) * 18, y = 32 + (Math.random() - 0.5) * 18, r = 14 + Math.random() * 12;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }
  } else {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Une particule : position, vitesse, taille de départ et d'arrivée, couleur et opacité qui évoluent sur sa durée. */
interface P {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  s0: number; s1: number; t: number; life: number; g: number; drag: number;
  c0: THREE.Color; c1: THREE.Color; a0: number; a1: number;
  rx: number; ry: number; rz: number; spin: number; bounce: boolean; sx: number; sy: number; sz: number;
}

/** Lot de particules d'un même aspect, avec une opacité par particule (attribut ajouté au shader). */
class Pool {
  readonly mesh: THREE.InstancedMesh;
  private alpha: THREE.InstancedBufferAttribute;
  private ps: P[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private s = new THREE.Vector3(); private p = new THREE.Vector3(); private c = new THREE.Color();
  private dir = new THREE.Vector3(); private z = new THREE.Vector3(0, 0, 1); private rz = new THREE.Quaternion(); private zAxis = new THREE.Vector3(0, 0, 1);
  /** Orientation de la caméra, pour les particules qui lui font face. */
  static cam = new THREE.Quaternion();
  constructor(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, private cap: number, private stretch = false, private ground?: (x: number, z: number) => number, private billboard = false) {
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(1), 1);
    geo.setAttribute('iAlpha', this.alpha);
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float iAlpha;\nvarying float vIAlpha;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvIAlpha = iAlpha;');
      sh.fragmentShader = 'varying float vIAlpha;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vIAlpha;');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    scene.add(this.mesh);
  }
  add(p: Partial<P> & { x: number; y: number; z: number }) {
    if (this.ps.length >= this.cap) this.ps.shift();
    this.ps.push({ vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, t: 0, life: 1, g: 0, drag: 0, c0: WHITE, c1: WHITE, a0: 1, a1: 0, rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, spin: 0, bounce: false, sx: 1, sy: 1, sz: 1, ...p });
  }
  update(dt: number) {
    const { m, q, e, s, p, c } = this;
    let n = 0;
    this.ps = this.ps.filter((a) => (a.t += dt) < a.life);
    for (const a of this.ps) {
      a.vy -= a.g * dt;
      const k = Math.max(0, 1 - a.drag * dt); a.vx *= k; a.vy *= a.g ? 1 : k; a.vz *= k;
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      if (a.bounce && this.ground) {
        const gy = this.ground(a.x, a.z) + a.s0 * 0.4;
        if (a.y < gy) { a.y = gy; a.vy = Math.abs(a.vy) * 0.3; a.vx *= 0.55; a.vz *= 0.55; a.spin *= 0.5; if (Math.abs(a.vy) < 0.6) a.vy = 0; }
      }
      const f = a.t / a.life, sc = a.s0 + (a.s1 - a.s0) * f;
      if (this.stretch) {
        // Étincelle : étirée dans le sens de sa course.
        this.dir.set(a.vx, a.vy, a.vz); const sp = this.dir.length() || 1;
        q.setFromUnitVectors(this.z, this.dir.multiplyScalar(1 / sp));
        s.set(sc, sc, sc * Math.min(6, 0.6 + sp * 0.12));
      } else if (this.billboard) {
        a.rz += a.spin * dt;
        q.copy(Pool.cam).multiply(this.rz.setFromAxisAngle(this.zAxis, a.rz)); s.set(sc, sc, sc);
      } else {
        a.rx += a.spin * dt; a.ry += a.spin * 0.7 * dt;
        q.setFromEuler(e.set(a.rx, a.ry, a.rz)); s.set(sc * a.sx, sc * a.sy, sc * a.sz);
      }
      this.mesh.setMatrixAt(n, m.compose(p.set(a.x, a.y, a.z), q, s));
      this.mesh.setColorAt(n, c.copy(a.c0).lerp(a.c1, f));
      this.alpha.setX(n, a.a0 + (a.a1 - a.a0) * f);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true; this.alpha.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
const WHITE = new THREE.Color(1, 1, 1);
const C = (h: number) => new THREE.Color(h);
const FIRE_HOT = C(0xfff2b0), FIRE = C(0xff8a2a), FIRE_END = C(0x8a1c06), SMOKE_D = C(0x221d1a), SMOKE_L = C(0x6b625b), DUST = C(0xa86a42), DUST_L = C(0xc99a72);
const SPARK = C(0xffe08a), SPARK_END = C(0xff5a1a), ENERGY = C(0x9ff4ff), ENERGY_END = C(0x2a7cff);
const DEBRIS = [C(0x3a3e45), C(0x55595f), C(0x2a2622), C(0x6d5444)];
const ARROW = C(0x3a2a1c), STONE = C(0x8d8780);
const SHELL_RED = C(0xb3261e), BULLET = C(0xffe9a0), SHELL = C(0xffb347), MISSILE = C(0xfff4d0), LASER = C(0x37e6ff), PLASMA_G = C(0x6dff8e), PLASMA_B = C(0x5aa8ff), PLASMA_O = C(0xff9a3a), PLASMA_V = C(0xc77dff), BEAM_O = C(0xff7a2a), BEAM_R = C(0xff3030);
/** Armes à distance : chacune a son projectile, son éclair et son impact. */
export type Weapon = 'fusil' | 'pompe' | 'mitrailleuse' | 'canon' | 'roquette' | 'artillerie' | 'laser' | 'plasma' | 'plasmaBleu' | 'tourelle' | 'salve' | 'assaut' | 'cuirasse' | 'flak' | 'rayon' | 'rayonRouge' | 'precision' | 'grenade' | 'bombes' | 'fleche' | 'pierre';

export class Effects {
  private tracers: THREE.InstancedMesh;
  private tr: { t: number; life: number; m: THREE.Matrix4 }[] = [];
  private fire: Pool; private smoke: Pool; private debris: Pool; private sparks: Pool; private rings: Pool; private scorch: Pool;
  private bolts: Pool; private beams: Pool; private glows: Pool; private arrows: Pool;
  /** Projectiles suivis image par image (missiles, obus d'artillerie). */
  private proj: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; t: number; life: number; kind: 'missile' | 'obus' | 'fleche' | 'pierre'; size: number; last: THREE.Vector3 }[] = [];
  /** Impact d'un projectile (pour le son) : position et taille. */
  onImpact?: (x: number, z: number, size: number) => void;
  private later: { t: number; fn: () => void }[] = [];
  private barBg: THREE.InstancedMesh; private barFill: THREE.InstancedMesh; private nBar = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3(); private p = new THREE.Vector3();
  private a = new THREE.Vector3(); private b = new THREE.Vector3();
  private col = new THREE.Color();
  /** Secousse demandée à la caméra (lue et remise à zéro par la boucle principale). */
  shake = 0;

  constructor(scene: THREE.Scene, private ground: (x: number, z: number) => number = () => 0) {
    this.tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xfff1a8, fog: false }), TR);
    const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false } as const;
    const puff = softTexture('puff');
    this.fire = new Pool(scene, new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ ...add, map: puff }), 900, false, undefined, true);
    this.sparks = new Pool(scene, new THREE.BoxGeometry(0.07, 0.07, 1), new THREE.MeshBasicMaterial(add), 700, true);
    this.rings = new Pool(scene, new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ ...add, side: THREE.DoubleSide }), 40);
    this.smoke = new Pool(scene, new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: puff, transparent: true, depthWrite: false }), 900, false, undefined, true);
    this.debris = new Pool(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.5, flatShading: true, transparent: true }), 500, false, ground);
    this.scorch = new Pool(scene, new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softTexture('scorch'), color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 140);
    this.debris.mesh.castShadow = true;
    this.arrows = new Pool(scene, new THREE.BoxGeometry(0.06, 0.06, 1), new THREE.MeshBasicMaterial({ transparent: true }), 300, true);
    this.bolts = new Pool(scene, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(add), 600, true);
    this.beams = new Pool(scene, new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ ...add, side: THREE.DoubleSide }), 160);
    this.glows = new Pool(scene, new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ ...add, map: softTexture('scorch') }), 400, false, undefined, true);
    const bar = new THREE.PlaneGeometry(1, 0.2).translate(0.5, 0, 0);
    this.barBg = new THREE.InstancedMesh(bar, new THREE.MeshBasicMaterial({ color: 0x1a0d08, depthTest: false, depthWrite: false, transparent: true, opacity: 0.85, fog: false }), BARS);
    this.barFill = new THREE.InstancedMesh(bar, new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, transparent: true, fog: false, toneMapped: false }), BARS);
    this.barFill.setColorAt(0, this.col.set(0x6dff7a));
    this.barBg.renderOrder = 10; this.barFill.renderOrder = 11;
    for (const im of [this.tracers, this.barBg, this.barFill]) { im.frustumCulled = false; im.count = 0; scene.add(im); }
  }

  shot(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, big: boolean) {
    if (this.tr.length >= TR) this.tr.shift();
    const { a, b, m, q, s, p } = this;
    a.set(x0, y0, z0); b.set(x1, y1, z1);
    const len = a.distanceTo(b);
    m.lookAt(a, b, THREE.Object3D.DEFAULT_UP); q.setFromRotationMatrix(m);
    const w = big ? 0.22 : 0.09;
    this.tr.push({ t: 0, life: big ? 0.16 : 0.1, m: new THREE.Matrix4().compose(p.copy(a).add(b).multiplyScalar(0.5), q, s.set(w, w, len)) });
    // Bouche à feu et impact.
    this.fire.add({ x: x0 + (x1 - x0) * 0.04, y: y0, z: z0 + (z1 - z0) * 0.04, s0: big ? 0.45 : 0.22, s1: 0.05, life: 0.08, c0: FIRE_HOT, c1: FIRE });
    this.boom(x1, y1, z1, big ? 1.1 : 0.35, big ? 0.3 : 0.14);
    for (let i = 0; i < (big ? 6 : 2); i++) this.sparks.add({ x: x1, y: y1, z: z1, vx: rnd(-5, 5), vy: rnd(1, 6), vz: rnd(-5, 5), s0: 0.9, s1: 0.4, life: rnd(0.15, 0.35), g: 14, c0: SPARK, c1: SPARK_END });
  }
  // ---------------------------------------------------------------- armes à distance
  /** Tir d'une arme : chaque type a son projectile, sa bouche à feu et son impact. `twin` : décalage latéral entre deux canons. */
  weapon(w: Weapon, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, twin = 0) {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), d = b.clone().sub(a), dist = d.length() || 1;
    const dir = d.clone().divideScalar(dist), side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const from = (k: number) => a.clone().addScaledVector(side, k * twin).addScaledVector(dir, 0.6);
    const jit = (r: number) => b.clone().add(new THREE.Vector3(rnd(-r, r), rnd(-r * 0.3, r * 0.3), rnd(-r, r)));
    const at = (t: number, fn: () => void) => { if (t <= 0) fn(); else this.later.push({ t, fn }); };
    switch (w) {
      case 'fusil': for (let i = 0; i < 2; i++) at(i * 0.09, () => this.bullet(from(0), jit(0.25), 85, BULLET, 0.07)); break;
      case 'pompe': {
        // Fusil à pompe : un seul coup, grosse flamme en éventail, gerbe de plombs qui s'écartent, fumée, douille éjectée.
        // Départ au ras du canon (les autres armes partent 60 cm devant).
        const m = a.clone().addScaledVector(dir, 0.05);
        this.flash(m, dir, 0.5, FIRE_HOT);
        for (let i = 0; i < 4; i++) { const sp = rnd(-0.35, 0.35); const v = dir.clone().addScaledVector(side, sp).normalize(); this.fire.add({ x: m.x + v.x * 0.15, y: m.y + rnd(-0.05, 0.05), z: m.z + v.z * 0.15, vx: v.x * 6, vy: 0, vz: v.z * 6, drag: 10, s0: 0.35, s1: 0.1, life: 0.1, c0: FIRE_HOT, c1: FIRE }); }
        for (let i = 0; i < 3; i++) this.smoke.add({ x: m.x + dir.x * 0.15, y: m.y, z: m.z + dir.z * 0.15, vx: dir.x * rnd(1.5, 3) + rnd(-0.4, 0.4), vy: rnd(0.2, 0.7), vz: dir.z * rnd(1.5, 3) + rnd(-0.4, 0.4), drag: 2.5, s0: 0.2, s1: 0.9, life: rnd(0.7, 1.1), c0: SMOKE_L, c1: DUST_L, a0: 0.55, a1: 0 });
        const spread = 0.35 + dist * 0.09;
        for (let i = 0; i < 8; i++) this.bullet(m.clone().addScaledVector(dir, 0.2), jit(spread), rnd(45, 60), BULLET, 0.06, i < 4);
        at(0.45, () => { const p = a.clone().addScaledVector(dir, -0.3); this.debris.add({ x: p.x, y: p.y + 0.1, z: p.z, vx: side.x * 2.5 - dir.x * 0.5, vy: rnd(2.5, 3.5), vz: side.z * 2.5 - dir.z * 0.5, g: 18, spin: 14, s0: 0.07, s1: 0.07, life: 0.9, c0: SHELL_RED, c1: SHELL_RED, a0: 1, a1: 1, bounce: true, sx: 0.6, sy: 0.6, sz: 1.5 }); });
        break;
      }
      case 'mitrailleuse': for (let i = 0; i < 4; i++) at(i * 0.07, () => this.bullet(from(i % 2 ? 1 : -1), jit(0.45), 95, BULLET, 0.08)); break;
      case 'canon': this.cannon(from(0), b, 1); break;
      case 'roquette': this.flash(from(0), dir, 0.35, FIRE_HOT); this.missile(from(0), b, 0.6, 26, 0.55); break;
      case 'artillerie': this.flash(from(0), dir, 0.8, FIRE_HOT); this.smoke.add({ ...from(0), vy: 1.2, s0: 0.6, s1: 2, life: 1.8, c0: SMOKE_D, c1: SMOKE_L, a0: 0.7, a1: 0 }); this.lob(from(0), b, 1.1); break;
      case 'laser': for (const k of twin ? [-1, 1] : [0]) this.beam(from(k), jit(0.15), LASER, 0.2, 0.22); break;
      case 'plasma': for (let i = 0; i < 2; i++) at(i * 0.1, () => this.plasma(from(i ? 1 : -1), jit(0.2), PLASMA_G, 0.2)); break;
      case 'plasmaBleu': for (let i = 0; i < 2; i++) at(i * 0.08, () => this.plasma(from(i ? 1 : -1), jit(0.2), PLASMA_B, 0.18)); break;
      case 'tourelle': for (let i = 0; i < 2; i++) at(i * 0.12, () => this.plasma(from(i ? 1 : -1), jit(0.15), PLASMA_O, 0.24)); break;
      case 'salve':
        for (let i = 0; i < 4; i++) at(i * 0.12, () => this.missile(from(i % 2 ? 1 : -1).add(new THREE.Vector3(0, 0.6, 0)), jit(1.4), 2.5 + dist * 0.25, 20, 0.5));
        break;
      case 'assaut': this.cannon(from(-1), b, 0.9); at(0.1, () => this.beam(from(1), jit(0.15), LASER, 0.2, 0.22)); at(0.25, () => this.missile(from(0).add(new THREE.Vector3(0, 0.7, 0)), jit(0.8), 1.2, 24, 0.5)); break;
      case 'cuirasse': for (let i = 0; i < 2; i++) at(i * 0.14, () => this.plasma(from(i ? 1 : -1), jit(0.3), PLASMA_V, 0.34)); if (Math.random() < 0.5) at(0.3, () => this.missile(from(0), jit(1), 1.5, 22, 0.6)); break;
      case 'flak':
        for (let i = 0; i < 3; i++) at(i * 0.06, () => this.bullet(from(i % 2 ? 1 : -1), jit(0.8), 110, BULLET, 0.09, false));
        at(dist / 110 + 0.05, () => { for (let i = 0; i < 3; i++) { const p = jit(1.2); this.fire.add({ x: p.x, y: p.y, z: p.z, s0: 0.3, s1: 1.4, life: 0.25, c0: FIRE_HOT, c1: FIRE_END }); this.smoke.add({ x: p.x, y: p.y, z: p.z, s0: 0.5, s1: 1.6, life: 1.2, c0: SMOKE_D, c1: SMOKE_D, a0: 0.75, a1: 0 }); } });
        break;
      case 'rayon': this.beam(from(0), b, BEAM_O, 0.55, 0.32); at(0.05, () => this.impact(x1, y1 - 0.3, z1, 0.9)); break;
      case 'precision': this.flash(from(0), dir, 0.3, FIRE_HOT); this.bullet(from(0), jit(0.05), 160, WHITE, 0.06); this.bolts.add({ x: a.x, y: a.y, z: a.z, vx: d.x * 4, vy: d.y * 4, vz: d.z * 4, s0: 0.03, s1: 0.03, life: 0.25, c0: BULLET, c1: BULLET, a0: 0.5, a1: 0 }); break;
      case 'grenade': this.flash(from(0), dir, 0.3, FIRE_HOT); this.proj.push({ a: from(0), b: jit(0.4), c: a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.5 + dist * 0.3, 0)), t: 0, life: 0.5 + dist / 25, kind: 'obus', size: 0.55, last: from(0) }); break;
      case 'bombes': for (let i = 0; i < 3; i++) at(i * 0.15, () => { const p0 = a.clone().add(new THREE.Vector3(rnd(-0.5, 0.5), -0.4, rnd(-0.5, 0.5))), p1 = jit(1.3); this.proj.push({ a: p0, b: p1, c: p0.clone().lerp(p1, 0.3), t: 0, life: 0.55, kind: 'obus', size: 0.75, last: p0.clone() }); }); break;
      case 'fleche': {   // flèche ou carreau : arc tendu, sans flamme
        const c = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.6 + dist * 0.12, 0));
        this.proj.push({ a: from(0), b: jit(0.35), c, t: 0, life: 0.25 + dist / 32, kind: 'fleche', size: 0.3, last: from(0) }); break;
      }
      case 'pierre': {   // catapulte : un bloc de pierre en cloche, nuage de poussière au départ
        this.smoke.add({ ...from(0), vy: 0.8, s0: 0.5, s1: 1.6, life: 1.2, c0: DUST_L, c1: DUST_L, a0: 0.5, a1: 0 });
        const c = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 3.5 + dist * 0.5, 0));
        this.proj.push({ a: from(0), b: jit(0.6), c, t: 0, life: 0.9 + dist / 28, kind: 'pierre', size: 1, last: from(0) }); break;
      }
      case 'rayonRouge': this.beam(from(0), jit(0.1), BEAM_R, 0.28, 0.25); break;
    }
  }
  /** Balle traçante : trait lumineux qui file vers la cible, petite gerbe à l'impact. */
  private bullet(a: THREE.Vector3, b: THREE.Vector3, speed: number, c: THREE.Color, w: number, impact = true) {
    const d = b.clone().sub(a), len = d.length(), life = len / speed;
    d.multiplyScalar(speed / (len || 1));
    this.bolts.add({ x: a.x, y: a.y, z: a.z, vx: d.x, vy: d.y, vz: d.z, s0: w, s1: w, life, c0: c, c1: c, a0: 1, a1: 0.9 });
    this.fire.add({ x: a.x, y: a.y, z: a.z, s0: w * 3, s1: 0.02, life: 0.05, c0: FIRE_HOT, c1: FIRE });
    if (impact) this.later.push({ t: life, fn: () => { this.fire.add({ x: b.x, y: b.y, z: b.z, s0: 0.12, s1: 0.4, life: 0.1, c0: FIRE_HOT, c1: FIRE }); for (let i = 0; i < 2; i++) this.sparks.add({ x: b.x, y: b.y, z: b.z, vx: rnd(-4, 4), vy: rnd(1, 4), vz: rnd(-4, 4), s0: 0.6, s1: 0.2, life: rnd(0.1, 0.25), g: 14, c0: SPARK, c1: SPARK_END }); } });
  }
  /** Impact d'un projectile : boule de feu, fumée, étincelles, quelques éclats ; pas de gros débris. */
  private impact(x: number, y: number, z: number, S: number) {
    this.fire.add({ x, y, z, s0: 0.5 * S, s1: 1.8 * S, life: 0.28, c0: WHITE, c1: FIRE, a0: 1, a1: 0 });
    for (let i = 0; i < 4; i++) { const a = Math.random() * 6.28; this.fire.add({ x, y, z, vx: Math.cos(a) * 2 * S, vy: rnd(1, 2.5), vz: Math.sin(a) * 2 * S, drag: 4, s0: 0.5 * S, s1: 1.1 * S, life: rnd(0.35, 0.6), c0: FIRE_HOT, c1: FIRE_END, a0: 1, a1: 0 }); }
    for (let i = 0; i < 3; i++) this.smoke.add({ x, y: y + 0.3, z, vx: rnd(-0.6, 0.6), vy: rnd(0.8, 1.8), vz: rnd(-0.6, 0.6), drag: 0.8, s0: 0.4 * S, s1: 1.6 * S, life: rnd(1.2, 2), c0: SMOKE_D, c1: SMOKE_L, a0: 0.75, a1: 0 });
    for (let i = 0; i < 8; i++) { const a = Math.random() * 6.28, sp = rnd(4, 10); this.sparks.add({ x, y, z, vx: Math.cos(a) * sp, vy: rnd(1, 7), vz: Math.sin(a) * sp, g: 16, s0: 0.9, s1: 0.3, life: rnd(0.2, 0.5), c0: SPARK, c1: SPARK_END }); }
    for (let i = 0; i < 3; i++) { const a = Math.random() * 6.28, sp = rnd(2, 5); this.debris.add({ x, y, z, vx: Math.cos(a) * sp, vy: rnd(3, 6), vz: Math.sin(a) * sp, g: 20, spin: rnd(4, 12), s0: 0.12, s1: 0.1, life: rnd(0.8, 1.4), c0: DEBRIS[i % 4], c1: DEBRIS[i % 4], a0: 1, a1: 1, bounce: true }); }
    const gy = this.ground(x, z);
    if (y - gy < 2.5) { this.rings.add({ x, y: gy + 0.12, z, rx: 0, ry: 0, rz: 0, s0: 0.4 * S, s1: 2 * S, life: 0.35, c0: FIRE_HOT, c1: FIRE, a0: 0.7, a1: 0 }); this.scorch.add({ x, y: gy + 0.08, z, s0: 0.7 * S, s1: 0.75 * S, life: 14, c0: C(0x1a120c), c1: C(0x1a120c), a0: 0.4, a1: 0, rx: 0, ry: Math.random() * 6, rz: 0 }); }
    this.shake = Math.max(this.shake, 0.04 * S);
  }
  /** Éclair de bouche à feu. */
  private flash(a: THREE.Vector3, dir: THREE.Vector3, s: number, c: THREE.Color) {
    this.fire.add({ x: a.x + dir.x * 0.2, y: a.y, z: a.z + dir.z * 0.2, s0: s, s1: s * 0.2, life: 0.09, c0: WHITE, c1: c });
    this.glows.add({ x: a.x, y: a.y, z: a.z, s0: s * 1.6, s1: s * 0.5, life: 0.12, c0: c, c1: FIRE, a0: 0.8, a1: 0 });
  }
  /** Obus de canon : gros éclair, fumée, projectile incandescent rapide, explosion à l'impact. */
  private cannon(a: THREE.Vector3, b: THREE.Vector3, k: number) {
    const dir = b.clone().sub(a).normalize();
    this.flash(a, dir, 0.7 * k, FIRE_HOT);
    for (let i = 0; i < 3; i++) this.smoke.add({ x: a.x, y: a.y, z: a.z, vx: dir.x * 2 + rnd(-0.5, 0.5), vy: rnd(0.3, 1), vz: dir.z * 2 + rnd(-0.5, 0.5), drag: 2, s0: 0.3, s1: 1.2 * k, life: 1, c0: SMOKE_L, c1: DUST_L, a0: 0.6, a1: 0 });
    const len = a.distanceTo(b), life = len / 65, v = dir.clone().multiplyScalar(65);
    this.bolts.add({ x: a.x, y: a.y, z: a.z, vx: v.x, vy: v.y, vz: v.z, s0: 0.2 * k, s1: 0.2 * k, life, c0: SHELL, c1: SHELL, a0: 1, a1: 1 });
    this.later.push({ t: life, fn: () => { this.impact(b.x, b.y - 0.3, b.z, 0.6 * k); this.onImpact?.(b.x, b.z, 0.5 * k); } });
  }
  /** Rayon laser : cœur blanc et halo coloré qui s'estompent, éclat à l'impact. */
  private beam(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Color, w: number, life: number) {
    const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
    this.m.lookAt(a, b, THREE.Object3D.DEFAULT_UP); this.q.setFromRotationMatrix(this.m);
    const e = new THREE.Euler().setFromQuaternion(this.q);
    const add = (ww: number, col: THREE.Color, al: number) => this.beams.add({ x: mid.x, y: mid.y, z: mid.z, rx: e.x, ry: e.y, rz: e.z, spin: 0, s0: 1, s1: 0.3, sx: ww, sy: ww, sz: len, life, c0: col, c1: col, a0: al, a1: 0 });
    add(w * 2.6, c, 0.35); add(w, c, 0.9); add(w * 0.35, WHITE, 1);
    this.glows.add({ x: a.x, y: a.y, z: a.z, s0: w * 4, s1: w, life: life, c0: c, c1: c, a0: 0.9, a1: 0 });
    this.glows.add({ x: b.x, y: b.y, z: b.z, s0: w * 6, s1: w * 2, life: life * 1.4, c0: WHITE, c1: c, a0: 1, a1: 0 });
    for (let i = 0; i < 4; i++) this.sparks.add({ x: b.x, y: b.y, z: b.z, vx: rnd(-4, 4), vy: rnd(1, 5), vz: rnd(-4, 4), s0: 0.6, s1: 0.2, life: rnd(0.15, 0.35), g: 10, c0: WHITE, c1: c });
  }
  /** Boule de plasma : bolt allongé et lumineux, éclaboussure d'énergie à l'impact. */
  private plasma(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Color, w: number) {
    const d = b.clone().sub(a), len = d.length(), sp = 48, life = len / sp;
    d.multiplyScalar(sp / (len || 1));
    this.bolts.add({ x: a.x, y: a.y, z: a.z, vx: d.x, vy: d.y, vz: d.z, s0: w, s1: w, life, c0: WHITE, c1: c, a0: 1, a1: 1 });
    this.bolts.add({ x: a.x, y: a.y, z: a.z, vx: d.x, vy: d.y, vz: d.z, s0: w * 2.2, s1: w * 2.2, life, c0: c, c1: c, a0: 0.45, a1: 0.45 });
    this.glows.add({ x: a.x, y: a.y, z: a.z, s0: w * 4, s1: w, life: 0.12, c0: c, c1: c, a0: 0.9, a1: 0 });
    this.later.push({ t: life, fn: () => {
      this.glows.add({ x: b.x, y: b.y, z: b.z, s0: w * 3, s1: w * 9, life: 0.22, c0: WHITE, c1: c, a0: 1, a1: 0 });
      for (let i = 0; i < 5; i++) this.sparks.add({ x: b.x, y: b.y, z: b.z, vx: rnd(-5, 5), vy: rnd(1, 5), vz: rnd(-5, 5), s0: 0.7, s1: 0.2, life: rnd(0.15, 0.35), g: 8, c0: WHITE, c1: c });
    } });
  }
  /** Missile : trajectoire courbe, flamme de propulsion et traînée de fumée, explosion à l'arrivée. */
  private missile(a: THREE.Vector3, b: THREE.Vector3, h: number, speed: number, size: number) {
    const mid = a.clone().add(b).multiplyScalar(0.5), sd = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize().multiplyScalar(rnd(-1, 1) * h * 0.5);
    const c = mid.add(new THREE.Vector3(0, h, 0)).add(sd);
    this.proj.push({ a, b, c, t: 0, life: Math.max(0.35, a.distanceTo(b) / speed), kind: 'missile', size, last: a.clone() });
  }
  /** Obus d'artillerie : tir en cloche. */
  private lob(a: THREE.Vector3, b: THREE.Vector3, size: number) {
    const dist = a.distanceTo(b), c = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 3 + dist * 0.55, 0));
    this.proj.push({ a, b, c, t: 0, life: 0.8 + dist / 30, kind: 'obus', size, last: a.clone() });
  }
  private flyProjectiles(dt: number) {
    const p = new THREE.Vector3();
    this.proj = this.proj.filter((m) => {
      m.t += dt; const u = Math.min(1, m.t / m.life), v = 1 - u;
      p.set(0, 0, 0).addScaledVector(m.a, v * v).addScaledVector(m.c, 2 * u * v).addScaledVector(m.b, u * u);
      const vel = p.clone().sub(m.last).divideScalar(Math.max(dt, 1e-3));
      if (m.kind === 'missile') {
        this.bolts.add({ x: p.x, y: p.y, z: p.z, vx: vel.x * 0.03, vy: vel.y * 0.03, vz: vel.z * 0.03, s0: 0.24, s1: 0.24, life: 0.05, c0: MISSILE, c1: MISSILE, a0: 1, a1: 1 });
        this.glows.add({ x: m.last.x, y: m.last.y, z: m.last.z, s0: 0.9, s1: 0.3, life: 0.12, c0: FIRE_HOT, c1: FIRE, a0: 0.9, a1: 0 });
        this.fire.add({ x: m.last.x, y: m.last.y, z: m.last.z, s0: 0.45, s1: 0.1, life: 0.14, c0: FIRE_HOT, c1: FIRE });
        for (const k of [0, 0.5]) { const q = m.last.clone().lerp(p, k); this.smoke.add({ x: q.x, y: q.y, z: q.z, vx: rnd(-0.2, 0.2), vy: rnd(0.1, 0.4), vz: rnd(-0.2, 0.2), s0: 0.35, s1: 1.2, life: rnd(1.1, 1.6), c0: C(0xd8cfc4), c1: DUST_L, a0: 0.7, a1: 0 }); }
      } else if (m.kind === 'fleche') {
        // Flèche : un trait sombre orienté selon sa vitesse.
        this.arrows.add({ x: p.x, y: p.y, z: p.z, vx: vel.x * 0.04, vy: vel.y * 0.04, vz: vel.z * 0.04, s0: 1, s1: 1, life: 0.03, c0: ARROW, c1: ARROW, a0: 1, a1: 1 });
      } else if (m.kind === 'pierre') {
        this.debris.add({ x: p.x, y: p.y, z: p.z, s0: 0.55, s1: 0.55, life: 0.03, c0: STONE, c1: STONE, a0: 1, a1: 1 });
        this.smoke.add({ x: m.last.x, y: m.last.y, z: m.last.z, s0: 0.25, s1: 0.6, life: 0.4, c0: DUST_L, c1: DUST_L, a0: 0.25, a1: 0 });
      } else {
        this.bolts.add({ x: p.x, y: p.y, z: p.z, vx: vel.x * 0.02, vy: vel.y * 0.02, vz: vel.z * 0.02, s0: 0.28, s1: 0.28, life: 0.04, c0: SHELL, c1: SHELL, a0: 1, a1: 1 });
        this.glows.add({ x: p.x, y: p.y, z: p.z, s0: 0.7, s1: 0.2, life: 0.15, c0: SHELL, c1: FIRE, a0: 0.6, a1: 0 });
      }
      m.last.copy(p);
      if (u >= 1) {
        if (m.kind === 'fleche') { this.dust(m.b.x, m.b.y - 0.6, m.b.z, 0.3); return false; }
        if (m.kind === 'pierre') { this.dust(m.b.x, m.b.y - 0.4, m.b.z, 1.4); for (let i = 0; i < 6; i++) this.debris.add({ x: m.b.x, y: m.b.y, z: m.b.z, vx: rnd(-4, 4), vy: rnd(2, 6), vz: rnd(-4, 4), s0: 0.25, s1: 0.2, life: 1.2, g: 14, c0: STONE, c1: STONE, a0: 1, a1: 1 }); this.onImpact?.(m.b.x, m.b.z, -1); return false; }
        this.impact(m.b.x, m.b.y - 0.4, m.b.z, m.size * 1.3); this.onImpact?.(m.b.x, m.b.z, m.size); return false;
      }
      return true;
    });
  }

  /** Nuage de poussière (flèche fichée au sol, pierre qui s'écrase). */
  dust(x: number, y: number, z: number, r: number) {
    for (let i = 0; i < (r > 1 ? 6 : 2); i++) this.smoke.add({ x: x + rnd(-r, r) * 0.4, y, z: z + rnd(-r, r) * 0.4, vx: rnd(-0.6, 0.6), vy: rnd(0.3, 1), vz: rnd(-0.6, 0.6), s0: r * 0.4, s1: r * 1.5, life: rnd(0.8, 1.4), c0: DUST_L, c1: DUST_L, a0: 0.55, a1: 0 });
  }
  /** Étincelles d'un coup au corps à corps. */
  spark(x: number, y: number, z: number, heavy = false) {
    for (let i = 0; i < (heavy ? 10 : 5); i++) this.sparks.add({ x, y, z, vx: rnd(-4, 4), vy: rnd(1, heavy ? 5 : 3.5), vz: rnd(-4, 4), s0: heavy ? 1.1 : 0.7, s1: 0.3, life: rnd(0.12, 0.3), g: 14, c0: SPARK, c1: SPARK_END });
    if (heavy) this.boom(x, y - 0.3, z, 0.6, 0.18);
  }
  /** Petite boule de feu (impact, passage d'ère…). */
  boom(x: number, y: number, z: number, r: number, life = 0.45) {
    this.fire.add({ x, y, z, s0: r * 0.35, s1: r * 1.2, life, c0: FIRE_HOT, c1: FIRE_END, a0: 1, a1: 0 });
    if (r > 0.8) this.smoke.add({ x, y, z, vy: 1.2, s0: r * 0.4, s1: r * 1.3, life: life * 3, c0: SMOKE_D, c1: SMOKE_L, a0: 0.55, a1: 0 });
  }

  /** Explosion complète : `size` ≈ 1 pour un véhicule. */
  explode(x: number, y: number, z: number, size: number, onGround = true) {
    const S = size;
    this.fire.add({ x, y: y + 0.4 * S, z, s0: 1.2 * S, s1: 3.2 * S, life: 0.35, c0: FIRE_HOT, c1: FIRE, a0: 1, a1: 0 });            // éclair
    this.fire.add({ x, y: y + 0.4 * S, z, s0: 0.6 * S, s1: 1.6 * S, life: 0.22, c0: WHITE, c1: FIRE_HOT, a0: 1, a1: 0 });
    for (let i = 0; i < 7 + 4 * S; i++) {
      const a = Math.random() * 6.28, r = rnd(0.5, 1.6) * S;
      this.fire.add({ x, y: y + rnd(0, 0.8) * S, z, vx: Math.cos(a) * r * 2.2, vy: rnd(1, 3.5) * S, vz: Math.sin(a) * r * 2.2, drag: 3.5, spin: rnd(-2, 2), s0: rnd(0.8, 1.3) * S, s1: rnd(1.6, 2.4) * S, life: rnd(0.6, 1.1), c0: FIRE_HOT, c1: FIRE_END, a0: 1, a1: 0 });
    }
    for (let i = 0; i < 5 + 3 * S; i++) {
      const a = Math.random() * 6.28;
      this.smoke.add({ x: x + Math.cos(a) * 0.5 * S, y: y + rnd(0.6, 1.6) * S, z: z + Math.sin(a) * 0.5 * S, vx: Math.cos(a) * 0.8, vy: rnd(1.2, 2.6), vz: Math.sin(a) * 0.8, drag: 0.8, spin: rnd(-0.6, 0.6), s0: 0.7 * S, s1: rnd(1.6, 2.4) * S, life: rnd(1.6, 2.8), c0: SMOKE_D, c1: SMOKE_L, a0: 0.9, a1: 0 });
    }
    for (let i = 0; i < 10 * S; i++) {
      const a = Math.random() * 6.28, sp = rnd(3, 9) * Math.sqrt(S);
      this.debris.add({ x, y: y + 0.5 * S, z, vx: Math.cos(a) * sp, vy: rnd(4, 11) * Math.sqrt(S), vz: Math.sin(a) * sp, g: 20, spin: rnd(4, 14), s0: rnd(0.12, 0.38) * Math.sqrt(S), s1: rnd(0.1, 0.3) * Math.sqrt(S), life: rnd(1.6, 3), c0: DEBRIS[i % 4], c1: DEBRIS[(i + 1) % 4], a0: 1, a1: 1, bounce: true, sx: rnd(0.6, 1.6), sy: rnd(0.4, 1), sz: rnd(0.6, 1.8) });
    }
    for (let i = 0; i < 18 * S; i++) {
      const a = Math.random() * 6.28, sp = rnd(6, 16);
      this.sparks.add({ x, y: y + 0.4 * S, z, vx: Math.cos(a) * sp, vy: rnd(2, 12), vz: Math.sin(a) * sp, g: 18, s0: 1.1, s1: 0.3, life: rnd(0.3, 0.8), c0: SPARK, c1: SPARK_END });
    }
    if (onGround) {
      const gy = this.ground(x, z) + 0.12;
      this.rings.add({ x, y: gy, z, rx: 0, ry: 0, rz: 0, s0: 0.6 * S, s1: 3.2 * S, life: 0.45, c0: FIRE_HOT, c1: FIRE, a0: 0.8, a1: 0 });
      this.scorch.add({ x, y: gy - 0.04, z, s0: 1.1 * S, s1: 1.2 * S, life: 28, c0: C(0x1a120c), c1: C(0x1a120c), a0: 0.5, a1: 0, rx: 0, ry: Math.random() * 6, rz: 0 });
      for (let i = 0; i < 6; i++) { const a = i * 1.05; this.smoke.add({ x, y: gy + 0.2, z, vx: Math.cos(a) * 4 * S, vz: Math.sin(a) * 4 * S, drag: 2.5, s0: 0.5 * S, s1: 1.4 * S, life: 1.4, c0: DUST, c1: DUST_L, a0: 0.5, a1: 0 }); }
    }
    this.shake = Math.max(this.shake, 0.12 * S);
  }

  /** Mort d'une unité : fantassin (désintégration d'énergie), véhicule (explosion), appareil (explosion en vol, épave qui tombe). */
  death(x: number, y: number, z: number, kind: 'inf' | 'veh' | 'air', big = false) {
    if (kind === 'inf') {
      for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, sp = rnd(1, 4); this.sparks.add({ x, y: y + rnd(0.4, 1.6), z, vx: Math.cos(a) * sp, vy: rnd(1, 4), vz: Math.sin(a) * sp, g: 3, s0: 0.8, s1: 0.2, life: rnd(0.4, 0.9), c0: ENERGY, c1: ENERGY_END }); }
      this.fire.add({ x, y: y + 1, z, s0: 0.3, s1: 1.1, life: 0.25, c0: ENERGY, c1: ENERGY_END });
      for (let i = 0; i < 3; i++) this.smoke.add({ x: x + rnd(-0.3, 0.3), y: y + 0.4, z: z + rnd(-0.3, 0.3), vy: rnd(0.4, 1), s0: 0.3, s1: 0.9, life: rnd(1, 1.6), c0: SMOKE_L, c1: DUST_L, a0: 0.45, a1: 0 });
      return;
    }
    const S = big ? 2 : kind === 'air' ? 1.15 : 1.05;
    if (kind === 'air') {
      this.explode(x, y, z, S, false);
      // Épave en flammes qui tombe et explose au sol.
      const gy = this.ground(x, z), fall = Math.sqrt(Math.max(0.5, (y - gy) * 2 / 20));
      for (let i = 0; i < 6; i++) { const t = i * fall / 6; this.later.push({ t, fn: () => this.fire.add({ x, y: y - 10 * t * t, z, s0: 0.6 * S, s1: 0.1, life: 0.5, c0: FIRE_HOT, c1: FIRE_END }) }); }
      this.later.push({ t: fall, fn: () => this.explode(x, gy, z, S * 0.8) });
    } else this.explode(x, y, z, S);
  }

  /** Destruction d'un bâtiment : explosions en chaîne, colonne de fumée, débris, onde de choc et cratère. */
  collapse(x: number, y: number, z: number, r: number) {
    const S = Math.max(1, r * 0.45);
    this.explode(x, y + 0.8, z, S * 1.2);
    const n = Math.round(3 + r * 0.8);
    for (let i = 1; i <= n; i++) {
      const a = Math.random() * 6.28, d = rnd(0.2, 0.9) * r;
      this.later.push({ t: i * rnd(0.12, 0.22), fn: () => this.explode(x + Math.cos(a) * d, y + rnd(0.5, 2.5), z + Math.sin(a) * d, S * rnd(0.55, 0.9)) });
    }
    for (let i = 0; i < 26; i++) this.later.push({ t: i * 0.11, fn: () => this.smoke.add({ x: x + rnd(-0.5, 0.5) * r, y: y + 1, z: z + rnd(-0.5, 0.5) * r, vx: rnd(-0.4, 0.4), vy: rnd(2.5, 4.5), vz: rnd(-0.4, 0.4), drag: 0.3, s0: 0.8 * S, s1: rnd(2.5, 3.8) * S, life: rnd(3, 4.5), c0: SMOKE_D, c1: SMOKE_L, a0: 0.8, a1: 0 }) });
    const gy = this.ground(x, z) + 0.15;
    this.rings.add({ x, y: gy, z, rx: 0, ry: 0, rz: 0, s0: r, s1: r * 3, life: 0.7, c0: DUST_L, c1: DUST, a0: 0.7, a1: 0 });
    for (let i = 0; i < 14; i++) { const a = i * 0.45; this.smoke.add({ x: x + Math.cos(a) * r, y: gy + 0.3, z: z + Math.sin(a) * r, vx: Math.cos(a) * 5, vz: Math.sin(a) * 5, drag: 1.8, s0: 0.8 * S, s1: 2.2 * S, life: 2.2, c0: DUST, c1: DUST_L, a0: 0.55, a1: 0 }); }
    this.scorch.add({ x, y: gy - 0.08, z, s0: r * 1.3, s1: r * 1.4, life: 40, c0: C(0x160f0a), c1: C(0x160f0a), a0: 0.6, a1: 0, rx: 0, ry: 0, rz: 0 });
    this.shake = Math.max(this.shake, 0.35 + r * 0.05);
  }

  barsBegin() { this.nBar = 0; }
  /** Barre de vie au-dessus d'un point ; `ratio` entre 0 et 1. */
  bar(x: number, y: number, z: number, width: number, ratio: number) {
    if (this.nBar >= BARS) return;
    const { m, s, p } = this;
    this.barBg.setMatrixAt(this.nBar, m.compose(p.set(x - width / 2, y, z), TILT, s.set(width, 1.5, 1)));
    this.barFill.setMatrixAt(this.nBar, m.compose(p.set(x - width / 2 + 0.04, y + 0.02, z + 0.02), TILT, s.set(Math.max(0.03, (width - 0.08) * ratio), 1, 1)));
    this.barFill.setColorAt(this.nBar, this.col.setHSL(0.33 * ratio, 0.85, 0.55));
    this.nBar++;
  }
  barsEnd() {
    this.barBg.count = this.barFill.count = this.nBar;
    this.barBg.instanceMatrix.needsUpdate = this.barFill.instanceMatrix.needsUpdate = true;
    if (this.barFill.instanceColor) this.barFill.instanceColor.needsUpdate = true;
  }

  update(dt: number, cam?: THREE.Quaternion) {
    if (cam) Pool.cam.copy(cam);
    this.tr = this.tr.filter((t) => (t.t += dt) < t.life);
    this.tr.forEach((t, i) => this.tracers.setMatrixAt(i, t.m));
    this.tracers.count = this.tr.length; this.tracers.instanceMatrix.needsUpdate = true;
    if (this.later.length) {
      const due = this.later.filter((l) => (l.t -= dt) <= 0);
      this.later = this.later.filter((l) => l.t > 0);
      for (const l of due) l.fn();
    }
    if (this.proj.length) this.flyProjectiles(dt);
    for (const p of [this.fire, this.smoke, this.debris, this.sparks, this.rings, this.scorch, this.bolts, this.beams, this.glows, this.arrows]) p.update(dt);
  }
}
