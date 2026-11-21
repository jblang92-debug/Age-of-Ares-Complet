// Audit : parties IA contre IA sur toutes les cartes, avec relevé des blocages, erreurs et temps de calcul.
// Lancer : npx tsx tests/audit.ts [filtre]
import { generateMap, SIZES, type MapSize } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { GAME, UNITS } from '../src/data/rules';
import { Ai, type Level } from '../src/sim/ai';
import type { MapKind } from '../src/mapgen/terrain';
type Players = 'duel' | 'ffa' | 'equipes';
const KINDS: MapKind[] = ['terre', 'cotiere', 'continentale', 'mont', 'rivieres', 'grandesiles', 'petitesiles'];
const cases: { kind: MapKind; size: MapSize; players: Players; lv: Level; seed: number }[] = [];
let s = 101;
for (const kind of KINDS) {
  cases.push({ kind, size: 'petite', players: 'duel', lv: 'difficile', seed: s++ * 7919 });
  cases.push({ kind, size: 'grande', players: 'duel', lv: 'normal', seed: s++ * 7919 });
  cases.push({ kind, size: 'moyenne', players: 'ffa', lv: 'difficile', seed: s++ * 7919 });
  cases.push({ kind, size: 'moyenne', players: 'equipes', lv: 'facile', seed: s++ * 7919 });
}
const filt = process.argv[2];
const CAP = 50 * 600;
for (const c of cases) {
  const tag = `${c.kind}/${c.size}/${c.players}/${c.lv}`;
  if (filt && !tag.includes(filt)) continue;
  const nP = c.players === 'duel' ? 2 : 4;
  const g = generateMap(c.seed, SIZES[c.size], c.kind, nP), sim = new Sim(g.terrain, g.objects);
  for (let o = 0; o < g.terrain.starts.length; o++) {
    sim.players[o].faction = (c.seed + o * 3) % GAME.factions.length;
    for (let i = 0; i < GAME.depart.ouvriers; i++) sim.spawn('ouvrier', o, g.objects.spawns[o][i + 4].x, g.objects.spawns[o][i + 4].z);
    sim.spawn('eclaireur', o, g.objects.spawns[o][10].x, g.objects.spawns[o][10].z);
  }
  if (c.players === 'equipes') sim.setTeams([0, 1, 0, 1]);
  const ais = sim.sides.map((o) => new Ai(sim, o, c.lv));
  let err = '', maxStep = 0, sumStep = 0, n = 0, maxUnits = 0;
  const still = new Map<number, { x: number; z: number; t: number }>();
  let stuckWorst = 0, stuckKinds = new Map<string, number>();
  const idleSamples: number[][] = sim.sides.map(() => []);
  const t0 = Date.now();
  try {
    while (sim.winner < 0 && sim.tick < CAP) {
      const a = performance.now();
      for (const ai of ais) ai.step();
      sim.step();
      const d = performance.now() - a; sumStep += d; n++; if (sim.tick > 50 && d > maxStep) maxStep = d;
      sim.events.length = 0;
      maxUnits = Math.max(maxUnits, sim.units.length);
      if (sim.tick % 50 === 0) {
        // Unité qui a un ordre (déplacement ou travail) mais n'a pas bougé depuis 60 s.
        for (const u of sim.units) {
          const busy = !!u.group || (u.job && (u.job as any).phase === 'go');
          const p = still.get(u.id);
          if (!busy || !p || Math.hypot(p.x - u.x, p.z - u.z) > 0.3) { still.set(u.id, { x: u.x, z: u.z, t: sim.tick }); continue; }
          if (sim.tick - p.t >= 600) { stuckKinds.set(u.kind, (stuckKinds.get(u.kind) ?? 0) + 1); still.set(u.id, { x: u.x, z: u.z, t: sim.tick }); stuckWorst++; }
        }
        if (sim.tick % 600 === 0) sim.sides.forEach((o, i) => { const w = sim.units.filter((u) => u.owner === o && u.kind === 'ouvrier'); idleSamples[i].push(w.length ? sim.idleWorkers(o).length / w.length : 0); });
      }
    }
  } catch (e: any) { err = String(e?.stack ?? e).split('\n').slice(0, 3).join(' | '); }
  const P = sim.sides.map((o) => {
    const p = sim.players[o], st = sim.stats[o];
    const fac = Object.entries(st.produitsPar).filter(([k]) => UNITS[k as keyof typeof UNITS]?.faction !== undefined).reduce((a, [, v]) => a + (v as number), 0);
    const idle = idleSamples[sim.sides.indexOf(o)]; const idleAvg = idle.length ? idle.reduce((a, b) => a + b, 0) / idle.length : 0;
    const alive = sim.buildings.some((b) => b.owner === o && b.kind === 'centre');
    return `J${o}:${GAME.factions[p.faction].split(' ').pop()} ère${p.ere} prod${st.produits} fac${fac} tués${st.tues} oisifs${Math.round(idleAvg * 100)}%${alive ? '' : ' ✝'}`;
  });
  console.log(`${tag.padEnd(36)} ${err ? 'ERREUR ' + err : sim.winner >= 0 ? `fin ${(sim.tick / 600).toFixed(1)} min, gagnant équipe ${sim.winner}` : 'PAS DE FIN à 50 min'} | step moy ${(sumStep / n).toFixed(2)} ms max ${maxStep.toFixed(0)} ms | unités max ${maxUnits} | bloqués ${stuckWorst} ${[...stuckKinds].map(([k, v]) => k + ':' + v).join(',')} | ${Math.round((Date.now() - t0) / 1000)} s`);
  console.log('   ' + P.join('  '));
}
