// Anti-triche en ligne : un joueur ne peut commander que ce qui lui appartient.
import { generateMap } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
let bad = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'ok ' : 'ECHEC ') + m); if (!c) bad++; };
const g = generateMap(4242), sim = new Sim(g.terrain, g.objects);
const e = sim.spawn('fantassin', 1, g.objects.spawns[1][4].x, g.objects.spawns[1][4].z), m = sim.spawn('fantassin', 0, g.objects.spawns[0][4].x, g.objects.spawns[0][4].z);
const c0 = sim.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!, c1 = sim.buildings.find((b) => b.owner === 1 && b.kind === 'centre')!;
ok(sim.own({ type: 'move', ids: [e.id], x: 0, z: 0, formation: 'libre' } as any, 0) === null, 'déplacer une unité ennemie : refusé');
ok((sim.own({ type: 'move', ids: [e.id, m.id], x: 0, z: 0, formation: 'libre' } as any, 0) as any)?.ids.join() === String(m.id), 'ordre mixte : seule mon unité reste');
ok(sim.own({ type: 'train', b: c1.id, kind: 'ouvrier' }, 0) === null, 'produire dans le Centre ennemi : refusé');
ok(sim.own({ type: 'train', b: c0.id, kind: 'ouvrier' }, 0) !== null, 'produire chez moi : accepté');
ok(sim.own({ type: 'place', owner: 1, kind: 'habitat', x: 0, z: 0, ids: [] }, 0) === null, 'construire au nom d\'un autre : refusé');
ok(sim.own({ type: 'attack', ids: [m.id], unit: e.id, b: -1 }, 0) !== null, 'attaquer une unité ennemie : accepté');
ok(sim.own({ type: 'ion', owner: 1, on: true }, 0) === null, 'canon ionique d\'un autre : refusé');
console.log(bad ? `${bad} ÉCHECS` : 'TOUT VERT'); process.exit(bad ? 1 : 0);
