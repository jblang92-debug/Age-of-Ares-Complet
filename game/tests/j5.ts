// Test du jalon 5 : on détruit un Centre adverse immobile. Lancer : npx tsx tests/j5.ts
import { generateMap } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { UNITS, BUILDINGS, GAME } from '../src/data/rules';

function setup(seed: number) {
  const g = generateMap(seed), sim = new Sim(g.terrain, g.objects);
  for (const owner of [0, 1]) {
    for (let i = 0; i < GAME.depart.ouvriers; i++) sim.spawn('ouvrier', owner, g.objects.spawns[owner][i + 4].x, g.objects.spawns[owner][i + 4].z);
    sim.spawn('eclaireur', owner, g.objects.spawns[owner][10].x, g.objects.spawns[owner][10].z);
  }
  return { g, sim };
}
function freeSpot(sim: Sim, kind: string, cx: number, cz: number, salt: number): { x: number; z: number } | null {
  for (let k = 0; k < 80; k++) { const a = salt * 2.4 + k * 0.7, r = 12 + (k % 5) * 3, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (sim.canPlace(kind, x, z)) return { x, z }; }
  return null;
}

function fullGame(seed: number) {
  const { g, sim } = setup(seed), s = g.terrain.starts[0], e = g.terrain.starts[1], P = sim.players[0];
  const centre = sim.buildings.find((b) => b.owner === 0)!;
  const near = (kind: string) => sim.nodes.filter((n) => n.kind === kind && n.amount > 0).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
  const W = () => sim.units.filter((u) => u.owner === 0 && u.kind === 'ouvrier');
  const A = () => sim.units.filter((u) => u.owner === 0 && u.kind === 'fantassin');
  let placed = 0, sent = -1;
  for (let t = 0; t < 9000 && sim.winner < 0; t++) {
    if (t % 10 === 0) {
      const ice = near('glace'), ore = near('minerai');
      if (ice) sim.issue({ type: 'rally', b: centre.id, x: ice.x, z: ice.z, node: ice.id });
      if (W().length < 14 && centre.queue.length < 2 && !sim.canPay(0, UNITS.ouvrier.cout)) sim.issue({ type: 'train', b: centre.id, kind: 'ouvrier' });
      for (const u of sim.idleWorkers(0)) { const n = u.id % 2 === 0 ? ore : ice; if (n) sim.issue({ type: 'gather', ids: [u.id], node: n.id }); }
      const has = (k: string) => sim.buildings.filter((b) => b.owner === 0 && b.kind === k);
      const build = (kind: string) => { const p = freeSpot(sim, kind, s.x, s.z, placed); if (p && !sim.canPay(0, BUILDINGS[kind].cout)) { sim.issue({ type: 'place', owner: 0, kind, x: p.x, z: p.z, ids: [W()[0].id] }); placed++; } };
      if (P.pop + 3 >= P.popCap && has('habitat').filter((b) => !b.done).length === 0 && P.popCap < 40) build('habitat');
      else if (!has('caserne').length && W().length >= 8) build('caserne');
      const cas = has('caserne').find((b) => b.done);
      if (cas && cas.queue.length < 2 && !sim.canPay(0, UNITS.fantassin.cout) && sent < 0) sim.issue({ type: 'train', b: cas.id, kind: 'fantassin' });
      if (sent < 0 && A().length >= 14) { sent = t; sim.issue({ type: 'amove', ids: A().map((u) => u.id), x: e.x, z: e.z, formation: 'libre' }); }
      if (sent >= 0 && t % 100 === 0 && A().length) sim.issue({ type: 'amove', ids: A().filter((u) => !u.amove && u.tu < 0 && u.tb < 0).map((u) => u.id), x: e.x, z: e.z, formation: 'libre' });
    }
    sim.step(); sim.events.length = 0;
    if (sim.winner >= 0) return { win: sim.winner, t, sent, army: A().length, st: sim.stats[0] };
  }
  console.log('   fin :', sim.buildings.filter((b) => b.owner === 0).map((b) => b.kind + (b.done ? '' : '(' + Math.round(b.progress * 100) + '%)') + (b.queue.length ? '[file ' + b.queue.length + (b.waiting ? ' attente' : '') + ']' : '')).join(', '), 'eau', Math.round(P.eau), 'minerai', Math.round(P.minerai), 'pop', P.pop + '/' + P.popCap, 'ouvriers', W().length, 'jobs', W().map((u) => u.job ? u.job.t[0] + u.job.phase[0] : '-').join(''));
  return { win: -1, t: 9000, sent, army: A().length, st: sim.stats[0] };
}

// Duels : bonus de hauteur et contres.
function duel(a: 'fantassin' | 'eclaireur', b: 'fantassin' | 'eclaireur' | 'ouvrier', n = 1, m = 1) {
  const { sim } = setup(4242); sim.units.length = 0;
  const s = sim.map.starts[0];
  for (let i = 0; i < n; i++) sim.spawn(a, 0, s.x + i * 1.2, s.z + 12);
  for (let i = 0; i < m; i++) sim.spawn(b, 1, s.x + i * 1.2, s.z + 15);
  for (let t = 0; t < 1500; t++) { sim.step(); sim.events.length = 0; if (!sim.units.some((u) => u.owner === 0) || !sim.units.some((u) => u.owner === 1)) break; }
  return { a: sim.units.filter((u) => u.owner === 0).length, b: sim.units.filter((u) => u.owner === 1).length };
}

let ok = true;
const d1 = duel('fantassin', 'fantassin', 5, 5), d2 = duel('fantassin', 'eclaireur', 3, 3), d3 = duel('eclaireur', 'ouvrier', 1, 3);
console.log('5 fantassins contre 5 :', JSON.stringify(d1), '| 3 fantassins contre 3 éclaireurs :', JSON.stringify(d2), '| 1 éclaireur contre 3 ouvriers :', JSON.stringify(d3));
if (d2.a === 0) { ok = false; console.log('  -> les fantassins devraient battre les éclaireurs'); }
for (const seed of [20261113, 4242, 777]) {
  const t0 = Date.now(), r = fullGame(seed);
  console.log(`graine ${seed} : ${r.win === 0 ? 'VICTOIRE' : 'pas de victoire'} à ${(r.t / 600).toFixed(1)} min (attaque lancée à ${(r.sent / 600).toFixed(1)} min, ${r.army} fantassins restants) | récolté ${r.st.recolte}, produits ${r.st.produits}, perdus ${r.st.perdus}, tués ${r.st.tues} | ${Date.now() - t0} ms`);
  if (r.win !== 0) ok = false;
}
console.log(ok ? 'TEST OK' : 'TEST ECHEC'); process.exit(ok ? 0 : 1);
