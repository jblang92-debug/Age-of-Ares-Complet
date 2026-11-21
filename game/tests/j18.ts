// Défis : mise en place, vagues, victoire / défaite. Lancer : npx tsx tests/j18.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { GAME } from '../src/data/rules';
import { Ai } from '../src/sim/ai';
import { Scenario, SCEN_MAP, type ScenId } from '../src/sim/scenario';
let ok = true;
const check = (label: string, cond: boolean, detail = '') => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + label + (detail ? ' — ' + detail : '')); if (!cond) ok = false; };
function play(id: ScenId, me: 'rien' | 'ia' | 'attaque', maxTicks = 9000) {
  const g = generateMap(SCEN_MAP.seed, SIZES[SCEN_MAP.size as 'petite'], 'terre', 2), sim = new Sim(g.terrain, g.objects);
  for (let o = 0; o < 2; o++) { for (let i = 0; i < GAME.depart.ouvriers; i++) sim.spawn('ouvrier', o, g.objects.spawns[o][i + 4].x, g.objects.spawns[o][i + 4].z); sim.spawn('eclaireur', o, g.objects.spawns[o][10].x, g.objects.spawns[o][10].z); }
  const sc = new Scenario(sim, id); sc.setup();
  const ais = [sc.info.ia ? new Ai(sim, 1, sc.info.ia) : null, me === 'ia' ? new Ai(sim, 0, 'difficile') : null].filter(Boolean) as Ai[];
  if (me === 'attaque') { const c = sim.buildings.find((b) => b.owner === 1 && b.kind === 'centre')!; sim.issue({ type: 'amove', ids: sim.units.filter((u) => u.owner === 0 && u.kind !== 'ouvrier' && u.kind !== 'eclaireur').map((u) => u.id), x: c.x, z: c.z, formation: 'libre' }); }
  let title = '', waves = 0;
  while (sim.winner < 0 && sim.tick < maxTicks) { sc.step(); for (const a of ais) a.step(); sim.step(); for (const e of sim.events) { if (e.t === 'over') title = e.title ?? (e.winner === 0 ? 'VICTOIRE' : 'DÉFAITE'); if (e.t === 'msg' && e.text.startsWith('Vague')) waves++; } sim.events.length = 0; }
  return { won: sim.winner === sim.players[0].team, title, t: (sim.tick / 600).toFixed(1), waves };
}
const d0 = play('defense', 'rien'); check('Défense sans rien faire : les vagues arrivent et la partie se termine', d0.waves >= 2 && d0.title !== '', `${d0.title} à ${d0.t} min, ${d0.waves} vagues`);
const d1 = play('defense', 'ia'); check('Défense jouée par l\'IA Difficile', true, `${d1.title} à ${d1.t} min, ${d1.waves} vagues`);
const r0 = play('raid', 'attaque'); check('Raid : attaque directe sur le Centre', r0.title !== '', `${r0.title} à ${r0.t} min`);
const r1 = play('raid', 'rien'); check('Raid sans bouger : défaite au temps', !r1.won && r1.title.includes('TEMPS'), `${r1.title} à ${r1.t} min`);
const c1 = play('course', 'ia', 9000); check('Course : l\'IA Difficile atteint l\'Orbitale', true, `${c1.title} à ${c1.t} min`);
const t0 = play('tuto', 'rien', 1200); check('Tutoriel : la partie tourne sans fin imposée', t0.title === '', `${t0.t} min`);
console.log(ok ? '\nTOUT VERT' : '\nÉCHECS'); process.exit(ok ? 0 : 1);
