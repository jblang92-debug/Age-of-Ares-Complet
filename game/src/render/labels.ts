// Compteur d'ouvriers sur les gisements : une étiquette « ⛏ N » au-dessus de chaque poche exploitée par le joueur.
// Les blocs d'un même gisement sont regroupés une fois pour toutes (même ressource, à moins de 9 m les uns des autres).
import * as THREE from 'three';
import type { Sim } from '../sim/sim';

interface Pocket { x: number; z: number; y: number; nodes: Set<number>; el: HTMLDivElement; shown: string }

export class WorkerLabels {
  private pockets: Pocket[] = [];
  private byNode = new Map<number, Pocket>();
  private v = new THREE.Vector3();
  private acc = 1;
  private counts = new Map<Pocket, number>();

  constructor(private sim: Sim, private layer: HTMLElement, private player = 0) {
    const nodes = sim.nodes.filter((n) => n.b < 0);
    const seen = new Set<number>();
    for (const n of nodes) {
      if (seen.has(n.id)) continue;
      const group = [n]; seen.add(n.id);
      for (let i = 0; i < group.length; i++) for (const m of nodes) if (!seen.has(m.id) && m.kind === group[i].kind && Math.hypot(m.x - group[i].x, m.z - group[i].z) < 9) { seen.add(m.id); group.push(m); }
      const x = group.reduce((a, g) => a + g.x, 0) / group.length, z = group.reduce((a, g) => a + g.z, 0) / group.length;
      const el = document.createElement('div'); el.className = 'wlabel'; el.style.display = 'none'; layer.appendChild(el);
      const p: Pocket = { x, z, y: sim.map.heightAt(x, z) + 3.2, nodes: new Set(group.map((g) => g.id)), el, shown: '' };
      this.pockets.push(p); for (const g of group) this.byNode.set(g.id, p);
    }
  }

  /** Recompte 4 fois par seconde ; replace les étiquettes à chaque image. */
  update(dt: number, camera: THREE.Camera, w: number, h: number, zoom: number) {
    this.acc += dt;
    if (this.acc >= 0.25) {
      this.acc = 0; this.counts.clear();
      for (const u of this.sim.units) {
        if (u.owner !== this.player || u.kind !== 'ouvrier' || u.job?.t !== 'gather') continue;
        const p = this.byNode.get(u.job.node); if (p) this.counts.set(p, (this.counts.get(p) ?? 0) + 1);
      }
      // Ouvriers qui récoltent un bâtiment (Recycleur) : pas d'étiquette.
    }
    const far = zoom > 95;
    for (const p of this.pockets) {
      const n = this.counts.get(p) ?? 0;
      if (!n || far) { if (p.shown !== '') { p.el.style.display = 'none'; p.shown = ''; } continue; }
      const s = this.v.set(p.x, p.y, p.z).project(camera);
      if (s.z > 1 || Math.abs(s.x) > 1.05 || Math.abs(s.y) > 1.05) { if (p.shown !== '') { p.el.style.display = 'none'; p.shown = ''; } continue; }
      const txt = '⛏ ' + n;
      if (p.shown !== txt) { p.el.textContent = txt; p.el.style.display = 'block'; p.shown = txt; }
      p.el.style.transform = `translate(${((s.x * 0.5 + 0.5) * w).toFixed(1)}px,${((-s.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%,-100%)`;
    }
  }
}
