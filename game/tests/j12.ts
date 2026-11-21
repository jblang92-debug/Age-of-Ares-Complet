// Étape 4-5-7-9 : réparation, capture, navette par places, transport « Transporter ici », doctrines, mode Blitz.
// Lancer : npx tsx tests/j12.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';

let ok = true;
const check = (label: string, cond: boolean, detail = '') => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + label + (detail ? ' — ' + detail : '')); if (!cond) ok = false; };
const run = (sim: Sim, n: number, keep = false) => { const ev = []; for (let i = 0; i < n; i++) { sim.step(); if (keep) ev.push(...sim.events); sim.events.length = 0; } return ev; };
const fresh = (kind: Parameters<typeof generateMap>[2] = 'terre', seed = 4242) => { const g = generateMap(seed, SIZES.petite, kind); return { g, sim: new Sim(g.terrain, g.objects) }; };

{ // Réparation : un ingénieur répare plus vite qu'un ouvrier.
  const { g, sim } = fresh(), s = g.terrain.starts[0];
  const c = sim.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;
  c.hp = c.maxHp - 600;
  const eng = sim.spawn('ingenieur', 0, s.x + 8, s.z + 8);
  sim.issue({ type: 'repair', ids: [eng.id], b: c.id }); run(sim, 200);
  const gainE = c.hp - (c.maxHp - 600);
  c.hp = c.maxHp - 600;
  const w = sim.spawn('ouvrier', 0, s.x - 8, s.z + 8);
  sim.issue({ type: 'stop', ids: [eng.id] }); sim.issue({ type: 'repair', ids: [w.id], b: c.id }); run(sim, 200);
  const gainW = c.hp - (c.maxHp - 600);
  check('un ingénieur répare le Centre', gainE > 150, `+${Math.round(gainE)} PV en 20 s`);
  check('un ouvrier répare aussi, plus lentement', gainW > 40 && gainW < gainE, `+${Math.round(gainW)} PV en 20 s`);
}

{ // Capture : bâtiment ennemi sous 30 % de vie.
  const { g, sim } = fresh(), s = g.terrain.starts[0];
  sim.players[1].minerai = 999; sim.players[1].eau = 999; sim.players[1].energie = 999;
  let spot: { x: number; z: number } | null = null;
  for (let a = 0; a < 80 && !spot; a++) { const x = s.x + Math.cos(a) * (20 + a * 0.3), z = s.z + Math.sin(a) * (20 + a * 0.3); if (sim.canPlace('caserne', x, z)) spot = { x, z }; }
  sim.issue({ type: 'place', owner: 1, kind: 'caserne', x: spot!.x, z: spot!.z, ids: [] }); run(sim, 2);
  const b = sim.buildings.find((x) => x.owner === 1 && x.kind === 'caserne')!;
  b.done = true; b.progress = 1; b.hp = b.maxHp * 0.6;
  const eng = sim.spawn('ingenieur', 0, spot!.x + 9, spot!.z);
  sim.issue({ type: 'capture', ids: [eng.id], b: b.id }); run(sim, 120);
  check('pas de capture au-dessus de 30 % de vie', b.owner === 1);
  b.hp = b.maxHp * 0.25;
  sim.issue({ type: 'capture', ids: [eng.id], b: b.id }); run(sim, 200);
  check('capture sous 30 % : la caserne change de camp', b.owner === 0, `propriétaire ${b.owner}`);
}

{ // Places dans la navette : 3 par véhicule lourd, 2 par éclaireur, 1 par fantassin ; 8 places (+2 Aéronavale).
  const { g, sim } = fresh('continentale'), s = g.terrain.starts[0];
  const nv = sim.spawn('navette', 0, s.x, s.z + 10);
  const tanks = [0, 1, 2].map((i) => sim.spawn('blinde', 0, s.x - 6 + i * 6, s.z + 16));
  sim.issue({ type: 'load', ids: tanks.map((u) => u.id), navette: nv.id }); run(sim, 600);
  check('8 places : 2 blindés sur 3 embarquent', nv.cargo.length === 2, `${nv.cargo.length} à bord, ${sim.navUsed(nv)}/${sim.navCap(0)} places`);
  sim.players[0].doctrine = 'aeronavale';
  check('doctrine Aéronavale : 10 places', sim.navCap(0) === 10);
  sim.issue({ type: 'load', ids: [tanks[2].id], navette: nv.id }); run(sim, 400);
  check('avec 10 places, le 3e blindé monte (9/10)', nv.cargo.length === 3, `${nv.cargo.length} à bord`);
}

