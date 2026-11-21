// Caméra de RTS : angle fixe (55°), sans rotation. Tactile : un doigt déplace, pincer zoome.
// Ordinateur : flèches / ZQSD / WASD, glisser à la souris, molette.
import * as THREE from 'three';
import type { TerrainMap } from '../mapgen/terrain';
import { clamp } from '../core/rng';
import { orient } from '../ui/orient';

const PITCH = THREE.MathUtils.degToRad(55);

export class RtsCamera {
  readonly camera = new THREE.PerspectiveCamera(34, 1, 1, 600);
  readonly target = new THREE.Vector3();
  dist = 52;
  /** Banc d'essai : inclinaison (rad) et rotation autour de la cible ; null = angle de RTS habituel. */
  pitch: number | null = null;
  orbit = 0;
  minDist = 20;
  maxDist = 105;
  /** Appelé pour un toucher bref sans glissement : point du terrain touché. */
  onTap: ((world: THREE.Vector3 | null, e: PointerEvent) => void) | null = null;
  /** Décide si la caméra prend en charge ce pointeur (sinon : sélection, ordres). */
  filter: ((e: PointerEvent) => boolean) | null = null;

  private pointers = new Map<number, { x: number; y: number }>();
  private grab = new THREE.Vector3();
  private pinchDist0 = 0;
  private dist0 = 0;
  private vel = new THREE.Vector2();
  private keys = new Set<string>();
  private downAt = 0;
  private moved = 0;
  private ray = new THREE.Raycaster();
  private tmp = new THREE.Vector3();
  private lastMoveT = 0;

