// Test du jalon 6 : parties complètes contre l'IA, trois niveaux. Lancer : npx tsx tests/j6.ts
import { generateMap } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { Ai, type Level } from '../src/sim/ai';
import { GAME } from '../src/data/rules';

function match(seed: number, a: Level | null, b: Level, maxMin = 30) {
  const g = generateMap(seed), sim = new Sim(g.terrain, g.objects);
  for (const owner of [0, 1]) {
    for (let i = 0; i < GAME.depart.ouvriers; i++) sim.spawn('ouvrier', owner, g.objects.spawns[owner][i + 4].x, g.objects.spawns[owner][i + 4].z);
    sim.spawn('eclaireur', owner, g.objects.spawns[owner][10].x, g.objects.spawns[owner][10].z);
  }
  const ais = [a ? new Ai(sim, 0, a) : null, new Ai(sim, 1, b)];
  const t0 = Date.now();
  let firstFight = -1;
  while (sim.winner < 0 && sim.tick < maxMin * 600) {
    for (const ai of ais) ai?.step();
    sim.step();
    if (firstFight < 0 && sim.events.some((e) => e.t === 'shot')) firstFight = sim.tick;
    sim.events.length = 0;
  }
  const c = (o: number) => `${sim.units.filter((u) => u.owner === o && u.kind === 'ouvrier').length} ouvriers, ${sim.units.filter((u) => u.owner === o && u.kind !== 'ouvrier').length} soldats, ${sim.buildings.filter((x) => x.owner === o).length} bâtiments`;
  console.log(`  graine ${seed} : ${a ?? 'joueur absent'} contre ${b} -> ${sim.winner < 0 ? 'pas de vainqueur' : 'vainqueur : ' + (sim.winner === 0 ? (a ?? 'joueur') : b) + (sim.winner === 0 ? ' (camp 0)' : ' (camp 1)')} à ${(sim.tick / 600).toFixed(1)} min | premier combat à ${(firstFight / 600).toFixed(1)} min | camp 0 : ${c(0)} | camp 1 : ${c(1)} | ${Date.now() - t0} ms`);
  return sim.winner;
}
let ok = true;
console.log('L\'IA bat un joueur qui ne fait rien :');
for (const lv of ['facile', 'normal', 'difficile'] as Level[]) if (match(4242, null, lv) !== 1) ok = false;
console.log('Le niveau supérieur bat le niveau inférieur (3 cartes, les deux côtés) :');
let wins = 0, games = 0;
for (const seed of [20261113, 4242, 777]) {
  for (const [a, b, expect] of [['difficile', 'facile', 0], ['facile', 'difficile', 1], ['normal', 'facile', 0], ['difficile', 'normal', 0]] as [Level, Level, number][]) { games++; if (match(seed, a, b) === expect) wins++; }
}
console.log(`résultats conformes à la hiérarchie des niveaux : ${wins}/${games}`);
if (wins < games - 2) ok = false;
console.log(ok ? 'TEST OK' : 'TEST ECHEC'); process.exit(ok ? 0 : 1);
