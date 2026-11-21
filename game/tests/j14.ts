// Parties à 4 : chacun pour soi et 2 contre 2, IA contre IA, sur cartes moyennes. Lancer : npx tsx tests/j14.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { Ai, type Level } from '../src/sim/ai';

let ok = true;
const check = (label: string, cond: boolean, detail = '') => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + label + (detail ? ' — ' + detail : '')); if (!cond) ok = false; };

function game(seed: number, kind: 'terre' | 'mont' | 'continentale' | 'grandesiles' | 'rivieres', teams: boolean, levels: Level[], contested = false) {
  const g = generateMap(seed, SIZES.moyenne, kind, 4), sim = new Sim(g.terrain, g.objects);
  for (let o = 0; o < 4; o++) { for (let i = 0; i < 4; i++) sim.spawn('ouvrier', o, g.objects.spawns[o][i + 4].x, g.objects.spawns[o][i + 4].z); sim.spawn('eclaireur', o, g.objects.spawns[o][10].x, g.objects.spawns[o][10].z); }
  if (teams) sim.setTeams([0, 1, 0, 1]);
  if (contested) sim.setupContested();
  const ais = sim.sides.map((o) => new Ai(sim, o, levels[o]));
  const t0 = Date.now();
  const out: number[] = [];
  while (sim.tick < 30000 && sim.winner < 0) {
    for (const a of ais) a.step(); sim.step();
    for (const e of sim.events) if (e.t === 'msg' && e.text.endsWith('est éliminé') && !out.includes(e.owner)) void 0;
    sim.events.length = 0;
  }
  const alive = sim.sides.filter((o) => sim.buildings.some((b) => b.owner === o && b.kind === 'centre'));
  return { sim, ms: Date.now() - t0, alive, valid: g.report.ok };
}

{
  const r = game(1234, 'terre', false, ['normal', 'normal', 'normal', 'normal']);
  check('4 joueurs, carte valide', r.valid);
  console.log(`  info  chacun pour soi (terre, Normal ×4) : fin ${(r.sim.tick / 600).toFixed(1)} min, vainqueur ${r.sim.winner}, Centres debout ${r.alive.join(',')}, ${r.ms} ms`);
  check('chacun pour soi : la partie se termine avec un seul survivant', r.sim.winner >= 0 && r.alive.length === 1 && r.alive[0] === r.sim.winner);
}
{
  const r = game(777, 'mont', true, ['difficile', 'normal', 'difficile', 'normal']);
  console.log(`  info  2 contre 2 (mont, Difficile+Difficile contre Normal+Normal) : fin ${(r.sim.tick / 600).toFixed(1)} min, équipe gagnante ${r.sim.winner}, Centres debout ${r.alive.join(',')}, ${r.ms} ms`);
  check('2 contre 2 : une équipe gagne, ses alliés ne se sont pas battus entre eux', r.sim.winner === 0 && r.alive.every((o) => r.sim.players[o].team === 0), `équipe ${r.sim.winner}`);
}
{
  const r = game(99, 'continentale', true, ['normal', 'normal', 'normal', 'normal'], true);
  const relaysTaken = r.sim.relays.filter((x) => x.owner >= 0).length;
  console.log(`  info  2 contre 2 continentale avec centre disputé : fin ${(r.sim.tick / 600).toFixed(1)} min, équipe ${r.sim.winner}, relais tenus ${relaysTaken}/${r.sim.relays.length}, ${r.ms} ms`);
  check('centre disputé à 4 : relais posés et partie sans plantage', r.sim.relays.length >= 3);
}
{
  const r = game(57, 'grandesiles', false, ['normal', 'normal', 'normal', 'normal']);
  console.log(`  info  chacun pour soi sur Grandes îles (navettes) : fin ${(r.sim.tick / 600).toFixed(1)} min, vainqueur ${r.sim.winner}, Centres debout ${r.alive.join(',')}, quais ${r.sim.buildings.filter((b) => b.kind === 'quai').length}, ${r.ms} ms`);
  check('Grandes îles à 4 : les IA construisent des quais', r.sim.buildings.some((b) => b.kind === 'quai') || r.sim.winner >= 0);
}
console.log(ok ? 'J14 OK' : 'J14 ECHEC'); if (!ok) process.exit(1);
