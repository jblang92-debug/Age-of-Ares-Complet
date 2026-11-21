// Génération du relief à partir d'une graine. TypeScript pur : aucune dépendance au rendu.
// Étapes : 1) trois niveaux de plateaux tirés d'un bruit symétrique, 2) nettoyage des petites zones,
// 3) rampes posées entre plateaux voisins, 4) hauteurs (falaises raides, rampes en pente douce), 5) massif de bordure.
import { fbm, smoothstep, lerp, clamp, mulberry32 } from '../core/rng';

export interface Vec2 { x: number; z: number }
/** Types de cartes, inspirés des cartes aléatoires d'Age of Empires. Le vide intersidéral y joue le rôle de l'eau. */
export type MapKind = 'terre' | 'cotiere' | 'continentale' | 'mont' | 'rivieres' | 'grandesiles' | 'petitesiles';
export const MAP_KINDS: { key: MapKind; nom: string; desc: string }[] = [
  { key: 'terre', nom: 'Terre ferme', desc: 'plateaux, sans vide' },
  { key: 'cotiere', nom: 'Côtière', desc: 'deux côtes sur le vide' },
  { key: 'continentale', nom: 'Continentale', desc: 'un continent, des îlots' },
  { key: 'mont', nom: 'Mont de solarite', desc: 'un cratère riche au centre' },
  { key: 'rivieres', nom: 'Rivières', desc: 'une faille et trois gués' },
  { key: 'grandesiles', nom: 'Grandes îles', desc: 'chacun son île, navettes' },
  { key: 'petitesiles', nom: 'Petites îles', desc: 'îles et îlots, navettes' },
];
/** Cartes où le vide entoure la zone de jeu (sinon, un massif rocheux). */
export const VOID_BORDER: ReadonlySet<MapKind> = new Set(['cotiere', 'continentale', 'grandesiles', 'petitesiles']);
/** Cartes où les deux bases ne sont pas reliées à pied : il faut des navettes (ou des drones). */
export const SEPARATED: ReadonlySet<MapKind> = new Set(['grandesiles', 'petitesiles']);
export function toMapKind(v: string | null | undefined): MapKind { return MAP_KINDS.some((k) => k.key === v) ? (v as MapKind) : 'terre'; }
export interface Ramp { x: number; z: number; nx: number; nz: number; from: number }

export interface TerrainMap {
  seed: number;
  /** Demi-côté de la zone jouable, en mètres (la carte va de -half à +half). */
  half: number;
  /** Demi-côté de la zone affichée (zone jouable + massif de bordure). */
  ext: number;
  /** Nombre de sommets par côté de la grille (1 case = 1 m). */
  n: number;
  heights: Float32Array;
  /** Niveau de plateau par sommet : 0 bas, 1 moyen, 2 haut, 3 bordure. */
  levels: Uint8Array;
  /** 1 là où passe une rampe. */
  rampMask: Uint8Array;
  ramps: Ramp[];
  starts: Vec2[];
  kind: MapKind;
  /** 1 là où s'ouvre le vide intersidéral (infranchissable à pied). */
  voidMask: Uint8Array;
  /** Îles neutres (séparées des bases par le vide) : centre et rayon. Une île et sa jumelle se suivent, sauf l'île centrale. */
  islands: (Vec2 & { r: number })[];
  isVoid(x: number, z: number): boolean;
  heightAt(x: number, z: number): number;
  levelAt(x: number, z: number): number;
  rampNear(x: number, z: number, r: number): boolean;
}

export const PLATEAU_HEIGHT = 5.5;
const RAMP_LEN = 12, RAMP_HALF_W = 4.5;

/** Terrains jouables à 4 (symétrie par quart de tour). */
export const KINDS_4P: ReadonlySet<MapKind> = new Set(['terre', 'cotiere', 'continentale', 'mont', 'rivieres', 'grandesiles', 'petitesiles']);
/** Quart de tour (q fois 90°) autour du centre de la carte. */
export const rotQ = (x: number, z: number, q: number): Vec2 => { q = ((q % 4) + 4) % 4; return q === 0 ? { x, z } : q === 1 ? { x: -z, z: x } : q === 2 ? { x: -x, z: -z } : { x: z, z: -x }; };