{ // Transport : ordre « ferry » vers une autre île, débarquement automatique.
  const { g, sim } = fresh('grandesiles', 57), s = g.terrain.starts[0], t = g.terrain.starts[1];
  const nv = sim.spawn('navette', 0, s.x, s.z + 10);
  const crew = [0, 1, 2, 3].map((i) => sim.spawn('fantassin', 0, s.x - 4 + i * 2.5, s.z + 15));
  const dx = (s.x + t.x) / 2 + (t.x - s.x) * 0.25, dz = (s.z + t.z) / 2 + (t.z - s.z) * 0.25;
  let dest: { x: number; z: number } | null = null;
  for (let a = 0; a < 200 && !dest; a++) { const x = dx + Math.cos(a) * a * 0.3, z = dz + Math.sin(a) * a * 0.3; const c = sim.nav.nearestFree(x, z, 0, undefined, undefined, 1); if (c >= 0 && sim.nav.region[c] !== sim.nav.region[sim.nav.nearestFree(s.x, s.z + 15, 0, undefined, undefined, 3)]) dest = { x, z }; }
  check('il existe une autre île', !!dest);
  if (dest) {
    sim.issue({ type: 'ferry', ids: crew.map((u) => u.id), navette: nv.id, x: dest.x, z: dest.z }); run(sim, 1500);
    const there = crew.filter((u) => sim.units.includes(u) && Math.hypot(u.x - dest!.x, u.z - dest!.z) < 14);
    check('la navette emmène et dépose les fantassins', there.length === 4 && nv.cargo.length === 0, `${there.length}/4 à destination, ${nv.cargo.length} encore à bord`);
  }
}

{ // Doctrines : coûts et récolte.
  const { sim } = fresh();
  const base = sim.buildCost(0, 'caserne');
  sim.players[0].doctrine = 'industrielle';
  check('Industrielle : bâtiments -10 % de minerai', (sim.buildCost(0, 'caserne').minerai ?? 0) < (base.minerai ?? 0), `${base.minerai} → ${sim.buildCost(0, 'caserne').minerai}`);
  sim.players[0].research.add('reseau');
  check('Réseau énergétique : -20 % d\'énergie', !base.energie || (sim.buildCost(0, 'caserne').energie ?? 0) < base.energie);
}

{ // Blitz : la partie s'arrête au temps prévu, le meilleur score gagne.
  const { sim } = fresh();
  sim.blitzEnd = 300; sim.stats[1].tues = 4;
  const ev = run(sim, 320, true);
  const over = ev.find((e) => e.t === 'over') as { t: 'over'; winner: number; blitz?: boolean } | undefined;
  check('Blitz : fin de partie au temps limite', !!over && !!over.blitz && sim.winner === 1, `vainqueur ${sim.winner}, score ${sim.score(0)} – ${sim.score(1)}`);
}

