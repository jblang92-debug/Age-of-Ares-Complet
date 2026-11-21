// Sélection et ordres. Souris : clic gauche = sélectionner, glisser = cadre, clic droit = ordre.
// Tactile : toucher une unité ou un bâtiment = sélectionner, toucher le sol ou une cible = ordre,
// appui long puis glisser = cadre.
import * as THREE from 'three';
import type { RtsCamera } from './camera';
import type { Sim, Formation, UnitKind } from '../sim/sim';
import type { UnitViews } from '../render/units';
import { BUILDINGS, TURRETS, manque } from '../data/rules';
import { orient } from '../ui/orient';

export class Controller {
  readonly selection = new Set<number>();
  /** Bâtiment sélectionné (-1 : aucun). */
  building = -1;
  formation: Formation = 'libre';
  boxMode = false;
  /** Mode « Attaquer » : le prochain toucher au sol lance une attaque-déplacement. */
  attackMode = false;
  /** Mode « Débarquer » : le prochain toucher au sol y dépose la cargaison des navettes sélectionnées. */
  unloadMode = false;
  player = 0;
  /** Construction en cours de placement. */
  placing: { kind: string; start: { x: number; z: number } | null } | null = null;
  ghost: { x: number; z: number; r: number; ok: boolean; range?: number } | null = null;
  onChange: (() => void) | null = null;
  onOrder: ((p: THREE.Vector3, color?: number) => void) | null = null;
  onMsg: ((text: string) => void) | null = null;
  onSelect: (() => void) | null = null;

  private box = document.getElementById('selbox')!;
  private drag: { id: number; x0: number; y0: number; x: number; y: number; active: boolean; touch: boolean; shift: boolean } | null = null;
  private longPress = 0;
  private lastTap = { t: 0, id: -1 };
  private v = new THREE.Vector3();

