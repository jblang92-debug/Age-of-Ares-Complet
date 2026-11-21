// Sauvegarde par rejeu : la simulation est déterministe (aucun hasard, ordres traités tick par tick),
// il suffit donc de garder les ordres du joueur et le tick où ils ont été donnés. L'IA les recalcule seule.
import type { Sim, Order } from './sim';
import type { Ai } from './ai';

export interface SaveGame { v: 1; seed: number; size: string; kind: string; level: string; /** Options de la partie (absentes dans les anciennes sauvegardes). */ doctrine?: string; fog?: boolean; blitz?: boolean; storms?: boolean; contested?: boolean; ressources?: string; faction?: number; /** Âge de départ (absent : âge moderne, comme avant les âges anciens). */ age?: number; players?: 'duel' | 'ffa' | 'equipes'; tick: number; orders: [number, Order][]; /** Date d'enregistrement (ms) et issue de la partie, pour les listes. */ at?: number; result?: string }

/** Avance la partie jusqu'au tick `to` en réinjectant les ordres enregistrés. Renvoie l'indice du prochain ordre. */
export function replayTo(sim: Sim, ais: Ai[], orders: [number, Order][], from: number, to: number, onEvents?: () => void): number {
  let i = from;
  while (sim.tick < to && sim.winner < 0) {
    while (i < orders.length && orders[i][0] <= sim.tick) sim.issue(orders[i++][1]);
    for (const ai of ais) ai.step();
    sim.step();
    onEvents?.();
    sim.events.length = 0;
  }
  return i;
}

/** Empreinte de l'état (pour vérifier qu'un rejeu redonne exactement la même partie). */
export function fingerprint(sim: Sim): string {
  let h = 0;
  const mix = (v: number) => { h = (Math.imul(h ^ Math.round(v * 100), 2654435761) + 0x9e3779b9) >>> 0; };
  for (const u of sim.units) { mix(u.id); mix(u.x); mix(u.z); mix(u.hp); }
  for (const b of sim.buildings) { mix(b.id); mix(b.hp); mix(b.progress); }
  for (const p of sim.players) { mix(p.eau); mix(p.bois); mix(p.minerai); mix(p.energie); mix(p.solarite); mix(p.ere); }
  return `${sim.tick}:${sim.units.length}:${sim.buildings.length}:${h.toString(16)}`;
}
