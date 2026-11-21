// Test du jalon 4 : on passe de 4 à 25 ouvriers en 8 minutes. Lancer : npx tsx tests/j4.ts
import { generateMap } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { UNITS, BUILDINGS, GAME } from '../src/data/rules';

function play(seed: number) {
  const g = generateMap(seed), sim = new Sim(g.terrain, g.objects), s = g.terrain.starts[0], P = sim.players[0];
  for (let i = 0; i < GAME.depart.ouvriers; i++) sim.spawn('ouvrier', 0, g.objects.spawns[0][i + 4].x, g.objects.spawns[0][i + 4].z);
  sim.spawn('eclaireur', 0, g.objects.spawns[0][10].x, g.objects.spawns[0][10].z);
  const centre = sim.buildings.find((b) => b.owner === 0)!;
  const near = (kind: string) => sim.nodes.filter((n) => n.kind === kind && n.amount > 0).sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z))[0];
  const W = () => sim.units.filter((u) => u.owner === 0 && u.kind === 'ouvrier');
  // Script d'un joueur simple : 2 ouvriers à la glace, 2 au minerai, puis production continue.
  const w0 = W();
  sim.issue({ type: 'gather', ids: [w0[0].id, w0[1].id, w0[2].id], node: near('glace').id });
  sim.issue({ type: 'gather', ids: [w0[3].id], node: near('minerai').id });
  let habitats = 0, at25 = -1, msgs = new Set<string>();
  for (let t = 0; t < 4800; t++) {
    if (t % 10 === 0) {
      const ice = near('glace'), ore = near('minerai');
      if (ice) sim.issue({ type: 'rally', b: centre.id, x: ice.x, z: ice.z, node: ice.id });
      if (centre.queue.length < 2 && !sim.canPay(0, UNITS.ouvrier.cout)) sim.issue({ type: 'train', b: centre.id, kind: 'ouvrier' });
      const pending = sim.buildings.filter((b) => b.owner === 0 && b.kind === 'habitat' && !b.done).length;
      if (P.pop + centre.queue.length + 2 >= P.popCap + pending * 5 && P.popCap + pending * 5 < 32 && !sim.canPay(0, BUILDINGS.habitat.cout)) {
        // cherche un emplacement libre autour de la base
        for (let k = 0; k < 40; k++) {
          const a = (habitats * 2.4 + k * 0.7), r = 13 + (k % 4) * 3, x = s.x + Math.cos(a) * r, z = s.z - Math.abs(Math.sin(a) * r) - 2;
          if (sim.canPlace('habitat', x, z)) { const b = W().find((u) => u.job?.t === 'gather' && sim.nodes[u.job.node].kind === 'minerai') ?? W()[0]; sim.issue({ type: 'place', owner: 0, kind: 'habitat', x, z, ids: [b.id] }); habitats++; break; }
        }
      }
      // un ouvrier sur quatre va au minerai
      const idle = sim.idleWorkers(0);
      for (const u of idle) { const n = u.id % 4 === 0 ? ore : ice; if (n) sim.issue({ type: 'gather', ids: [u.id], node: n.id }); }
      const onOre = W().filter((u) => u.job?.t === 'gather' && sim.nodes[u.job.node].kind === 'minerai').length;
      if (onOre < Math.max(1, Math.floor(W().length / 5)) && ore) { const u = W().find((u) => u.job?.t === 'gather' && sim.nodes[u.job.node].kind === 'glace' && u.carry === 0); if (u) sim.issue({ type: 'gather', ids: [u.id], node: ore.id }); }
    }
    sim.step();
    for (const e of sim.events) if (e.t === 'msg') msgs.add(e.text);
    sim.events.length = 0;
    if (at25 < 0 && W().length >= 25) at25 = t;
  }
  return { at25, workers: W().length, P, habitats, idle: sim.idleWorkers(0).length, msgs: [...msgs] };
}
let ok = true;
for (const seed of [20261113, 4242, 777]) {
  const t0 = Date.now(), r = play(seed);
  console.log(`graine ${seed} : 25 ouvriers ${r.at25 >= 0 ? 'à ' + (r.at25 / 600).toFixed(1) + ' min' : 'NON ATTEINT'} | à 8 min : ${r.workers} ouvriers, ${r.habitats} habitats, eau ${Math.round(r.P.eau)}, minerai ${Math.round(r.P.minerai)}, pop ${r.P.pop}/${r.P.popCap}, inactifs ${r.idle} | ${Date.now() - t0} ms`, r.msgs.join(' / '));
  if (r.at25 < 0) ok = false;
}
console.log(ok ? 'TEST OK' : 'TEST ECHEC'); process.exit(ok ? 0 : 1);