export function generateTerrain(seed: number, half = 80, border = 40, kind: MapKind = 'terre', players = 2): TerrainMap {
  const four = players === 4;
  if (four && !KINDS_4P.has(kind)) kind = 'terre';
  /** Rotations de la symétrie : 180° à deux joueurs, quarts de tour à quatre. */
  const Q = four ? [0, 1, 2, 3] : [0, 2];
  const ext = half + border, n = ext * 2 + 1, N = n * n;
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const sf = kind === 'continentale' ? 0.42 : kind === 'grandesiles' ? 0.52 : kind === 'petitesiles' ? 0.53 : 0.62;
  const s0 = { x: -half * sf, z: half * sf };
  // Ordre des bases : 0 et 1 face à face ; à quatre, 2 et 3 sur l'autre diagonale.
  const starts: Vec2[] = four ? [s0, rotQ(s0.x, s0.z, 2), rotQ(s0.x, s0.z, 1), rotQ(s0.x, s0.z, 3)] : [s0, rotQ(s0.x, s0.z, 2)];
  const sym = (x: number, z: number, f: number, s: number, oct = 4) => {
    let t = 0; for (const q of Q) { const p = rotQ(x, z, q); t += fbm(p.x * f + 300, p.z * f + 300, s, oct); }
    return t / Q.length;
  };
  // Forme des terres : vrai = terre, faux = vide. Symétrique par rotation de 180° (équité).
  const h = half, wob = (x: number, z: number, a: number) => ((sym(x, z, 0.03, seed + 3, 3) - 0.5) * 3.6 + (sym(x, z, 0.09, seed + 7, 2) - 0.5) * 1.6) * a;
  const islands: (Vec2 & { r: number })[] = [];
  const pairIsland = (x: number, z: number, r: number) => { for (const q of Q) islands.push({ ...rotQ(x, z, q), r }); };
  if (four) {
    // À quatre, les bases occupent les coins : îles et baies passent au milieu des bords (entre deux voisins).
    if (kind === 'cotiere') pairIsland(h * 0.84, 0, h * 0.1);
    if (kind === 'continentale') pairIsland(h * 0.8, h * 0.8, Math.max(11.5, h * 0.11));
    if (kind === 'petitesiles') { pairIsland(h * 0.62, 0, h * 0.16); islands.push({ x: 0, z: 0, r: h * 0.15 }); }
  } else {
    if (kind === 'cotiere') pairIsland(h * 0.8, h * 0.8, h * 0.13);
    if (kind === 'continentale') pairIsland(h * 0.8, h * 0.8, Math.max(11.5, h * 0.11));
    if (kind === 'grandesiles') pairIsland(h * 0.52, h * 0.52, h * 0.44);
    if (kind === 'petitesiles') { pairIsland(h * 0.56, h * 0.56, h * 0.2); islands.push({ x: 0, z: 0, r: h * 0.17 }); }
  }
  const playerR = kind === 'petitesiles' ? h * (four ? 0.33 : 0.35) : 0;
  // Méandre impair (m(-t) = -m(t)) : deux chenaux |x + m(z)| et |z - m(x)| restent symétriques par quart de tour.
  const a1 = 0.06 + 0.04 * ((seed * 0.37) % 1), a2 = 0.025 + 0.02 * ((seed * 0.61) % 1);
  const meander = (t: number) => h * (a1 * Math.sin((t / h) * 3) + a2 * Math.sin((t / h) * 7.1));
  const land = (x: number, z: number): boolean => {
    if (kind === 'terre' || kind === 'mont') return true;
    if (VOID_BORDER.has(kind) && Math.max(Math.abs(x), Math.abs(z)) > h - 6 + wob(x, z, 4)) return false;
    const inIsland = islands.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + wob(x, z, c.r * 0.25));
    if (kind === 'cotiere' && four) {
      const bay = Math.min(...Q.map((q) => { const p = rotQ(h * 0.95, 0, q); return Math.hypot(x - p.x, z - p.z); }));
      return inIsland || bay > h * 0.27 + wob(x, z, 4);
    }
    if (kind === 'rivieres' && four) {
      if (Math.max(Math.abs(x), Math.abs(z)) > h - 1) return true;
      const w = 4.6 + wob(x, z, 1.2);
      const fordA = [h * 0.6, -h * 0.6].some((f) => Math.abs(z - f) < 10), fordB = [h * 0.6, -h * 0.6].some((f) => Math.abs(x - f) < 10);
      return (fordA || Math.abs(x + meander(z)) > w) && (fordB || Math.abs(z - meander(x)) > w);
    }
    if (kind === 'grandesiles' && four) {
      const w = (h < 100 ? 7 : 8.5) + wob(x, z, 2.5);
      return Math.abs(x + meander(z)) > w && Math.abs(z - meander(x)) > w;
    }
    if (kind === 'cotiere') {
      const d = (x + z) / h, bay = Math.min(Math.hypot(x - h * 0.42, z - h * 0.42), Math.hypot(x + h * 0.42, z + h * 0.42));
      return inIsland || (Math.abs(d) < 0.98 + wob(x, z, 0.2) && bay > h * 0.13 + wob(x, z, 4));
    }
    if (kind === 'continentale') {
      const u = Math.abs(x) / h, v = Math.abs(z) / h;
      return inIsland || (u ** 4 + v ** 4) ** 0.25 < 0.75 + wob(x, z, 0.07);
    }
    if (kind === 'rivieres') {
      if (Math.max(Math.abs(x), Math.abs(z)) > h - 1) return true;
      const t = (x + z) / Math.SQRT2, s = (x - z) / Math.SQRT2;
      const s0 = h * (0.12 * Math.sin((t / h) * 3) + 0.05 * Math.sin((t / h) * 7.1));
      const ford = [0, h * 0.62, -h * 0.62].some((tf) => Math.abs(t - tf) < 5.5);
      const lake = Math.min(Math.hypot(x - h * 0.12, z - h * 0.62), Math.hypot(x + h * 0.12, z + h * 0.62)) < Math.max(10, h * 0.1);
      return !lake && (ford || Math.abs(s - s0) > 4.6 + wob(x, z, 1.2));
    }
    if (kind === 'grandesiles') {
      // Deux chenaux de vide qui serpentent (bruit impair : la symétrie est conservée).
      const odd = (a: number, b: number, s2: number) => 0.5 * (fbm(a * 0.025 + 300, b * 0.025 + 300, s2, 3) - fbm(-a * 0.025 + 300, -b * 0.025 + 300, s2, 3));
      const w = (h < 100 ? 7 : 8.5) + wob(x, z, 2.5);
      return Math.abs(x + odd(x, z, seed + 41) * h * 0.9) > w && Math.abs(z + odd(x, z, seed + 43) * h * 0.9) > w;
    }
    if (kind === 'petitesiles') return inIsland || starts.some((st) => Math.hypot(x - st.x, z - st.z) < playerR + wob(x, z, playerR * 0.16));
    return true;
  };
  // Rivières à quatre : une vallée basse relie chaque base aux deux gués voisins.
  const segDist = (x: number, z: number, g: number[]) => {
    const dx = g[2] - g[0], dz = g[3] - g[1], t = Math.max(0, Math.min(1, ((x - g[0]) * dx + (z - g[1]) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - g[0] - dx * t, z - g[1] - dz * t);
  };
  const fordPaths: number[][] = [];
  if (kind === 'rivieres' && four) for (const st of starts) {
    fordPaths.push([st.x, st.z, -meander(Math.sign(st.z) * h * 0.6), Math.sign(st.z) * h * 0.6]);
    fordPaths.push([st.x, st.z, Math.sign(st.x) * h * 0.6, meander(Math.sign(st.x) * h * 0.6)]);
  }
  const inPlay = (i: number, j: number) => Math.abs(i - ext) <= half && Math.abs(j - ext) <= half;

  // 1) Niveaux bruts.
  let L = new Uint8Array(N);
  const T1 = 0.5 + (rng() - 0.5) * 0.04, T2 = T1 + 0.15 + rng() * 0.03;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = i - ext, z = j - ext;
    let e = 0.5 + (sym(x, z, 0.02, seed) - 0.5) * 2.1;
    e += 0.2 * Math.exp(-(x * x + z * z) / (2 * 20 * 20)); // plateau haut au centre : zone à disputer
    let flat = 0;
    for (const s of starts) flat = Math.max(flat, smoothstep(36, 22, Math.hypot(x - s.x, z - s.z)));
    e = lerp(e, 0.3, flat);
    let lv = e < T1 ? 0 : e < T2 ? 1 : 2;
    if (kind === 'mont') {
      // Cratère central : plateau haut, anneau moyen, puis une plaine basse qui l'entoure.
      const d = Math.hypot(x, z) + wob(x, z, 2.5), R = h * 0.2;
      if (d < R) lv = 2; else if (d < R + 11) lv = 1; else if (d < R + 22) lv = 0;
    }
    if (islands.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 3)) lv = 1;   // îles neutres : plates
    // Rivières à quatre : berges basses le long des deux chenaux, pour que les gués relient vraiment les rives.
    if (kind === 'rivieres' && four && (Math.abs(x + meander(z)) < 17 || Math.abs(z - meander(x)) < 17 || fordPaths.some((sg) => segDist(x, z, sg) < 10))) lv = 0;
    L[j * n + i] = land(x, z) ? lv : 3;                                          // 3 = vide pendant la génération
  }

  const voidMask = new Uint8Array(N);

  // 2) Nettoyage : filtre majoritaire, puis suppression des zones trop petites.
  for (let pass = 0; pass < 2; pass++) {
    const M = new Uint8Array(L);
    for (let j = 2; j < n - 2; j++) for (let i = 2; i < n - 2; i++) {
      const c = [0, 0, 0, 0];
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) c[L[(j + dj) * n + i + di]]++;
      const k = j * n + i, own = L[k];
      let best = own;
      for (let v = 0; v < 4; v++) if (c[v] > c[best]) best = v;
      M[k] = c[best] > c[own] + 2 ? best : own;
    }
    L = M;
  }
  const label = new Int32Array(N).fill(-1);
  const regionLevel: number[] = [], regionSize: number[] = [];
  const stack: number[] = [];
  const flood = (k0: number, id: number): number[] => {
    const cells = [k0]; label[k0] = id; stack.push(k0);
    while (stack.length) {
      const k = stack.pop()!, i = k % n, j = (k - i) / n;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const q = b * n + a;
        if (label[q] === -1 && L[q] === L[k0]) { label[q] = id; stack.push(q); cells.push(q); }
      }
    }
    return cells;
  };
  for (let k = 0; k < N; k++) if (label[k] === -1) {
    const cells = flood(k, regionLevel.length);
    if (cells.length < 260) { // îlot : on l'absorbe dans le niveau voisin
      const i = cells[0] % n, j = (cells[0] - i) / n;
      const nb = i > 0 ? L[j * n + i - 1] : j > 0 ? L[(j - 1) * n + i] : L[k];
      let lv = nb === L[k] ? Math.max(0, L[k] - 1) : nb;
      if (lv === 3 && L[k] !== 3) lv = L[k] === 0 ? 1 : L[k] - 1;   // un bout de terre ne disparaît pas dans le vide
      for (const c of cells) { L[c] = lv; label[c] = -2; }
    } else { regionLevel.push(L[k]); regionSize.push(cells.length); }
  }
  // ré-étiquetage après absorption
  label.fill(-1); regionLevel.length = 0; regionSize.length = 0;
  for (let k = 0; k < N; k++) if (label[k] === -1) { const cells = flood(k, regionLevel.length); regionLevel.push(L[k]); regionSize.push(cells.length); }

  // 3) Rampes : aux frontières droites entre un niveau et le suivant.
  const B = new Float32Array(N); // niveau lissé, pour estimer la direction de la pente
  for (let j = 3; j < n - 3; j++) for (let i = 3; i < n - 3; i++) {
    let s = 0;
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) s += L[(j + dj) * n + i + di];
    B[j * n + i] = s / 49;
  }
  const rotK = (k: number, q: number) => { const i = k % n, j = (k - i) / n, p = rotQ(i - ext, j - ext, q); return Math.round(p.z + ext) * n + Math.round(p.x + ext); };
  type Cand = { k: number; nx: number; nz: number };
  const cands = new Map<string, Cand[]>();
  const lv = (x: number, z: number) => { const i = Math.round(x), j = Math.round(z); return i < 0 || j < 0 || i >= n || j >= n ? 9 : L[j * n + i]; };
  for (let j = ext - half + 14; j <= ext + half - 14; j += 1) for (let i = ext - half + 14; i <= ext + half - 14; i += 1) {
    const k = j * n + i, a = L[k];
    if (a > 1) continue;
    if (L[k + 1] !== a + 1 && L[k - 1] !== a + 1 && L[k + n] !== a + 1 && L[k - n] !== a + 1) continue;
    let gx = B[k + 2] - B[k - 2], gz = B[k + 2 * n] - B[k - 2 * n];
    const gl = Math.hypot(gx, gz); if (gl < 0.05) continue;
    gx /= gl; gz /= gl;
    if (starts.some((s) => Math.hypot(i - ext - s.x, j - ext - s.z) < 30)) continue;
    if (islands.some((c) => Math.hypot(i - ext - c.x, j - ext - c.z) < c.r + 6)) continue;
    let ok = true;
    for (let s = -RAMP_HALF_W - 1; s <= RAMP_HALF_W + 1 && ok; s += 1.5) for (let t = 3; t <= RAMP_LEN / 2 + 4; t += 1.5) {
      const hx = i + gx * t - gz * s, hz = j + gz * t + gx * s, lx = i - gx * t - gz * s, lz = j - gz * t + gx * s;
      if (lv(hx, hz) !== a + 1 || lv(lx, lz) !== a) { ok = false; break; }
    }
    if (!ok) continue;
    const hi = label[Math.round(j + gz * 4) * n + Math.round(i + gx * 4)];
    const key = label[k] + ':' + hi;
    let list = cands.get(key); if (!list) cands.set(key, list = []);
    list.push({ k, nx: gx, nz: gz });
  }
  const ramps: Ramp[] = [];
  const done = new Set<string>();
  const farFromRamps = (i: number, j: number, d: number) => ramps.every((r) => Math.hypot(r.x + ext - i, r.z + ext - j) > d);
  const addRamp = (c: Cand) => {
    const i = c.k % n, j = (c.k - i) / n;
    ramps.push({ x: i - ext, z: j - ext, nx: c.nx, nz: c.nz, from: L[c.k] });
    for (const q of Q) {
      if (q === 0) continue;
      const m = rotK(c.k, q), mi = m % n, mj = (m - mi) / n, nn = rotQ(c.nx, c.nz, q);
      if (Math.hypot(mi - i, mj - j) > 16) ramps.push({ x: mi - ext, z: mj - ext, nx: nn.x, nz: nn.z, from: L[c.k] });
    }
  };
  const keys = [...cands.keys()].sort();
  for (const key of keys) {
    if (done.has(key)) continue;
    const list = cands.get(key)!.filter((c) => farFromRamps(c.k % n, Math.floor(c.k / n), 18));
    if (!list.length) continue;
    const [lo, hi] = key.split(':').map(Number);
    const first = list[Math.floor(rng() * list.length)];
    addRamp(first);
    // jumelle : la même frontière vue de l'autre côté de la carte
    done.add(key);
    for (const q of Q) {
      if (q === 0) continue;
      const m = rotK(first.k, q), mi = m % n, mj = (m - mi) / n, nn = rotQ(first.nx, first.nz, q);
      done.add(label[m] + ':' + label[Math.round(mj + nn.z * 4) * n + Math.round(mi + nn.x * 4)]);
    }
    // Les plateaux moyens ont une seconde rampe, loin de la première ; les plateaux hauts n'en ont qu'une.
    if (regionLevel[hi] === 1 && regionSize[Math.min(lo, hi)] > 0) {
      const fi = first.k % n, fj = Math.floor(first.k / n);
      let best: Cand | null = null, bd = 45;
      for (const c of list) { const d = Math.hypot(c.k % n - fi, Math.floor(c.k / n) - fj); if (d > bd && farFromRamps(c.k % n, Math.floor(c.k / n), 30)) { bd = d; best = c; } }
      if (best) addRamp(best);
    }
  }

  // 4) Hauteurs : plateaux, rampes, puis léger lissage (falaises raides mais pas verticales).
  let T = new Float32Array(N);
  for (let k = 0; k < N; k++) { if (L[k] === 3) voidMask[k] = 1; T[k] = voidMask[k] ? 0 : L[k] * PLATEAU_HEIGHT; }
  const rampMask = new Uint8Array(N);
  for (const r of ramps) {
    const ci = r.x + ext, cj = r.z + ext, R = Math.ceil(RAMP_LEN / 2 + RAMP_HALF_W + 2);
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const t = (i - ci) * r.nx + (j - cj) * r.nz, s = -(i - ci) * r.nz + (j - cj) * r.nx;
      if (Math.abs(s) > RAMP_HALF_W || Math.abs(t) > RAMP_LEN / 2) continue;
      T[j * n + i] = PLATEAU_HEIGHT * (r.from + clamp((t + RAMP_LEN / 2) / RAMP_LEN, 0, 1));
      rampMask[j * n + i] = 1;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    const U = new Float32Array(T);
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
      const k = j * n + i;
      U[k] = (T[k] * 4 + (T[k - 1] + T[k + 1] + T[k - n] + T[k + n]) * 2 + T[k - n - 1] + T[k - n + 1] + T[k + n - 1] + T[k + n + 1]) / 16;
    }
    T = U;
  }

  // 5) Dunes légères et massif infranchissable autour de la carte.
  const heights = T, levels = L, hasVoid = voidMask.includes(1);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = i - ext, z = j - ext;
    let flat = 0;
    for (const s of starts) flat = Math.max(flat, smoothstep(30, 18, Math.hypot(x - s.x, z - s.z)));
    let h = heights[k] + (sym(x, z, 0.09, seed + 13, 3) - 0.5) * 0.9 * (1 - flat) * (rampMask[k] ? 0.2 : 1);
    const db = Math.max(Math.abs(x), Math.abs(z)) - half;
    const t = VOID_BORDER.has(kind) ? 0 : smoothstep(-5, 16, db);
    if (t > 0) {
      h = lerp(h, 9 + fbm(x * 0.045 + 50, z * 0.045 + 50, seed + 29, 4) * 22, t);
      if (db > -1) levels[k] = 3;
    }
    if (hasVoid) {
      // Bord du vide arrondi : la terre plonge doucement, puis le vide s'enfonce ; la coupe à l'écran suit une courbe.
      let v = 0, c = 0;
      for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const a2 = i + di, b2 = j + dj; if (a2 >= 0 && b2 >= 0 && a2 < n && b2 < n) { v += voidMask[b2 * n + a2]; c++; } }
      v /= c;
      if (voidMask[k]) { h = -4 - 26 * smoothstep(0.42, 0.9, v); levels[k] = 4; }
      else if (v > 0.18) h = lerp(h, Math.min(h, -2.5), smoothstep(0.18, 0.5, v));
    }
    heights[k] = h;
    void inPlay;
  }

  const heightAt = (x: number, z: number): number => {
    const fx = clamp(x + ext, 0, n - 1.001), fz = clamp(z + ext, 0, n - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, k = iz * n + ix;
    const a = heights[k], b = heights[k + 1], c = heights[k + n], d = heights[k + n + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  };
  const levelAt = (x: number, z: number): number => levels[clamp(Math.round(z + ext), 0, n - 1) * n + clamp(Math.round(x + ext), 0, n - 1)];
  const rampNear = (x: number, z: number, r: number): boolean => ramps.some((q) => Math.hypot(q.x - x, q.z - z) < r + RAMP_LEN / 2);
  const isVoid = (x: number, z: number): boolean => voidMask[clamp(Math.round(z + ext), 0, n - 1) * n + clamp(Math.round(x + ext), 0, n - 1)] === 1;
  return { seed, half, ext, n, heights, levels, rampMask, ramps, starts, kind, voidMask, islands, isVoid, heightAt, levelAt, rampNear };
}

/** Pente locale (0 = plat), utile pour le placement du décor. */
export function slopeAt(map: TerrainMap, x: number, z: number): number {
  const dx = map.heightAt(x + 1, z) - map.heightAt(x - 1, z), dz = map.heightAt(x, z + 1) - map.heightAt(x, z - 1);
  return Math.hypot(dx, dz) / 2;
}
