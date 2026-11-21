// Pêche, galion de transport et marine de l'IA. Lancer : npx tsx tests/j23.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { Ai } from '../src/sim/ai';
import { GAME } from '../src/data/rules';
let bad = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'ok ' : 'ECHEC ') + m); if (!c) bad++; };
const g = generateMap(777, SIZES.moyenne, 'grandesiles', 2), sim = new Sim(g.terrain, g.objects); sim.setStartAge(3);
const fish = sim.nodes.filter((n) => n.kind === 'poisson');
ok(fish.length >= 8, `bancs de poissons : ${fish.length} nœuds`);
const P = sim.players[0]; P.bois = P.eau = P.energie = P.minerai = 5000;
// Port au bord de l'eau près de la base.
const st = g.terrain.starts[0]; let port = null as null | { x: number; z: number };
for (let r = 6; r < 60 && !port; r += 2) for (let a = 0; a < 6.28 && !port; a += 0.2) { const x = st.x + Math.cos(a) * r, z = st.z + Math.sin(a) * r; if (sim.canPlace('quai', x, z)) port = { x, z }; }
ok(!!port, 'emplacement de Port trouvé');
const q = sim.addBuilding('quai', 0, port!.x, port!.z, true);
const near = fish.sort((a, b) => Math.hypot(a.x - q.x, a.z - q.z) - Math.hypot(b.x - q.x, b.z - q.z))[0];
const c = sim.nav.nearestFree(q.x, q.z, 2, undefined, undefined, 30);
const boat = sim.spawn('pecheur', 0, sim.nav.cx(c), sim.nav.cz(c));
sim.issue({ type: 'gather', ids: [boat.id], node: near.id });
const food0 = P.eau;
for (let t = 0; t < 3000; t++) { sim.step(); sim.events.length = 0; }
ok(P.eau > food0 + 40, `le bateau de pêche rapporte de la nourriture (+${Math.round(P.eau - food0)}, banc à ${Math.round(Math.hypot(near.x - q.x, near.z - q.z))} m)`);
// Galion : embarque trois miliciens au bord de l'eau, les débarque sur l'île d'en face.
const gal = sim.spawn('galion', 0, sim.nav.cx(c), sim.nav.cz(c));
const lc = sim.nav.nearestFree(q.x, q.z, 0, undefined, undefined, 12);
const men = [0, 1, 2].map(() => sim.spawn('milicien', 0, sim.nav.cx(lc), sim.nav.cz(lc)));
sim.issue({ type: 'load', ids: men.map((u) => u.id), navette: gal.id });
for (let t = 0; t < 600 && gal.cargo.length < 3; t++) { sim.step(); sim.events.length = 0; }
ok(gal.cargo.length === 3, `embarquement dans le galion (${gal.cargo.length}/3)`);
const foe = g.terrain.starts[1];
sim.issue({ type: 'unload', id: gal.id, x: foe.x, z: foe.z });
for (let t = 0; t < 4000 && gal.cargo.length; t++) { sim.step(); sim.events.length = 0; }
const landed = men.filter((u) => sim.units.includes(u));

ok(!gal.cargo.length && landed.length === 3, `débarquement (${landed.length} à terre)`);
ok(landed.every((u) => sim.nav.region[sim.nav.cell(u.x, u.z)] === sim.nav.region[sim.nav.nearestFree(foe.x, foe.z, 0)]), 'les troupes sont sur l\'île ennemie');
// IA sur carte côtière depuis l'Antiquité : Port, pêche et flotte.
const g2 = generateMap(4242, SIZES.moyenne, 'cotiere', 2), s2 = new Sim(g2.terrain, g2.objects);
for (const o of [0, 1]) { for (let i = 0; i < GAME.depart.ouvriers; i++) s2.spawn('ouvrier', o, g2.objects.spawns[o][i + 4].x, g2.objects.spawns[o][i + 4].z); }
s2.setStartAge(1);
const ais = [new Ai(s2, 0, 'difficile'), new Ai(s2, 1, 'normal')];
let maxFish = 0, maxNavy = 0;
for (let t = 0; t < 600 * 30 && s2.winner < 0; t++) { for (const a of ais) a.step(); s2.step(); s2.events.length = 0;
  if (t % 300 === 0) { maxFish = Math.max(maxFish, s2.units.filter((u) => u.kind === 'pecheur').length); maxNavy = Math.max(maxNavy, s2.units.filter((u) => u.kind === 'galere' || u.kind === 'galion').length); } }
console.log(`IA côtière : ${maxFish} bateaux de pêche, ${maxNavy} navires de guerre, ports ${s2.buildings.filter((b) => b.kind === 'quai').length}, nourriture pêchée ${s2.stats.map((x) => x.rec.eau).join('/')}`);
ok(maxFish >= 1, 'l\'IA pêche sur une carte côtière');
// IA sur Grandes îles depuis l'Antiquité : les galions transportent des troupes.
{
  const g3 = generateMap(4242, SIZES.moyenne, 'grandesiles', 2), s3 = new Sim(g3.terrain, g3.objects);
  for (const o of [0, 1]) { for (let i = 0; i < GAME.depart.ouvriers; i++) s3.spawn('ouvrier', o, g3.objects.spawns[o][i + 4].x, g3.objects.spawns[o][i + 4].z); }
  s3.setStartAge(1);
  const a3 = [new Ai(s3, 0, 'difficile'), new Ai(s3, 1, 'normal')];
  let cargo = 0, fights = 0;
  for (let t = 0; t < 600 * 36 && s3.winner < 0; t++) { for (const a of a3) a.step(); s3.step();
    for (const e of s3.events) if (e.t === 'shot' && (e.kind === 'galere' || e.kind === 'galion')) fights++;
    s3.events.length = 0; for (const u of s3.units) if (u.kind === 'galion') cargo = Math.max(cargo, u.cargo.length); }
  console.log(`Grandes îles : galion chargé jusqu'à ${cargo} unités, ${fights} tirs de navires`);
  ok(cargo >= 3, 'l\'IA transporte des troupes en galion');
  ok(fights > 20, 'les flottes se battent');
}
console.log(bad ? `${bad} ÉCHECS` : 'TOUT VERT'); process.exit(bad ? 1 : 0);
