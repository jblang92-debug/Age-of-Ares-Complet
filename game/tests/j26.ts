// Ferme à 4 champs (âge 2), Marché, Temple, Château, passage d'âge avec 2 bâtiments bâtis pendant l'âge, noms par âge.
// Lancer : npx tsx tests/j26.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { BUILDINGS, GAME, nomBat, dispo } from '../src/data/rules';

let ok = true;
const check = (label: string, cond: boolean, detail = '') => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + label + (detail ? ' — ' + detail : '')); if (!cond) ok = false; };
const run = (sim: Sim, n: number) => { for (let i = 0; i < n; i++) { sim.step(); sim.events.length = 0; } };
const g = generateMap(4242, SIZES.moyenne, 'terre', 2), sim = new Sim(g.terrain, g.objects);
const P = sim.players[0], c = sim.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;

check('ferme indisponible à l\'Antiquité', !dispo(BUILDINGS.recycleur, 1) && dispo(BUILDINGS.recycleur, 2));
check('Monastère dès l\'âge 1, renommé ensuite', nomBat('labo', 1) === 'Monastère' && nomBat('labo', 3) === 'Université' && nomBat('labo', 6) === 'Institut stellaire');
check('Port jusqu\'à l\'âge industriel, Quai orbital au galactique', nomBat('quai', 3) === 'Port' && nomBat('quai', 5) === 'Port industriel' && nomBat('quai', 6) === 'Quai orbital');

// Ferme : 4 ouvriers, un par champ, un 5e refusé ; la nourriture arrive.
P.ere = 2; P.bois = P.eau = P.energie = P.minerai = 5000;
let fp: { x: number; z: number } | null = null;
for (let r = 1; r < 4 && !fp; r++) for (const [gx, gz] of [[r, 0], [0, r], [-r, 0], [0, -r], [r, r]]) { const p = sim.farmSnap(0, c.x + gx * Sim.FARM_GRID, c.z + gz * Sim.FARM_GRID); if (sim.canPlace('recycleur', p.x, p.z)) { fp = p; break; } }
check('emplacement de ferme trouvé', !!fp);
const ws = sim.units.filter((u) => u.owner === 0 && u.kind === 'ouvrier').slice(0, 3);
while (ws.length < 5) ws.push(sim.spawn('ouvrier', 0, c.x + 6, c.z + 6));
sim.issue({ type: 'place', owner: 0, kind: 'recycleur', x: fp!.x, z: fp!.z, ids: ws.slice(0, 2).map((u) => u.id) });
run(sim, 900);
const farm = sim.buildings.find((b) => b.kind === 'recycleur' && b.owner === 0)!;
check('ferme bâtie', !!farm && farm.done);
const fields = sim.nodes.filter((n) => n.b === farm.id);
check('4 champs', fields.length === 4);
sim.issue({ type: 'gather', ids: ws.map((u) => u.id), node: fields[0].id }); run(sim, 5);
const onF = new Set(ws.filter((u) => u.job?.t === 'gather' && fields.some((f) => f.id === (u.job as { node: number }).node)).map((u) => (u.job as { node: number }).node));
check('4 ouvriers sur 4 champs différents, le 5e refusé', onF.size === 4 && ws.filter((u) => u.job?.t === 'gather').length === 4, String(onF.size));
const e0 = P.eau; run(sim, 900);
check('la ferme rapporte de la nourriture', P.eau > e0 + 40, `${P.eau - e0}`);
check('maison seule infranchissable', sim.nav.blocked[0][sim.nav.cell(fields[0].x, fields[0].z)] === 0 && sim.nav.blocked[0][sim.nav.cell(farm.x, farm.z)] !== 0);
check('rien ne se bâtit sur les champs', !sim.canPlace('habitat', fields[1].x, fields[1].z));

// Marché.
const m = sim.placeNear('marche', 0, c.x - 14, c.z)!;
const or0 = P.energie, b0 = P.bois;
sim.issue({ type: 'trade', b: m.id, res: 'bois', buy: false }); sim.step();
check('vente de 100 bois contre de l\'or', P.bois === b0 - 100 && P.energie > or0, `${P.energie - or0}`);
const p1 = sim.price(0, 'bois', false);
check('le cours baisse après une vente', p1 < 70, String(p1));
sim.issue({ type: 'trade', b: m.id, res: 'eau', buy: true }); sim.step();
check('achat de nourriture', P.eau > 0);

// Château : +10 population ; Temple : soigne.
const before = P.popCap; const ch = sim.placeNear('chateau', 0, c.x, c.z + 16)!; sim.step(); run(sim, 10);
check('château : +10 population', P.popCap === Math.min(GAME.popMax, before + 10) && !!ch, `${before} -> ${P.popCap}`);
const t = sim.placeNear('temple', 0, c.x, c.z - 16)!;
const hurt = sim.spawn('milicien', 0, t.x + 5, t.z); hurt.hp = 10; run(sim, 30);
check('le temple soigne', hurt.hp > 15, String(hurt.hp));

// Passage d'âge : 2 types bâtis pendant l'âge en cours.
const g2 = generateMap(99, SIZES.moyenne, 'terre', 2), s2 = new Sim(g2.terrain, g2.objects), Q = s2.players[0];
const c2 = s2.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;
Q.eau = Q.bois = Q.energie = Q.minerai = 5000; Q.ere = 2; s2.stats[0].ereT[1] = 0;
s2.placeNear('archerie', 0, c2.x + 15, c2.z);
run(s2, 2);   // ces bâtiments existaient déjà : reculons l'arrivée à l'âge 2
s2.stats[0].ereT[1] = s2.tick + 1; run(s2, 2);
s2.issue({ type: 'age', b: c2.id }); s2.step();
check('bâtiments d\'avant : pas de passage d\'âge', !c2.task && !s2.ageNeed(0).ok);
s2.placeNear('marche', 0, c2.x - 15, c2.z); s2.placeNear('temple', 0, c2.x, c2.z + 15); s2.step();
for (const b of s2.buildings) if (b.kind === 'marche' || b.kind === 'temple') b.doneT = s2.tick;
s2.issue({ type: 'age', b: c2.id }); s2.step();
check('Marché + Temple bâtis pendant l\'âge : passage lancé', !!c2.task, s2.ageNeed(0).done.join(','));
console.log(ok ? 'J26 OK' : 'J26 ÉCHEC'); if (!ok) process.exit(1);
