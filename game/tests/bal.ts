// Équilibrage : duels à coût égal entre unités de combat. Lancer : npx tsx tests/bal.ts [budget]
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim, type UnitKind } from '../src/sim/sim';
import { UNITS } from '../src/data/rules';

const BUDGET = +(process.argv[2] ?? 1500);
const W: Record<string, number> = { eau: 1, minerai: 1, energie: 1.25, solarite: 1.6 };
export const value = (k: string) => Object.entries(UNITS[k].cout).reduce((a, [r, v]) => a + (W[r] ?? 1) * (v as number), 0);
const g = generateMap(777, SIZES.moyenne, 'terre');
// Une zone dégagée au milieu de la carte.
const probe = new Sim(g.terrain, g.objects);
let X = 0, Z = 0;
for (let a = 0; a < 4000; a++) {
  const px = Math.cos(a * 0.7) * a * 0.02, pz = Math.sin(a * 0.7) * a * 0.02; let ok = true;
  for (let dx = -18; dx <= 18 && ok; dx += 3) for (let dz = -8; dz <= 8 && ok; dz += 3) if (!probe.nav.walkable(px + dx, pz + dz, 1)) ok = false;
  if (ok && !probe.buildings.some((b) => Math.hypot(b.x - px, b.z - pz) < 40)) { X = px; Z = pz; break; }
}
const KINDS = Object.keys(UNITS).filter((k) => UNITS[k].degats > 0 && !['ouvrier', 'ingenieur', 'navette', 'eclaireur'].includes(k)) as UnitKind[];
function fight(a: UnitKind, b: UnitKind): number {
  const sim = new Sim(g.terrain, g.objects);
  for (const p of sim.players) p.ere = 5;
  const na = Math.max(1, Math.round(BUDGET / value(a))), nb = Math.max(1, Math.round(BUDGET / value(b)));
  const A = [], B = [];
  for (let i = 0; i < na; i++) A.push(sim.spawn(a, 0, X - 14 + (i % 3) * 1.6, Z - 4 + Math.floor(i / 3) * 1.6));
  for (let i = 0; i < nb; i++) B.push(sim.spawn(b, 1, X + 14 - (i % 3) * 1.6, Z - 4 + Math.floor(i / 3) * 1.6));
  sim.issue({ type: 'amove', ids: A.map((u) => u.id), x: X + 20, z: Z, formation: 'libre' });
  sim.issue({ type: 'amove', ids: B.map((u) => u.id), x: X - 20, z: Z, formation: 'libre' });
  for (let t = 0; t < 1800; t++) { sim.step(); sim.events.length = 0; if (!A.some((u) => u.hp > 0) || !B.some((u) => u.hp > 0)) break; }
  const left = (us: { hp: number; maxHp: number; kind: string }[], n: number) => us.reduce((s, u) => s + Math.max(0, u.hp) / u.maxHp, 0) / n;
  return left(A, na) - left(B, nb);   // > 0 : A gagne (part de l'armée restante)
}
const res: Record<string, Record<string, number>> = {};
for (const a of KINDS) { res[a] = {}; for (const b of KINDS) if (a !== b) res[a][b] = b in (res[b] ?? {}) && a in res[b] ? -res[b][a] : fight(a, b); }
const score = KINDS.map((k) => ({ k, s: Object.values(res[k]).reduce((x, y) => x + y, 0) / (KINDS.length - 1), w: Object.values(res[k]).filter((v) => v > 0.05).length }));
score.sort((p, q) => q.s - p.s);
console.log(`Budget ${BUDGET} — score moyen (part d'armée restante, de -1 à +1) et victoires sur ${KINDS.length - 1}`);
for (const { k, s, w } of score) console.log(`${k.padEnd(16)} ${s.toFixed(2).padStart(6)}  ${String(w).padStart(2)}  coût ${value(k).toFixed(0).padStart(4)}  ${UNITS[k].faction ?? '-'}`);
import fs from 'fs'; fs.writeFileSync('/home/claude/bal/res_' + BUDGET + '.json', JSON.stringify(res));
