// Âge de la poudre et marine : navires sur l'eau seulement, unités et ordre des âges. Lancer : npx tsx tests/j22.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { GAME, UNITS, dispo } from '../src/data/rules';
let bad = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'ok ' : 'ECHEC ') + m); if (!c) bad++; };
ok(GAME.eres.length === 6 && GAME.eres[2].nom === 'Âge de la poudre', 'six âges, la poudre en troisième');
ok(dispo(UNITS.mousquetaire, 3) && !dispo(UNITS.mousquetaire, 2) && !dispo(UNITS.mousquetaire, 4), 'mousquetaire : âge de la poudre seulement');
ok(UNITS.fantassin.ere === 4 && UNITS.cuirasse.ere === 6, 'âges modernes décalés');
const g = generateMap(777, SIZES.moyenne, 'grandesiles', 2), sim = new Sim(g.terrain, g.objects); sim.setStartAge(3);
const nav = sim.nav, S = nav.size, water: number[] = [];
for (let c = 0; c < S * S; c++) if (!nav.blocked[2][c]) water.push(c);
ok(water.length > 500, `eau navigable : ${water.length} cases`);
const st = g.terrain.starts[0];
const near = water.map((c) => ({ c, d: Math.hypot(nav.cx(c) - st.x, nav.cz(c) - st.z) })).sort((a, b) => a.d - b.d)[0];
const ship = sim.spawn('galion', 0, nav.cx(near.c), nav.cz(near.c));
ok(ship.wide === 2 && nav.walkable(ship.x, ship.z, 2), 'le galion est mis à l\'eau');
// Destination : une case d'eau éloignée, reliée (même étendue d'eau).
const f = nav.field(ship.x, ship.z, 2);
const far = water.filter((c) => f[c] < 1e8).map((c) => ({ c, d: f[c] })).sort((a, b) => b.d - a.d)[Math.floor(water.length / 20)];
sim.issue({ type: 'move', ids: [ship.id], x: nav.cx(far.c), z: nav.cz(far.c), formation: 'libre' });
let dry = 0;
for (let t = 0; t < 2400; t++) { sim.step(); sim.events.length = 0; if (!nav.walkable(ship.x, ship.z, 2)) dry++; }
const d = Math.hypot(ship.x - nav.cx(far.c), ship.z - nav.cz(far.c));
ok(dry === 0, `jamais sur la terre ferme (${dry} ticks)`);
ok(d < 8, `arrivé par l'eau (reste ${d.toFixed(1)} m, trajet ${far.d.toFixed(0)} m)`);
// Ordre vers la terre : le navire reste au bord de l'eau.
sim.issue({ type: 'move', ids: [ship.id], x: st.x, z: st.z, formation: 'libre' });
for (let t = 0; t < 600; t++) { sim.step(); sim.events.length = 0; if (!nav.walkable(ship.x, ship.z, 2)) dry++; }
ok(dry === 0, 'un ordre vers la terre ne l\'échoue pas');
console.log(bad ? `${bad} ÉCHECS` : 'TOUT VERT'); process.exit(bad ? 1 : 0);