{ // Tempêtes : calendrier fixe, événements, tourelles coupées.
  const { g, sim } = fresh(), s = g.terrain.starts[0];
  sim.storms = true;
  const ev = run(sim, 2460, true);
  const warn = ev.filter((e) => e.t === 'msg' && e.owner === 0 && e.text.startsWith('Tempête')).length;
  const on = ev.some((e) => e.t === 'storm' && e.on);
  check('tempête : alerte 15 s avant puis début vers 4 min', warn === 1 && on && sim.storm, `alerte ${warn}, en cours ${sim.storm}`);
  sim.players[0].minerai = 999; sim.players[0].eau = 999; sim.players[0].energie = 999;
  let spot: { x: number; z: number } | null = null;
  for (let a = 0; a < 80 && !spot; a++) { const x = s.x + Math.cos(a) * (14 + a * 0.2), z = s.z + Math.sin(a) * (14 + a * 0.2); if (sim.canPlace('tourelle', x, z)) spot = { x, z }; }
  sim.issue({ type: 'place', owner: 0, kind: 'tourelle', x: spot!.x, z: spot!.z, ids: [] }); run(sim, 2);
  const t = sim.buildings.find((b) => b.kind === 'tourelle')!; t.done = true; t.progress = 1; t.hp = t.maxHp;
  const foe = sim.spawn('fantassin', 1, spot!.x + 4, spot!.z); foe.posture = 'tenir';
  const hp0 = foe.hp; run(sim, 100);
  check('pendant la tempête, la tourelle ne tire pas', foe.hp === hp0, `PV ${hp0} → ${Math.round(foe.hp)}`);
  run(sim, 400);
  check('après la tempête, elle tire de nouveau', !sim.storm && (foe.hp < hp0 || !sim.units.includes(foe)));
}

{ // Vétérance : un fantassin qui élimine 2 ennemis gagne une étoile (+10 % PV).
  const { g, sim } = fresh(), s = g.terrain.starts[0];
  const hero = sim.spawn('fantassin', 0, s.x + 20, s.z + 20); hero.maxHp = hero.hp = 9999;
  const hp0 = 0;
  for (let k = 0; k < 2; k++) { const v = sim.spawn('ouvrier', 1, hero.x + 2, hero.z); v.hp = 1; sim.issue({ type: 'attack', ids: [hero.id], unit: v.id, b: -1 }); run(sim, 40); }
  check('vétérance : 1 étoile après 2 éliminations', hero.vet === 1 && hero.xp === 2 && sim.stats[0].promotions === 1, `étoiles ${hero.vet}, éliminations ${hero.xp}`);
  void hp0;
}

{ // Centre disputé : relais, sentinelles, capsules.
  const { sim } = fresh();
  sim.setupContested();
  const sent = sim.buildings.filter((b) => b.kind === 'sentinelle');
  check('centre disputé : relais et sentinelles posés', sim.relays.length >= 1 && sent.length >= 1 && sim.players[sim.players.length - 1].neutral === true, `${sim.relays.length} relais, ${sent.length} sentinelles`);
  const r = sim.relays[0];
  const guards = [0, 1, 2].map((i) => sim.spawn('fantassin', 0, r.x + i - 1, r.z + 1));
  run(sim, 170);
  check('relais capturé en ~15 s par une équipe seule', r.owner === 0, `propriétaire ${r.owner}, capture ${Math.round(r.cap)}`);
  const m0 = sim.players[0].minerai; run(sim, 100);
  check('le relais rapporte du minerai', sim.players[0].minerai > m0 + 10, `${Math.round(m0)} → ${Math.round(sim.players[0].minerai)}`);
  const foe = [0, 1, 2, 3].map((i) => sim.spawn('fantassin', 1, r.x + i - 1.5, r.z - 1)); void foe;
  run(sim, 2);
  const capt = r.owner;
  check('relais contesté : il ne change pas de main tant que les deux camps y sont', capt === 0);
  // Capsule : tombe à 2 min ; on pose un ouvrier dessus.
  run(sim, Math.max(0, 1210 - sim.tick), false);
  const cp = sim.capsules[0];
  check('une capsule tombe à 2 min', !!cp, cp ? `en ${Math.round(cp.x)}, ${Math.round(cp.z)}` : 'aucune');
  if (cp) { const w = sim.spawn('ouvrier', 1, cp.x, cp.z); const e0 = sim.players[1].eau; run(sim, 60); check('la capsule est ramassée', sim.capsules.length === 0 && sim.players[1].eau >= e0 + 150 || !sim.units.includes(w), `eau ${Math.round(e0)} → ${Math.round(sim.players[1].eau)}`); }
  void guards;
}

console.log(ok ? 'J12 OK' : 'J12 ECHEC'); if (!ok) process.exit(1);
