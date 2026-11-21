// Factions : choix, unités propres, production par l'IA.
// Lancer : npx tsx tests/j17.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim, type UnitKind } from '../src/sim/sim';
import { UNITS, GAME } from '../src/data/rules';
import { Ai } from '../src/sim/ai';

let ok = true;
const check = (label: string, cond: boolean, detail = '') => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + label + (detail ? ' — ' + detail : '')); if (!cond) ok = false; };
const run = (sim: Sim, n: number) => { for (let i = 0; i < n; i++) { sim.step(); sim.events.length = 0; } };
const g = generateMap(4242, SIZES.petite, 'terre');
const FAC: UnitKind[] = ['tireur', 'sam', 'chasseurChars', 'exo', 'zenith', 'avc', 'challenger', 'pancake', 'grenadier', 'huit', 'executioner', 'canonAA', 'spitfire', 'imperial'];
{
  const sim = new Sim(g.terrain, g.objects);
  sim.setFaction(2);
  const fs = sim.players.filter((p) => !p.neutral).map((p) => p.faction);
  check('le joueur prend la faction choisie', sim.players[0].faction === 2, sim.factionName(0));
  check('les adversaires ont d\'autres factions', fs.slice(1).every((f) => f !== 2), fs.join(','));
  check('chaque faction a au moins 3 unités propres, dont une dès l\'âge moderne', [0, 1, 2, 3].every((f) => Object.values(UNITS).filter((r) => r.faction === f).length >= 3 && Object.values(UNITS).some((r) => r.faction === f && r.ere === 3)));
  check('les 14 nouvelles unités existent', FAC.every((k) => !!UNITS[k]));
  check('les noms de faction sont définis', GAME.factionsDesc.length === 4);
}
{ // Restriction : une unité d'une autre faction ne se produit pas.
  const sim = new Sim(g.terrain, g.objects); sim.sandbox = 0; sim.setFaction(0);
  const c = sim.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;
  sim.players[0].ere = 5;
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
  const cas = place('caserne', 0), us = place('usine', 2), ha = place('hangar', 4);
  const B: Record<string, number> = { caserne: cas.id, usine: us.id, hangar: ha.id };
  sim.issue({ type: 'train', b: cas.id, kind: 'grenadier' }); run(sim, 1);
  check('Arès ne peut pas former de lance-grenades (Australe)', cas.queue.length === 0);
  const mine = FAC.filter((k) => UNITS[k].faction === undefined || UNITS[k].faction === 0);
  for (const k of mine) { sim.issue({ type: 'train', b: B[UNITS[k].produitA], kind: k }); run(sim, 60); }
  run(sim, 900);
  const made = mine.filter((k) => sim.units.some((u) => u.owner === 0 && u.kind === k));
  check('Arès produit ses unités et les communes', made.length === mine.length, made.join(', '));
}
{ // L'IA difficile fabrique des unités de sa faction.
  const seen = new Set<string>();
  for (const f of [0, 1, 2, 3]) {
    const g2 = generateMap(4242 + f), sim = new Sim(g2.terrain, g2.objects); sim.setFaction(f);
    for (const owner of [0, 1]) for (let i = 0; i < GAME.depart.ouvriers; i++) sim.spawn('ouvrier', owner, g2.objects.spawns[owner][i + 4].x, g2.objects.spawns[owner][i + 4].z);
    const ais = [new Ai(sim, 0, 'difficile'), new Ai(sim, 1, 'difficile')];
    while (sim.winner < 0 && sim.tick < 22 * 600) {
      for (const ai of ais) ai.step(); sim.step(); sim.events.length = 0;
      if (sim.tick % 50 === 0) for (const u of sim.units) if (u.owner <= 1 && UNITS[u.kind]?.faction !== undefined) seen.add(u.kind + '@' + sim.players[u.owner].faction);
    }
    console.log(`    faction ${f} : fin à ${(sim.tick / 600).toFixed(1)} min, ères ${sim.players[0].ere}/${sim.players[1].ere}, unités ${[...new Set(sim.units.filter((u) => u.owner <= 1).map((u) => u.kind))].join(' ')}`);
  }
  const bad = [...seen].filter((s) => { const [k, f] = s.split('@'); return UNITS[k].faction !== +f; });
  check('l\'IA ne produit que ses propres unités de faction', bad.length === 0, bad.join(' '));
  check('l\'IA utilise des unités de faction', seen.size >= 2, [...seen].join(' '));
}
console.log(ok ? '\nTOUT VERT' : '\nÉCHECS'); process.exit(ok ? 0 : 1);
