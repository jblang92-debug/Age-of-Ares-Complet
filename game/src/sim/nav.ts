// Grille de navigation (1 case = 1 m) et champs de flux : un seul calcul de chemin par groupe.
import type { TerrainMap } from '../mapgen/terrain';
import type { MapObjects } from '../mapgen/objects';

export const INF = 1e9;
/** Pente maximale franchissable (mètres de dénivelé par mètre). Au-delà : falaise. */
export const MAX_SLOPE = 0.62;

export class NavGrid {
  readonly size: number;
  /** blocked[0] : unités à pied ; blocked[1] : véhicules (obstacles élargis d'une case). */
  readonly blocked: [Uint8Array, Uint8Array];
  /** Change à chaque modification (bâtiment posé, gisement épuisé) : les chemins en cours sont recalculés. */
  version = 0;
  private fixed: Uint8Array;   // relief infranchissable + poches fermées
  private occ: Uint8Array;     // nombre d'objets posés sur chaque case
  private cache = new Map<string, { f: Float32Array; reach: number }>();
  /** Tas binaire réutilisé (évite d'allouer à chaque calcul). */
  private hc = new Int32Array(1024); private hd = new Float32Array(1024);
  /** Numéro de la zone de terre ferme de chaque case (deux cases de zones différentes ne sont pas reliées à pied). */
  region: Int32Array = new Int32Array(0);
  /** Portes : propriétaire de la porte sur chaque case (-1 : aucune). Une porte est fermée aux autres camps. */
  private gate: Int8Array;
  private gates = 0;

