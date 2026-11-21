// Défis courts : tutoriel guidé, défense, raid, course à l'ère 3.
// La mise en place et le script (vagues, chronomètre, victoire) sont déterministes et tournent au rythme des ticks.
import type { Sim, UnitKind } from './sim';

export type ScenId = 'tuto' | 'defense' | 'raid' | 'course';
export const SCENARIOS: Record<ScenId, { nom: string; but: string; ia: 'facile' | 'normal' | null; duree?: number }> = {
  tuto: { nom: 'Tutoriel', but: 'Apprends les bases pas à pas', ia: 'facile' },
  defense: { nom: 'Défense de la base', but: 'Tiens 5 minutes face aux vagues ennemies', ia: null, duree: 3000 },
  raid: { nom: 'Raid éclair', but: 'Détruis le Centre ennemi en moins de 4 minutes', ia: 'normal', duree: 2400 },
  course: { nom: 'Course à l\'Orbitale', but: 'Atteins l\'ère 3 en moins de 12 minutes', ia: 'facile', duree: 7200 },
};
/** Carte fixe des défis (petite, terre ferme, 1 contre 1). */
export const SCEN_MAP = { seed: 20261113, size: 'petite', kind: 'terre', players: 'duel' as const };

export class Scenario {
  readonly info;
  constructor(private sim: Sim, readonly id: ScenId) { this.info = SCENARIOS[id]; }
  private get me() { return this.sim.players[0]; }
  private centre(o: number) { return this.sim.buildings.find((b) => b.owner === o && b.kind === 'centre'); }
  /** Point entre les deux bases (f = 0 : chez moi, 1 : chez l'ennemi). */
  private along(f: number) { const a = this.sim.map.starts[0], b = this.sim.map.starts[1]; return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f }; }
  private squad(kinds: [UnitKind, number][], o: number, at: { x: number; z: number }) {
    const out = [];
    let i = 0;
    for (const [k, n] of kinds) for (let j = 0; j < n; j++, i++) {
      out.push(this.sim.spawn(k, o, at.x + (i % 4) * 1.8 - 2.7, at.z + Math.floor(i / 4) * 1.8));
    }
    return out;
  }

  setup() {
    const sim = this.sim, me = this.me, foe = sim.players[1];
    if (this.id === 'tuto') { me.eau += 300; me.minerai += 300; me.energie += 100; }
    if (this.id === 'defense') {
      me.ere = 4; me.eau = 800; me.minerai = 900; me.energie = 500; me.solarite = 100;
      const c = this.centre(0)!, f = this.along(0.18);
      for (let i = 0; i < 3; i++) sim.placeNear('habitat', 0, c.x - 8 + i * 5, c.z - 10);
      sim.placeNear('tourelle', 0, f.x - 5, f.z); sim.placeNear('tourelle', 0, f.x + 5, f.z); sim.placeNear('tourelle', 0, f.x, f.z - 3); sim.placeNear('caserne', 0, c.x - 9, c.z);
      this.squad([['fantassin', 6], ['antiblindage', 3], ['blinde', 2]], 0, this.along(0.12));
    }
    if (this.id === 'raid') {
      me.ere = 4; me.eau = 0; me.minerai = 0; me.energie = 0; me.solarite = 0;
      { const c0 = this.centre(0)!; for (let i = 0; i < 4; i++) sim.placeNear('habitat', 0, c0.x - 10 + i * 5, c0.z - 10); }
      this.squad([['blinde', 3], ['fantassin', 6], ['antiblindage', 3], ['strikerLaser', 2]], 0, this.along(0.5));
      foe.ere = 4;
      const c = this.centre(1)!, d = this.along(0.85);
      sim.placeNear('tourelle', 1, d.x - 4, d.z); sim.placeNear('tourelle', 1, d.x + 4, d.z); sim.placeNear('tourelle', 1, (d.x + c.x) / 2 + 3, (d.z + c.z) / 2 + 3);
      sim.placeNear('caserne', 1, c.x + 8, c.z); sim.placeNear('usine', 1, c.x - 9, c.z);
      this.squad([['fantassin', 6], ['antiblindage', 3], ['blinde', 2]], 1, this.along(0.88));
    }
    if (this.id === 'course') { me.eau += 200; me.minerai += 200; }
  }

  private waves = 0;
  /** À chaque tick, avant la simulation. */
  step() {
    const sim = this.sim, t = sim.tick;
    if (sim.winner >= 0) return;
    const dur = this.info.duree ?? 0;
    if (this.id === 'defense') {
      // Une vague toutes les minutes à partir de 30 s, de plus en plus forte.
      if (t >= 300 + this.waves * 600 && t < dur) {
        const n = ++this.waves;
        const kinds: [UnitKind, number][] = [['fantassin', 3 + n * 2], ['antiblindage', n > 1 ? n - 1 : 0], ['blinde', n > 2 ? n - 2 : 0], ['drone', n > 3 ? 1 : 0], ['artillerie', n > 4 ? 1 : 0]];
        const us = this.squad(kinds.filter(([, k]) => k > 0), 1, this.along(0.8));
        const c = this.centre(0); if (c) sim.issue({ type: 'amove', ids: us.map((u) => u.id), x: c.x, z: c.z, formation: 'libre' });
        sim.events.push({ t: 'msg', owner: 0, text: `Vague ${n} en approche !` });
      }
      if (t >= dur) sim.endGame(this.me.team, 'BASE TENUE : VICTOIRE');
    }
    if (this.id === 'raid') {
      if (t > 50 && !sim.units.some((u) => u.owner === 0 && u.kind !== 'ouvrier' && u.kind !== 'eclaireur')) sim.endGame(sim.players[1].team, 'RAID REPOUSSÉ : DÉFAITE');
      else if (t >= dur) sim.endGame(sim.players[1].team, 'TEMPS ÉCOULÉ : DÉFAITE');
    }
    if (this.id === 'course') {
      if (this.me.ere >= 5) sim.endGame(this.me.team, `ORBITALE ATTEINTE EN ${Math.floor(t / 600)}:${String(Math.floor(t / 10) % 60).padStart(2, '0')}`);
      else if (t >= dur) sim.endGame(sim.players[1].team, 'TEMPS ÉCOULÉ : DÉFAITE');
    }
  }
  /** Texte de l'objectif et chronomètre, pour l'interface. */
  status(): string {
    const dur = this.info.duree, t = this.sim.tick;
    if (!dur) return this.info.but;
    const left = Math.max(0, Math.ceil((dur - t) / 10));
    return `${this.info.but} · ⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}${this.id === 'defense' ? ` · vague ${this.waves}` : ''}`;
  }
}
