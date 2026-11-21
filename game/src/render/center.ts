// Option « Centre disputé » : relais (plateforme, faisceau aux couleurs du camp, anneau de capture) et capsules qui tombent du ciel.
import * as THREE from 'three';
import type { Sim } from '../sim/sim';
import { Sim as SimClass } from '../sim/sim';
import { spawn } from './assets';
import { TEAM_COLORS, colorIndex } from './units';

const GREY = 0xcfc6b8;

interface RelayView { g: THREE.Group; beam: THREE.Mesh; ring: THREE.Mesh; bar: THREE.Mesh; owner: number }
interface CapsuleView { g: THREE.Object3D; flare: THREE.Mesh; t0: number }

export class CenterViews {
  private relays: RelayView[] = [];
  private caps = new Map<number, CapsuleView>();

  constructor(private scene: THREE.Scene, private sim: Sim) {
    for (const r of sim.relays) {
      const g = new THREE.Group();
      const pad = spawn('shs/Teleporter.json', { footprint: 6.5 }); g.add(pad);
      const ant = spawn('shs/Satellite.json', { footprint: 2.6 }); ant.position.y = 7; g.add(ant);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 14, 10, 1, true).translate(0, 7, 0),
        new THREE.MeshBasicMaterial({ color: GREY, transparent: true, opacity: 0.45, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
      g.add(beam);
      // Zone de capture et avancée de la capture.
      const ring = new THREE.Mesh(new THREE.RingGeometry(SimClass.RELAY.r - 0.25, SimClass.RELAY.r, 64).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: GREY, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      ring.position.y = 0.12; g.add(ring);
      const bar = new THREE.Mesh(new THREE.RingGeometry(SimClass.RELAY.r - 0.9, SimClass.RELAY.r - 0.35, 64, 1, 0, Math.PI * 2).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
      bar.position.y = 0.14; bar.visible = false; g.add(bar);
      g.position.set(r.x, sim.map.heightAt(r.x, r.z), r.z);
      scene.add(g);
      this.relays.push({ g, beam, ring, bar, owner: -2 });
    }
  }

  update(dt: number) {
    const sim = this.sim, t = performance.now() / 1000;
    sim.relays.forEach((r, i) => {
      const v = this.relays[i]; if (!v) return;
      if (v.owner !== r.owner) {
        v.owner = r.owner;
        const c = r.owner >= 0 ? TEAM_COLORS[colorIndex(sim, r.owner)] : GREY;
        (v.beam.material as THREE.MeshBasicMaterial).color.setHex(c); (v.ring.material as THREE.MeshBasicMaterial).color.setHex(c);
      }
      const capturing = r.by >= 0 && r.cap > -100 && r.cap < 100;
      v.bar.visible = capturing;
      if (capturing) {
        const k = r.cap < 0 ? -r.cap / 100 : r.cap / 100;
        v.bar.geometry.dispose();
        v.bar.geometry = new THREE.RingGeometry(SimClass.RELAY.r - 0.9, SimClass.RELAY.r - 0.35, 48, 1, 0, Math.max(0.01, k * Math.PI * 2)).rotateX(-Math.PI / 2);
        (v.bar.material as THREE.MeshBasicMaterial).color.setHex(r.cap < 0 ? 0xffffff : TEAM_COLORS[colorIndex(sim, r.by)]);
      }
      (v.beam.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.15 * Math.sin(t * 3 + i);
    });
    // Capsules : apparition, chute de 5 s, fusée éclairante, disparition.
    const alive = new Set(sim.capsules.map((c) => c.id));
    for (const [id, v] of this.caps) if (!alive.has(id)) { this.scene.remove(v.g, v.flare); this.caps.delete(id); }
    for (const c of sim.capsules) {
      let v = this.caps.get(c.id);
      if (!v) {
        const g = spawn('kaykit/cargo_A.json', { footprint: 1.8 });
        const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.6, 30, 8, 1, true).translate(0, 15, 0),
          new THREE.MeshBasicMaterial({ color: 0x9dffb8, transparent: true, opacity: 0.4, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
        flare.position.set(c.x, sim.map.heightAt(c.x, c.z), c.z);
        this.scene.add(g, flare); v = { g, flare, t0: c.t }; this.caps.set(c.id, v);
      }
      const k = Math.min(1, (sim.tick - c.t) / SimClass.CAPSULE.fall), y = sim.map.heightAt(c.x, c.z);
      v.g.position.set(c.x, y + (1 - k * k) * 40, c.z); v.g.rotation.y = t * 0.6;
      (v.flare.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.2 * Math.sin(t * 5);
    }
    void dt;
  }
}
