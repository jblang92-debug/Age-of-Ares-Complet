// Bac à sable et départ riche.
// Lancer : npx tsx tests/j15.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { UNITS, BUILDINGS } from '../src/data/rules';

let ok = true;
const check = (label: string, cond: boolean, detail = '') => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + label + (detail ? ' — ' + detail : '')); if (!cond) ok = false; };
const run = (sim: Sim, n: number) => { for (let i = 0; i < n; i++) { sim.step(); sim.events.length = 0; } };
const g = generateMap(4242, SIZES.petite, 'terre');
{
  const sim = new Sim(g.terrain, g.objects); sim.sandbox = 0;
  const c = sim.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;
  for (let i = 0; i < 5; i++) sim.issue({ type: 'train', b: c.id, kind: 'ouvrier' });
  run(sim, 2);
  check('ressources illimitées après dépense', sim.players[0].minerai === Sim.SANDBOX.stock && sim.players[0].eau === Sim.SANDBOX.stock);
  const t = UNITS.ouvrier.temps * 10;
  const n0 = sim.units.filter((u) => u.owner === 0 && u.kind === 'ouvrier').length;
  run(sim, Math.ceil(t / Sim.SANDBOX.speed) * 5 + 10);
  const n1 = sim.units.filter((u) => u.owner === 0 && u.kind === 'ouvrier').length;
  check('production 5 fois plus rapide', n1 - n0 === 5, `${n1 - n0} ouvriers en ${Math.ceil(t / Sim.SANDBOX.speed) * 5 + 10} ticks`);
  check('population maximale', sim.players[0].popCap === Sim.SANDBOX.pop);
  check('l\'adversaire garde les règles normales', sim.players[1].minerai < 1000 && sim.players[1].popCap < Sim.SANDBOX.pop);
}
{
  const sim = new Sim(g.terrain, g.objects); const m0 = sim.players[1].minerai; sim.setRich();
  check('départ riche pour tous les camps', sim.players[0].minerai === m0 + 3000 && sim.players[1].minerai === m0 + 3000);
}
{ // Après la chute d'un bâtiment désigné, les soldats enchaînent sur l'ennemi voisin.
  const sim = new Sim(g.terrain, g.objects), s1 = g.terrain.starts[1];
  const c1 = sim.buildings.find((b) => b.owner === 1 && b.kind === 'centre')!;
  sim.issue({ type: 'place', owner: 1, kind: 'habitat', x: c1.x + 12, z: c1.z, ids: [] }); run(sim, 1);
  const h = sim.buildings.filter((b) => b.owner === 1).pop()!; h.done = true; h.progress = 1; h.hp = 30;
  const army = [0, 1, 2, 3].map((i) => sim.spawn('fantassin', 0, h.x + 6 + i, h.z + 3));
  for (const u of sim.units.filter((u) => u.owner === 1)) { u.x = s1.x - 5; u.z = s1.z; }
  const foe = sim.spawn('fantassin', 1, h.x + 12, h.z + 9); foe.posture = 'passive';
  sim.issue({ type: 'attack', ids: army.map((u) => u.id), unit: -1, b: h.id });
  run(sim, 40);
  check('le bâtiment désigné tombe', !sim.buildings.includes(h));
  run(sim, 120);
  check('les soldats enchaînent sur l\'ennemi voisin sans nouvel ordre', !sim.units.includes(foe) || foe.hp < foe.maxHp, `PV ennemi ${Math.round(foe.hp)}`);
}
{ // Patrouille de l'éclaireur.
  const sim = new Sim(g.terrain, g.objects);
  const s0 = g.terrain.starts[0], e = sim.spawn('eclaireur', 0, s0.x, s0.z - 8);
  const seen = new Set<number>();
  sim.issue({ type: 'patrol', ids: [e.id] });
  for (let i = 0; i < 1800; i++) { sim.step(); sim.events.length = 0; seen.add(e.patrol); }
  check('l\'éclaireur enchaîne les points de patrouille', seen.size >= 6 && e.patrol >= 0, `${seen.size} points visités`);
}
{ // Porte intégrée à un mur existant (comme dans Empire Earth).
  const sim = new Sim(g.terrain, g.objects), s0 = g.terrain.starts[0];
  sim.players[0].minerai = 9999;
  // On cherche une ligne libre de 22 m près de la base.
  let z0 = 0, x0 = 0, found = false;
  for (let k = 0; k < 60 && !found; k++) {
    x0 = s0.x - 11 + ((k % 6) - 3) * 4; z0 = s0.z + 14 + Math.floor(k / 6) * 3;
    found = true; for (let i = 0; i <= 12; i++) if (!sim.canPlace('mur', x0 + i * 1.85, z0)) { found = false; break; }
  }
  check('ligne de mur libre trouvée', found);
  for (let i = 0; i <= 12; i++) sim.issue({ type: 'place', owner: 0, kind: 'mur', x: x0 + i * 1.85, z: z0, ids: [] });
  run(sim, 1);
  for (const b of sim.buildings) if (b.kind === 'mur') { b.done = true; b.progress = 1; b.hp = b.maxHp; }
  const nWalls = sim.buildings.filter((b) => b.kind === 'mur').length;
  const snap = sim.gateSnap(0, x0 + 6 * 1.85 + 0.6, z0 + 1.2);
  check('la porte se cale sur un poteau du mur', snap.wall && Math.abs(snap.x - (x0 + 6 * 1.85)) < 0.01);
  check('porte autorisée sur le mur', sim.canPlaceGate(0, snap.x, snap.z));
  check('mais pas une tourelle au même endroit', !sim.canPlace('tourelle', snap.x, snap.z));
  sim.issue({ type: 'place', owner: 0, kind: 'porte', x: snap.x, z: snap.z, ids: [] }); run(sim, 1);
  const gate = sim.buildings.find((b) => b.kind === 'porte');
  check('porte posée dans le mur', !!gate, `${nWalls} poteaux avant, ${sim.buildings.filter((b) => b.kind === 'mur').length} après`);
  let leak = 0;
  for (let t = -9; t <= 9; t += 0.25) { if (Math.abs(t) < BUILDINGS.porte.rayon + 0.1) continue; const c = sim.nav.cell(snap.x + t, z0); if (c >= 0 && !sim.nav.blocked[0][c]) leak++; }
  check('aucun trou entre la porte et le mur', leak === 0, `${leak} cases ouvertes`);
  // Porte large : un mech (unité large) la franchit, l'ennemi non.
  gate!.done = true; gate!.progress = 1;
  check('passage assez large pour un mech', sim.nav.walkable(snap.x, z0, 1, 0) && !sim.nav.walkable(snap.x, z0, 1, 1));
  const mech = sim.spawn('strikerLaser', 0, snap.x + 1, z0 - 7);
  sim.issue({ type: 'move', ids: [mech.id], x: snap.x - 1, z: z0 + 7, formation: 'libre' });
  run(sim, 400);
  check('le Striker traverse la porte', mech.z > z0 + 3, `z ${(mech.z - z0).toFixed(1)} par rapport au mur`);
}
console.log(ok ? 'J15 OK' : 'J15 ECHEC'); if (!ok) process.exit(1);