  constructor(private dom: HTMLElement, private cam: RtsCamera, private sim: Sim, private views: UnitViews) {
    cam.filter = (e) => {
      if (e.pointerType === 'mouse') return e.button !== 0;      // gauche : sélection ; milieu / droit : caméra
      return !this.boxMode;                                       // tactile : caméra, sauf en mode cadre
    };
    cam.onTap = (world, e) => this.tap(world, e);
    dom.addEventListener('pointerdown', this.down);
    dom.addEventListener('pointermove', this.move);
    dom.addEventListener('pointerup', this.up);
    dom.addEventListener('pointercancel', this.up);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (this.placing) this.cancelPlacing(); else this.select([]); }
      if (e.key.toLowerCase() === 'x') this.stop();
      if (e.key.toLowerCase() === 'a' && this.military().length) { this.attackMode = !this.attackMode; this.onChange?.(); }
    });
  }

  private screen(id: number): { x: number; y: number } | null {
    const p = this.views.position(id, this.v);
    if (!p) return null;
    p.y += 0.9; p.project(this.cam.camera);
    if (p.z > 1) return null;
    const r = orient.rect(this.dom);
    return { x: (p.x * 0.5 + 0.5) * r.width + r.left, y: (-p.y * 0.5 + 0.5) * r.height + r.top };
  }
  private pick(cx: number, cy: number, radius: number): number {
    const { x, y } = orient.local(cx, cy);
    let best = -1, bd = radius;
    for (const u of this.sim.units) {
      if (u.owner !== this.player) continue;
      const s = this.screen(u.id); if (!s) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = u.id; }
    }
    return best;
  }

  military(): number[] { return [...this.selection].filter((id) => { const k = this.sim.get(id)?.kind; return !!k && k !== 'ouvrier'; }); }
  /** Envoie les unités au sol sélectionnées embarquer dans la navette touchée. Renvoie faux si ce n'est pas possible. */
  private embark(nv: number): boolean {
    const t = nv >= 0 ? this.sim.get(nv) : undefined;
    if (!t || (t.kind !== 'navette' && t.kind !== 'galion') || t.owner !== this.player) return false;
    const ids = [...this.selection].filter((id) => { const u = this.sim.get(id); return !!u && !u.fly && u.wide !== 2; });
    if (!ids.length) return false;
    this.sim.issue({ type: 'load', ids, navette: nv });
    this.onMsg?.(t.kind === 'galion' ? 'Embarquement dans le galion' : 'Embarquement dans la navette');
    return true;
  }
  /** Ordre contextuel envoyé depuis la mini-carte. */
  orderAt(x: number, z: number) { this.context(new THREE.Vector3(x, this.sim.map.heightAt(x, z), z)); }
  /** Zone de terre (déplacement à pied) qui contient ce point ; -1 si aucune à proximité. */
  private regionAt(x: number, z: number, near = 9): number { const c = this.sim.nav.nearestFree(x, z, 0, undefined, undefined, near); return c >= 0 ? this.sim.nav.region[c] : -1; }
  /** Unités au sol sélectionnées qui ne peuvent pas atteindre ce point à pied : on appelle une navette. Vrai si l'ordre a été donné. */
  private ferry(p: THREE.Vector3): boolean {
    const ground = [...this.selection].map((id) => this.sim.get(id)!).filter((u) => u && !u.fly && u.wide !== 2 && u.board < 0);
    if (!ground.length) return false;
    const dest = this.regionAt(p.x, p.z);
    if (dest < 0) return false;
    const away = ground.filter((u) => this.regionAt(u.x, u.z, 3) !== dest);
    if (!away.length) return false;
    const cx = away.reduce((a, u) => a + u.x, 0) / away.length, cz = away.reduce((a, u) => a + u.z, 0) / away.length;
    let nv = null as ReturnType<Sim['get']> | null, bd = 1e9;
    for (const u of this.sim.units) if (u.owner === this.player && (u.kind === 'navette' || u.kind === 'galion') && !u.ferryTo) { const d = Math.hypot(u.x - cx, u.z - cz) + (u.kind === 'galion' ? 40 : 0); if (d < bd) { bd = d; nv = u; } }
    if (!nv) { this.onMsg?.('Aucun transport disponible : construis un Port (navette ou galion)'); return true; }
    this.sim.issue({ type: 'ferry', ids: away.map((u) => u.id), navette: nv.id, x: p.x, z: p.z });
    const rest = ground.filter((u) => !away.includes(u)).map((u) => u.id);
    if (rest.length) this.sim.issue({ type: 'move', ids: rest, x: p.x, z: p.z, formation: this.formation });
    this.onMsg?.('Transport : la navette vient chercher les unités');
    return true;
  }
  /** Ouvriers et ingénieurs sélectionnés (réparation). */
  fixers(): number[] { return [...this.selection].filter((id) => { const k = this.sim.get(id)?.kind; return k === 'ouvrier' || k === 'ingenieur'; }); }
  workers(): number[] { return [...this.selection].filter((id) => this.sim.get(id)?.kind === 'ouvrier'); }

  select(ids: number[], add = false) {
    if (!add) this.selection.clear();
    for (const id of ids) this.selection.add(id);
    this.building = -1; this.attackMode = false; this.unloadMode = false;
    if (this.placing && !this.workers().length) { this.placing = null; this.ghost = null; }
    this.views.setSelected(this.selection);
    if (ids.length) this.onSelect?.();
    this.onChange?.();
  }
  selectBuilding(id: number) { this.selection.clear(); this.views.setSelected(this.selection); this.building = id; this.placing = null; this.ghost = null; this.onChange?.(); }
  selectAll(kinds?: UnitKind[]) { this.select(this.sim.units.filter((u) => u.owner === this.player && (!kinds || kinds.includes(u.kind))).map((u) => u.id)); }
  private sameKindOnScreen(id: number): number[] {
    const k = this.sim.get(id)?.kind, r = orient.rect(this.dom);
    return this.sim.units.filter((u) => { if (u.owner !== this.player || u.kind !== k) return false; const s = this.screen(u.id); return !!s && s.x >= r.left && s.x <= r.left + r.width && s.y >= r.top && s.y <= r.top + r.height; }).map((u) => u.id);
  }

  stop() { if (this.selection.size) this.sim.issue({ type: 'stop', ids: [...this.selection] }); }

  startPlacing(kind: string) {
    if (!this.workers().length) return;
    if (BUILDINGS[kind].ere > this.sim.players[this.player].ere) { this.onMsg?.('Disponible à l\'âge ' + BUILDINGS[kind].ere); return; }
    const lack = this.sim.canPay(this.player, this.sim.buildCost(this.player, kind));
    if (lack) { this.onMsg?.(manque(lack)); return; }
    this.placing = { kind, start: null }; this.ghost = null; this.onChange?.();
  }
  cancelPlacing() { this.placing = null; this.ghost = null; this.onChange?.(); }

  private placeAt(p: THREE.Vector3) {
    const pl = this.placing!; const ids = this.workers();
    if (pl.kind === 'mur') {
      if (!pl.start) { pl.start = { x: p.x, z: p.z }; this.onOrder?.(p, 0xffe07a); this.onMsg?.('Touche maintenant la fin du mur'); return; }
      const d = Math.hypot(p.x - pl.start.x, p.z - pl.start.z), n = Math.max(1, Math.round(d / 1.85));
      let placed = 0;
      for (let i = 0; i <= n; i++) {
        const x = pl.start.x + (p.x - pl.start.x) * i / n, z = pl.start.z + (p.z - pl.start.z) * i / n;
        if (this.sim.canPlace('mur', x, z)) { this.sim.issue({ type: 'place', owner: this.player, kind: 'mur', x, z, ids }); placed++; }
      }
      if (!placed) this.onMsg?.('Emplacement impossible');
      pl.start = null;
      return;
    }
    if (pl.kind === 'porte') {
      // La porte se cale sur le mur le plus proche et le remplace à cet endroit.
      const g = this.sim.gateSnap(this.player, p.x, p.z);
      if (!this.sim.canPlaceGate(this.player, g.x, g.z)) { this.onMsg?.('Emplacement impossible'); return; }
      this.sim.issue({ type: 'place', owner: this.player, kind: 'porte', x: g.x, z: g.z, ids });
      this.onOrder?.(p, 0xffe07a); this.cancelPlacing(); return;
    }
    if (!this.sim.canPlace(pl.kind, p.x, p.z)) { this.onMsg?.('Emplacement impossible'); return; }
    this.sim.issue({ type: 'place', owner: this.player, kind: pl.kind, x: p.x, z: p.z, ids });
    this.onOrder?.(p, 0xffe07a);
    this.cancelPlacing();
  }

  /** Ordre contextuel sur un point du terrain : récolter, aider un chantier, se déplacer, point de ralliement. */
  private context(p: THREE.Vector3, sx?: number, sy?: number) {
    const node = this.sim.nodeAt(p.x, p.z), b = this.sim.buildingAt(p.x, p.z);
    if (this.selection.size) {
      const navs = [...this.selection].filter((id) => { const k = this.sim.get(id)?.kind; return k === 'navette' || k === 'galion'; });
      if (this.unloadMode && navs.length) {
        for (const id of navs) this.sim.issue({ type: 'unload', id, x: p.x, z: p.z });
        this.unloadMode = false; this.onOrder?.(p, 0x8fd3ff); this.onChange?.(); return;
      }
      // Toucher une de ses navettes avec des unités au sol sélectionnées : embarquement.
      if (sx !== undefined && sy !== undefined) {
        const nv = this.pick(sx, sy, 40);
        if (this.embark(nv)) { this.onOrder?.(p, 0x8fd3ff); return; }
      }
      const ws = this.workers();
      const fishers = [...this.selection].filter((id) => this.sim.get(id)?.kind === 'pecheur');
      if (node && node.kind === 'poisson' && fishers.length) { this.sim.issue({ type: 'gather', ids: fishers, node: node.id }); this.onOrder?.(p, 0x8fd3ff); return; }
      if (node && node.kind !== 'poisson' && ws.length) { this.sim.issue({ type: 'gather', ids: ws, node: node.id }); this.onOrder?.(p, 0x8fd3ff); return; }
      if (b && b.owner === this.player && !b.done && ws.length) { this.sim.issue({ type: 'assist', ids: ws, b: b.id }); this.onOrder?.(p, 0xffe07a); return; }
      const fx = this.fixers();
      if (b && b.owner === this.player && b.done && b.hp < b.maxHp && fx.length) { this.sim.issue({ type: 'repair', ids: fx, b: b.id }); this.onOrder?.(p, 0x9dffb8); this.onMsg?.('Réparation'); return; }
      const eng = [...this.selection].filter((id) => this.sim.get(id)?.kind === 'ingenieur');
      if (b && this.sim.foe(b.owner, this.player) && eng.length && b.kind !== 'centre' && b.kind !== 'mur') {
        if (b.hp <= b.maxHp * 0.3) {
          this.sim.issue({ type: 'capture', ids: eng, b: b.id });
          const others = this.military().filter((id) => !eng.includes(id));
          if (others.length) this.sim.issue({ type: 'attack', ids: others, unit: -1, b: b.id });
          this.onOrder?.(p, 0xffe07a); this.onMsg?.('Capture en cours'); return;
        }
        if (this.military().length === eng.length) { this.onMsg?.('Capture possible sous 30 % de vie'); return; }
      }
      if (!this.attackMode && this.ferry(p)) { this.onOrder?.(p, 0x8fd3ff); return; }
      const army = this.military().filter((id) => this.sim.get(id)?.kind !== 'ingenieur');
      if (army.length) {
        // Cible ennemie sous le doigt : unité (repérée à l'écran) ou bâtiment.
        let foe = -1, bd = 34;
        if (sx !== undefined && sy !== undefined) { const l = orient.local(sx, sy); sx = l.x; sy = l.y; }
        if (sx !== undefined && sy !== undefined) for (const u of this.sim.units) { if (!this.sim.foe(u.owner, this.player) || !this.views.visible(u.x, u.z)) continue; const s = this.screen(u.id); if (!s) continue; const d = Math.hypot(s.x - sx, s.y - sy); if (d < bd) { bd = d; foe = u.id; } }
        if (foe < 0) foe = this.sim.enemyAt(this.player, p.x, p.z)?.id ?? -1;
        if (foe >= 0 || (b && this.sim.foe(b.owner, this.player))) {
          this.sim.issue({ type: 'attack', ids: army, unit: foe, b: foe >= 0 ? -1 : b!.id });
          this.onOrder?.(p, 0xff5a4d); return;
        }
        if (this.attackMode) {
          this.sim.issue({ type: 'amove', ids: [...this.selection], x: p.x, z: p.z, formation: this.formation });
          this.attackMode = false; this.onOrder?.(p, 0xff5a4d); this.onChange?.(); return;
        }
      }
      this.sim.issue({ type: 'move', ids: [...this.selection], x: p.x, z: p.z, formation: this.formation });
      this.onOrder?.(p);
    } else if (this.building >= 0) {
      this.sim.issue({ type: 'rally', b: this.building, x: p.x, z: p.z, node: node ? node.id : -1 });
      this.onOrder?.(p, 0xff9ad5); this.onMsg?.(node ? 'Ralliement : les nouveaux ouvriers iront récolter ici' : 'Point de ralliement fixé');
    }
  }

  /** Toucher bref (tactile) ou clic droit (souris), transmis par la caméra. */
  private tap(world: THREE.Vector3 | null, e: PointerEvent) {
    if (e.pointerType === 'mouse') {
      if (e.button !== 2) return;
      if (this.placing) this.cancelPlacing(); else if (world) this.context(world, e.clientX, e.clientY);
      return;
    }
    if (this.placing) { if (world) this.placeAt(world); return; }
    if (this.unloadMode && world) return this.context(world, e.clientX, e.clientY);
    const id = this.pick(e.clientX, e.clientY, 34);
    if (id >= 0 && !this.selection.has(id) && this.embark(id)) return;
    if (id >= 0) return this.clickUnit(id, false);
    if (!world) return;
    const b = this.sim.buildingAt(world.x, world.z);
    if (b && b.owner === this.player && (b.done || !this.workers().length) && !(b.done && b.hp < b.maxHp && this.fixers().length)) return this.selectBuilding(b.id);
    this.context(world, e.clientX, e.clientY);
  }

  private clickUnit(id: number, add: boolean) {
    const now = performance.now();
    if (this.lastTap.id === id && now - this.lastTap.t < 380) this.select(this.sameKindOnScreen(id), add);
    else this.select([id], add);
    this.lastTap = { t: now, id };
  }

  private down = (e: PointerEvent) => {
    const mouseLeft = e.pointerType === 'mouse' && e.button === 0;
    if (mouseLeft || (e.pointerType !== 'mouse' && this.boxMode)) {
      this.dom.setPointerCapture?.(e.pointerId);
      this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false, touch: !mouseLeft, shift: e.shiftKey };
    } else if (e.pointerType !== 'mouse' && !this.placing) {
      // Appui long sans bouger : le doigt devient un cadre de sélection.
      clearTimeout(this.longPress);
      const { pointerId, clientX, clientY } = e;
      this.drag = { id: pointerId, x0: clientX, y0: clientY, x: clientX, y: clientY, active: false, touch: true, shift: false };
      const d = this.drag;
      this.longPress = window.setTimeout(() => {
        if (this.drag !== d || Math.hypot(d.x - d.x0, d.y - d.y0) > 8) return;
        this.cam.release(pointerId); d.active = true; this.drawBox(d);
        try { navigator.vibrate?.(15); } catch { /* sans vibration */ }
      }, 420);
    }
  };

  private move = (e: PointerEvent) => {
    if (this.placing && e.pointerType === 'mouse') {
      const p = this.cam.terrainPoint(e.clientX, e.clientY, this.v);
      if (p && this.placing.kind === 'porte') { const g = this.sim.gateSnap(this.player, p.x, p.z); this.ghost = { x: g.x, z: g.z, r: BUILDINGS.porte.rayon, ok: this.sim.canPlaceGate(this.player, g.x, g.z) }; }
      else this.ghost = p ? { x: p.x, z: p.z, r: BUILDINGS[this.placing.kind].rayon, ok: this.sim.canPlace(this.placing.kind, p.x, p.z), range: (TURRETS as Record<string, { portee: number }>)[this.placing.kind]?.portee } : null;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    d.x = e.clientX; d.y = e.clientY;
    const far = Math.hypot(d.x - d.x0, d.y - d.y0) > 6;
    const direct = e.pointerType === 'mouse' || this.boxMode;
    if (!d.active && far) { if (direct && !this.placing) d.active = true; else if (!direct) { clearTimeout(this.longPress); this.drag = null; return; } }
    if (d.active) this.drawBox(d);
  };

  private up = (e: PointerEvent) => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) { if (e.pointerType !== 'mouse') clearTimeout(this.longPress); return; }
    clearTimeout(this.longPress);
    this.drag = null;
    this.box.style.display = 'none';
    if (d.active) {
      const a = orient.local(d.x0, d.y0), b = orient.local(d.x, d.y);
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      const ids = this.sim.units.filter((u) => { if (u.owner !== this.player) return false; const s = this.screen(u.id); return !!s && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1; }).map((u) => u.id);
      this.select(ids, d.shift);
      if (this.boxMode && d.touch) { this.boxMode = false; this.onChange?.(); }
    } else if (e.pointerType === 'mouse') {
      const world = this.cam.terrainPoint(e.clientX, e.clientY, new THREE.Vector3());
      if (this.placing) { if (world) this.placeAt(world); return; }
      const id = this.pick(e.clientX, e.clientY, 26);
      if (id >= 0) return this.clickUnit(id, d.shift);
      const b = world ? this.sim.buildingAt(world.x, world.z) : null;
      if (b && b.owner === this.player) this.selectBuilding(b.id);
      else if (!d.shift) this.select([]);
    } else if (this.boxMode) { this.boxMode = false; this.onChange?.(); }
  };

  private drawBox(d: { x0: number; y0: number; x: number; y: number }) {
    const s = this.box.style;
    s.display = 'block';
    const a = orient.local(d.x0, d.y0), b = orient.local(d.x, d.y);
    s.left = Math.min(a.x, b.x) + 'px'; s.top = Math.min(a.y, b.y) + 'px';
    s.width = Math.abs(b.x - a.x) + 'px'; s.height = Math.abs(b.y - a.y) + 'px';
  }
}
