// IA sur les cartes d'îles : elle construit un quai, une navette, et vient attaquer l'autre île. Lancer : npx tsx tests/j10.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { Ai } from '../src/sim/ai';
let ok = true;
const check = (label: string, cond: boolean, detail = '') => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + label + (detail ? ' — ' + detail : '')); if (!cond) ok = false; };
for (const [kind, seed] of [['grandesiles', 11], ['petitesiles', 23], ['grandesiles', 57]] as const) {
  const g = generateMap(seed, SIZES.petite, kind), sim = new Sim(g.terrain, g.objects);
  const a = new Ai(sim, 0, 'normal'), b = new Ai(sim, 1, 'normal');
  let quai = -1, nav = -1, landed = -1, hits = -1;
  const foe = (o: number) => sim.buildings.find((x) => x.owner !== o && x.kind === 'centre');
  for (let t = 0; t < 15000 && sim.winner < 0; t++) {
    a.step(); b.step(); sim.step();
    for (const e of sim.events) if ((e as any).t === 'hit' && hits < 0) hits = t;
    sim.events.length = 0;
    if (quai < 0 && sim.buildings.some((x) => x.kind === 'quai' && x.done)) quai = t;
    if (nav < 0 && sim.units.some((u) => u.kind === 'navette')) nav = t;
    if (landed < 0) for (const o of [0, 1]) { const f = foe(o); if (f && sim.units.some((u) => u.owner === o && !u.fly && u.kind !== 'ouvrier' && Math.hypot(u.x - f.x, u.z - f.z) < 35)) landed = t; }
  }
  const sec = (t: number) => t < 0 ? 'jamais' : Math.round(t / 10) + ' s';
  console.log(`${kind} graine ${seed} : quai ${sec(quai)}, navette ${sec(nav)}, débarquement chez l'ennemi ${sec(landed)}, fin ${sec(sim.tick)}, vainqueur ${sim.winner}`);
  check(`${kind} ${seed} : l'IA traverse le vide et attaque`, landed > 0);
}
console.log(ok ? 'J10 OK' : 'J10 ECHEC'); if (!ok) process.exit(1);
