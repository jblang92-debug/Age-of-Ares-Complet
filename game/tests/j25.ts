// Âge moderne : bâtiments anciens convertis ; fermes en damier ; cible inaccessible -> point atteignable le plus proche.
// Lancer : npx tsx tests/j25.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { BUILDINGS } from '../src/data/rules';

let ok = true;
const check = (label: string, cond: boolean, detail = '') => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + label + (detail ? ' — ' + detail : '')); if (!cond) ok = false; };
{
  const g = generateMap(4242, SIZES.moyenne, 'terre', 2), sim = new Sim(g.terrain, g.objects);
  const c = sim.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;
  const P = sim.players[0]; P.ere = 3;
  const a = sim.placeNear('archerie', 0, c.x + 16, c.z)!, e = sim.placeNear('ecurie', 0, c.x - 16, c.z)!;
  a.hp = a.maxHp / 2; const bois = P.bois; a.queue.push({ kind: 'archer', left: 10, total: 10 });
  P.ere = 4; sim.modernize(0);
  check('archerie et écurie deviennent des casernes', a.kind === 'caserne' && e.kind === 'caserne');
  check('santé gardée en proportion', Math.abs(a.hp / a.maxHp - 0.5) < 0.01 && a.maxHp === BUILDINGS.caserne.pv);
  check('file remboursée', a.queue.length === 0 && P.bois === bois + 30);
  // Fermes : damier.
  const f1 = sim.farmSnap(0, c.x + 9, c.z + 3), f2 = sim.farmSnap(0, c.x + 14.5, c.z + 3.2);
  check('fermes alignées sur une grille', Math.abs(f2.x - f1.x - 5.6) < 1e-6 && Math.abs(f2.z - f1.z) < 1e-6, `${f1.x - c.x},${f1.z - c.z} ${f2.x - c.x},${f2.z - c.z}`);
}
{
  // Cible dans une poche fermée : les unités vont au point atteignable le plus proche (et ne restent pas bloquées loin).
  const g = generateMap(777, SIZES.moyenne, 'terre', 2), sim = new Sim(g.terrain, g.objects);
  const f = sim.nav.field(-31, -17, 0, 0); let n = 0; for (let i = 0; i < f.length; i++) if (f[i] < 1e9) n++;
  const c = sim.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;
  const ids = [0, 1, 2, 3].map((i) => sim.spawn('catapulte', 0, c.x + 8 + i, c.z - 8).id);
  sim.issue({ type: 'move', ids, x: -31, z: -17, formation: 'libre' } as never);
  for (let t = 0; t < 3000; t++) { sim.step(); sim.events.length = 0; if (ids.every((id) => !sim.get(id)!.moving)) break; }
  const d = ids.map((id) => { const u = sim.get(id)!; return Math.hypot(u.x - u.slotX, u.z - u.slotZ); });
  check('poche fermée : chaque engin arrive à sa place de repli', n < 2000 && d.every((x) => x < 4), d.map((x) => x.toFixed(1)).join(' '));
}
console.log(ok ? 'J25 OK' : 'J25 ÉCHEC'); if (!ok) process.exit(1);
