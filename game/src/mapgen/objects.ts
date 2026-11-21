// Placement des bâtiments de départ, rochers et gisements. Données pures : la simulation
// s'en sert pour les obstacles, le rendu pour l'affichage.
import { mulberry32 } from '../core/rng';
import { slopeAt, VOID_BORDER, rotQ, type TerrainMap, type Vec2 } from './terrain';
import { NavGrid, INF } from '../sim/nav';

export interface Placed {
  model: string; x: number; z: number; rot: number;
  footprint?: number; height?: number; dy?: number;
  /** Rayon infranchissable, en mètres (0 = décoratif). */
  block: number; owner: number; roof?: { model: string; footprint: number };
}
export interface Rock { model: string; x: number; z: number; rot: number; s: number; sy: number; block: number }
export interface ResourceNode { kind: 'solarite' | 'glace' | 'arbre' | 'minerai' | 'or'; x: number; z: number; rot: number; sx: number; sy: number; tilt: number; /** Gisement posé sur une île (accessible par navette). */ island?: boolean }
export interface MapObjects { buildings: Placed[]; rocks: Rock[]; resources: ResourceNode[]; spawns: Vec2[][]; /** Gisements que le générateur n'a pas réussi à placer. */ missing: string[] }

export function generateObjects(map: TerrainMap): MapObjects {
  const buildings: Placed[] = [], rocks: Rock[] = [], resources: ResourceNode[] = [], spawns: Vec2[][] = [], missing: string[] = [];

  // Symétrie : 180° à deux joueurs ; à quatre, quarts de tour (base k = base 0 tournée de TURN[k] quarts).
  const four = map.starts.length === 4, Q = four ? [0, 1, 2, 3] : [0, 2], TURN = [0, 2, 1, 3];
  const mirrors = (p: Vec2) => Q.map((q) => rotQ(p.x, p.z, q));
  map.starts.forEach((s, owner) => {
    const q = TURN[owner], rot = -q * Math.PI / 2;
    const at = (dx: number, dz: number) => { const p = rotQ(dx, dz, q); return { x: s.x + p.x, z: s.z + p.z }; };
    const b = (model: string, dx: number, dz: number, r: number, block: number, o: Partial<Placed> = {}) =>
      buildings.push({ model, ...at(dx, dz), rot: rot + r, block, owner, ...o });
    // Le Centre de commandement est créé par la simulation ; ici, seulement le décor de l'atterrissage.
    b('kaykit/landingpad_large.json', 12, 0, 0, 4.8, { footprint: 9 });
    b('kaykit/lander_A.json', 12, 0, 0.6, 0, { footprint: 5.2, dy: 1.2 });
    b('kaykit/cargo_B_stacked.json', 6.5, 6.5, 0.3, 1.2, { footprint: 2.2 });
    b('kaykit/cargo_A.json', 8.6, 7.4, 1.1, 0.7, { footprint: 1.3 });
    // Zone de rassemblement devant la base.
    const sp: Vec2[] = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) sp.push(at(c * 2.2 - 12, 9 + r * 2.4));
    spawns.push(sp);
  });

  // Gisements, placés par règles et en symétrie (chaque gisement a son jumeau chez l'adversaire).
  const rng = mulberry32(map.seed + 5);
  const s0 = map.starts[0];
  const navT = new NavGrid(map, { buildings: [...buildings, ...map.starts.map((s, owner) => ({ model: '', x: s.x, z: s.z, rot: 0, block: 4.7, owner }))], rocks: [], resources: [], spawns: [], missing: [] });
  const walk = navT.flowField(s0.x, s0.z + 15, 0);
  const centers: Vec2[] = [];
  const clear = (x: number, z: number, r: number): boolean => {
    const lv = map.levelAt(x, z);
    for (let dz = -r; dz <= r; dz += 1.5) for (let dx = -r; dx <= r; dx += 1.5)
      if (!navT.walkable(x + dx, z + dz, 0) || map.levelAt(x + dx, z + dz) !== lv) return false;
    return !map.rampNear(x, z, r + 5);
  };
  const cluster = (kind: ResourceNode['kind'], c: Vec2, count: number, radius: number, sx: [number, number], sy: [number, number], tilt: number) => {
    for (const p of mirrors(c)) for (let k = 0; k < count; k++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * radius;
      resources.push({ kind, x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, rot: rng() * 6.28, sx: sx[0] + rng() * sx[1], sy: sy[0] + rng() * sy[1], tilt: (rng() - 0.5) * tilt });
    }
    centers.push(...mirrors(c));
  };
  /** Cherche un emplacement plat et accessible respectant la règle, puis y pose le gisement et son jumeau. */
  const place = (kind: ResourceNode['kind'], label: string, rule: (x: number, z: number, d: number, lv: number) => boolean) => {
    const found: Vec2[] = [];
    for (let z = -map.half + 8; z <= map.half - 8; z += 2) for (let x = -map.half + 8; x <= map.half - 8; x += 2) {
      const c = navT.cell(x, z), d = c >= 0 ? walk[c] : INF;
      if (d >= INF || !rule(x, z, d, map.levelAt(x, z))) continue;
      if (Math.hypot(x, z) < 9 || map.starts.some((s) => Math.hypot(x - s.x, z - s.z) < 17)) continue;
      if (Math.hypot(x - s0.x, z - (s0.z + 21)) < 17) continue; // zone de rassemblement devant la base
      if (centers.some((q) => Math.hypot(q.x - x, q.z - z) < 13) || !clear(x, z, 5)) continue;
      found.push({ x, z });
    }
    if (!found.length) { missing.push(label); return; }
    const c = found[Math.floor(rng() * found.length)];
    if (kind === 'solarite') cluster(kind, c, 9, 3.2, [0.5, 0.55], [1.4, 2.2], 0.5);
    else if (kind === 'glace') cluster(kind, c, 9, 3.4, [0.8, 0.9], [0.5, 0.8], 0.3);
    else if (kind === 'arbre') cluster(kind, c, 22, 6.2, [1.5, 0.7], [0.85, 0.35], 0);
    else if (kind === 'or') cluster(kind, c, 6, 2.8, [1.5, 1.0], [1.2, 0.8], 0);
    else cluster(kind, c, 7, 3.2, [1.5, 1.3], [1.5, 1.3], 0);
  };
  const nearA = (x: number, z: number) => Math.hypot(x - s0.x, z - s0.z);
  // Près de chaque base, façon Age of Empires : 2 buissons de baies (nourriture), 2 bois, 1 carrière de pierre, 1 mine d'or.
  const near = (x: number, z: number, d: number) => d > 17 && d < 36 && nearA(x, z) < 34;
  place('glace', 'nourriture de départ', near);
  place('arbre', 'bois de départ', near);
  place('minerai', 'pierre de départ', near);
  place('or', 'or de départ', near);
  place('glace', 'nourriture de départ', near);
  place('arbre', 'bois de départ', (x, z, d) => d > 20 && d < 44 && nearA(x, z) < 42);
  // Plus loin : de quoi s'étendre.
  place('arbre', 'bois éloigné', (x, z, d) => d > 40 && d < 75 && nearA(x, z) < 70);
  place('glace', 'nourriture éloignée', (x, z, d) => d > 45 && d < 80 && nearA(x, z) < 75);
  place('or', 'or éloigné', (x, z, d) => d > 45 && d < 80 && nearA(x, z) < 75);
  place('minerai', 'pierre éloignée', (x, z, d) => d > 45 && d < 80 && nearA(x, z) < 75);
  place('or', 'or lointain', (x, z, d) => d > 70 && d < 130);
  place('minerai', 'pierre lointaine', (x, z, d) => d > 70 && d < 130);
  place('arbre', 'bois lointain', (x, z, d) => d > 70 && d < 130);
  place('glace', 'nourriture lointaine', (x, z, d) => d > 70 && d < 130);
  // Solarite : sur les plateaux (zones à disputer), jamais près des bases.
  const before = missing.length;
  place('solarite', 'solarite du plateau haut', (x, z, d, lv) => lv === 2 && d > 50);
  if (missing.length > before) { missing.length = before; place('solarite', 'solarite du plateau', (x, z, d, lv) => lv === 1 && d > 60); }
  place('solarite', 'solarite du plateau moyen', (x, z, d, lv) => lv >= 1 && d > 45 && d < 120);
  place('solarite', 'solarite éloignée', (x, z, d, lv) => lv >= 1 && d > 60);
  // Mont de solarite : le cratère central est très riche (comme la montagne d'or d'Age of Empires).
  if (map.kind === 'mont') {
    cluster('solarite', { x: 5, z: -3 }, 14, 3.4, [0.5, 0.55], [1.4, 2.2], 0.5);
    cluster('or', { x: -2, z: -8 }, 10, 3.4, [1.5, 1.0], [1.2, 0.8], 0);
  }
  // Îles neutres : gisements riches (solarite, minerai, glace). Pour une paire d'îles, on traite la première, la symétrie fait l'autre.
  for (let i = 0; i < map.islands.length; i++) {
    const c = map.islands[i];
    if (map.islands.slice(0, i).some((q) => mirrors(q).slice(1).some((m) => Math.abs(m.x - c.x) < 1 && Math.abs(m.z - c.z) < 1))) continue;
    const n0 = resources.length, big = c.r > 25, o = c.x === 0 && c.z === 0 ? 7 : Math.min(6, c.r * 0.4);
    cluster('solarite', { x: c.x + o, z: c.z - o * 0.5 }, big ? 12 : 10, 3.2, [0.5, 0.55], [1.4, 2.2], 0.5);
    if (c.r > 9) cluster('or', { x: c.x - o * 0.8, z: c.z - o * 1.4 }, 6, 2.8, [1.5, 1.0], [1.2, 0.8], 0);
    if (c.r > 9) cluster('minerai', { x: c.x - o * 0.8, z: c.z + o * 0.7 }, 9, 3.2, [1.5, 1.3], [1.5, 1.3], 0);
    if (big) { cluster('glace', { x: c.x + o * 0.2, z: c.z + o * 1.6 }, 11, 3.6, [0.8, 0.9], [0.5, 0.8], 0.3); cluster('minerai', { x: c.x - o * 1.8, z: c.z - o * 1.2 }, 8, 3.4, [1.5, 1.3], [1.5, 1.3], 0); }
    for (let k = n0; k < resources.length; k++) resources[k].island = true;
  }
  // Cartes moyennes et grandes : davantage de gisements, proportionnellement à la surface.
  const extra = Math.round(((map.half / 80) ** 2 - 1) * 2);
  for (let k = 0; k < extra; k++) {
    const before2 = missing.length;
    place('glace', 'nourriture supplémentaire', (x, z, d) => d > 60);
    place('minerai', 'pierre supplémentaire', (x, z, d) => d > 60);
    place('or', 'or supplémentaire', (x, z, d) => d > 60);
    place('arbre', 'bois supplémentaire', (x, z, d) => d > 50);
    if (k % 2 === 0) place('solarite', 'solarite supplémentaire', (x, z, d, lv) => lv >= 1 && d > 70);
    missing.length = before2; // ces gisements sont un bonus : leur absence n'invalide pas la carte
  }

  // Rochers : chaque rocher a son jumeau de l'autre côté de la carte.
  const rr = mulberry32(map.seed + 11);
  const { half, ext, starts } = map;
  // Rivières à quatre : les gués restent dégagés (sinon les véhicules ne passent plus).
  const ford = (x: number, z: number) => map.kind === 'rivieres' && starts.length === 4 &&
    ((Math.abs(Math.abs(z) - half * 0.6) < 14 && Math.abs(x) < half * 0.3) || (Math.abs(Math.abs(x) - half * 0.6) < 14 && Math.abs(z) < half * 0.3));
  const far = (x: number, z: number, d: number) => !ford(x, z) && starts.every((s) => Math.hypot(x - s.x, z - s.z) > d) && !map.rampNear(x, z, 7) && !map.isVoid(x, z) && map.islands.every((c) => Math.hypot(c.x - x, c.z - z) > Math.min(c.r * 0.6, 14)) && centers.every((q) => Math.hypot(q.x - x, q.z - z) > 9);
  const big = ['quat/Rock_Large_1.json', 'quat/Rock_Large_2.json', 'quat/Rock_Large_3.json'];
  const mid = ['quat/Rock_1.json', 'quat/Rock_2.json', 'quat/Rock_3.json', 'quat/Rock_4.json'];
  const small = ['kaykit/rock_A.json', 'kaykit/rock_B.json'];
  const pair = (model: string, x: number, z: number, s: number, sy: number, block: number) => {
    const rot = rr() * Math.PI * 2;
    Q.forEach((q) => { const p = rotQ(x, z, q); rocks.push({ model, x: p.x, z: p.z, rot: rot - q * Math.PI / 2, s, sy, block }); });
  };
  const area = (half / 80) ** 2;
  for (let k = 0; k < 700 * area; k++) {
    const x = (rr() * 2 - 1) * half, z = (rr() * 2 - 1) * half;
    const slope = slopeAt(map, x, z), kind = rr();
    if (kind < 0.07 && slope < 0.35 && far(x, z, 34)) { const s = 4 + rr() * 4; pair(big[(rr() * 3) | 0], x, z, s, 0.55 + rr() * 0.3, s * 0.46); }
    else if (kind < 0.3 && far(x, z, 30)) { const s = 1.2 + rr() * 1.8; pair(mid[(rr() * 4) | 0], x, z, s, 0.8, s * 0.42); }
    else if (kind < 0.46 && far(x, z, 13)) pair(small[(rr() * 2) | 0], x, z, 0.6 + rr() * 1.1, 1, 0);
  }
  for (let k = 0; k < 130 * (half / 80); k++) {
    const x = (rr() * 2 - 1) * ext, z = (rr() * 2 - 1) * ext;
    if (Math.max(Math.abs(x), Math.abs(z)) < half + 3 || VOID_BORDER.has(map.kind)) continue;
    rocks.push({ model: big[(rr() * 3) | 0], x, z, rot: rr() * 6.28, s: 7 + rr() * 9, sy: 0.6 + rr() * 0.5, block: 0 });
  }
  return { buildings, rocks, resources, spawns, missing };
}
