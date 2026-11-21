import { SEPARATED } from '../mapgen/terrain';
// IA adverse. Elle ne triche pas : elle lit l'état du jeu et émet les mêmes ordres qu'un joueur.
import { Sim, type Unit, type Building, type ResNode, type UnitKind } from './sim';
import { UNITS, BUILDINGS, GAME, RESEARCH } from '../data/rules';

export type Level = 'facile' | 'normal' | 'difficile';
interface Profile { think: number; workers: number; army: number; first: number; casernes: number; turrets: number; depots: boolean; scouts: boolean; grow: number; cap: number; /** Tick à partir duquel l'IA passe en ère 2 (Infinity : jamais). */ era2: number; drones: boolean; labo: boolean; /** Ère 3 (Infinity : jamais) et Ascenseur orbital. */ era3: number; wonder: boolean }
/** Réglages par niveau : rythme de réflexion (en ticks), taille de l'économie et de l'armée, minute de la première attaque. */
export const LEVELS: Record<Level, Profile> = {
  facile:    { think: 40, workers: 8,  army: 5,  first: 5400, casernes: 1, turrets: 0, depots: false, scouts: false, grow: 2, cap: 12, era2: Infinity, drones: false, labo: false, era3: Infinity, wonder: false },
  normal:    { think: 18, workers: 14, army: 9,  first: 3600, casernes: 1, turrets: 1, depots: true,  scouts: false, grow: 3, cap: 24, era2: 3600, drones: false, labo: false, era3: 10800, wonder: false },
  difficile: { think: 8,  workers: 18, army: 14, first: 3300, casernes: 2, turrets: 2, depots: true,  scouts: true,  grow: 4, cap: 40, era2: 3000, drones: true, labo: true, era3: 7800, wonder: true },
};

export class Ai {
  private p: Profile;
  private attacking = false;
  private threshold: number;
  private lastDefend = -999;
  private placed = 0;
  // --- Cartes d'îles : transport de l'armée par navette.
  private regionCache = new Map<number, number>();
  private sep: boolean | null = null;
  private home = -1;
  private shore: { x: number; z: number } | null = null;
  private landing: { x: number; z: number } | null = null;
  private ferry = new Map<number, { st: 'idle' | 'loading' | 'flying' | 'back'; t: number }>();
  /** Centre ennemi pour lequel le rivage et le point de débarquement ont été calculés. */
  private sepFor = -1;
  /** Île voisine exploitée quand les gisements de la sienne s'épuisent ; navette qui y conduit les ouvriers. */
  private colony: { region: number; x: number; z: number } | null = null;
  private colonyChecked = -9999;
  private cf = { id: -1, st: 'idle' as 'idle' | 'loading' | 'flying' | 'back', t: 0 };
  // --- Escarmouche d'avertissement : quelques unités harcèlent les ouvriers adverses vers 3-4 min, puis rentrent.
  private raid: { ids: number[]; t: number } | null = null;
  private raided = false;

  constructor(private sim: Sim, private owner: number, readonly level: Level) {
    this.p = LEVELS[level]; this.threshold = this.p.army;
    // Doctrine de l'IA (si aucune n'a été imposée) : seule l'IA Difficile en prend une — Aéronavale sur les îles,
    // sinon Industrielle (son jeu repose sur l'économie). Facile et Normal jouent sans bonus, ce qui garde l'écart entre niveaux.
    const P = sim.players[owner];
    if (!P.doctrine && level === 'difficile') P.doctrine = SEPARATED.has(sim.map.kind) ? 'aeronavale' : 'industrielle';
  }

  step() { if ((this.sim.tick + this.owner * 3) % this.p.think === 0 && this.sim.winner < 0) this.think(); }

