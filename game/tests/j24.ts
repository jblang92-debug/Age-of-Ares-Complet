// Tribut entre joueurs : taxe, Monnaie et Banque au Marché, ordres refusés.
// Lancer : npx tsx tests/j24.ts
import { generateMap, SIZES } from '../src/mapgen/index';
import { Sim } from '../src/sim/sim';
import { RESEARCH } from '../src/data/rules';

let ok = true;
const check = (label: string, cond: boolean, detail = '') => { console.log((cond ? '  ok   ' : '  ECHEC') + ' ' + label + (detail ? ' — ' + detail : '')); if (!cond) ok = false; };
const run = (sim: Sim, n: number) => { for (let i = 0; i < n; i++) { sim.step(); sim.events.length = 0; } };
const g = generateMap(4242, SIZES.petite, 'terre', 4);
const sim = new Sim(g.terrain, g.objects);
const P = sim.players[0], Q = sim.players[1];
P.bois = 1000; Q.bois = 0;
sim.issue({ type: 'tribute', owner: 0, to: 1, res: 'bois', amount: 200 }); sim.step();
check('tribut de 200 bois : 25 % de taxe', P.bois === 800 && Q.bois === 150, `${P.bois} / ${Q.bois}`);
sim.issue({ type: 'tribute', owner: 0, to: 1, res: 'bois', amount: 5000 }); sim.step();
check('on ne donne pas plus que ce qu\'on a', P.bois === 0 && Q.bois === 750, `${P.bois} / ${Q.bois}`);
sim.issue({ type: 'tribute', owner: 0, to: 0, res: 'bois', amount: 100 }); sim.issue({ type: 'tribute', owner: 0, to: 1, res: 'pop' as 'bois', amount: 100 }); sim.step();
check('pas de tribut à soi-même ni de fausse ressource', Q.bois === 750 && P.pop >= 0);
// Un joueur ne peut pas envoyer au nom d'un autre (ordre filtré en ligne).
check('ordre d\'un autre camp rejeté', sim.own({ type: 'tribute', owner: 1, to: 0, res: 'bois', amount: 100 }, 0) === null);
// Monnaie puis Banque au Marché.
const cc = sim.buildings.find((b) => b.owner === 0 && b.kind === 'centre')!;
const c = sim.placeNear('marche', 0, cc.x + 12, cc.z)!;
sim.issue({ type: 'research', b: cc.id, key: 'monnaie' }); P.eau = P.energie = 2000; P.ere = 2; sim.step();
check('plus de Monnaie au Centre', !cc.task);
P.eau = P.energie = 2000; P.ere = 1;
sim.issue({ type: 'research', b: c.id, key: 'monnaie' }); sim.step();
check('Monnaie impossible à l\'Antiquité', !c.task);
P.ere = 2; sim.issue({ type: 'research', b: c.id, key: 'banque' }); sim.step();
check('Banque demande la Monnaie (et l\'âge de la poudre)', !c.task);
sim.issue({ type: 'research', b: c.id, key: 'monnaie' }); run(sim, RESEARCH.monnaie.temps * 10 + 20);
check('Monnaie recherchée au Marché', P.research.has('monnaie'));
check('taxe à 15 %', Math.abs(sim.tributeTax(0) - 0.15) < 1e-9);
P.ere = 4; sim.issue({ type: 'research', b: c.id, key: 'banque' }); run(sim, RESEARCH.banque.temps * 10 + 20);
check('Banque recherchée', P.research.has('banque'));
P.minerai = 100; Q.minerai = 0;
sim.issue({ type: 'tribute', owner: 0, to: 1, res: 'minerai', amount: 100 }); sim.step();
check('taxe à 5 % : 95 reçus', Q.minerai === 95, String(Q.minerai));
console.log(ok ? 'J24 OK' : 'J24 ÉCHEC'); if (!ok) process.exit(1);
