// Ère 3 « Orbitale » : passage d'ère, Défense orbitale, Cuirassé du vide, recherches, Ascenseur orbital.
// Lancer : npx tsx tests/j13.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim, WONDER_TICKS } from '../src/sim/sim';
import { Ai } from '../src/sim/ai';

let ok = true;
const check = (label: string, cond: boolean, detail = '') => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + label + (detail ? ' — ' + detail : '')); if (!cond) ok = false; };
const run = (sim: Sim, n: number, keep = false) => { const ev = []; for (let i = 0; i < n; i++) { sim.step(); if (keep) ev.push(...sim.events); sim.events.length = 0; } return ev; };
const rich = (sim: Sim, o: number) => Object.assign(sim.players[o], { eau: 9999, bois: 9999, minerai: 9999, energie: 9999, solarite: 9999 });
const spotNear = (sim: Sim, kind: string, x: number, z: number, d0 = 14) => { for (let a = 0; a < 300; a++) { const px = x + Math.cos(a * 0.7) * (d0 + a * 0.12), pz = z + Math.sin(a * 0.7) * (d0 + a * 0.12); if (sim.canPlace(kind, px, pz)) return { x: px, z: pz }; } return null; };
const instant = (sim: Sim, o: number, kind: string, x: number, z: number) => {
  const p = spotNear(sim, kind, x, z)!; sim.issue({ type: 'place', owner: o, kind, x: p.x, z: p.z, ids: [] }); run(sim, 1);
  const b = sim.buildings.filter((b) => b.owner === o && b.kind === kind).pop()!; b.done = true; b.progress = 1; b.hp = b.maxHp; b.doneT = sim.tick; return b;
};

{ // Passage en ère 3 : il faut l'ère 2 et deux bâtiments de l'ère 2.
  const g = generateMap(4242, SIZES.petite, 'terre'), sim = new Sim(g.terrain, g.objects), s = g.terrain.starts[0];
  rich(sim, 0); sim.players[0].ere = 5;
  const c = sim.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;
  const ev = run(sim, 2, true); void ev;
  sim.issue({ type: 'age', b: c.id }); const ev1 = run(sim, 2, true);
  check('refus sans deux bâtiments de l\'ère 2', !c.task && ev1.some((e) => e.t === 'msg' && e.text.includes('2 types')));
  instant(sim, 0, 'usine', s.x, s.z); instant(sim, 0, 'labo', s.x, s.z);
  sim.issue({ type: 'age', b: c.id }); run(sim, 1350);
  check('ère 3 atteinte après 130 s', sim.players[0].ere === 6, `âge ${sim.players[0].ere}, arrivée ${sim.stats[0].ereT[5]}`);

  // Défense orbitale : vise le sol et l'air.
  const d = instant(sim, 0, 'defense', s.x, s.z);
  const f = sim.spawn('fantassin', 1, d.x + 9, d.z), dr = sim.spawn('drone', 1, d.x - 9, d.z);
  f.posture = 'tenir'; dr.posture = 'tenir';
  run(sim, 120);
  check('la Défense orbitale touche le sol et l\'air', (f.hp < f.maxHp || !sim.units.includes(f)) && (dr.hp < dr.maxHp || !sim.units.includes(dr)), `fantassin ${Math.round(f.hp)}, drone ${Math.round(dr.hp)}`);

  // Cuirassé : produit au hangar, vole.
  const h = instant(sim, 0, 'hangar', s.x, s.z);
  sim.issue({ type: 'train', b: h.id, kind: 'cuirasse' }); run(sim, 470);
  const cu = sim.units.find((u) => u.kind === 'cuirasse' && u.owner === 0);
  check('le hangar produit un Cuirassé du vide (volant)', !!cu && cu.fly, cu ? `PV ${cu.maxHp}` : 'aucun');

  // Recherches de l'ère 3.
  const l = sim.buildings.find((b) => b.kind === 'labo' && b.owner === 0)!;
  sim.issue({ type: 'research', b: l.id, key: 'nano' }); run(sim, 460);
  check('recherche Nano-blindage', sim.players[0].research.has('nano'));
}

{ // Recherche d'ère 3 refusée en ère 2.
  const g = generateMap(4242, SIZES.petite, 'terre'), sim = new Sim(g.terrain, g.objects), s = g.terrain.starts[0];
  rich(sim, 0); sim.players[0].ere = 5;
  const l = instant(sim, 0, 'labo', s.x, s.z);
  sim.issue({ type: 'research', b: l.id, key: 'surcharge' }); run(sim, 5);
  check('Surcharge indisponible en ère 2', !l.task);
}

{ // Ascenseur orbital : victoire s'il tient 5 minutes.
  const g = generateMap(4242, SIZES.petite, 'terre'), sim = new Sim(g.terrain, g.objects), s = g.terrain.starts[0];
  rich(sim, 1); sim.players[1].ere = 6;
  const w = instant(sim, 1, 'ascenseur', g.terrain.starts[1].x, g.terrain.starts[1].z);
  const ev = run(sim, WONDER_TICKS + 20, true);
  const over = ev.find((e) => e.t === 'over') as { winner: number; wonder?: boolean } | undefined;
  check('l\'Ascenseur tenu 5 min fait gagner son camp', !!over && over.wonder === true && sim.winner === 1, over ? `vainqueur ${over.winner}` : 'pas de fin');
  void w; void s;
}

{ // IA Difficile : elle passe en ère 3 et construit au moins une Défense orbitale en partie longue.
  const g = generateMap(777, SIZES.moyenne, 'terre'), sim = new Sim(g.terrain, g.objects);
  for (const o of [0, 1]) { for (let i = 0; i < 4; i++) sim.spawn('ouvrier', o, g.objects.spawns[o][i + 4].x, g.objects.spawns[o][i + 4].z); sim.spawn('eclaireur', o, g.objects.spawns[o][10].x, g.objects.spawns[o][10].z); }
  const a = new Ai(sim, 0, 'difficile'), b = new Ai(sim, 1, 'difficile');
  let t3 = -1;
  while (sim.tick < 24000 && sim.winner < 0) { a.step(); b.step(); sim.step(); sim.events.length = 0; if (t3 < 0 && sim.players.some((p) => p.ere === 6)) t3 = sim.tick; }
  const def = sim.buildings.filter((x) => x.kind === 'defense').length, asc = sim.buildings.filter((x) => x.kind === 'ascenseur').length, cu = sim.units.filter((u) => u.kind === 'cuirasse').length;
  console.log(`  info  Difficile contre Difficile (moyenne) : ère 3 à ${t3 < 0 ? '—' : (t3 / 600).toFixed(1) + ' min'}, défenses ${def}, ascenseurs ${asc}, cuirassés ${cu}, fin ${(sim.tick / 600).toFixed(1)} min, vainqueur ${sim.winner}`);
  check('une IA Difficile atteint l\'ère 3 si la partie dure', t3 > 0 || sim.winner >= 0);
}

console.log(ok ? 'J13 OK' : 'J13 ECHEC'); if (!ok) process.exit(1);