  constructor(private dom: HTMLElement, private map: TerrainMap) {
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', this.onDown);
    dom.addEventListener('pointermove', this.onMove);
    dom.addEventListener('pointerup', this.onUp);
    dom.addEventListener('pointercancel', this.onUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
    this.apply();
  }

  setAspect(a: number) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  focus(x: number, z: number) { this.target.x = x; this.target.z = z; this.vel.set(0, 0); this.clampTarget(); this.target.y = this.groundY(x, z); this.apply(); }
  /** Hauteur suivie par la caméra : le sol, mais jamais sous le niveau 0 (au-dessus du vide, la vue reste stable). */
  private groundY(x: number, z: number): number { return Math.max(0, this.map.heightAt(x, z)); }

  private clampTarget() {
    const m = this.map.half - 4;
    this.target.x = clamp(this.target.x, -m, m);
    this.target.z = clamp(this.target.z, -m, m);
  }

  /** Secousse (explosions) : amplitude en mètres, qui s'amortit. */
  private shakeAmt = 0;
  shake(a: number) { this.shakeAmt = Math.min(1.2, Math.max(this.shakeAmt, a * Math.min(1, 40 / this.dist))); }

  private apply() {
    const c = this.camera, k = this.shakeAmt;
    const p = this.pitch ?? PITCH, h = Math.cos(p) * this.dist;
    c.position.set(this.target.x + Math.sin(this.orbit) * h + (Math.random() - 0.5) * k, this.target.y + Math.sin(p) * this.dist + (Math.random() - 0.5) * k, this.target.z + Math.cos(this.orbit) * h);
    c.lookAt(this.target);
    c.updateMatrixWorld(true);
  }

  /** Point du plan horizontal (à la hauteur de la cible) sous un pixel de l'écran. */
  groundPoint(clientX: number, clientY: number, out: THREE.Vector3): THREE.Vector3 {
    const l = orient.local(clientX, clientY);
    return this.groundLocal(l.x, l.y, out);
  }
  /** Même chose, à partir d'un point déjà exprimé dans le repère du jeu. */
  groundLocal(x: number, y: number, out: THREE.Vector3): THREE.Vector3 {
    const r = orient.rect(this.dom);
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    const t = (this.target.y - o.y) / (d.y || -1e-6);
    return out.copy(d).multiplyScalar(t).add(o);
  }

  /** Surface de l'eau aux âges où la mer est visible (un clic sur l'eau la touche, pas le fond). */
  waterY = -Infinity;
  /** Point exact du terrain sous un pixel (marche le long du rayon). */
  terrainPoint(clientX: number, clientY: number, out: THREE.Vector3): THREE.Vector3 | null {
    this.groundPoint(clientX, clientY, out);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    let prev = 0;
    for (let t = 5; t < 400; t += 0.75) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const H = (px: number, pz: number) => Math.max(this.map.heightAt(px, pz), this.waterY);
      if (y <= H(x, z)) {
        let a = prev, b = t;
        for (let k = 0; k < 8; k++) {
          const m = (a + b) / 2;
          if (o.y + d.y * m <= H(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m;
        }
        return out.set(o.x + d.x * b, 0, o.z + d.z * b).setY(H(o.x + d.x * b, o.z + d.z * b));
      }
      prev = t;
    }
    return null;
  }

  private mid(): { x: number; y: number } {
    let x = 0, y = 0;
    for (const p of this.pointers.values()) { x += p.x; y += p.y; }
    return { x: x / this.pointers.size, y: y / this.pointers.size };
  }
  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  private regrab() {
    const m = this.mid();
    this.groundPoint(m.x, m.y, this.grab);
    if (this.pointers.size >= 2) { this.pinchDist0 = this.spread(); this.dist0 = this.dist; }
  }

  /** Retire un pointeur à la caméra (ex. appui long qui devient un cadre de sélection). */
  release(id: number) { if (this.pointers.delete(id)) { this.vel.set(0, 0); if (this.pointers.size) this.regrab(); } }

  private onDown = (e: PointerEvent) => {
    if (this.filter && !this.filter(e)) return;
    this.dom.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.vel.set(0, 0);
    if (this.pointers.size === 1) { this.downAt = performance.now(); this.moved = 0; }
    else this.moved = 999;
    this.regrab();
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.moved += Math.hypot(e.clientX - p.x, e.clientY - p.y);
    p.x = e.clientX; p.y = e.clientY;
    if (this.moved < 6) return;
    if (this.pointers.size >= 2) {
      this.dist = clamp(this.dist0 * (this.pinchDist0 / Math.max(this.spread(), 1)), this.minDist, this.maxDist);
      this.apply();
    }
    const m = this.mid();
    const cur = this.groundPoint(m.x, m.y, this.tmp);
    const dx = this.grab.x - cur.x, dz = this.grab.z - cur.z;
    const now = performance.now();
    const dt = Math.max((now - this.lastMoveT) / 1000, 1 / 240);
    this.lastMoveT = now;
    this.vel.lerp(new THREE.Vector2(dx / dt, dz / dt), 0.5);
    this.target.x += dx; this.target.z += dz;
    this.clampTarget();
    this.apply();
  };

  private onUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    const wasSingle = this.pointers.size === 1;
    this.pointers.delete(e.pointerId);
    if (wasSingle && this.moved < 6 && performance.now() - this.downAt < 350) {
      this.vel.set(0, 0);
      const hit = this.terrainPoint(e.clientX, e.clientY, new THREE.Vector3());
      if (this.onTap) this.onTap(hit, e);
    }
    if (performance.now() - this.lastMoveT > 80) this.vel.set(0, 0);
    if (this.pointers.size > 0) { this.regrab(); this.vel.set(0, 0); }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const g = this.groundPoint(e.clientX, e.clientY, new THREE.Vector3());
    this.dist = clamp(this.dist * Math.exp(e.deltaY * 0.0012), this.minDist, this.maxDist);
    this.apply();
    const cur = this.groundPoint(e.clientX, e.clientY, this.tmp);
    this.target.x += g.x - cur.x; this.target.z += g.z - cur.z;
    this.clampTarget();
    this.apply();
  };

  update(dt: number) {
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
    const k = this.keys;
    let kx = 0, kz = 0;
    if (k.has('arrowleft') || k.has('q') || k.has('a')) kx -= 1;
    if (k.has('arrowright') || k.has('d')) kx += 1;
    if (k.has('arrowup') || k.has('z') || k.has('w')) kz -= 1;
    if (k.has('arrowdown') || k.has('s')) kz += 1;
    if (kx || kz) {
      const sp = this.dist * 1.15 * dt / Math.hypot(kx, kz);
      this.target.x += kx * sp; this.target.z += kz * sp;
    }
    if (this.pointers.size === 0 && this.vel.lengthSq() > 0.01) {
      // inertie après un glissement
      this.target.x += this.vel.x * dt; this.target.z += this.vel.y * dt;
      this.vel.multiplyScalar(Math.exp(-dt * 5.5));
    }
    this.clampTarget();
    const ty = this.groundY(this.target.x, this.target.z);
    this.target.y += (ty - this.target.y) * Math.min(1, dt * 4);
    this.apply();
  }
}
