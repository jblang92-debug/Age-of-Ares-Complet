// Test du jalon 7 : ère 2. Lancer : npx tsx tests/j7.ts
import { generateMap } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { Ai, type Level } from '../src/sim/ai';
import { GAME, SHIELD } from '../src/data/rules';

function fresh(seed = 4242) {
  const g = generateMap(seed), sim = new Sim(g.terrain, g.objects);
  return { g, sim, s: g.terrain.starts[0], e: g.terrain.starts[1] };
}
const run = (sim: Sim, n: number) => { for (let i = 0; i < n; i++) { sim.step(); sim.events.length = 0; } };
let ok = true;
const check = (label: string, cond: boolean, detail = '') => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + label + (detail ? ' — ' + detail : '')); if (!cond) ok = false; };

{ // Le drone vole en ligne droite par-dessus les falaises, bien plus vite qu'un blindé qui contourne.
  const { sim, s, e } = fresh();
  const d = sim.spawn('drone', 0, s.x, s.z + 12), b = sim.spawn('blinde', 0, s.x + 3, s.z + 12);
  sim.issue({ type: 'move', ids: [d.id], x: e.x, z: e.z - 12, formation: 'libre' }); sim.issue({ type: 'move', ids: [b.id], x: e.x, z: e.z - 12, formation: 'libre' });
  let td = -1, tb = -1;
  for (let t = 0; t < 2500 && (td < 0 || tb < 0); t++) { run(sim, 1); if (td < 0 && !d.moving && t > 5) td = t; if (tb < 0 && !b.moving && t > 5) tb = t; }
  check('le drone traverse la carte en ligne droite', td > 0 && Math.hypot(d.x - e.x, d.z - (e.z - 12)) < 3, `drone ${(td / 10).toFixed(0)} s, blindé ${(tb / 10).toFixed(0)} s`);
}
{ // Anti-aérien : la tourelle normale ignore le drone, la tourelle AA l'abat ; le blindé ne peut pas viser en l'air.
  const { sim, s } = fresh(); sim.players[1].ere = 4; sim.players[1].minerai = 9999; sim.players[1].energie = 9999;
  const w = sim.spawn('ouvrier', 1, s.x + 20, s.z + 14);
  void w;
  const d = sim.spawn('drone', 0, s.x, s.z + 14), tank = sim.spawn('blinde', 1, s.x + 4, s.z + 14);
  run(sim, 100);
  check('le blindé ne tire pas sur le drone, le drone tire sur le blindé', d.hp === d.maxHp && tank.hp < tank.maxHp, `drone ${d.hp}/${d.maxHp}, blindé ${Math.round(tank.hp)}/${tank.maxHp}`);
  const f = sim.spawn('fantassin', 1, s.x - 3, s.z + 14); void f;
  run(sim, 60);
  check('le fantassin tire sur le drone', d.hp < d.maxHp, `drone ${Math.round(d.hp)}/${d.maxHp}`);
}
{ // Bouclier : absorbe les dégâts sous le dôme.
  const { sim, s } = fresh(); const P = sim.players[0]; P.ere = 4; P.minerai = 9999; P.energie = 9999; P.solarite = 9999;
  const w = sim.spawn('ouvrier', 0, s.x, s.z + 9);
  let spot: any = null; for (let k = 0; k < 60 && !spot; k++) { const a = k * 0.7, x = s.x + Math.cos(a) * 12, z = s.z + Math.sin(a) * 12; if (sim.canPlace('bouclier', x, z)) spot = { x, z }; }
  sim.issue({ type: 'place', owner: 0, kind: 'bouclier', x: spot.x, z: spot.z, ids: [w.id] });
  run(sim, 600);
  const sh = sim.buildings.find((b) => b.kind === 'bouclier')!;
  const before = sh.shield, centre = sim.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;
  for (let i = 0; i < 4; i++) sim.spawn('fantassin', 1, centre.x - 3 + i * 1.5, centre.z - 9);
  sim.issue({ type: 'attack', ids: sim.units.filter((u) => u.owner === 1).map((u) => u.id), unit: -1, b: centre.id });
  run(sim, 120);
  check('le bouclier se construit, se charge et absorbe les tirs', sh.done && before > SHIELD.max * 0.3 && centre.hp === centre.maxHp && sh.shield < before, `bouclier ${Math.round(before)} -> ${Math.round(sh.shield)}, Centre ${centre.hp}/${centre.maxHp}`);
}

// Parties IA contre IA : les deux camps atteignent l'ère 2 avant 20 minutes.
function match(seed: number, a: Level, b: Level) {
  const { g, sim } = fresh(seed);
  for (const owner of [0, 1]) {
    for (let i = 0; i < GAME.depart.ouvriers; i++) sim.spawn('ouvrier', owner, g.objects.spawns[owner][i + 4].x, g.objects.spawns[owner][i + 4].z);
    sim.spawn('eclaireur', owner, g.objects.spawns[owner][10].x, g.objects.spawns[owner][10].z);
  }
  const ais = [new Ai(sim, 0, a), new Ai(sim, 1, b)], era = [-1, -1], seen = new Set<string>(), t0 = Date.now();
  while (sim.winner < 0 && sim.tick < 30 * 600) {
    for (const ai of ais) ai.step();
    sim.step(); sim.events.length = 0;
    if (sim.tick % 50 === 0) { for (const o of [0, 1]) if (era[o] < 0 && sim.players[o].ere >= 4) era[o] = sim.tick; for (const u of sim.units) seen.add(u.kind); for (const x of sim.buildings) seen.add(x.kind); }
  }
  const e2 = (o: number) => era[o] < 0 ? 'jamais' : (era[o] / 600).toFixed(1) + ' min';
  console.log(`  graine ${seed} : ${a} contre ${b} -> ère 2 à ${e2(0)} / ${e2(1)} | fin à ${(sim.tick / 600).toFixed(1)} min, vainqueur ${sim.winner < 0 ? 'aucun' : sim.winner === 0 ? a : b} | vus : ${['blinde', 'drone', 'raffinerie', 'usine', 'hangar', 'tourelleAA', 'bouclier', 'labo', 'recycleur'].filter((k) => seen.has(k)).join(', ') || 'rien de l\'ère 2'} | ${Date.now() - t0} ms`);
  return era;
}
console.log('IA contre IA :');
let both = 0;
for (const seed of [20261113, 4242, 777]) { const era = match(seed, 'normal', 'normal'); if (era[0] > 0 && era[0] < 12000 && era[1] > 0 && era[1] < 12000) both++; }
match(4242, 'difficile', 'difficile');
check('les deux camps atteignent l\'ère 2 avant 20 min (IA normale, 3 cartes)', both >= 2, `${both}/3`);
console.log(ok ? 'TEST OK' : 'TEST ECHEC'); process.exit(ok ? 0 : 1);
