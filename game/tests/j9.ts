// Test du vide intersidéral (carte Archipel) : navette, quai, îles. Lancer : npx tsx tests/j9.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { Ai } from '../src/sim/ai';

const run = (sim: Sim, n: number) => { for (let i = 0; i < n; i++) { sim.step(); sim.events.length = 0; } };
let ok = true;
const check = (label: string, cond: boolean, detail = '') => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + label + (detail ? ' — ' + detail : '')); if (!cond) ok = false; };

for (const size of ['petite', 'moyenne'] as const) {
  const g = generateMap(4242, SIZES[size], 'continentale'), sim = new Sim(g.terrain, g.objects), s = g.terrain.starts[0];
  const isl = g.terrain.islands.slice().sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
  console.log(`Archipel ${size} : ${g.terrain.islands.length} îles, île la plus proche à ${Math.hypot(isl.x - s.x, isl.z - s.z).toFixed(0)} m`);
  const nv = sim.spawn('navette', 0, s.x, s.z + 12);
  const crew = [sim.spawn('ouvrier', 0, s.x + 3, s.z + 14), sim.spawn('ouvrier', 0, s.x - 3, s.z + 14), sim.spawn('fantassin', 0, s.x, s.z + 16)];
  // À pied, l'île est hors d'atteinte.
  sim.issue({ type: 'move', ids: [crew[2].id], x: isl.x, z: isl.z, formation: 'libre' }); run(sim, 600);
  check('à pied, on ne rejoint pas l\'île', Math.hypot(crew[2].x - isl.x, crew[2].z - isl.z) > 8 && !g.terrain.isVoid(crew[2].x, crew[2].z), `reste à ${Math.hypot(crew[2].x - isl.x, crew[2].z - isl.z).toFixed(0)} m`);
  const pop0 = sim.players[0].pop;
  sim.issue({ type: 'load', ids: crew.map((u) => u.id), navette: nv.id }); run(sim, 900);
  check('les 3 unités embarquent', nv.cargo.length === 3 && crew.every((u) => !sim.units.includes(u)), `${nv.cargo.length} à bord`);
  run(sim, 2); check('la population compte les passagers', sim.players[0].pop === pop0, `${sim.players[0].pop} / ${pop0}`);
  sim.issue({ type: 'unload', id: nv.id, x: isl.x, z: isl.z }); run(sim, 600);
  const on = crew.filter((u) => sim.units.includes(u) && Math.hypot(u.x - isl.x, u.z - isl.z) < 12 && !g.terrain.isVoid(u.x, u.z));
  check('débarquement sur l\'île', nv.cargo.length === 0 && on.length === 3, `${on.length} sur l'île`);
  // Les ouvriers peuvent y miner et y bâtir un dépôt.
  const node = sim.nodes.filter((n) => n.amount > 0).sort((a, b) => Math.hypot(a.x - isl.x, a.z - isl.z) - Math.hypot(b.x - isl.x, b.z - isl.z))[0];
  check('l\'île porte des ressources', Math.hypot(node.x - isl.x, node.z - isl.z) < 14, `${node.kind} à ${Math.hypot(node.x - isl.x, node.z - isl.z).toFixed(0)} m du centre`);
  sim.players[0].minerai = 999; sim.players[0].ere = 4;
  const depot = node.kind === 'solarite' ? 'raffinerie' : 'depotMinier';
  let spot: { x: number; z: number } | null = null;
  for (let a = 0; a < 40 && !spot; a++) { const x = isl.x + Math.cos(a) * (2 + a * 0.2), z = isl.z + Math.sin(a) * (2 + a * 0.2); if (sim.canPlace(depot, x, z)) spot = { x, z }; }
  check('on peut bâtir un dépôt sur l\'île', !!spot);
  if (spot) {
    sim.issue({ type: 'place', owner: 0, kind: depot, x: spot.x, z: spot.z, ids: [crew[0].id] }); run(sim, 500);
    const dep = sim.buildings.find((b) => b.kind === depot && b.owner === 0);
    check('le dépôt est construit', !!dep && dep.done);
    const before = sim.players[0][node.kind as 'minerai' | 'solarite'];
    sim.issue({ type: 'gather', ids: [crew[0].id, crew[1].id], node: node.id }); run(sim, 900);
    check('la récolte de l\'île rentre au dépôt', sim.players[0][node.kind as 'minerai' | 'solarite'] > before, `${node.kind} ${before} → ${Math.round(sim.players[0][node.kind as 'minerai' | 'solarite'])}`);
  }
  // Quai : seulement au bord du vide.
  check('quai refusé loin du vide', !sim.canPlace('quai', s.x + 14, s.z));
  let edge = false;
  for (let r = 10; r < 120 && !edge; r += 2) for (let a = 0; a < 64 && !edge; a++) edge = sim.canPlace('quai', s.x + Math.cos(a * 0.098) * r, s.z + Math.sin(a * 0.098) * r);
  check('quai accepté au bord du vide', edge);
  // La navette abattue perd sa cargaison.
  sim.issue({ type: 'load', ids: [crew[2].id], navette: nv.id }); run(sim, 400);
  const had = nv.cargo.length; sim.issue({ type: 'kill', owner: 0, ids: [nv.id], b: -1 }); run(sim, 3);
  check('navette détruite : cargaison perdue', had === 1 && !sim.units.includes(crew[2]) && !sim.units.includes(nv));
}
{ // Une partie IA contre IA tourne sans erreur sur un archipel.
  const g = generateMap(77, SIZES.petite, 'grandesiles'), sim = new Sim(g.terrain, g.objects);
  const a = new Ai(sim, 0, 'normal'), b = new Ai(sim, 1, 'facile');
  for (let t = 0; t < 9000 && sim.winner < 0; t++) { a.step(); b.step(); sim.step(); sim.events.length = 0; }
  check('IA contre IA sur archipel sans plantage', true, `tick ${sim.tick}, vainqueur ${sim.winner}, unités ${sim.units.length}`);
}
console.log(ok ? 'J9 OK' : 'J9 ECHEC'); if (!ok) process.exit(1);
