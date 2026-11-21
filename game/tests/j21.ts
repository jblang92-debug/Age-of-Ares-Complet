// Test des âges : parties IA contre IA qui partent de l'Antiquité. Lancer : npx tsx tests/j21.ts
// Vérifie : passage des âges (Moyen Âge, moderne…), production des unités anciennes, unités antiques masquées ensuite, issue de la partie.
import { generateMap } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { Ai, type Level } from '../src/sim/ai';
import { GAME, UNITS, BUILDINGS } from '../src/data/rules';

function match(seed: number, a: Level, b: Level, maxMin = 40) {
  const g = generateMap(seed), sim = new Sim(g.terrain, g.objects);
  for (const owner of [0, 1]) {
    for (let i = 0; i < GAME.depart.ouvriers; i++) sim.spawn('ouvrier', owner, g.objects.spawns[owner][i + 4].x, g.objects.spawns[owner][i + 4].z);
    sim.spawn('eclaireur', owner, g.objects.spawns[owner][10].x, g.objects.spawns[owner][10].z);
  }
  sim.setStartAge(1);
  const ais = [new Ai(sim, 0, a), new Ai(sim, 1, b)];
  const made: Record<string, number>[] = [{}, {}], ages: string[][] = [[], []];
  let fights = 0;
  while (sim.winner < 0 && sim.tick < maxMin * 600) {
    for (const ai of ais) ai.step();
    sim.step();
    for (const e of sim.events) {
      if (e.t === 'shot') fights++;
      if (e.t === 'age') ages[e.owner].push(`${GAME.eres[e.ere - 1].nom} ${(sim.tick / 600).toFixed(1)} min`);
    }
    sim.events.length = 0;
  }
  for (const o of [0, 1]) Object.assign(made[o], sim.stats[o].produitsPar);
  console.log(`graine ${seed} : ${a} contre ${b} -> ${sim.winner < 0 ? 'pas de vainqueur' : 'vainqueur camp ' + sim.winner} à ${(sim.tick / 600).toFixed(1)} min, ${fights} tirs`);
  for (const o of [0, 1]) console.log(`  camp ${o} : âges ${ages[o].join(' → ') || 'aucun'} | produit ${JSON.stringify(made[o])} | bâtiments ${[...new Set(sim.buildings.filter((x) => x.owner === o).map((x) => x.kind))].join(',')}`);
  return { sim, made, ages };
}
let ok = true;
const r1 = match(20261113, 'difficile', 'normal');
const anc = ['milicien', 'hachier', 'champion', 'archer', 'arbaletrier', 'cavalier', 'chevalier', 'belier', 'catapulte'];
const any = anc.filter((k) => (r1.made[0][k] ?? 0) + (r1.made[1][k] ?? 0) > 0);
console.log('unités anciennes produites :', any.join(', '));
if (any.length < 5) { console.log('ECHEC : trop peu de types d\'unités anciennes'); ok = false; }
if (!r1.ages.some((a) => a.length >= 1)) { console.log('ECHEC : aucune IA n\'a changé d\'âge'); ok = false; }
// Règles : les unités antiques ne se produisent plus à l'âge moderne.
const s = r1.sim, P = s.players[0];
P.ere = 3; P.eau = P.minerai = P.energie = 9999;
const cas = s.buildings.find((b) => b.owner === 0 && b.kind === 'caserne' && b.done);
if (cas) { cas.queue.length = 0; s.issue({ type: 'train', b: cas.id, kind: 'milicien' }); s.step(); if (cas.queue.length) { console.log('ECHEC : milicien produit à l\'âge moderne'); ok = false; } }
if (BUILDINGS.usine.ere !== 4 || UNITS.fantassin.ere !== 3 || UNITS.cuirasse.ere !== 5) { console.log('ECHEC : décalage des ères'); ok = false; }
const r2 = match(4242, 'normal', 'difficile', 45);
if (!r2.ages.some((a) => a.length >= 2) && !r1.ages.some((a) => a.length >= 2)) { console.log('ECHEC : aucune IA n\'atteint l\'âge moderne'); ok = false; }
match(777, 'facile', 'normal', 25);
console.log(ok ? 'TEST OK' : 'TEST ECHEC'); process.exit(ok ? 0 : 1);
