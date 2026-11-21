// Test du jalon 2 : 50 unités traversent la carte en groupe sans s'empiler. Lancer : npx tsx tests/j2.ts
import { generateMap } from '../src/mapgen/index';
import { Sim, type UnitKind, type Formation } from '../src/sim/sim';
import { INF } from '../src/sim/nav';

const game = generateMap(20261113), map = game.terrain, objects = game.objects;
function run(formation: Formation, gx = map.starts[1].x + 6, gz = map.starts[1].z - 18) {
  const sim = new Sim(map, objects);
  sim.buildings.splice(0); // test de déplacement pur : sans les Centres, qui tirent désormais sur les intrus
  const S = sim.nav.size, blk = sim.nav.blocked;
  const kinds: UnitKind[] = [...Array(30).fill('fantassin'), ...Array(8).fill('eclaireur'), ...Array(8).fill('blinde'), ...Array(4).fill('ouvrier')];
  kinds.forEach((k, i) => sim.spawn(k, 0, objects.spawns[0][i].x, objects.spawns[0][i].z));
  const f0 = sim.nav.flowField(gx, gz, 0), f1 = sim.nav.flowField(gx, gz, 1);
  const a = sim.nav.cell(map.starts[0].x, map.starts[0].z + 16);
  if (formation === 'libre') {
    console.log(`grille ${S}x${S}, bloqué à pied ${(blk[0].reduce((s, v) => s + v, 0) / (S * S) * 100).toFixed(1)} %, véhicules ${(blk[1].reduce((s, v) => s + v, 0) / (S * S) * 100).toFixed(1)} %`);
    console.log('chemin base A -> base B : à pied', f0[a] < INF ? f0[a].toFixed(0) + ' m' : 'AUCUN', '| véhicules', f1[a] < INF ? f1[a].toFixed(0) + ' m' : 'AUCUN');
    for (const kind of ['solarite', 'glace', 'minerai'] as const) {
      const nodes = objects.resources.filter((r) => r.kind === kind);
      const ok = nodes.filter((r) => { const c = sim.nav.nearestFree(r.x, r.z, 0, undefined, undefined, 4); return c >= 0 && f0[c] < INF; }).length;
      console.log(`gisements ${kind} accessibles : ${ok}/${nodes.length}`);
    }
  }
  const t0 = Date.now();
  sim.issue({ type: 'move', ids: sim.units.map((u) => u.id), x: gx, z: gz, formation });
  let ticks = 0, worst = 0;
  while (ticks < 3000 && (ticks < 5 || sim.units.some((u) => u.moving))) {
    sim.step(); ticks++;
    if (ticks % 10 === 0) for (const u of sim.units) for (const v of sim.units) if (v.id > u.id) {
      const pen = u.radius + v.radius - Math.hypot(u.x - v.x, u.z - v.z); if (pen > worst) { worst = pen; if (pen > 0.6) console.log('   chevauchement', pen.toFixed(2), u.kind, v.kind, 't', ticks, 'pos', u.x.toFixed(0), u.z.toFixed(0), 'moving', u.moving, v.moving, 'rampe', map.rampNear(u.x, u.z, 3)); }
    }
  }
  const tc = { x: gx, z: gz };
  const far = sim.units.filter((u) => Math.hypot(u.x - tc.x, u.z - tc.z) > 22).length;
  for (const u of sim.units) if (Math.hypot(u.x - tc.x, u.z - tc.z) > 22) console.log('   hors zone', u.kind, 'pos', u.x.toFixed(0), u.z.toFixed(0), 'rampe', map.rampNear(u.x, u.z, 3), 'slot', u.slotX.toFixed(0), u.slotZ.toFixed(0));
  const exact = sim.units.filter((u) => Math.hypot(u.x - u.slotX, u.z - u.slotZ) < 1).length;
  let rest = 0;
  for (const u of sim.units) for (const v of sim.units) if (v.id > u.id) rest = Math.max(rest, u.radius + v.radius - Math.hypot(u.x - v.x, u.z - v.z));
  const inWall = sim.units.filter((u) => !sim.nav.walkable(u.x, u.z, u.wide)).length;
  console.log(`[${formation}] ${ticks / 10} s de jeu, calculé en ${Date.now() - t0} ms | hors de la zone d'arrivée : ${far}/50 | à leur place exacte : ${exact}/50 | dans un obstacle : ${inWall} | chevauchement à l'arrêt : ${rest.toFixed(2)} m (en marche, au pire : ${worst.toFixed(2)} m)`);
  return far === 0 && inWall === 0 && rest < 0.4 && ticks < 1200;
}
const F = ['libre', 'ligne', 'colonne', 'carre'] as Formation[];
const ok = [...F.map((f) => run(f)), ...F.map((f) => run(f, -30, 5))].every(Boolean);
console.log(ok ? 'TEST OK' : 'TEST ECHEC'); process.exit(ok ? 0 : 1);