  private mine(kind?: string): Building[] { return this.sim.buildings.filter((b) => b.owner === this.owner && (!kind || b.kind === kind)); }
  /** Zone de terre (au sens du déplacement à pied) qui contient ce point ; -1 si aucune. */
  private regionAt(x: number, z: number): number {
    const key = Math.round(x) * 4096 + Math.round(z);
    let r = this.regionCache.get(key);
    if (r === undefined) { const c = this.sim.nav.nearestFree(x, z, 0, undefined, undefined, 9); r = c >= 0 ? this.sim.nav.region[c] : -1; this.regionCache.set(key, r); }
    return r;
  }
  private nearest(kind: ResNode['kind'], x: number, z: number): ResNode | null {
    let best: ResNode | null = null, bd = 1e9;
    const home = this.regionAt(x, z);
    for (const n of this.sim.nodes) {
      if (n.kind !== kind || n.amount <= 0) continue;
      const d = Math.hypot(n.x - x, n.z - z); if (d >= bd) continue;
      if (this.regionAt(n.x, n.z) !== home) continue;                // gisement sur une autre île : hors de portée à pied
      if (this.sim.buildings.some((b) => b.kind === 'sentinelle' && Math.hypot(b.x - n.x, b.z - n.z) < 13)) continue;   // gardé par une sentinelle
      bd = d; best = n;
    }
    return best;
  }
  /** Point de terre de la zone `region`, au bord du vide, le plus proche de (tx, tz) ; à au moins `keep` m de (ax, az). */
  private shorePoint(region: number, tx: number, tz: number, ax = 0, az = 0, keep = 0): { x: number; z: number } | null {
    const m = this.sim.map, nav = this.sim.nav;
    let best: { x: number; z: number } | null = null, bd = 1e9;
    for (let z = -m.half + 4; z <= m.half - 4; z += 3) for (let x = -m.half + 4; x <= m.half - 4; x += 3) {
      const c = nav.cell(x, z); if (c < 0 || nav.blocked[0][c] || nav.region[c] !== region) continue;
      if (!(m.isVoid(x + 7, z) || m.isVoid(x - 7, z) || m.isVoid(x, z + 7) || m.isVoid(x, z - 7))) continue;
      if (keep && Math.hypot(x - ax, z - az) < keep) continue;
      const d = Math.hypot(x - tx, z - tz); if (d < bd) { bd = d; best = { x, z }; }
    }
    return best;
  }
  /** Emplacement libre autour d'un point, à bonne distance des autres bâtiments et des gisements. */
  private spot(kind: string, cx: number, cz: number, r0: number, region = this.home): { x: number; z: number } | null {
    const r = BUILDINGS[kind].rayon;
    for (let ring = r0; ring < r0 + 26; ring += 3) for (let k = 0; k < 14; k++) {
      const a = this.placed * 1.7 + k * (Math.PI * 2 / 14) + ring * 0.37, x = cx + Math.cos(a) * ring, z = cz + Math.sin(a) * ring;
      if (!this.sim.canPlace(kind, x, z)) continue;
      if (region >= 0 && this.regionAt(x, z) !== region) continue;   // jamais de chantier sur une autre île (sauf la colonie)
      if (this.sim.buildings.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + r + 2.6)) continue;
      if (this.sim.nodes.some((n) => n.amount > 0 && Math.hypot(n.x - x, n.z - z) < r + n.r + 3)) continue;
      return { x, z };
    }
    return null;
  }

  private think() {
    const sim = this.sim, me = this.owner, P = sim.players[me], pr = this.p;
    const centre = this.mine('centre')[0];
    if (!centre) return;
    const units = sim.units.filter((u) => u.owner === me);
    const workers = units.filter((u) => u.kind === 'ouvrier'), army = units.filter((u) => u.kind !== 'ouvrier' && u.kind !== 'navette');
    const navettes = units.filter((u) => u.kind === 'navette');
    // Centre ennemi visé : le plus proche (parties à 4 : chacun pour soi ou en équipes).
    const near = (b: Building) => Math.hypot(b.x - centre0.x, b.z - centre0.z);
    const centre0 = this.mine('centre')[0] ?? { x: 0, z: 0 } as Building;
    const foeCentre = sim.buildings.filter((b) => b.kind === 'centre' && sim.foe(b.owner, me)).sort((a, b) => near(a) - near(b))[0];
    const foeWonder = sim.buildings.find((b) => sim.foe(b.owner, me) && b.kind === 'ascenseur' && b.done);
    const home = this.home = this.regionAt(centre.x, centre.z);
    if (foeCentre && this.sepFor !== foeCentre.id) { this.sep = null; this.sepFor = foeCentre.id; }   // nouvel adversaire visé : nouveau trajet
    if (this.sep === null && foeCentre) {
      this.sep = this.regionAt(foeCentre.x, foeCentre.z) !== home;
      if (this.sep) {
        // Rivage du quai : un emplacement réellement constructible, le plus proche de l'ennemi (sinon le bord le plus proche).
        let qb: { x: number; z: number } | null = null, qd = 1e9;
        for (let z = -sim.map.half + 4; z <= sim.map.half - 4; z += 2) for (let x = -sim.map.half + 4; x <= sim.map.half - 4; x += 2) {
          if (this.regionAt(x, z) !== home || !sim.canPlace('quai', x, z) || sim.nodes.some((n) => n.amount > 0 && Math.hypot(n.x - x, n.z - z) < 8)) continue;
          const d = Math.hypot(x - foeCentre.x, z - foeCentre.z); if (d < qd) { qd = d; qb = { x, z }; }
        }
        this.shore = qb ?? this.shorePoint(home, foeCentre.x, foeCentre.z);
        if (this.shore) this.landing = this.shorePoint(this.regionAt(foeCentre.x, foeCentre.z), this.shore.x, this.shore.z, foeCentre.x, foeCentre.z, 16);
      }
    }
    const sep = !!this.sep && !!this.shore && !!this.landing;
    const ice = this.nearest('glace', centre.x, centre.z), ore = this.nearest('minerai', centre.x, centre.z);
    const afford = (c: object) => !sim.canPay(me, c);
    // Unité disponible pour ma faction et mon ère, et payable.
    const ok = (k: string) => { const r = UNITS[k]; return !!r && (r.faction === undefined || r.faction === P.faction) && r.ere <= P.ere && afford(r.cout); };
    const nKind = (k: string) => army.filter((u) => u.kind === k).length;

    // --- Économie : ouvriers inactifs au travail, environ 55 % sur l'eau.
    const onOre = workers.filter((u) => u.job?.t === 'gather' && sim.nodes[u.job.node].kind === 'minerai').length;
    let oreNeed = Math.round(workers.length * 0.45) - onOre;
    // Rééquilibrage : si une ressource s'accumule pendant que l'autre manque, un ouvrier change de gisement.
    const kindOf = (u: Unit) => u.job?.t === 'gather' ? sim.nodes[u.job.node].kind : '';
    if (ore && P.eau > P.minerai * 1.5 + 120 && onOre < workers.length * 0.7) {
      oreNeed = 99;
      const w = workers.find((u) => kindOf(u) === 'glace' && u.job?.t === 'gather' && u.job.phase !== 'return');
      if (w) sim.issue({ type: 'gather', ids: [w.id], node: ore.id });
    } else if (ice && P.minerai > P.eau * 1.5 + 120 && onOre > workers.length * 0.3) {
      oreNeed = 0;
      const w = workers.find((u) => kindOf(u) === 'minerai' && u.job?.t === 'gather' && u.job.phase !== 'return');
      if (w) sim.issue({ type: 'gather', ids: [w.id], node: ice.id });
    }
    for (const u of sim.idleWorkers(me)) {
      if (sim.tick - u.fleeT < 80) continue;
      if (this.regionAt(u.x, u.z) !== home) {   // ouvrier sur une autre île (colonie) : il récolte sur place
        const [a, b] = P.minerai < P.eau ? ['minerai', 'glace'] as const : ['glace', 'minerai'] as const; const n = this.nearest(a, u.x, u.z) ?? this.nearest(b, u.x, u.z); if (n) sim.issue({ type: 'gather', ids: [u.id], node: n.id });
        continue;
      }
      const n = oreNeed > 0 ? ore ?? ice : ice ?? ore; if (oreNeed > 0) oreNeed--;
      if (n) sim.issue({ type: 'gather', ids: [u.id], node: n.id });
    }
    // Ère 2 : quelques ouvriers sur la solarite dès qu'une raffinerie existe.
    const raff = this.mine('raffinerie').find((b) => b.done);
    if (raff) {
      const sol = this.nearest('solarite', raff.x, raff.z);
      const onSol = workers.filter((u) => u.job?.t === 'gather' && sim.nodes[u.job.node].kind === 'solarite').length;
      if (sol && onSol < 3) { const w = workers.find((u) => u.job?.t === 'gather' && sim.nodes[u.job.node].kind === 'glace' && u.carry === 0); if (w) sim.issue({ type: 'gather', ids: [w.id], node: sol.id }); }
    }
    if (ice && (!centre.rally || centre.rally.node !== ice.id)) sim.issue({ type: 'rally', b: centre.id, x: ice.x, z: ice.z, node: ice.id });
    if (workers.length + centre.queue.length < pr.workers && centre.queue.length < 2 && afford(UNITS.ouvrier.cout)) sim.issue({ type: 'train', b: centre.id, kind: 'ouvrier' });

    // --- Passage en ère 2.
    const casDone = this.mine('caserne').some((b) => b.done);
    const wantAge = P.ere === 1 && !centre.task && casDone && sim.tick >= pr.era2 && workers.length >= pr.workers * 0.75;
    if (wantAge && afford(GAME.eres[1].cout)) sim.issue({ type: 'age', b: centre.id });
    // --- Passage en ère 3 (Orbitale), une fois deux bâtiments de l'ère 2 debout.
    const era2Kinds = new Set(this.mine().filter((b) => b.done && ['raffinerie', 'usine', 'hangar', 'labo', 'tourelleAA', 'bouclier', 'recycleur'].includes(b.kind)).map((b) => b.kind)).size;
    const want3 = P.ere === 2 && !centre.task && sim.tick >= pr.era3 && era2Kinds >= 2;
    if (want3 && afford(GAME.eres[2].cout)) sim.issue({ type: 'age', b: centre.id });

    // --- Chantiers : un chantier sans ouvrier en reçoit un.
    const sites = this.mine().filter((b) => !b.done);
    for (const b of sites) if (!workers.some((u) => u.job?.t === 'build' && u.job.b === b.id)) {
      const w = this.pickBuilder(workers, b.x, b.z); if (w) sim.issue({ type: 'assist', ids: [w.id], b: b.id });
    }
    // --- Constructions voulues, par priorité ; une seule à la fois.
    if (!sites.length && workers.length) {
      const count = (k: string) => this.mine(k).length;
      const build = (kind: string, cx: number, cz: number, r0: number): boolean => {
        if (!afford(BUILDINGS[kind].cout)) return true;            // on attend d'avoir de quoi payer
        const s = this.spot(kind, cx, cz, r0); if (!s) return false;
        const w = this.pickBuilder(workers, s.x, s.z); if (!w) return false;
        sim.issue({ type: 'place', owner: me, kind, x: s.x, z: s.z, ids: [w.id] }); this.placed++;
        return true;
      };
      const casernesDone = this.mine('caserne').filter((b) => b.done).length;
      const dirX = foeCentre ? foeCentre.x - centre.x : 0, dirZ = foeCentre ? foeCentre.z - centre.z : 1, dl = Math.hypot(dirX, dirZ) || 1;
      const far = (n: ResNode | null, depot: string) => !!n && Math.hypot(n.x - centre.x, n.z - centre.z) > 17 && !this.mine(depot).some((b) => Math.hypot(b.x - n.x, b.z - n.z) < 15);
      if (P.pop + 4 >= P.popCap && P.popCap < GAME.popMax && P.popCap < pr.cap + pr.workers + 6) build('habitat', centre.x - dirX / dl * 6, centre.z - dirZ / dl * 6, 9);
      else if (count('caserne') < 1 && workers.length >= 6) build('caserne', centre.x + dirX / dl * 8, centre.z + dirZ / dl * 8, 8);
      else if (sep && casernesDone && count('quai') < 1) build('quai', this.shore!.x, this.shore!.z, 0);
      else if (sep && casernesDone && count('centrale') < 1) build('centrale', centre.x - dirX / dl * 10, centre.z - dirZ / dl * 10, 6);   // les navettes demandent de l'énergie
      else if (count('caserne') < pr.casernes && workers.length >= 10) build('caserne', centre.x + dirX / dl * 8, centre.z + dirZ / dl * 8, 10);
      else if (pr.depots && far(ice, 'stationEau')) build('stationEau', ice!.x, ice!.z, 6);
      else if (pr.depots && far(ore, 'depotMinier')) build('depotMinier', ore!.x, ore!.z, 6);
      else if (casernesDone && pr.turrets > 0 && count('centrale') < 1) build('centrale', centre.x - dirX / dl * 10, centre.z - dirZ / dl * 10, 6);
      else if ((P.ere >= 2 || (pr.turrets >= 2 && P.energie < 80 && workers.length >= 16)) && count('centrale') < 2) build('centrale', centre.x - dirX / dl * 10, centre.z - dirZ / dl * 10, 6);
      else if (P.ere >= 2 && count('usine') < 1) build('usine', centre.x + dirX / dl * 6, centre.z + dirZ / dl * 6, 12);
      else if (P.ere >= 2 && count('raffinerie') < 1 && this.nearest('solarite', centre.x, centre.z)) { const n = this.nearest('solarite', centre.x, centre.z)!; build('raffinerie', n.x, n.z, 6); }
      else if (P.ere >= 2 && count('recycleur') < (P.minerai > 1500 && P.eau < 800 ? 4 : 2) && P.eau < (P.minerai > 1500 ? 800 : 250) && workers.length >= 10) build('recycleur', centre.x + dirZ / dl * 8, centre.z - dirX / dl * 8, 8);   // eau infinie : la base ne manque plus d'eau
      else if (P.ere >= 2 && pr.labo && count('atelier') < 1 && P.energie >= 110) build('atelier', centre.x - dirX / dl * 2, centre.z - dirZ / dl * 2, 16);
      else if (P.ere >= 2 && sim.units.some((u) => sim.foe(u.owner, me) && u.fly) && count('tourelleAA') < 2) build('tourelleAA', centre.x, centre.z, 8);
      else if (P.ere >= 2 && pr.drones && count('hangar') < 1 && P.solarite >= 50) build('hangar', centre.x - dirX / dl * 4, centre.z - dirZ / dl * 4, 14);
      else if (P.ere >= 2 && pr.labo && count('labo') < 1 && P.solarite >= 50) build('labo', centre.x - dirX / dl * 8, centre.z - dirZ / dl * 8, 14);
      else if (P.ere >= 3 && count('defense') < Math.max(1, pr.turrets)) build('defense', centre.x + dirX / dl * 11, centre.z + dirZ / dl * 11, 6);
      else if (P.ere >= 3 && pr.wonder && count('ascenseur') < 1 && P.minerai >= 900 && P.eau >= 900 && P.solarite >= 500 && P.energie >= 450) build('ascenseur', centre.x - dirX / dl * 14, centre.z - dirZ / dl * 14, 16);
      else if (pr.scouts && casernesDone && count('arene') < 1 && workers.length >= 12) build('arene', centre.x + dirX / dl * 4, centre.z + dirZ / dl * 4, 12);
      else if (casernesDone && count('tourelle') < pr.turrets) build('tourelle', centre.x + dirX / dl * 13, centre.z + dirZ / dl * 13, 3);
    }

    // --- Production militaire.
    const armyCap = Math.min(pr.cap, this.threshold + 6);
    for (const c of this.mine('caserne')) {
      if (!c.done || c.queue.length >= 2 || army.length + c.queue.length >= armyCap) continue;
      if (wantAge && this.level === 'normal' && army.length >= Math.ceil(this.threshold * 0.6)) continue;   // le niveau Normal met de côté pour l'ère 2
      if (want3 && army.length >= Math.ceil(this.threshold * 0.6) && !this.attacking) continue;                // on économise pour l'ère 3
      // Contre les blindés adverses : quelques anti-blindages.
      const foeArmor = sim.units.filter((u) => sim.foe(u.owner, me) && (u.kind === 'blinde' || u.kind === 'artillerie')).length;
      const kind = foeArmor >= 2 && army.filter((u) => u.kind === 'antiblindage').length < foeArmor + 1 ? 'antiblindage'
        : pr.scouts && army.filter((u) => u.kind === 'eclaireur').length < Math.floor(army.length / 4) ? 'eclaireur' : 'fantassin';
      // Unités propres à la faction (et tireurs communs) : environ une sur trois.
      const extra = (['exo', 'grenadier', 'garde', 'commando', 'vigile', 'tireur'] as UnitKind[]).find((k) => ok(k) && nKind(k) < Math.max(1, Math.floor(army.length / (k === 'tireur' ? 6 : 4))));
      if (kind === 'fantassin' && extra) { sim.issue({ type: 'train', b: c.id, kind: extra }); }
      else if (afford(UNITS[kind].cout)) sim.issue({ type: 'train', b: c.id, kind });
      if (foeCentre && !c.rally) { const dx = foeCentre.x - c.x, dz = foeCentre.z - c.z, l = Math.hypot(dx, dz) || 1; sim.issue({ type: 'rally', b: c.id, x: c.x + dx / l * 9, z: c.z + dz / l * 9, node: -1 }); }
    }

    for (const f of this.mine('usine')) {
      if (!f.done || f.queue.length >= 1 || army.length >= armyCap) continue;
      if (want3 && army.length >= Math.ceil(this.threshold * 0.6) && !this.attacking) continue;
      const nb = army.filter((u) => u.kind === 'blinde').length, na = army.filter((u) => u.kind === 'artillerie').length;
      // Un Atelier qui attend ses premières machines passe avant l'usine.
      if (this.mine('atelier').some((w) => w.done && w.queue.length === 0) && army.filter((u) => u.kind.startsWith('striker') || u.kind.startsWith('araignee') || u.kind === 'cogneur').length < 2) continue;
      const fu = (['chasseurChars', 'avc', 'huit', 'canonAA'] as UnitKind[]).find((k) => ok(k));
      const foeAirU = sim.units.filter((u) => sim.foe(u.owner, me) && u.fly).length;
      if (foeAirU >= 3 && nKind('sam') < Math.ceil(foeAirU / 3) && ok('sam')) sim.issue({ type: 'train', b: f.id, kind: 'sam' });
      else if (fu && nb >= 1 && nKind(fu) < Math.max(1, Math.floor(army.length / 4))) sim.issue({ type: 'train', b: f.id, kind: fu });
      else if (nb >= 2 && na < Math.floor(army.length / 5) && P.solarite >= 30 && afford(UNITS.artillerie.cout)) sim.issue({ type: 'train', b: f.id, kind: 'artillerie' });
      else if (nb < Math.max(2, Math.floor(army.length / 3)) && afford(UNITS.blinde.cout)) sim.issue({ type: 'train', b: f.id, kind: 'blinde' });
    }
    // Salle d'armes : marteleurs contre les bâtiments, lames sinon ; sabreurs puis lames d'Aether aux ères suivantes.
    for (const a of this.mine('arene')) {
      if (!a.done || a.queue.length >= 1 || army.length >= armyCap) continue;
      if (want3 && army.length >= Math.ceil(this.threshold * 0.6) && !this.attacking) continue;
      const n = army.filter((u) => u.kind === 'marteleur').length;
      const kind = P.ere >= 3 && P.solarite >= 60 ? 'aether' : P.ere >= 2 ? 'sabreur' : n < Math.floor(army.length / 6) + 1 ? 'marteleur' : 'lame';
      if (afford(UNITS[kind].cout)) sim.issue({ type: 'train', b: a.id, kind });
    }
    // Atelier mécanique : araignées et Strikers.
    for (const w of this.mine('atelier')) {
      if (!w.done || w.queue.length >= 1 || army.length >= armyCap) continue;
      if (want3 && army.length >= Math.ceil(this.threshold * 0.6) && !this.attacking) continue;
      const m = army.filter((u) => u.kind.startsWith('striker') || u.kind === 'cogneur').length;
      const kind = P.ere >= 3 && P.solarite >= 80 ? (m % 2 ? 'strikerMissiles' : 'strikerAssaut') : m < 2 ? 'strikerLaser' : army.filter((u) => u.kind === 'araignee').length < 2 ? 'araignee' : 'cogneur';
      if (afford(UNITS[kind].cout)) sim.issue({ type: 'train', b: w.id, kind });
    }
    // Cartes d'îles : une navette pour 8 soldats (au plus 2).
    for (const q of this.mine('quai')) {
      if (!q.done || q.queue.length >= 1) continue;
      if (navettes.length < (army.length >= 6 ? 2 : 1) + (this.colony ? 1 : 0) && afford(UNITS.navette.cout)) sim.issue({ type: 'train', b: q.id, kind: 'navette' });
    }
    for (const h of this.mine('hangar')) {
      if (!h.done || h.queue.length >= 1 || army.length >= armyCap) continue;
      if (want3 && !this.attacking) continue;
      const foeAir = sim.units.filter((u) => sim.foe(u.owner, me) && (u.kind === 'drone' || u.kind === 'navette' || u.kind === 'intercepteur')).length;
      const big = (['zenith', 'pancake', 'executioner', 'imperial'] as UnitKind[]).find((k) => ok(k));
      const fighter = (['challenger', 'spitfire'] as UnitKind[]).find((k) => ok(k));
      if (big && nKind(big) < 2 && P.solarite >= 120) sim.issue({ type: 'train', b: h.id, kind: big });
      else if (fighter && foeAir >= 1 && nKind(fighter) < foeAir + 1) sim.issue({ type: 'train', b: h.id, kind: fighter });
      else if (P.ere >= 3 && army.filter((u) => u.kind === 'cuirasse').length < 3 && P.solarite >= 160 && afford(UNITS.cuirasse.cout)) sim.issue({ type: 'train', b: h.id, kind: 'cuirasse' });
      else if (foeAir >= 2 && army.filter((u) => u.kind === 'intercepteur').length < foeAir && afford(UNITS.intercepteur.cout)) sim.issue({ type: 'train', b: h.id, kind: 'intercepteur' });
      else if (army.filter((u) => u.kind === 'drone').length < 4 && afford(UNITS.drone.cout)) sim.issue({ type: 'train', b: h.id, kind: 'drone' });
    }
    for (const l of this.mine('labo')) {
      if (!l.done || l.task || want3) continue;
      const key = ['degats', 'armure', 'moteurs', 'recolte', ...(P.ere >= 3 ? ['nano', 'surcharge'] : [])].find((k) => !P.research.has(k));
      if (key && afford(RESEARCH[key].cout)) sim.issue({ type: 'research', b: l.id, key });
    }

    // --- Centre disputé : une petite garde sur le relais le plus proche, et la capsule si elle est à portée.
    if (sim.contested && this.level !== 'facile' && !this.attacking) {
      const idle = army.filter((u) => !u.group && u.tu < 0 && u.tb < 0 && !u.amove && !u.fly && u.kind !== 'ingenieur');
      const mineR = sim.relays.filter((r) => r.owner >= 0 && !sim.foe(r.owner, me));
      const want = sim.relays.filter((r) => (r.owner < 0 || sim.foe(r.owner, me)) && this.regionAt(r.x, r.z) === this.regionAt(centre.x, centre.z))
        .sort((p, q) => Math.hypot(p.x - centre.x, p.z - centre.z) - Math.hypot(q.x - centre.x, q.z - centre.z))[0];
      if (want && idle.length >= 4 && mineR.length < (this.level === 'difficile' ? 2 : 1)) sim.issue({ type: 'amove', ids: idle.slice(0, 3).map((u) => u.id), x: want.x, z: want.z, formation: 'libre' });
      const cap = sim.capsules.find((c) => sim.tick - c.t > 50 && Math.hypot(c.x - centre.x, c.z - centre.z) < 70);
      if (cap && idle.length) { const u = idle.sort((p, q) => Math.hypot(p.x - cap.x, p.z - cap.z) - Math.hypot(q.x - cap.x, q.z - cap.z))[idle.length > 3 ? 3 : 0]; if (u) sim.issue({ type: 'move', ids: [u.id], x: cap.x, z: cap.z, formation: 'libre' }); }
    }

    // --- Escarmouche : prévient le joueur qu'une attaque se prépare (jamais sur une carte d'îles).
    const RAID = { facile: { at: 2700, n: 1 }, normal: { at: 2100, n: 1 }, difficile: { at: 1900, n: 2 } }[this.level];
    if (!this.raided && !sep && foeCentre && sim.tick >= RAID.at && !this.attacking) {
      const pool = army.filter((u) => (u.kind === 'eclaireur' || u.kind === 'fantassin') && !u.group && u.tu < 0).sort((a, b) => (a.kind === 'eclaireur' ? 0 : 1) - (b.kind === 'eclaireur' ? 0 : 1));
      const take = pool.slice(0, RAID.n);
      if (take.length) {
        // Cible : un gisement où travaillent des ouvriers adverses, sinon les abords de leur Centre.
        const w = sim.units.find((u) => sim.foe(u.owner, me) && u.kind === 'ouvrier' && u.job?.t === 'gather');
        const tx = w ? w.x : foeCentre.x, tz = w ? w.z : foeCentre.z;
        sim.issue({ type: 'amove', ids: take.map((u) => u.id), x: tx, z: tz, formation: 'libre' });
        this.raid = { ids: take.map((u) => u.id), t: sim.tick }; this.raided = true;
      }
    }
    if (this.raid) {
      const alive = this.raid.ids.map((id) => sim.get(id)).filter((u): u is Unit => !!u);
      if (!alive.length) this.raid = null;
      else if (alive.some((u) => u.hp < u.maxHp * 0.6) || sim.tick - this.raid.t > 320) {
        sim.issue({ type: 'move', ids: alive.map((u) => u.id), x: centre.x, z: centre.z + (me ? -9 : 9), formation: 'libre' });
        this.raid = null;
      }
    }

    // --- Îles : quand les gisements de l'île s'épuisent, une partie des ouvriers part exploiter une île voisine.
    const colonyNav = SEPARATED.has(sim.map.kind) ? this.colonyStep(workers, navettes, home) : -1;
    if (colonyNav >= 0) { const i = navettes.findIndex((n) => n.id === colonyNav); if (i >= 0) navettes.splice(i, 1); }

    // --- Armée : défendre la base, sinon attaquer quand le groupe est assez gros.
    const free = (u: Unit) => !u.group && u.tu < 0 && u.tb < 0 && !u.amove;
    let threat: Unit | null = null, td = 30;
    for (const v of sim.units) { if (!sim.foe(v.owner, me)) continue; const d = Math.hypot(v.x - centre.x, v.z - centre.z); if (d < td) { td = d; threat = v; } }
    if (threat) {
      if (sim.tick - this.lastDefend > 30 && army.length) {
        this.lastDefend = sim.tick;
        sim.issue({ type: 'amove', ids: army.filter((u) => u.tu < 0).map((u) => u.id), x: threat.x, z: threat.z, formation: 'libre' });
      }
    } else if (this.attacking) {
      const aboard = navettes.reduce((a, n) => a + n.cargo.length, 0);
      if (army.length + aboard < 3) { this.attacking = false; this.threshold = Math.min(pr.cap, this.threshold + pr.grow); }
      else {
        // Un Ascenseur orbital ennemi passe avant tout : s'il tient 5 min, la partie est perdue.
        const target = foeWonder ?? foeCentre ?? sim.buildings.find((b) => sim.foe(b.owner, me) && !sim.players[b.owner].neutral);
        // Sur une carte d'îles, seuls ceux qui peuvent atteindre la cible y vont ; les autres prennent la navette.
        const reach = (u: Unit) => u.fly || !sep || !target || this.regionAt(u.x, u.z) === this.regionAt(target.x, target.z);
        const idle = army.filter((u) => free(u) && u.board < 0 && reach(u));
        if (target && idle.length) sim.issue({ type: 'amove', ids: idle.map((u) => u.id), x: target.x, z: target.z, formation: 'libre' });
        if (sep) this.ferryStep(army.filter((u) => !reach(u) && u.board < 0 && u.tu < 0 && u.tb < 0), navettes);
      }
    } else if ((army.length >= this.threshold && sim.tick >= pr.first) || (foeWonder && army.length >= 3)
      // Population au plafond (les blindés comptent double) : l'armée ne grossira plus, elle part telle quelle.
      || (sim.tick >= pr.first && army.length >= 3 && P.pop + 2 > P.popCap && (P.popCap >= GAME.popMax || P.popCap >= pr.cap + pr.workers + 6))) this.attacking = true;
    if (!this.attacking && sep) for (const nv of navettes) if (nv.cargo.length && !nv.moving && !nv.drop) sim.issue({ type: 'unload', id: nv.id, x: this.shore!.x, z: this.shore!.z });
  }

  /** Navettes : embarquer les soldats restés sur l'île, les déposer chez l'ennemi, revenir. */
  private ferryStep(waiting: Unit[], navettes: Unit[]) {
    const sim = this.sim, shore = this.shore!, land = this.landing!;
    for (const id of [...this.ferry.keys()]) if (!navettes.some((n) => n.id === id)) this.ferry.delete(id);
    for (const nv of navettes) {
      let f = this.ferry.get(nv.id);
      if (!f) this.ferry.set(nv.id, f = { st: 'idle', t: sim.tick });
      const boarding = sim.units.filter((u) => u.board === nv.id).length;
      if (f.st === 'idle') {
        // Soldats restés sur une autre île (adversaire éliminé, colonie) : la navette va les chercher sur place.
        if (waiting.length && !waiting.some((u) => this.regionAt(u.x, u.z) === this.home)) {
          const r = this.regionAt(waiting[0].x, waiting[0].z), there = waiting.filter((u) => this.regionAt(u.x, u.z) === r);
          if (Math.hypot(nv.x - there[0].x, nv.z - there[0].z) > 6) { if (!nv.moving) sim.issue({ type: 'move', ids: [nv.id], x: there[0].x, z: there[0].z, formation: 'libre' }); continue; }
          waiting = there;
        } else waiting = waiting.filter((u) => this.regionAt(u.x, u.z) === this.home);
        const take = this.fill(nv, waiting, 0);
        if (take.length) { sim.issue({ type: 'load', ids: take.map((u) => u.id), navette: nv.id }); f.st = 'loading'; f.t = sim.tick; }
        else if (Math.hypot(nv.x - shore.x, nv.z - shore.z) > 10 && !nv.moving) sim.issue({ type: 'move', ids: [nv.id], x: shore.x, z: shore.z, formation: 'libre' });
      } else if (f.st === 'loading') {
        const more = waiting.length ? this.fill(nv, waiting, sim.units.filter((u) => u.board === nv.id).reduce((a, u) => a + sim.slot(u), 0)) : [];
        if (more.length) sim.issue({ type: 'load', ids: more.map((u) => u.id), navette: nv.id });
        if (nv.cargo.length > 0 && (sim.navUsed(nv) >= sim.navCap(nv.owner) - 1 || boarding === 0 || sim.tick - f.t > 260)) {
          for (const u of sim.units) if (u.board === nv.id) u.board = -1;          // les retardataires attendront le prochain voyage
          sim.issue({ type: 'unload', id: nv.id, x: land.x, z: land.z }); f.st = 'flying'; f.t = sim.tick;
        } else if (!nv.cargo.length && !boarding && sim.tick - f.t > 40) f.st = 'idle';
      } else if (f.st === 'flying') {
        if (!nv.cargo.length) { sim.issue({ type: 'move', ids: [nv.id], x: shore.x, z: shore.z, formation: 'libre' }); f.st = 'back'; f.t = sim.tick; }
        else if (!nv.moving && !nv.drop) sim.issue({ type: 'unload', id: nv.id, x: land.x + (sim.tick % 7) - 3, z: land.z + (sim.tick % 5) - 2 });
      } else if (f.st === 'back' && (!nv.moving || sim.tick - f.t > 400)) f.st = 'idle';
    }
  }

  /** Colonie sur une île voisine : choix de l'île, transport des ouvriers, dépôts. Renvoie la navette utilisée (ou -1). */
  private colonyStep(workers: Unit[], navettes: Unit[], home: number): number {
    const sim = this.sim, me = this.owner;
    const left = (r: number) => sim.nodes.filter((n) => n.amount > 0 && n.b < 0 && (n.kind === 'glace' || n.kind === 'minerai') && this.regionAt(n.x, n.z) === r);
    if (!this.colony) {
      if (sim.tick - this.colonyChecked < 300) return -1;
      this.colonyChecked = sim.tick;
      const homeLeft = left(home);
      if (homeLeft.length >= 8 && homeLeft.some((n) => n.kind === 'glace') && homeLeft.some((n) => n.kind === 'minerai')) return -1;
      // Île la plus intéressante : beaucoup de gisements, proche, sans bâtiment ennemi.
      const centre = this.mine('centre')[0]; if (!centre) return -1;
      const score = new Map<number, { n: number; x: number; z: number; d: number }>();
      for (const n of sim.nodes) {
        if (n.amount <= 0 || n.b >= 0 || (n.kind !== 'glace' && n.kind !== 'minerai')) continue;
        const r = this.regionAt(n.x, n.z); if (r < 0 || r === home) continue;
        if (sim.buildings.some((b) => sim.foe(b.owner, me) && !sim.players[b.owner].neutral && Math.hypot(b.x - n.x, b.z - n.z) < 30)) continue;
        const d = Math.hypot(n.x - centre.x, n.z - centre.z), e = score.get(r);
        if (!e) score.set(r, { n: 1, x: n.x, z: n.z, d }); else { e.n++; if (d < e.d) { e.d = d; e.x = n.x; e.z = n.z; } }
      }
      let best: { r: number; v: number; x: number; z: number } | null = null;
      for (const [r, e] of score) { if (e.n < 4) continue; const v = e.n * 40 - e.d; if (!best || v > best.v) best = { r, v, x: e.x, z: e.z }; }
      if (!best) return -1;
      this.colony = { region: best.r, x: best.x, z: best.z };
    }
    const col = this.colony;
    if (left(col.region).length < 2) { this.colony = null; this.cf.id = -1; return -1; }
    const there = workers.filter((u) => this.regionAt(u.x, u.z) === col.region);
    // Dépôts sur la colonie.
    const sites = this.mine().filter((b) => !b.done && this.regionAt(b.x, b.z) === col.region);
    for (const b of sites) if (!there.some((u) => u.job?.t === 'build' && u.job.b === b.id)) { const w = this.pickBuilder(there, b.x, b.z); if (w) sim.issue({ type: 'assist', ids: [w.id], b: b.id }); }
    if (there.length && !sites.length) {
      const P = sim.players[me], order = P.minerai < P.eau ? [['minerai', 'depotMinier'], ['glace', 'stationEau']] as const : [['glace', 'stationEau'], ['minerai', 'depotMinier']] as const;
      for (const [kind, dk] of order) {
        const n = this.nearest(kind, col.x, col.z); if (!n || this.regionAt(n.x, n.z) !== col.region) continue;
        if (this.mine(dk).some((b) => Math.hypot(b.x - n.x, b.z - n.z) < 15)) continue;
        if (sim.canPay(me, BUILDINGS[dk].cout)) break;   // canPay renvoie la ressource manquante
        const s = this.spot(dk, n.x, n.z, 6, col.region), w = s && this.pickBuilder(there, s.x, s.z);
        if (s && w) { sim.issue({ type: 'place', owner: me, kind: dk, x: s.x, z: s.z, ids: [w.id] }); this.placed++; }
        break;
      }
    }
    // Transport : jusqu'à 8 ouvriers sur la colonie.
    let nv = navettes.find((n) => n.id === this.cf.id);
    if (!nv) { nv = navettes.length >= 2 || (navettes.length === 1 && !this.attacking) ? navettes[navettes.length - 1] : undefined; this.cf = { id: nv?.id ?? -1, st: 'idle', t: sim.tick }; }
    if (!nv) return -1;
    const f = this.cf, land = this.shorePoint(col.region, col.x, col.z) ?? col;
    if (f.st === 'idle') {
      if (there.length >= 8) { this.cf.id = -1; return -1; }       // assez de monde : la navette retourne à l'armée
      const pool = workers.filter((u) => this.regionAt(u.x, u.z) === home && u.job?.t !== 'build' && u.board < 0).slice(0, Math.min(4, 8 - there.length, Math.max(0, workers.length - 6)));
      if (!pool.length) return nv.id;
      if (Math.hypot(nv.x - pool[0].x, nv.z - pool[0].z) > 6) { if (!nv.moving) sim.issue({ type: 'move', ids: [nv.id], x: pool[0].x, z: pool[0].z, formation: 'libre' }); return nv.id; }
      sim.issue({ type: 'load', ids: pool.map((u) => u.id), navette: nv.id }); f.st = 'loading'; f.t = sim.tick;
    } else if (f.st === 'loading') {
      const boarding = sim.units.filter((u) => u.board === nv!.id).length;
      if (nv.cargo.length && (!boarding || sim.tick - f.t > 200)) { for (const u of sim.units) if (u.board === nv.id) u.board = -1; sim.issue({ type: 'unload', id: nv.id, x: land.x, z: land.z }); f.st = 'flying'; f.t = sim.tick; }
      else if (!nv.cargo.length && !boarding && sim.tick - f.t > 60) f.st = 'idle';
    } else if (f.st === 'flying') {
      if (!nv.cargo.length) { f.st = 'idle'; f.t = sim.tick; }
      else if (!nv.moving && !nv.drop && sim.tick - f.t > 30) sim.issue({ type: 'unload', id: nv.id, x: land.x + (sim.tick % 7) - 3, z: land.z + (sim.tick % 5) - 2 });
    }
    return nv.id;
  }

  /** Choisit dans `waiting` les unités qui tiennent encore dans la navette (places selon la taille). */
  private fill(nv: Unit, waiting: Unit[], reserved: number): Unit[] {
    let room = this.sim.navCap(nv.owner) - this.sim.navUsed(nv) - reserved;
    const take: Unit[] = [];
    for (let i = 0; i < waiting.length && room > 0;) {
      const s = this.sim.slot(waiting[i]);
      if (s <= room) { take.push(waiting[i]); room -= s; waiting.splice(i, 1); } else i++;
    }
    return take;
  }

  private pickBuilder(workers: Unit[], x: number, z: number): Unit | null {
    let best: Unit | null = null, bd = 1e9;
    for (const u of workers) {
      if (u.job?.t === 'build') continue;
      const d = Math.hypot(u.x - x, u.z - z) + (u.carry > 0 ? 8 : 0);
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
}