  constructor(readonly map: TerrainMap, objects: MapObjects) {
    const S = this.size = map.half * 2;
    const f = this.fixed = new Uint8Array(S * S);
    this.occ = new Uint8Array(S * S);
    this.gate = new Int8Array(S * S).fill(-1);
    for (let iz = 0; iz < S; iz++) for (let ix = 0; ix < S; ix++) {
      const x = ix - map.half, z = iz - map.half;
      const h00 = map.heightAt(x, z), h10 = map.heightAt(x + 1, z), h01 = map.heightAt(x, z + 1), h11 = map.heightAt(x + 1, z + 1);
      const steep = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00), Math.abs(h11 - h10), Math.abs(h11 - h01), Math.abs(h11 - h00) / 1.414, Math.abs(h10 - h01) / 1.414);
      if (steep > MAX_SLOPE || ix < 2 || iz < 2 || ix >= S - 2 || iz >= S - 2 || map.isVoid(x, z) || map.isVoid(x + 1, z) || map.isVoid(x, z + 1) || map.isVoid(x + 1, z + 1)) f[iz * S + ix] = 1;
    }
    this.blocked = [new Uint8Array(S * S), new Uint8Array(S * S)];
    for (const o of objects.buildings) this.disc(o.x, o.z, o.block, 1);
    for (const o of objects.rocks) this.disc(o.x, o.z, o.block, 1);
    for (const o of objects.resources) this.disc(o.x, o.z, o.sx * 0.75, 1);
    this.refresh(0, 0, S - 1, S - 1);
    // Les poches isolées (entre deux obstacles, îlots de plateau) sont fermées : aucune unité au sol n'y entre.
    for (const g of this.blocked) {
      const comp = new Int32Array(S * S).fill(-1), sizes: number[] = [], st: number[] = [];
      for (let k = 0; k < S * S; k++) {
        if (g[k] || comp[k] >= 0) continue;
        const id = sizes.length; let size = 0; comp[k] = id; st.push(k);
        while (st.length) {
          const c = st.pop()!, ix = c % S; size++;
          if (ix > 0 && !g[c - 1] && comp[c - 1] < 0) { comp[c - 1] = id; st.push(c - 1); }
          if (ix < S - 1 && !g[c + 1] && comp[c + 1] < 0) { comp[c + 1] = id; st.push(c + 1); }
          if (c >= S && !g[c - S] && comp[c - S] < 0) { comp[c - S] = id; st.push(c - S); }
          if (c < S * S - S && !g[c + S] && comp[c + S] < 0) { comp[c + S] = id; st.push(c + S); }
        }
        sizes.push(size);
      }
      // Seules les petites poches sont fermées ; les îles restent praticables (on y accède par navette).
      if (g === this.blocked[0]) {
        // Une poche au bord du vide est une île (ou un bout d'île) : elle reste ouverte.
        const shore = new Uint8Array(sizes.length), m = this.map;
        for (let k = 0; k < S * S; k++) if (!g[k] && !shore[comp[k]]) {
          const x = (k % S) + 0.5 - m.half, z = Math.floor(k / S) + 0.5 - m.half;
          if (m.isVoid(x + 2, z) || m.isVoid(x - 2, z) || m.isVoid(x, z + 2) || m.isVoid(x, z - 2)) shore[comp[k]] = 1;
        }
        for (let k = 0; k < S * S; k++) if (!g[k] && sizes[comp[k]] < 150 && !(shore[comp[k]] && sizes[comp[k]] >= 30)) f[k] = 1;
        this.region = comp;
      }
    }
    this.refresh(0, 0, S - 1, S - 1);
    this.version = 0;
  }

  private disc(cx: number, cz: number, r: number, delta: number) {
    if (r <= 0) return;
    const S = this.size, h = this.map.half;
    for (let iz = Math.floor(cz - r + h); iz <= Math.floor(cz + r + h); iz++)
      for (let ix = Math.floor(cx - r + h); ix <= Math.floor(cx + r + h); ix++) {
        if (ix < 0 || iz < 0 || ix >= S || iz >= S) continue;
        if (Math.hypot(ix + 0.5 - h - cx, iz + 0.5 - h - cz) <= r) this.occ[iz * S + ix] += delta;
      }
  }
  private refresh(x0: number, z0: number, x1: number, z1: number, bump = true) {
    const S = this.size, [b, w] = this.blocked;
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(S - 1, x1); z1 = Math.min(S - 1, z1);
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) { const k = iz * S + ix; b[k] = this.fixed[k] || this.occ[k] ? 1 : 0; }
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      let any = 0;
      for (let dz = -1; dz <= 1 && !any; dz++) for (let dx = -1; dx <= 1; dx++) {
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= S || jz >= S || this.fixed[jz * S + jx] || this.occ[jz * S + jx]) { any = 1; break; }
      }
      w[iz * S + ix] = any;
    }
    // Un obstacle qui disparaît ne casse aucun chemin en cours : seuls les nouveaux calculs en tiennent compte.
    if (bump) this.version++;
    this.cache.clear();
  }
  /** Pose (on = true) ou retire un obstacle rond : bâtiment, gisement. */
  setDisc(x: number, z: number, r: number, on: boolean) {
    this.disc(x, z, r, on ? 1 : -1);
    const h = this.map.half;
    this.refresh(Math.floor(x - r + h) - 2, Math.floor(z - r + h) - 2, Math.floor(x + r + h) + 2, Math.floor(z + r + h) + 2, on);
  }
  /** Pose (owner >= 0) ou retire (owner = -1) une porte. */
  setGate(x: number, z: number, r: number, owner: number) {
    const S = this.size, h = this.map.half;
    for (let iz = Math.floor(z - r + h); iz <= Math.floor(z + r + h); iz++) for (let ix = Math.floor(x - r + h); ix <= Math.floor(x + r + h); ix++) {
      if (ix < 0 || iz < 0 || ix >= S || iz >= S) continue;
      if (Math.hypot(ix + 0.5 - h - x, iz + 0.5 - h - z) <= r) this.gate[iz * S + ix] = owner;
    }
    this.gates += owner >= 0 ? 1 : -1;
    this.version++; this.cache.clear();
  }
  /** Champ de flux mis en cache : plusieurs unités allant au même endroit partagent le calcul.
   *  `reach` limite le calcul aux cases à moins de cette distance de marche (trajets courts : bien plus rapide). */
  field(tx: number, tz: number, wide: 0 | 1, owner = -1, reach = INF): Float32Array {
    if (this.gates <= 0) owner = -1;
    const key = this.cell(tx, tz) + ':' + wide + ':' + owner;
    const e = this.cache.get(key);
    if (e && e.reach >= reach) return e.f;
    if (!e && this.cache.size > 40) this.cache.clear();
    const f = this.flowField(tx, tz, wide, owner, reach);
    this.cache.set(key, { f, reach });
    return f;
  }

  cell(x: number, z: number): number {
    const S = this.size, ix = Math.floor(x + this.map.half), iz = Math.floor(z + this.map.half);
    return ix < 0 || iz < 0 || ix >= S || iz >= S ? -1 : iz * S + ix;
  }
  /** Avec `owner`, les portes des autres camps comptent comme des murs. */
  walkable(x: number, z: number, wide: 0 | 1, owner = -2): boolean {
    const c = this.cell(x, z);
    return c >= 0 && !this.blocked[wide][c] && (owner === -2 || this.gate[c] < 0 || this.gate[c] === owner);
  }
  cx(c: number): number { return (c % this.size) + 0.5 - this.map.half; }
  cz(c: number): number { return Math.floor(c / this.size) + 0.5 - this.map.half; }

  /** Case libre la plus proche d'un point (recherche en spirale), ou -1. */
  nearestFree(x: number, z: number, wide: 0 | 1, taken?: Set<number>, field?: Float32Array, maxR = 14): number {
    const S = this.size, bx = Math.floor(x + this.map.half), bz = Math.floor(z + this.map.half);
    let best = -1, bestD = INF;
    for (let r = 0; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const ix = bx + dx, iz = bz + dz;
        if (ix < 0 || iz < 0 || ix >= S || iz >= S) continue;
        const c = iz * S + ix;
        if (this.blocked[wide][c] || taken?.has(c) || (field && field[c] >= INF)) continue;
        const d = Math.hypot(ix + 0.5 - this.map.half - x, iz + 0.5 - this.map.half - z);
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best >= 0 && r >= bestD) break;
    }
    return best;
  }

  /** Champ de flux : distance de marche de chaque case jusqu'à la cible (Dijkstra), jusqu'à `reach` mètres. */
  flowField(tx: number, tz: number, wide: 0 | 1, owner = -1, reach = INF): Float32Array {
    const S = this.size, blk = this.blocked[wide], gate = this.gate, useGate = this.gates > 0;
    const dist = new Float32Array(S * S).fill(INF);
    const start = this.nearestFree(tx, tz, wide);
    if (start < 0) return dist;
    let hc = this.hc, hd = this.hd, n = 0;
    const push = (c: number, d: number) => {
      if (n >= hc.length) { const c2 = new Int32Array(hc.length * 2), d2 = new Float32Array(hc.length * 2); c2.set(hc); d2.set(hd); this.hc = hc = c2; this.hd = hd = d2; }
      let i = n++;
      while (i > 0) { const p = (i - 1) >> 1; if (hd[p] <= d) break; hc[i] = hc[p]; hd[i] = hd[p]; i = p; }
      hc[i] = c; hd[i] = d;
    };
    const pop = (): number => {
      const top = hc[0]; n--;
      if (n > 0) {
        const lc = hc[n], ld = hd[n];
        let i = 0;
        for (;;) {
          let k = i * 2 + 1; if (k >= n) break;
          if (k + 1 < n && hd[k + 1] < hd[k]) k++;
          if (hd[k] >= ld) break;
          hc[i] = hc[k]; hd[i] = hd[k]; i = k;
        }
        hc[i] = lc; hd[i] = ld;
      }
      return top;
    };
    dist[start] = 0; push(start, 0);
    while (n) {
      const d0 = hd[0], c = pop();
      if (d0 > dist[c]) continue;
      if (d0 > reach) break;
      const ix = c % S, iz = (c - ix) / S;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= S || jz >= S) continue;
        const nb = jz * S + jx;
        if (blk[nb] || (useGate && gate[nb] >= 0 && gate[nb] !== owner)) continue;
        if (dx && dz && (blk[iz * S + jx] || blk[jz * S + ix])) continue; // pas de coupe en diagonale
        const nd = Math.fround(d0 + (dx && dz ? 1.4142 : 1));
        if (nd < dist[nb]) { dist[nb] = nd; push(nb, nd); }
      }
    }
    // Au-delà de la limite, les cases atteintes mais pas encore validées restent approximatives : on les efface.
    if (reach < INF) for (let i = 0; i < n; i++) if (dist[hc[i]] > reach) dist[hc[i]] = INF;
    return dist;
  }

  /** Meilleure case voisine à rejoindre depuis la case c, selon le champ. */
  next(field: Float32Array, c: number, wide: 0 | 1): number {
    const S = this.size, blk = this.blocked[wide], ix = c % S, iz = (c - ix) / S;
    let best = c, bd = field[c];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const jx = ix + dx, jz = iz + dz;
      if (jx < 0 || jz < 0 || jx >= S || jz >= S) continue;
      const n = jz * S + jx;
      if (blk[n]) continue;
      if (dx && dz && (blk[iz * S + jx] || blk[jz * S + ix])) continue;
      if (field[n] < bd) { bd = field[n]; best = n; }
    }
    return best;
  }
}
