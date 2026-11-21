// Équilibrage des factions : IA Difficile contre IA Difficile, chaque paire de factions, deux cartes, les deux côtés.
// Lancer : npx tsx tests/balfac.ts
import { generateMap } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { GAME } from '../src/data/rules';
import { Ai } from '../src/sim/ai';
const N = GAME.factions.length, win = Array.from({ length: N }, () => Array(N).fill(0)), games = Array.from({ length: N }, () => Array(N).fill(0));
const seeds = (process.argv[2] ?? '4242,777,1312').split(',').map(Number);
for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
  if (a === b) continue;
  for (const seed of seeds) {
    const g = generateMap(seed), sim = new Sim(g.terrain, g.objects);
    sim.players[0].faction = a; sim.players[1].faction = b;
    for (const owner of [0, 1]) for (let i = 0; i < GAME.depart.ouvriers; i++) sim.spawn('ouvrier', owner, g.objects.spawns[owner][i + 4].x, g.objects.spawns[owner][i + 4].z);
    const ais = [new Ai(sim, 0, 'difficile'), new Ai(sim, 1, 'difficile')];
    while (sim.winner < 0 && sim.tick < 40 * 600) { for (const ai of ais) ai.step(); sim.step(); sim.events.length = 0; }
    // Sans vainqueur : avantage à celui qui a le plus de points de vie (unités et bâtiments).
    const hp = (o: number) => sim.units.filter((u) => u.owner === o).reduce((s, u) => s + u.hp, 0) + sim.buildings.filter((x) => x.owner === o).reduce((s, x) => s + x.hp, 0);
    const w = sim.winner >= 0 ? sim.winner : hp(0) >= hp(1) ? 0 : 1;
    games[a][b]++; games[b][a]++;
    if (w === 0) win[a][b]++; else win[b][a]++;
    console.log(`${GAME.factions[a]} contre ${GAME.factions[b]} (carte ${seed}) : ${w === 0 ? GAME.factions[a] : GAME.factions[b]} ${sim.winner < 0 ? '(aux points)' : 'à ' + (sim.tick / 600).toFixed(1) + ' min'}`);
  }
}
console.log('\nVictoires (ligne contre colonne) :');
for (let a = 0; a < N; a++) console.log(GAME.factions[a].padEnd(20), win[a].map((w, b) => a === b ? '  -  ' : `${w}/${games[a][b]}`.padStart(5)).join(' '), '  total', win[a].reduce((x, y) => x + y, 0) + '/' + games[a].reduce((x, y) => x + y, 0));
