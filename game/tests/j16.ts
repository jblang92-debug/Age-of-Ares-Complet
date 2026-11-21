// Salle d'armes, Atelier mécanique et leurs unités.
// Lancer : npx tsx tests/j16.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim, type UnitKind } from '../src/sim/sim';
import { UNITS } from '../src/data/rules';
import { Ai } from '../src/sim/ai';

let ok = true;
const check = (label: string, cond: boolean, detail = '') => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + label + (detail ? ' — ' + detail : '')); if (!cond) ok = false; };
const run = (sim: Sim, n: number) => { for (let i = 0; i < n; i++) { sim.step(); sim.events.length = 0; } };
const g = generateMap(4242, SIZES.petite, 'terre');
const NEW: UnitKind[] = ['lame', 'marteleur', 'sabreur', 'aether', 'araignee', 'araigneeCanon', 'cogneur', 'strikerLaser', 'strikerMissiles', 'strikerAssaut'];
{ // Production : chaque bâtiment fabrique ses unités, selon l'ère.
  const sim = new Sim(g.terrain, g.objects); sim.sandbox = 0;
  const c = sim.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;
  sim.players[0].ere = 6;
  const place = (kind: string, dx: number) => {
    for (let a = 0; a < 24; a++) for (const d of [13, 17, 21]) {
      const x = c.x + Math.cos(a / 24 * 6.28 + dx) * d, z = c.z + Math.sin(a / 24 * 6.28 + dx) * d;
      if (!sim.canPlace(kind, x, z)) continue;
      sim.issue({ type: 'place', owner: 0, kind, x, z, ids: [] }); run(sim, 1);
      const b = sim.buildings.filter((b) => b.owner === 0 && b.kind === kind).pop();
      if (b) { b.done = true; b.progress = 1; b.hp = b.maxHp; return b; }
    }
    throw new Error('placement impossible : ' + kind);
  };
  const ar = place('arene', 0), at = place('atelier', 3);
  check('Salle d\'armes et Atelier se posent', !!ar && !!at);
  sim.players[0].ere = 4;
  sim.issue({ type: 'train', b: ar.id, kind: 'sabreur' }); run(sim, 1);
  check('le Sabreur demande l\'ère 2', ar.queue.length === 0);
  sim.players[0].ere = 6;
  for (const k of NEW) { sim.issue({ type: 'train', b: UNITS[k].produitA === 'arene' ? ar.id : at.id, kind: k }); run(sim, 120); }
  run(sim, 600);
  const made = NEW.filter((k) => sim.units.some((u) => u.owner === 0 && u.kind === k));
  check('les 10 nouvelles unités sortent', made.length === NEW.length, made.join(', '));
}
{ // Corps à corps : au contact, sans traçante ; le marteau abat vite les bâtiments.
  const sim = new Sim(g.terrain, g.objects), c0 = sim.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;
  const lames = [0, 1, 2].map((i) => sim.spawn('lame', 0, c0.x + 12 + i, c0.z + 12));
  const foe = sim.spawn('fantassin', 1, c0.x + 16, c0.z + 16); foe.posture = 'passive';
  sim.issue({ type: 'attack', ids: lames.map((u) => u.id), unit: foe.id, b: -1 });
  let melee = 0, near = Infinity;
  for (let i = 0; i < 200 && foe.hp > 0; i++) { sim.step(); for (const e of sim.events) if (e.t === 'shot' && e.melee) { melee++; near = Math.min(near, Math.hypot(e.x1 - e.x0, e.z1 - e.z0)); } sim.events.length = 0; }
  check('les lames tuent le fantassin au corps à corps', foe.hp <= 0 && melee > 0, `${melee} coups, distance ${near.toFixed(2)}`);
  check('les coups se portent au contact', near < 2.2);
  const sim2 = new Sim(g.terrain, g.objects), c1 = sim2.buildings.find((b) => b.owner === 1 && b.kind === 'centre')!;
  const h = c1; for (const u of sim2.units.filter((u) => u.owner === 1)) u.hp = 0; run(sim2, 1);
  const hp = h.hp, m = sim2.spawn('marteleur', 0, h.x + 7, h.z + 3), l = sim2.spawn('lame', 0, h.x + 7, h.z - 3);
  sim2.issue({ type: 'attack', ids: [m.id], unit: -1, b: h.id }); run(sim2, 120);
  const byHammer = hp - h.hp; h.hp = hp;
  m.hp = 0; run(sim2, 2);
  sim2.issue({ type: 'attack', ids: [l.id], unit: -1, b: h.id }); run(sim2, 120);
  check('le marteau frappe les bâtiments plus fort que la lame', byHammer > (hp - h.hp) * 2, `${byHammer.toFixed(0)} contre ${(hp - h.hp).toFixed(0)}`);
}
{ // Machines : l'anti-blindage les compte comme des véhicules.
  const sim = new Sim(g.terrain, g.objects), c0 = sim.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;
  const s = sim.spawn('strikerLaser', 1, c0.x + 14, c0.z + 14); s.posture = 'passive';
  const ab = sim.spawn('antiblindage', 0, c0.x + 9, c0.z + 9), hp = s.hp;
  sim.issue({ type: 'attack', ids: [ab.id], unit: s.id, b: -1 });
  let shots = 0; for (let i = 0; i < 80; i++) { sim.step(); for (const e of sim.events) if (e.t === 'shot' && e.x0 === ab.x) shots++; sim.events.length = 0; }
  const per = (hp - s.hp) / Math.max(1, shots);
  check('bonus anti-blindage contre un Striker', per > UNITS.antiblindage.degats * 1.4, `${per.toFixed(1)} par tir`);
}
{ // Posture agressive : une unité au repos repère un bâtiment ennemi proche et l'attaque ; les alliés voisins prêtent main-forte.
  const sim = new Sim(g.terrain, g.objects), c1 = sim.buildings.find((b) => b.owner === 1 && b.kind === 'centre')!;
  for (const u of sim.units.filter((u) => u.owner === 1)) u.hp = 0; run(sim, 1);
  const hp = c1.hp, f = sim.spawn('fantassin', 0, c1.x + c1.r + 11, c1.z);
  run(sim, 120);
  check('une unité au repos attaque d\'elle-même un bâtiment à 11 m', c1.hp < hp && (f.tb === c1.id || f.tu >= 0), `PV ${hp} → ${c1.hp.toFixed(0)}`);
  const sim2 = new Sim(g.terrain, g.objects), c0 = sim2.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;
  const a = sim2.spawn('fantassin', 0, c0.x + 14, c0.z + 14), friend = sim2.spawn('sabreur', 0, c0.x + 14, c0.z + 25);
  const foe = sim2.spawn('artillerie', 1, c0.x + 14 + 12, c0.z + 14 - 8); foe.posture = 'tenir';
  sim2.issue({ type: 'attack', ids: [foe.id], unit: a.id, b: -1 });
  run(sim2, 60);
  check('un allié voisin vient aider l\'unité attaquée', friend.tu === foe.id || Math.hypot(friend.x - foe.x, friend.z - foe.z) < 8);
}
{ // Barrière ionique : recherche, activation, blocage des appareils ennemis, coût en énergie.
  const sim = new Sim(g.terrain, g.objects), s0 = g.terrain.starts[0];
  let z0 = 0, x0 = 0, found = false;
  for (let k = 0; k < 60 && !found; k++) { x0 = s0.x - 11 + ((k % 6) - 3) * 4; z0 = s0.z + 14 + Math.floor(k / 6) * 3; found = true; for (let i = 0; i <= 12; i++) if (!sim.canPlace('mur', x0 + i * 1.85, z0)) { found = false; break; } }
  for (let i = 0; i <= 12; i++) sim.issue({ type: 'place', owner: 0, kind: 'mur', x: x0 + i * 1.85, z: z0, ids: [] });
  run(sim, 1); for (const b of sim.buildings) if (b.kind === 'mur') { b.done = true; b.progress = 1; b.hp = b.maxHp; }
  sim.issue({ type: 'ion', owner: 0, on: true }); run(sim, 1);
  check('pas de barrière sans la recherche', !sim.players[0].ion);
  sim.players[0].research.add('barriere'); sim.players[0].energie = 500;
  sim.issue({ type: 'ion', owner: 0, on: true }); run(sim, 1);
  check('barrière activée', !!sim.players[0].ion);
  const xm = x0 + 6 * 1.85, foe = sim.spawn('drone', 1, xm, z0 + 8), mine = sim.spawn('drone', 0, xm + 1, z0 - 8);
  foe.posture = 'passive'; mine.posture = 'passive';
  sim.issue({ type: 'move', ids: [foe.id], x: xm, z: z0 - 10, formation: 'libre' }); sim.issue({ type: 'move', ids: [mine.id], x: xm + 1, z: z0 + 10, formation: 'libre' });
  const e0 = sim.players[0].energie; run(sim, 150);
  check('le drone ennemi est arrêté par le voile', foe.z > z0, `z ${(foe.z - z0).toFixed(1)}`);
  check('mon drone passe', mine.z > z0 + 5, `z ${(mine.z - z0).toFixed(1)}`);
  check('la barrière consomme de l\'énergie', sim.players[0].energie < e0 + 1, `${e0} → ${sim.players[0].energie} (coût ${sim.ionCost(0)}/s)`);
  sim.players[0].energie = 0; run(sim, 12);
  check('elle se coupe sans énergie', !sim.players[0].ion);
  sim.issue({ type: 'move', ids: [foe.id], x: xm, z: z0 - 10, formation: 'libre' }); run(sim, 150);
  check('coupée, le drone ennemi passe', foe.z < z0 - 3);
}
{ // L'IA Difficile s'en sert : Salle d'armes dès l'ère 1, Atelier mécanique à l'ère 2.
  const play = (rich: boolean, ticks: number) => {
    const sim = new Sim(g.terrain, g.objects); if (rich) { sim.setRich(); for (const P of sim.players) { P.ere = 5; if (!P.neutral) P.faction = 3; } }
    const ais = [new Ai(sim, 0, 'difficile'), new Ai(sim, 1, 'difficile')], seen = new Set<string>();
    for (let t = 0; t < ticks && sim.winner < 0; t++) { for (const a of ais) a.step(); sim.step(); sim.events.length = 0; if (t % 50 === 0) { for (const b of sim.buildings) seen.add(b.kind); for (const u of sim.units) seen.add(u.kind); } }
    return seen;
  };
  const a = play(false, 14000), b = play(true, 9000);
  check('l\'IA Difficile bâtit une Salle d\'armes et l\'utilise', a.has('arene') && ['lame', 'marteleur', 'sabreur'].some((k) => a.has(k)));
  check('l\'IA Difficile bâtit un Atelier mécanique et sort des machines', b.has('atelier') && NEW.slice(4).some((k) => b.has(k)), [...b].filter((k) => NEW.includes(k as UnitKind) || k === 'atelier').join(', '));
}
console.log(ok ? 'J16 OK' : 'J16 ÉCHEC');
process.exit(ok ? 0 : 1);
