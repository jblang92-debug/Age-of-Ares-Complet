// Îles : l'IA dont l'île est épuisée part exploiter une île voisine (navette, dépôt, récolte sur place).
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { GAME } from '../src/data/rules';
import { Ai } from '../src/sim/ai';
let bad = 0; const ok = (c: boolean, m: string) => { console.log((c ? 'ok ' : 'ECHEC ') + m); if (!c) bad++; };
const g = generateMap(777, SIZES.moyenne, 'grandesiles', 2), sim = new Sim(g.terrain, g.objects);
for (let o = 0; o < 2; o++) for (let i = 0; i < GAME.depart.ouvriers; i++) sim.spawn('ouvrier', o, g.objects.spawns[o][i + 4].x, g.objects.spawns[o][i + 4].z);
const ai = new Ai(sim, 0, 'normal'); const A: any = ai;
const c0 = sim.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;
const home = A.regionAt(c0.x, c0.z);
// Île de départ presque vide : 6 gisements seulement.
const homeNodes = sim.nodes.filter((n) => A.regionAt(n.x, n.z) === home).sort((a, b) => Math.hypot(a.x - c0.x, a.z - c0.z) - Math.hypot(b.x - c0.x, b.z - c0.z));
let kept = { glace: 0, minerai: 0 } as any;
for (const n of homeNodes) { if ((n.kind === 'glace' || n.kind === 'minerai') && kept[n.kind] < 3) { kept[n.kind]++; n.amount = 400; } else n.amount = 0; }
sim.players[0].eau += 800; sim.players[0].minerai += 800; sim.players[0].energie += 200;
while (sim.tick < 600 * 14) { ai.step(); sim.step(); sim.events.length = 0; }
const away = sim.units.filter((u) => u.owner === 0 && u.kind === 'ouvrier' && A.regionAt(u.x, u.z) !== home);
ok(!!A.colony, 'une île voisine a été choisie');
ok(away.length >= 2, `ouvriers transportés sur la colonie : ${away.length}`);
ok(sim.buildings.some((b) => b.owner === 0 && (b.kind === 'stationEau' || b.kind === 'depotMinier') && A.regionAt(b.x, b.z) !== home), 'un dépôt construit sur la colonie');
ok(away.some((u) => u.job?.t === 'gather' && u.carry > 0 || u.job?.t === 'gather'), 'des ouvriers récoltent sur la colonie');
console.log(bad ? `${bad} ÉCHECS` : 'TOUT VERT'); process.exit(bad ? 1 : 0);
