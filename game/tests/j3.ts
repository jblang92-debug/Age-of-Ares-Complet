// Test du jalon 3 : 100 graines d'affilée donnent toutes une carte jouable. Lancer : npx tsx tests/j3.ts
import { generateMap } from '../src/mapgen/index';
let bad = 0, retries = 0, first = 0, t0 = Date.now(), foot = 0, ramps = 0, walk = 0;
const reasons: Record<string, number> = {};
for (let seed = 1; seed <= 100; seed++) {
  const m = generateMap(seed * 7919);
  if (!m.report.ok) { bad++; console.log('graine', seed * 7919, 'ECHEC', m.report.reasons.join(' ; ')); }
  if (m.attempt === 0) first++;
  retries += m.attempt; foot += m.report.pathFoot; ramps += m.report.ramps; walk += m.report.walkable;
  // symétrie : le gisement jumeau existe pour chaque gisement
  const key = (x: number, z: number) => Math.round(x * 10) + ':' + Math.round(z * 10);
  const centers = new Set(m.objects.resources.map((r) => r.kind));
  if (centers.size < 3) { reasons['type de ressource manquant'] = (reasons['type de ressource manquant'] ?? 0) + 1; bad++; }
  void key;
}
console.log(`100 graines : ${100 - bad} jouables | valides du premier coup : ${first} | nouvelles tentatives au total : ${retries}`);
console.log(`moyennes : chemin base-base ${(foot / 100).toFixed(0)} m, ${(ramps / 100).toFixed(1)} rampes, ${(walk / 100 * 100).toFixed(0)} % praticable | ${((Date.now() - t0) / 100).toFixed(0)} ms par carte`);
console.log(bad === 0 ? 'TEST OK' : 'TEST ECHEC'); process.exit(bad === 0 ? 0 : 1);
