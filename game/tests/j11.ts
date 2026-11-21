// Sauvegarde par rejeu : une partie rejouée à partir des seuls ordres du joueur doit redonner exactement le même état.
// Le « joueur » est ici une IA dont on enregistre les ordres. Lancer : npx tsx tests/j11.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim, type Order } from '../src/sim/sim';
import { Ai } from '../src/sim/ai';
import { replayTo, fingerprint } from '../src/sim/replay';
let ok = true;
const check = (label: string, cond: boolean, detail = '') => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + label + (detail ? ' — ' + detail : '')); if (!cond) ok = false; };
for (const [kind, seed, T] of [['terre', 4242, 6000], ['grandesiles', 57, 7000], ['rivieres', 99, 5000]] as const) {
  const g = generateMap(seed, SIZES.petite, kind);
  const sim = new Sim(g.terrain, g.objects);
  for (const owner of [0, 1]) { for (let i = 0; i < 4; i++) sim.spawn('ouvrier', owner, g.objects.spawns[owner][i + 4].x, g.objects.spawns[owner][i + 4].z); sim.spawn('eclaireur', owner, g.objects.spawns[owner][10].x, g.objects.spawns[owner][10].z); }
  const log: [number, Order][] = [];
  const raw = sim.issue.bind(sim); let rec = false;
  sim.issue = (o: Order) => { if (rec) log.push([sim.tick, JSON.parse(JSON.stringify(o))]); raw(o); };
  const player = new Ai(sim, 0, 'normal'), foe = new Ai(sim, 1, 'normal');
  const t0 = Date.now();
  while (sim.tick < T && sim.winner < 0) { rec = true; player.step(); rec = false; foe.step(); sim.step(); sim.events.length = 0; }
  const a = fingerprint(sim);
  // Rejeu : nouvelle partie, seule l'IA adverse joue, les ordres du joueur sont réinjectés.
  const g2 = generateMap(seed, SIZES.petite, kind), sim2 = new Sim(g2.terrain, g2.objects);
  for (const owner of [0, 1]) { for (let i = 0; i < 4; i++) sim2.spawn('ouvrier', owner, g2.objects.spawns[owner][i + 4].x, g2.objects.spawns[owner][i + 4].z); sim2.spawn('eclaireur', owner, g2.objects.spawns[owner][10].x, g2.objects.spawns[owner][10].z); }
  sim2.players[0].doctrine = sim.players[0].doctrine;   // comme la sauvegarde du jeu : la doctrine du joueur est enregistrée
  const t1 = Date.now();
  replayTo(sim2, [new Ai(sim2, 1, 'normal')], log, 0, sim.tick);
  const b = fingerprint(sim2);
  check(`${kind} : rejeu identique après ${Math.round(sim.tick / 600)} min`, a === b, `${log.length} ordres, ${JSON.stringify(log).length} octets, rejeu ${Date.now() - t1} ms (partie ${t1 - t0} ms) ${a === b ? '' : a + ' ≠ ' + b}`);
}
console.log(ok ? 'J11 OK' : 'J11 ECHEC'); if (!ok) process.exit(1);
