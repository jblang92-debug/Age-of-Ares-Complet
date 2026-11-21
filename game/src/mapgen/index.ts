// Générateur complet : relief + objets + vérification. Une carte invalide est régénérée
// avec une graine dérivée, de façon déterministe : la même graine redonne toujours la même carte.
import { generateTerrain, SEPARATED, VOID_BORDER, type TerrainMap, type MapKind } from './terrain';
import { generateObjects, type MapObjects } from './objects';
import { NavGrid, INF } from '../sim/nav';

export interface MapReport { ok: boolean; reasons: string[]; pathFoot: number; pathVehicle: number; walkable: number; ramps: number }
export interface GameMap { seed: number; attempt: number; terrain: TerrainMap; objects: MapObjects; report: MapReport }

/** Vérifie qu'une carte est jouable et équitable. */
export function validate(map: TerrainMap, objects: MapObjects): MapReport {
  // Sur les cartes d'îles, seuls les gisements de départ sont obligatoires sur l'île du joueur ; le reste est sur les îles neutres.
  const sep = SEPARATED.has(map.kind), voidy = VOID_BORDER.has(map.kind) || map.kind === 'rivieres';
  const reasons: string[] = [...objects.missing.filter((m) => !(voidy && m.startsWith('solarite')) && !(sep && !m.includes('départ'))).map((m) => 'gisement non placé : ' + m)];
  const nav = new NavGrid(map, objects), S = nav.size;
  const [a, b] = map.starts;
  const f0 = nav.flowField(b.x, b.z - 15, 0), f1 = nav.flowField(b.x, b.z - 15, 1);
  const ca = nav.nearestFree(a.x, a.z + 15, 1);
  const pathFoot = ca >= 0 ? f0[ca] : INF, pathVehicle = ca >= 0 ? f1[ca] : INF;
  if (!sep && pathFoot >= INF) reasons.push('aucun chemin à pied entre les bases');
  if (!sep && pathVehicle >= INF) reasons.push('aucun chemin pour les véhicules entre les bases');
  for (const o of map.starts.slice(2)) { const c = nav.nearestFree(o.x, o.z + 6, sep ? 0 : 1, undefined, undefined, 12); if (!sep && (c < 0 || f1[c] >= INF)) reasons.push('une base n\'est pas reliée aux autres'); if (sep && c >= 0 && f0[c] < INF) reasons.push('les îles des joueurs se touchent'); }
  if (sep && pathFoot < INF) reasons.push('les îles des joueurs se touchent');
  let free = 0;
  for (let k = 0; k < S * S; k++) if (!nav.blocked[0][k]) free++;
  const walkable = free / (S * S);
  if (walkable < (map.kind === 'petitesiles' ? 0.18 : voidy ? 0.4 : 0.55)) reasons.push('trop peu de terrain praticable');
  // Chaque gisement doit être accessible à pied.
  let unreachable = 0;
  const fa = nav.flowField(a.x, a.z + 15, 0);
  // À quatre, un gisement compte comme accessible s'il l'est depuis au moins une base.
  const more = map.starts.slice(2).map((o) => { const c = nav.nearestFree(o.x, o.z + 8, 0, undefined, undefined, 12); return c >= 0 ? nav.flowField(nav.cx(c), nav.cz(c), 0) : null; }).filter((f): f is Float32Array => !!f);
  for (const r of objects.resources) {
    if (r.island) continue;
    const c = nav.nearestFree(r.x, r.z, 0, undefined, undefined, 4);
    if (c < 0 || (f0[c] >= INF && fa[c] >= INF && more.every((f) => f[c] >= INF))) unreachable++;
  }
  if (unreachable > objects.resources.length * 0.06) reasons.push(`${unreachable} gisements inaccessibles`);
  // Zone de départ dégagée (pour construire).
  for (const s of map.starts) {
    let blocked = 0, total = 0;
    for (let dz = -24; dz <= 24; dz += 2) for (let dx = -24; dx <= 24; dx += 2) { if (Math.hypot(dx, dz) > 24) continue; total++; if (!nav.walkable(s.x + dx, s.z + dz, 0)) blocked++; }
    if (blocked / total > 0.45) reasons.push('zone de départ encombrée');
  }
  if (map.ramps.length < (voidy ? 0 : 2)) reasons.push('pas assez de rampes');
  // Chaque île neutre doit avoir de la terre ferme en son centre.
  for (const c of map.islands) {
    if (map.isVoid(c.x, c.z)) { reasons.push('île neutre absente'); continue; }
    const ci = nav.nearestFree(c.x, c.z, 0, undefined, undefined, 6);
    if (ci >= 0 && (fa[ci] < INF || f0[ci] < INF)) reasons.push('une île neutre touche une base');
  }
  return { ok: reasons.length === 0, reasons, pathFoot, pathVehicle, walkable, ramps: map.ramps.length };
}

/** Tailles de carte : demi-côté de la zone jouable, en mètres. */
export const SIZES = { petite: 80, moyenne: 110, grande: 140 } as const;
export type MapSize = keyof typeof SIZES;

export function generateMap(seed: number, half = 80, kind: MapKind = 'terre', players = 2): GameMap {
  // Si aucune tentative n'est parfaite, on garde la moins mauvaise (ressources de départ d'abord).
  let best: GameMap | null = null, bestScore = Infinity;
  for (let attempt = 0; attempt < 30; attempt++) {
    const s = attempt === 0 ? seed : (Math.imul(seed ^ (attempt * 0x9e3779b1), 2654435761) >>> 0) % 100000000;
    const terrain = generateTerrain(s, half, 40, kind, players), objects = generateObjects(terrain);
    const m: GameMap = { seed, attempt, terrain, objects, report: validate(terrain, objects) };
    if (m.report.ok) return m;
    const score = objects.missing.reduce((a, k) => a + (/départ/.test(k) ? 10 : 1), 0) + m.report.reasons.length * 100;
    if (score < bestScore) { best = m; bestScore = score; }
  }
  return best!;
}
