// Simulation : TypeScript pur, sans rendu. Avance par ticks de 100 ms.
// Joueur, IA et (plus tard) ami émettent les mêmes ordres via `issue()`.
import type { TerrainMap } from '../mapgen/terrain';
import type { MapObjects } from '../mapgen/objects';
import { UNITS, BUILDINGS, GAME, RESEARCH, TURRETS, SHIELD, ION, RECYCLEUR, NAVETTE, type Cost } from '../data/rules';
import { NavGrid, INF } from './nav';

export type UnitKind = 'ouvrier' | 'fantassin' | 'eclaireur' | 'blinde' | 'artillerie' | 'drone' | 'navette' | 'ingenieur' | 'antiblindage' | 'intercepteur' | 'cuirasse'
  | 'tireur' | 'sam' | 'chasseurChars' | 'exo' | 'zenith' | 'avc' | 'challenger' | 'pancake' | 'grenadier' | 'huit' | 'executioner' | 'canonAA' | 'spitfire' | 'imperial' | 'garde' | 'commando' | 'vigile'
  | 'lame' | 'marteleur' | 'sabreur' | 'aether' | 'araignee' | 'araigneeCanon' | 'cogneur' | 'strikerLaser' | 'strikerMissiles' | 'strikerAssaut'
  | 'milicien' | 'hachier' | 'champion' | 'archer' | 'arbaletrier' | 'cavalier' | 'chevalier' | 'belier' | 'catapulte';
/** Doctrine choisie avant la partie (vide : aucune). */
export type Doctrine = '' | 'industrielle' | 'aeronavale' | 'frappe';
export type Formation = 'libre' | 'ligne' | 'colonne' | 'carre';
export type ResKind = 'eau' | 'minerai' | 'energie' | 'solarite';
export type Order =
  | { type: 'move'; ids: number[]; x: number; z: number; formation: Formation }
  | { type: 'stop'; ids: number[] }
  | { type: 'gather'; ids: number[]; node: number }
  | { type: 'place'; owner: number; kind: string; x: number; z: number; ids: number[] }
  | { type: 'assist'; ids: number[]; b: number }
  | { type: 'train'; b: number; kind: UnitKind }
  | { type: 'rally'; b: number; x: number; z: number; node: number }
  | { type: 'attack'; ids: number[]; unit: number; b: number }
  | { type: 'amove'; ids: number[]; x: number; z: number; formation: Formation }
  | { type: 'posture'; ids: number[]; posture: Posture }
  | { type: 'patrol'; ids: number[] }
  | { type: 'kill'; owner: number; ids: number[]; b: number }
  | { type: 'load'; ids: number[]; navette: number }
  | { type: 'unload'; id: number; x: number; z: number }
  | { type: 'repair'; ids: number[]; b: number }
  | { type: 'capture'; ids: number[]; b: number }
  | { type: 'ferry'; ids: number[]; navette: number; x: number; z: number }
  | { type: 'age'; b: number }
  | { type: 'research'; b: number; key: string }
  | { type: 'ion'; owner: number; on: boolean }
  | { type: 'surrender'; owner: number };
/** Agressive : poursuit l'ennemi. Défensive : revient à son poste. Tenir : ne bouge pas. Passive : ne tire que sur ordre. */
export type Posture = 'agressive' | 'defensive' | 'tenir' | 'passive';
export type SimEvent = { t: 'msg'; owner: number; text: string } | { t: 'age'; owner: number; ere: number } | { t: 'depleted'; node: number } | { t: 'built'; b: number }
  | { t: 'shot'; x0: number; z0: number; x1: number; z1: number; big: boolean; air?: boolean; from?: boolean; melee?: boolean; kind?: UnitKind; id?: number; /** Tir d'un bâtiment (tourelle, Centre…) : son type. */ bk?: string }
  | { t: 'dead'; x: number; z: number; big: boolean; id?: number; kind?: UnitKind; fly?: boolean }
  | { t: 'destroyed'; b: number; x: number; z: number; r: number }
  | { t: 'attacked'; owner: number; x: number; z: number }
  | { t: 'over'; winner: number; blitz?: boolean; wonder?: boolean; /** Fin décidée par un scénario : titre à afficher. */ title?: string }
  | { t: 'storm'; on: boolean }
  | { t: 'promo'; id: number; owner: number; vet: number }
  | { t: 'relay'; id: number; owner: number; prev: number }
  | { t: 'capsule'; id: number; x: number; z: number; what: 'land' | 'take' | 'gone'; owner?: number }
  | { t: 'ready'; owner: number; kind: UnitKind };
export interface Stats {
  recolte: number; produits: number; perdus: number; tues: number; batimentsDetruits: number;
  /** Récolte par ressource (l'énergie est celle produite par les centrales). */
  rec: Record<ResKind, number>;
  depense: number; degats: number; batimentsConstruits: number; batimentsPerdus: number; captures: number; recherches: number;
  /** Tick d'arrivée dans chaque ère (indice 0 : ère 1). */
  ereT: number[];
  popMax: number; armeeMax: number; ouvriersProduits: number; promotions: number;
  produitsPar: Record<string, number>; perdusPar: Record<string, number>;
}
/** Relevé toutes les 30 s de jeu, pour les courbes de l'écran de fin (une valeur par camp). */
export interface Snapshot { t: number; score: number[]; mil: number[]; eco: number[]; armee: number[]; ouvriers: number[]; recolte: number[]; batiments: number[]; pop: number[] }
const newStats = (): Stats => ({ recolte: 0, produits: 0, perdus: 0, tues: 0, batimentsDetruits: 0, rec: { eau: 0, minerai: 0, energie: 0, solarite: 0 },
  depense: 0, degats: 0, batimentsConstruits: 0, batimentsPerdus: 0, captures: 0, recherches: 0, ereT: [0], popMax: 0, armeeMax: 0, ouvriersProduits: 0, promotions: 0, produitsPar: {}, perdusPar: {} });
const VEHICLE = new Set(['eclaireur', 'blinde', 'artillerie', 'sam', 'chasseurChars', 'avc', 'huit', 'canonAA', 'cavalier', 'chevalier', 'belier', 'catapulte']);
/** Machines de combat (Atelier mécanique) : comptent aussi comme véhicules pour les bonus anti-blindage. */
const MACHINE = new Set(['araignee', 'araigneeCanon', 'cogneur', 'strikerLaser', 'strikerMissiles', 'strikerAssaut']);
for (const k of MACHINE) VEHICLE.add(k);
/** Combattants au corps à corps : pas de traçante, un choc au contact. */
export const MELEE = new Set(['lame', 'marteleur', 'sabreur', 'aether', 'cogneur', 'milicien', 'hachier', 'champion', 'cavalier', 'chevalier', 'belier']);
const MOTOR = new Set(['eclaireur', 'blinde', 'artillerie', 'drone', 'intercepteur', 'sam', 'chasseurChars', 'avc', 'huit', 'canonAA', 'challenger', 'spitfire', 'zenith', 'pancake', 'executioner', 'imperial', 'araignee', 'araigneeCanon', 'cogneur', 'strikerLaser', 'strikerMissiles', 'strikerAssaut']);
const INFANTRY = new Set(['milicien', 'hachier', 'champion', 'archer', 'arbaletrier', 'fantassin', 'antiblindage', 'ingenieur', 'tireur', 'grenadier', 'lame', 'marteleur', 'sabreur', 'aether', 'exo', 'garde', 'commando', 'vigile']);
/** Catégorie d'une unité pour les bonus de dégâts (air, machine, véhicule, infanterie). */
export function unitClass(kind: string): 'air' | 'machine' | 'vehicule' | 'infanterie' | 'autre' {
  return UNITS[kind]?.vole ? 'air' : MACHINE.has(kind) ? 'machine' : VEHICLE.has(kind) ? 'vehicule' : INFANTRY.has(kind) || kind === 'ouvrier' ? 'infanterie' : 'autre';
}
const ERA1 = ['habitat', 'stationEau', 'depotMinier', 'centrale', 'caserne', 'arene', 'tourelle'];
const ERA2 = ['raffinerie', 'recycleur', 'usine', 'hangar', 'atelier', 'tourelleAA', 'bouclier', 'labo'];
/** Âges anciens : bâtiments qui comptent pour passer au Moyen Âge, puis à l'âge moderne. */
const AGE1 = ['habitat', 'stationEau', 'depotMinier', 'centrale', 'caserne', 'archerie', 'ecurie', 'tourelle', 'quai'];
const AGE2 = ['caserne', 'archerie', 'ecurie', 'atelierSiege', 'tourelle'];
/** Bâtiments exigés (2 types achevés) pour quitter l'âge `ere`. */
const NEED: Record<number, string[]> = { 1: AGE1, 2: AGE2, 3: ERA1, 4: ERA2 };
/** Ascenseur orbital : temps à tenir une fois achevé (5 min). */
export const WONDER_TICKS = 3000;

const SHAPE: Record<UnitKind, { radius: number; wide: 0 | 1; rank: number }> = {
  milicien: { radius: 0.5, wide: 0, rank: 1 }, hachier: { radius: 0.5, wide: 0, rank: 1 }, champion: { radius: 0.55, wide: 0, rank: 1 },
  archer: { radius: 0.5, wide: 0, rank: 2 }, arbaletrier: { radius: 0.5, wide: 0, rank: 2 },
  cavalier: { radius: 0.9, wide: 0, rank: 1 }, chevalier: { radius: 0.95, wide: 0, rank: 1 },
  belier: { radius: 1.3, wide: 1, rank: 0 }, catapulte: { radius: 1.3, wide: 1, rank: 3 },
  blinde: { radius: 1.25, wide: 1, rank: 0 },
  artillerie: { radius: 1.25, wide: 1, rank: 0 },
  ingenieur: { radius: 0.5, wide: 0, rank: 3 },
  antiblindage: { radius: 0.5, wide: 0, rank: 2 },
  intercepteur: { radius: 0.9, wide: 0, rank: 1 },
  eclaireur: { radius: 0.8, wide: 0, rank: 1 },
  fantassin: { radius: 0.5, wide: 0, rank: 2 },
  ouvrier: { radius: 0.5, wide: 0, rank: 3 },
  drone: { radius: 0.9, wide: 0, rank: 1 },
  navette: { radius: 1.6, wide: 0, rank: 4 },
  cuirasse: { radius: 2.2, wide: 0, rank: 0 },
  tireur: { radius: 0.5, wide: 0, rank: 3 },
  grenadier: { radius: 0.5, wide: 0, rank: 2 },
  garde: { radius: 0.55, wide: 0, rank: 1 },
  commando: { radius: 0.5, wide: 0, rank: 1 },
  vigile: { radius: 0.5, wide: 0, rank: 2 },
  exo: { radius: 0.9, wide: 0, rank: 1 },
  sam: { radius: 1.25, wide: 1, rank: 2 },
  chasseurChars: { radius: 1.25, wide: 1, rank: 0 },
  avc: { radius: 1.2, wide: 1, rank: 1 },
  huit: { radius: 1.25, wide: 1, rank: 0 },
  canonAA: { radius: 1.25, wide: 1, rank: 2 },
  challenger: { radius: 1.0, wide: 0, rank: 1 },
  spitfire: { radius: 0.9, wide: 0, rank: 1 },
  zenith: { radius: 1.3, wide: 0, rank: 1 },
  pancake: { radius: 1.6, wide: 0, rank: 0 },
  executioner: { radius: 1.8, wide: 0, rank: 0 },
  imperial: { radius: 2.4, wide: 0, rank: 0 },
  lame: { radius: 0.5, wide: 0, rank: 1 },
  marteleur: { radius: 0.55, wide: 0, rank: 1 },
  sabreur: { radius: 0.5, wide: 0, rank: 1 },
  aether: { radius: 0.55, wide: 0, rank: 1 },
  araignee: { radius: 0.95, wide: 0, rank: 1 },
  araigneeCanon: { radius: 1.0, wide: 0, rank: 0 },
  cogneur: { radius: 1.25, wide: 1, rank: 0 },
  strikerLaser: { radius: 1.25, wide: 1, rank: 0 },
  strikerMissiles: { radius: 1.25, wide: 1, rank: 0 },
  strikerAssaut: { radius: 1.3, wide: 1, rank: 0 },
};
const NODE_RES: Record<string, ResKind> = { glace: 'eau', minerai: 'minerai', solarite: 'solarite' };
const DEPOT: Record<string, ResKind[]> = { centre: ['eau', 'minerai'], stationEau: ['eau'], depotMinier: ['minerai'], raffinerie: ['solarite'] };
/** Bâtiments franchissables par leur camp : la porte est fermée aux autres. */
const OPEN = new Set(['porte']);

interface Group { owner: number; ver: number; deadline: number; tx: number; tz: number; fields: [Float32Array | null, Float32Array | null]; speed: number; extent: number; reach: number }
type Job =
  | { t: 'gather'; node: number; phase: 'go' | 'work' | 'return'; depot: number; tries: number }
  | { t: 'build'; b: number; phase: 'go' | 'work'; tries: number }
  | { t: 'repair' | 'capture'; b: number; phase: 'go' | 'work'; tries: number; t0: number };

export interface Player { /** Équipe (camps alliés) ; -1 : camp neutre, hostile à tous (sentinelles). */ team: number; neutral?: boolean; eau: number; minerai: number; energie: number; solarite: number; pop: number; popCap: number; ere: number; research: Set<string>; doctrine: Doctrine; /** Faction (indice dans GAME.factions) : style et unités propres. */ faction: number; /** Barrière ionique allumée (après la recherche). */ ion?: boolean }
export interface ResNode { id: number; kind: 'glace' | 'minerai' | 'solarite'; res: ResKind; x: number; z: number; r: number; amount: number; /** Recycleur : bâtiment associé (source infinie, un seul ouvrier). */ b: number }
export interface Building {
  id: number; owner: number; kind: string; x: number; z: number; r: number; hp: number; maxHp: number;
  progress: number; done: boolean; queue: { kind: UnitKind; left: number; total: number }[];
  rally: { x: number; z: number; node: number } | null; waiting: boolean; cd: number;
  /** Passage d'ère ou recherche en cours. */
  task: { kind: 'age' | 'research'; key: string; left: number; total: number } | null;
  /** Bouclier : énergie restante du dôme. */
  shield: number; node: number;
  /** Tick d'achèvement (merveille : compte à rebours de victoire). */
  doneT?: number;
}
export interface Unit {
  id: number; owner: number; kind: UnitKind;
  x: number; z: number; px: number; pz: number; heading: number;
  radius: number; wide: 0 | 1; speed: number;
  moving: boolean; group: Group | null; slotX: number; slotZ: number; stuck: number; best: number; homeUntil: number;
  job: Job | null; working: boolean; carry: number; carryKind: ResKind | null; lastNode: number;
  hp: number; maxHp: number; cd: number; posture: Posture;
  /** Cible : unité (tu) ou bâtiment (tb), -1 si aucune. `explicit` : cible désignée par le joueur. */
  tu: number; tb: number; explicit: boolean; chaseT: number;
  /** Attaque-déplacement en cours : destination à reprendre après chaque combat. */
  amove: { x: number; z: number } | null;
  /** Après la chute d'une cible désignée, l'unité cherche l'ennemi suivant à proximité. */
  hunt: boolean;
  /** Patrouille : indice du prochain point de la ronde (-1 : aucune). */
  patrol: number;
  anchorX: number; anchorZ: number; anchored: boolean; fleeT: number;
  /** Unité volante : ignore le relief, les murs et les obstacles. */
  fly: boolean;
  /** Navette : unités à bord, et point de débarquement demandé. */
  cargo: Unit[]; drop: { x: number; z: number } | null;
  /** Unité au sol : navette qu'elle va rejoindre pour embarquer (-1 : aucune). */
  board: number; boardT: number;
  /** Navette : destination à rejoindre une fois tout le monde à bord (« Transporter ici »). */
  ferryTo: { x: number; z: number } | null;
  /** Dernier dégât reçu (pour la régénération hors combat). */
  hitT: number;
  /** Dernier appel à l'aide lancé aux alliés voisins (tick). */
  helpT?: number;
  /** Vétérance : éliminations et étoiles (0 à 3). */
  xp: number; vet: number;
}

const DT = 0.1;
/** Relais neutre : rapporte à l'équipe qui le tient. `cap` : avancée de la capture (0 à 100) par `by`. */
export interface Relay { id: number; x: number; z: number; owner: number; by: number; cap: number }
/** Capsule de ravitaillement : tombe du ciel, le premier qui la touche la ramasse. */
export interface Capsule { id: number; x: number; z: number; t: number; taken: boolean }

export class Sim {
  tick = 0;
  readonly units: Unit[] = [];
  readonly buildings: Building[] = [];
  readonly nodes: ResNode[] = [];
  readonly players: Player[] = [];
  readonly nav: NavGrid;
  events: SimEvent[] = [];
  /** Vainqueur (-1 tant que la partie continue). */
  winner = -1;
  /** Termine la partie (scénarios) : équipe gagnante et titre de l'écran de fin. */
  endGame(team: number, title: string) { if (this.winner >= 0) return; this.winner = team; this.events.push({ t: 'over', winner: team, title }); }
  /** Mode Blitz : tick de fin (0 : partie normale). Le meilleur score l'emporte si aucun Centre n'est tombé. */
  blitzEnd = 0;
  /** Option « Centre disputé » : relais à capturer, capsules de ravitaillement, sentinelles neutres. */
  contested = false;
  readonly relays: Relay[] = [];
  readonly capsules: Capsule[] = [];
  static readonly RELAY = { r: 7, capture: 15, income: { minerai: 1.5, solarite: 0.5 } };
  static readonly CAPSULE = { first: 1200, every: 1800, fall: 50, life: 900, gift: { eau: 150, minerai: 150, solarite: 50 } };
  /** Option « Événements » : tempêtes de poussière périodiques (première vers 4 min, puis toutes les 5 min, 45 s chacune). */
  storms = false;
  /** Bac à sable : ce camp a des ressources illimitées, une population maximale et va 5 fois plus vite (-1 : aucun). */
  sandbox = -1;
  static readonly SANDBOX = { stock: 99999, pop: 200, speed: 5 };
  private spd(owner: number) { return owner === this.sandbox ? Sim.SANDBOX.speed : 1; }
  /** Départ riche : tous les camps commencent avec beaucoup de ressources (partie équitable). */
  setRich() { for (const p of this.players) if (!p.neutral) { p.eau += 3000; p.minerai += 3000; p.energie += 2000; p.solarite += 1000; } }
  static readonly STORM = { first: 2400, every: 3000, length: 450, warn: 150 };
  /** Vrai pendant une tempête : tourelles hors service, unités ralenties, vue réduite. */
  get storm(): boolean { return this.stormIn(this.tick); }
  stormIn(tick: number): boolean { const S = Sim.STORM; return this.storms && tick >= S.first && (tick - S.first) % S.every < S.length; }
  /** Secondes avant la prochaine tempête (ou avant la fin de celle en cours). */
  stormLeft(): number { const S = Sim.STORM, k = (this.tick - S.first) % S.every; return this.tick < S.first ? (S.first - this.tick) / 10 : k < S.length ? (S.length - k) / 10 : (S.every - k) / 10; }
  readonly stats: Stats[] = [];
  readonly history: Snapshot[] = [];
  /** Premier coup porté entre les deux camps (-1 : pas encore). */
  firstFight = -1;
  private alertT: number[] = [];
  private byId = new Map<number, Unit>();
  private bById = new Map<number, Building>();
  private nextId = 1;
  private queue: Order[] = [];
  private hash = new Map<number, Unit[]>();

  /** Âge de départ de la partie (1 : Antiquité, 3 : âge moderne, l'ancienne ère 1). Le menu choisit ; par défaut : moderne. */
  startAge = 3;
  /** Fixe l'âge de départ de tous les camps (à appeler avant le premier tick). */
  setStartAge(a: number) {
    this.startAge = a;
    for (let o = 0; o < this.players.length; o++) { const P = this.players[o]; if (P.neutral) continue; P.ere = a; const t = this.stats[o].ereT; t.length = 0; for (let i = 0; i < a; i++) t.push(0); }
    // Départ aux âges anciens : l'éclaireur de départ devient un cavalier éclaireur.
    if (a <= 2) for (const u of this.units.filter((x) => x.kind === 'eclaireur')) {
      const i = this.units.indexOf(u); this.units.splice(i, 1); this.byId.delete(u.id);
      this.spawn('cavalier', u.owner, u.x, u.z);
    }
    this.count();
  }
  constructor(readonly map: TerrainMap, readonly objects: MapObjects) {
    this.nav = new NavGrid(map, objects);
    objects.resources.forEach((r, i) => this.nodes.push({ id: i, kind: r.kind, res: NODE_RES[r.kind], x: r.x, z: r.z, r: r.sx * 0.75, amount: GAME.gisement[r.kind], b: -1 }));
    const d = GAME.depart;
    map.starts.forEach((s, owner) => {
      this.stats.push(newStats()); this.alertT.push(-999);
      this.players.push({ team: owner, eau: d.eau, minerai: d.minerai, energie: d.energie, solarite: d.solarite, pop: 0, popCap: 0, ere: 1, research: new Set(), doctrine: '', faction: owner % 4 });
      const c = this.addBuilding('centre', owner, s.x, s.z, true);
      void c;
    });
    this.setStartAge(this.startAge);
    this.count();
  }

  /** Vrai si ces deux camps sont ennemis (le camp neutre est hostile à tous). */
  foe(a: number, b: number): boolean { if (a === b) return false; const ta = this.players[a]?.team ?? a, tb = this.players[b]?.team ?? b; return ta < 0 || tb < 0 || ta !== tb; }
  /** Camps qui jouent vraiment (sans le camp neutre). */
  get sides(): number[] { return this.players.map((_, i) => i).filter((i) => !this.players[i].neutral); }
  /** Équipes encore en lice : celles qui ont au moins un Centre. */
  private aliveTeams(): number[] { return [...new Set(this.buildings.filter((x) => x.kind === 'centre' && !this.players[x.owner].neutral).map((x) => this.players[x.owner].team))]; }
  /** Ajoute le camp neutre (sentinelles) ; renvoie son indice. */
  addNeutral(): number {
    const i = this.players.length;
    this.stats.push(newStats()); this.alertT.push(-999);
    this.players.push({ team: -1, neutral: true, eau: 0, minerai: 0, energie: 0, solarite: 0, pop: 0, popCap: 999, ere: 1, research: new Set(), doctrine: '', faction: -1 });
    return i;
  }
  /** Met en place le centre disputé : relais symétriques, sentinelles sur les gros gisements de solarite. */
  setupContested() {
    this.contested = true;
    const h = this.map.half, n = this.sides.length;
    const spots: { x: number; z: number }[] = [{ x: 0, z: 0 }];
    // Relais latéraux, loin des bases : sur la diagonale libre (1 contre 1) ou au milieu des bords (à 4).
    if (n <= 2) { const s = this.map.starts[0], d = h * 0.48, l = Math.hypot(s.x, s.z) || 1; spots.push({ x: -s.z / l * d, z: s.x / l * d }, { x: s.z / l * d, z: -s.x / l * d }); }
    else for (const [x, z] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) spots.push({ x: x * h * 0.55, z: z * h * 0.55 });
    for (const p of spots) {
      const c = this.nav.nearestFree(p.x, p.z, 0, undefined, undefined, 10);
      if (c < 0 || this.map.isVoid(this.nav.cx(c), this.nav.cz(c))) continue;
      this.relays.push({ id: this.relays.length, x: this.nav.cx(c), z: this.nav.cz(c), owner: -1, by: -1, cap: 0 });
    }
    // Sentinelles : une par grosse poche de solarite éloignée des bases.
    const neutral = this.addNeutral();
    const sol = this.nodes.filter((nd) => nd.kind === 'solarite' && nd.b < 0 && this.map.starts.every((st) => Math.hypot(nd.x - st.x, nd.z - st.z) > 34));
    const pockets: { x: number; z: number; k: number }[] = [];
    for (const nd of sol) { const p = pockets.find((q) => Math.hypot(q.x / q.k - nd.x, q.z / q.k - nd.z) < 10); if (p) { p.x += nd.x; p.z += nd.z; p.k++; } else pockets.push({ x: nd.x, z: nd.z, k: 1 }); }
    for (const p of pockets.filter((q) => q.k >= 3).slice(0, n <= 2 ? 4 : 6)) {
      const cx = p.x / p.k, cz = p.z / p.k;
      for (let a = 0; a < 40; a++) { const x = cx + Math.cos(a * 1.3) * (5 + a * 0.15), z = cz + Math.sin(a * 1.3) * (5 + a * 0.15); if (this.canPlace('sentinelle', x, z)) { this.addBuilding('sentinelle', neutral, x, z, true); break; } }
    }
    this.count();
  }
  /** Relais et capsules, une fois par seconde. */
  private center() {
    const R = Sim.RELAY, C = Sim.CAPSULE;
    for (const r of this.relays) {
      const teams = new Map<number, number>();
      for (const u of this.units) if (!u.fly && !this.players[u.owner].neutral && u.kind !== 'navette' && Math.hypot(u.x - r.x, u.z - r.z) < R.r) teams.set(this.players[u.owner].team, u.owner);
      const ownTeam = r.owner >= 0 ? this.players[r.owner].team : -9;
      if (teams.size === 1) {
        const [t, o] = [...teams.entries()][0];
        if (t === ownTeam) r.cap = 100;
        else {
          if (r.by < 0 || this.players[r.by].team !== t) { r.by = o; r.cap = r.owner >= 0 ? -100 : 0; }   // un relais tenu doit d'abord être neutralisé
          r.cap += 100 / R.capture;
          if (r.cap >= 0 && r.owner >= 0) { const prev = r.owner; r.owner = -1; this.events.push({ t: 'relay', id: r.id, owner: -1, prev }); }
          if (r.cap >= 100) { const prev = r.owner; r.owner = o; r.cap = 100; r.by = -1; this.events.push({ t: 'relay', id: r.id, owner: o, prev }); for (const s of this.sides) this.msg(s, this.players[s].team === t ? 'Relais capturé : +minerai et solarite' : 'Un relais est tombé aux mains de l\'ennemi'); }
        }
      } else if (teams.size === 0 && r.owner < 0 && r.cap > 0) r.cap = Math.max(0, r.cap - 5);
      if (r.owner >= 0) { const P = this.players[r.owner]; P.minerai += R.income.minerai; P.solarite += R.income.solarite; this.stats[r.owner].rec.minerai += R.income.minerai; this.stats[r.owner].rec.solarite += R.income.solarite; }
    }
    // Capsules : une toutes les 3 min, autour du centre ; ramassée par la première unité au sol qui la touche.
    if (this.tick >= C.first && (this.tick - C.first) % C.every === 0) {
      const k = (this.tick / C.every) | 0, a = ((this.map.seed * 9301 + k * 49297) % 233280) / 233280 * Math.PI * 2, d = this.map.half * (0.12 + 0.25 * (((this.map.seed + k * 7919) % 97) / 97));
      const c = this.nav.nearestFree(Math.cos(a) * d, Math.sin(a) * d, 0, undefined, undefined, 12);
      if (c >= 0) { const cap = { id: this.tick, x: this.nav.cx(c), z: this.nav.cz(c), t: this.tick, taken: false }; this.capsules.push(cap); this.events.push({ t: 'capsule', id: cap.id, x: cap.x, z: cap.z, what: 'land' }); for (const s of this.sides) this.msg(s, 'Une capsule de ravitaillement tombe près du centre'); }
    }
    for (let i = this.capsules.length - 1; i >= 0; i--) {
      const cp = this.capsules[i];
      if (this.tick - cp.t < C.fall) continue;
      const u = this.units.find((v) => !v.fly && !this.players[v.owner].neutral && Math.hypot(v.x - cp.x, v.z - cp.z) < 2.6);
      if (u) {
        const P = this.players[u.owner]; for (const [k, v] of Object.entries(C.gift)) { P[k as ResKind] += v; this.stats[u.owner].rec[k as ResKind] += v; }
        this.capsules.splice(i, 1); this.events.push({ t: 'capsule', id: cp.id, x: cp.x, z: cp.z, what: 'take', owner: u.owner });
        this.msg(u.owner, 'Capsule récupérée : +150 eau, +150 minerai, +50 solarite');
      } else if (this.tick - cp.t > C.life) { this.capsules.splice(i, 1); this.events.push({ t: 'capsule', id: cp.id, x: cp.x, z: cp.z, what: 'gone' }); }
    }
  }

  /** Faction du joueur 0 ; les autres camps prennent, dans l'ordre, les factions restantes. */
  setFaction(f: number) {
    const rest = [0, 1, 2, 3].filter((k) => k !== f);
    this.players.forEach((p, o) => { if (!p.neutral) p.faction = o === 0 ? f : rest[(o - 1) % 3]; });
  }
  /** Nom de la faction d'un camp. */
  factionName(owner: number): string { return GAME.factions[this.players[owner]?.faction ?? owner] ?? ''; }
  /** Règle les équipes (2 contre 2 : [0, 1, 0, 1]). */
  setTeams(teams: number[]) { teams.forEach((t, i) => { if (this.players[i] && !this.players[i].neutral) this.players[i].team = t; }); }

  /** Vrai si l'unité peut se tenir à cet endroit (les volants passent partout dans les limites de la carte). */
  private pass(u: Unit, x: number, z: number): boolean {
    if (u.fly) return Math.max(Math.abs(x), Math.abs(z)) < this.map.half - 2 && !this.ionBlocks(u, x, z);
    return this.nav.walkable(x, z, u.wide, u.owner);
  }
  /** Barrière ionique : un appareil ennemi ne peut pas entrer dans le voile d'un mur ou d'une porte (il peut en sortir). */
  private ionBlocks(u: Unit, x: number, z: number): boolean {
    if (!this.players.some((p) => p.ion)) return false;
    for (const b of this.buildings) {
      if ((b.kind !== 'mur' && b.kind !== 'porte') || !b.done || b.hp <= 0 || !this.players[b.owner].ion || !this.foe(b.owner, u.owner)) continue;
      const R = b.r + ION.marge, dn = Math.hypot(x - b.x, z - b.z);
      if (dn < R && dn < Math.hypot(u.x - b.x, u.z - b.z)) return true;
    }
    return false;
  }
  /** Énergie demandée chaque seconde par la barrière ionique d'un camp. */
  ionCost(owner: number): number { return Math.max(1, Math.ceil(this.buildings.filter((b) => b.owner === owner && b.done && (b.kind === 'mur' || b.kind === 'porte')).length / 10) * ION.parDix); }
  get(id: number): Unit | undefined { return this.byId.get(id); }
  building(id: number): Building | undefined { return this.bById.get(id); }
  buildingAt(x: number, z: number): Building | null { for (const b of this.buildings) if (Math.hypot(b.x - x, b.z - z) < b.r + 0.6) return b; return null; }
  nodeAt(x: number, z: number): ResNode | null {
    let best: ResNode | null = null, bd = 1.6;
    for (const n of this.nodes) { if (n.amount <= 0) continue; const d = Math.hypot(n.x - x, n.z - z) - n.r; if (d < bd) { bd = d; best = n; } }
    return best;
  }
  idleWorkers(owner: number): Unit[] { return this.units.filter((u) => u.owner === owner && u.kind === 'ouvrier' && !u.job && !u.moving); }

  spawn(kind: UnitKind, owner: number, x: number, z: number): Unit {
    const sh = SHAPE[kind];
    const c = UNITS[kind].vole ? -1 : this.nav.nearestFree(x, z, sh.wide);
    if (c >= 0 && !this.nav.walkable(x, z, sh.wide)) { x = this.nav.cx(c); z = this.nav.cz(c); }
    const u: Unit = { id: this.nextId++, owner, kind, x, z, px: x, pz: z, heading: Math.atan2(-x, -z), radius: sh.radius, wide: sh.wide,
      speed: UNITS[kind].vitesse, moving: false, group: null, slotX: x, slotZ: z, stuck: 0, best: INF, homeUntil: 0,
      job: null, working: false, carry: 0, carryKind: null, lastNode: -1,
      hp: UNITS[kind].pv, maxHp: UNITS[kind].pv, cd: 0, posture: 'agressive', tu: -1, tb: -1, explicit: false, chaseT: -99, amove: null, hunt: false, patrol: -1, anchorX: x, anchorZ: z, anchored: false, fleeT: -99, fly: !!UNITS[kind].vole, cargo: [], drop: null, board: -1, boardT: -99, ferryTo: null, hitT: -999, xp: 0, vet: 0 };
    if (MOTOR.has(kind) && this.players[owner]?.research.has('moteurs')) u.speed *= 1.15;
    if (kind === 'navette') { if (this.players[owner]?.research.has('propulseurs')) u.speed *= 1.25; if (this.players[owner]?.doctrine === 'aeronavale') u.speed *= 1.25; }
    this.units.push(u); this.byId.set(u.id, u);
    return u;
  }

  /** Pose un bâtiment achevé au plus près du point donné (scénarios). */
  placeNear(kind: string, owner: number, x: number, z: number): Building | null {
    for (let a = 0; a < 90; a++) { const d = a * 0.35, x2 = x + Math.cos(a * 2.4) * d, z2 = z + Math.sin(a * 2.4) * d; if (this.canPlace(kind, x2, z2)) return this.addBuilding(kind, owner, x2, z2, true); }
    return null;
  }
  private addBuilding(kind: string, owner: number, x: number, z: number, done: boolean): Building {
    const rule = BUILDINGS[kind];
    const b: Building = { id: this.nextId++, owner, kind, x, z, r: rule.rayon, hp: done ? rule.pv : rule.pv * 0.1, maxHp: rule.pv, progress: done ? 1 : 0, done, queue: [], rally: null, waiting: false, cd: 0, task: null, shield: 0, node: -1 };
    if (this.players[owner]?.research.has('murs') && (kind === 'mur' || kind === 'porte')) { b.maxHp *= 1.5; b.hp *= 1.5; }
    this.buildings.push(b); this.bById.set(b.id, b);
    if (OPEN.has(kind)) this.nav.setGate(x, z, b.r, owner);
    else {
      this.nav.setDisc(x, z, b.r, true);
      // Les unités qui se trouvaient sur l'emplacement sont déplacées à côté.
      for (const u of this.units) if (!u.fly && !this.pass(u, u.x, u.z)) {
        const c = this.nav.nearestFree(u.x, u.z, u.wide);
        if (c >= 0) { u.x = u.px = this.nav.cx(c); u.z = u.pz = this.nav.cz(c); }
      }
    }
    return b;
  }

  /** Vrai si un bâtiment peut être posé ici : terrain plat, libre, hors rampe et hors gisement. */
  canPlace(kind: string, x: number, z: number, ignore: Building[] = []): boolean {
    // Le quai, posé au bord du vide où le terrain s'affaisse, tolère un sol moins régulier (cercle de contrôle réduit).
    const r = kind === 'quai' ? BUILDINGS[kind].rayon * 0.7 : BUILDINGS[kind].rayon, lv = this.map.levelAt(x, z);
    if (Math.max(Math.abs(x), Math.abs(z)) > this.map.half - 4 || this.map.rampNear(x, z, r - 2)) return false;
    for (let dz = -r; dz <= r; dz += 0.9) for (let dx = -r; dx <= r; dx += 0.9) {
      if (dx * dx + dz * dz > r * r) continue;
      const c = this.nav.cell(x + dx, z + dz);
      if (c < 0 || this.map.levelAt(x + dx, z + dz) !== lv) return false;
      if (this.nav.blocked[0][c] && !ignore.some((w) => Math.hypot(x + dx - w.x, z + dz - w.z) < w.r + 0.75)) return false;
    }
    if (kind === 'quai') {
      // Le quai se construit au bord du vide.
      let edge = false;
      for (let a = 0; a < 6.28 && !edge; a += 0.4) if (this.map.isVoid(x + Math.cos(a) * (r + 6), z + Math.sin(a) * (r + 6))) edge = true;
      if (!edge) return false;
    }
    return !this.buildings.some((b) => OPEN.has(b.kind) && Math.hypot(b.x - x, b.z - z) < b.r + r);
  }

  // --- Porte intégrée à un mur (comme dans Empire Earth) : posée sur un mur existant, elle remplace ses poteaux.
  /** Poteaux de mur du camp recouverts par une porte posée en (x, z). */
  wallsUnder(owner: number, x: number, z: number): Building[] {
    return this.buildings.filter((b) => b.kind === 'mur' && b.owner === owner && b.hp > 0 && Math.hypot(b.x - x, b.z - z) < BUILDINGS.porte.rayon + 0.6);
  }
  /** Point d'ancrage d'une porte : le poteau de mur le plus proche (à moins de 2,5 m), sinon le point visé. */
  gateSnap(owner: number, x: number, z: number): { x: number; z: number; wall: boolean } {
    let best: Building | null = null, bd = 2.5;
    for (const b of this.buildings) if (b.kind === 'mur' && b.owner === owner) { const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
    return best ? { x: best.x, z: best.z, wall: true } : { x, z, wall: false };
  }
  canPlaceGate(owner: number, x: number, z: number): boolean { return this.canPlace('porte', x, z, this.wallsUnder(owner, x, z)); }
  /** Retire les poteaux sous la porte et comble les trous de part et d'autre, pour que le mur reste étanche. */
  private embedGate(owner: number, x: number, z: number, under: Building[]) {
    const done = under.every((w) => w.done);
    for (const w of under) { const i = this.buildings.indexOf(w); if (i >= 0) this.buildings.splice(i, 1); this.bById.delete(w.id); this.nav.setDisc(w.x, w.z, w.r, false); }
    // Direction du mur : les poteaux restants les plus proches de part et d'autre.
    const rest = this.buildings.filter((b) => b.kind === 'mur' && b.owner === owner && Math.hypot(b.x - x, b.z - z) < BUILDINGS.porte.rayon + 3);
    if (!rest.length) return;
    rest.sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    const a = rest[0], al = Math.hypot(a.x - x, a.z - z) || 1, dx = (a.x - x) / al, dz = (a.z - z) / al;
    const other = rest.find((b) => ((b.x - x) * dx + (b.z - z) * dz) < -0.5);
    const gap = BUILDINGS.porte.rayon + BUILDINGS.mur.rayon + 0.02;
    for (const [w, sx, sz] of [[a, dx, dz], ...(other ? [[other, -dx, -dz]] : [])] as [Building, number, number][]) {
      if (Math.hypot(w.x - x, w.z - z) > gap + 0.1) this.addBuilding('mur', owner, x + sx * gap, z + sz * gap, done);
    }
  }

  canPay(owner: number, c: Cost): ResKind | null {
    const p = this.players[owner];
    for (const k of ['eau', 'minerai', 'energie', 'solarite'] as ResKind[]) if ((c[k] ?? 0) > p[k]) return k;
    return null;
  }
  private pay(owner: number, c: Cost) { const p = this.players[owner]; for (const k of ['eau', 'minerai', 'energie', 'solarite'] as ResKind[]) { p[k] -= c[k] ?? 0; this.stats[owner].depense += c[k] ?? 0; } }
  private msg(owner: number, text: string) { this.events.push({ t: 'msg', owner, text }); }

  /** Enregistre un ordre : il sera appliqué au début du prochain tick. */
  issue(order: Order) { this.queue.push(order); }
  /** Ordre reçu d'un joueur en ligne : on ne garde que ce qui lui appartient (anti-triche). null si rien ne reste. */
  own(o: Order, side: number): Order | null {
    const mineU = (id: number) => { const u = this.get(id); return !!u && u.owner === side; };
    const mineB = (id: number) => { const b = this.building(id); return !!b && b.owner === side; };
    const ids = (a: number[]) => (Array.isArray(a) ? a.filter((id) => typeof id === 'number' && mineU(id)) : []);
    switch (o.type) {
      case 'train': case 'rally': case 'age': case 'research': return mineB(o.b) ? o : null;
      case 'unload': return mineU(o.id) ? o : null;
      case 'ion': case 'surrender': return o.owner === side ? o : null;
      case 'place': { if (o.owner !== side) return null; return { ...o, ids: ids(o.ids) }; }
      case 'kill': { if (o.owner !== side) return null; const r = { ...o, ids: ids(o.ids) }; if (o.b >= 0 && !mineB(o.b)) r.b = -1; return r.ids.length || r.b >= 0 ? r : null; }
      case 'load': case 'ferry': { if (!mineU(o.navette)) return null; const r = { ...o, ids: ids(o.ids) }; return r.ids.length ? r : null; }
      default: { const r: any = { ...o, ids: ids((o as any).ids) }; return r.ids.length ? r : null; }
    }
  }

  private moveGroup(us: Unit[], x: number, z: number, formation: Formation) {
    if (!us.length) return;
    const ground = us.filter((u) => !u.fly);
    const anyWide = ground.some((u) => u.wide), wide: 0 | 1 = anyWide ? 1 : 0;
    const tc = ground.length ? this.nav.nearestFree(x, z, wide) : -1;
    if (ground.length && tc < 0) return;
    const lim = this.map.half - 4;
    const tx = tc >= 0 ? this.nav.cx(tc) : Math.max(-lim, Math.min(lim, x)), tz = tc >= 0 ? this.nav.cz(tc) : Math.max(-lim, Math.min(lim, z));
    const fields: [Float32Array | null, Float32Array | null] = [null, null];
    // Calcul limité à la zone utile (distance à vol d'oiseau x 1,5 + marge) ; s'il manque une unité qu'on peut rejoindre à pied, calcul complet.
    let reach = 0;
    for (const u of ground) reach = Math.max(reach, Math.hypot(u.x - tx, u.z - tz));
    reach = Math.ceil(reach * 1.5 + 30);
    const reg = this.nav.region, tcR = reg[this.nav.cell(tx, tz)] ?? -1;
    for (const w of [0, 1] as const) {
      if (w === 0 ? !ground.some((u) => !u.wide) : !anyWide) continue;
      let f = this.nav.field(tx, tz, w, us[0].owner, reach);
      if (reach < INF && ground.some((u) => { if (u.wide !== w) return false; const c = this.nav.cell(u.x, u.z); return c >= 0 && f[c] >= INF && reg[c] === tcR; })) { reach = INF; f = this.nav.field(tx, tz, w, us[0].owner); }
      fields[w] = f;
    }
    let cx = 0, cz = 0;
    for (const u of us) { cx += u.x; cz += u.z; }
    cx /= us.length; cz /= us.length;
    let fx = tx - cx, fz = tz - cz;
    const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const rx = -fz, rz = fx;
    const n = us.length;
    const gap = (r: number) => r * 2 + 0.6;
    const cols = formation === 'ligne' ? Math.min(Math.ceil(n / 2), 14) : formation === 'colonne' ? (n > 30 ? 3 : 2)
      : formation === 'carre' ? Math.ceil(Math.sqrt(n)) : Math.ceil(Math.sqrt(n * 1.6));
    const rows = Math.ceil(n / cols);
    // En formation : blindés devant, fantassins derrière. En ordre libre : les plus proches devant.
    const fwd = (u: Unit) => (u.x - cx) * fx + (u.z - cz) * fz, lat = (u: Unit) => (u.x - cx) * rx + (u.z - cz) * rz;
    const sorted = [...us].sort((a, b) => formation === 'libre' ? fwd(b) - fwd(a) || a.id - b.id : SHAPE[a.kind].rank - SHAPE[b.kind].rank || fwd(b) - fwd(a) || a.id - b.id);
    const group: Group = { owner: us[0].owner, ver: this.nav.version, deadline: 0, tx, tz, fields, speed: formation === 'libre' ? INF : Math.min(...us.map((u) => u.speed)), extent: 0, reach };
    // Délai de sécurité : temps de trajet estimé x 2 + 20 s.
    const longest = Math.max(...us.map((u) => { const f = u.fly ? null : fields[u.wide], c = this.nav.cell(u.x, u.z); return f && c >= 0 && f[c] < INF ? f[c] / Math.min(u.speed, group.speed) : Math.hypot(tx - u.x, tz - u.z) / Math.min(u.speed, group.speed) + 10; }));
    group.deadline = this.tick + Math.ceil((longest * 2 + 20) * 10);
    const taken = new Set<number>();
    const rowsU: Unit[][] = [];
    for (let r = 0; r < rows; r++) rowsU.push(sorted.slice(r * cols, (r + 1) * cols).sort((a, b) => lat(a) - lat(b) || a.id - b.id));
    const rowGap = rowsU.map((row) => gap(Math.max(...row.map((u) => u.radius))));
    const depth = rowGap.reduce((a, b) => a + b, 0);
    group.extent = Math.hypot(Math.max(...rowsU.map((row, r) => row.length * rowGap[r])), depth) * 0.5;
    let acc = 0;
    for (let r = 0; r < rows; r++) {
      const row = rowsU[r];
      const back = depth / 2 - acc - rowGap[r] / 2; acc += rowGap[r];
      row.forEach((u, k) => {
        const off = (k - (row.length - 1) / 2) * rowGap[r];
        const sx = tx + rx * off + fx * back, sz = tz + rz * off + fz * back;
        const c = u.fly ? -1 : this.nav.nearestFree(sx, sz, u.wide, taken, fields[u.wide] ?? undefined);
        if (u.fly) { u.slotX = Math.max(-lim, Math.min(lim, sx)); u.slotZ = Math.max(-lim, Math.min(lim, sz)); }
        else if (c >= 0) { taken.add(c); const same = this.nav.cell(sx, sz) === c; u.slotX = same ? sx : this.nav.cx(c); u.slotZ = same ? sz : this.nav.cz(c); }
        else { u.slotX = tx; u.slotZ = tz; }
        u.group = group; u.moving = true; u.stuck = 0; u.best = INF; u.homeUntil = 0;
      });
    }
  }

  /** Envoie une unité au bord d'un objet rond (gisement, bâtiment). */
  private approach(u: Unit, x: number, z: number, r: number, spread: number) {
    let a = Math.atan2(u.z - z, u.x - x) + spread;
    for (let k = 0; k < 8; k++) {
      const px = x + Math.cos(a) * (r + 0.95), pz = z + Math.sin(a) * (r + 0.95);
      if (this.pass(u, px, pz)) { this.moveGroup([u], px, pz, 'libre'); return; }
      a += (k % 2 ? -1 : 1) * (k + 1) * 0.5;
    }
    this.moveGroup([u], x + Math.cos(a) * (r + 1.5), z + Math.sin(a) * (r + 1.5), 'libre');
  }

  private clear(x0: number, z0: number, x1: number, z1: number, wide: 0 | 1, owner: number): boolean {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.5);
    for (let i = 1; i < n; i++) if (!this.nav.walkable(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, wide, owner)) return false;
    return true;
  }

  private halt(u: Unit) { u.group = null; u.moving = false; u.stuck = 0; u.homeUntil = 0; }

  private nearestNode(x: number, z: number, kind: string | null, maxD: number): ResNode | null {
    let best: ResNode | null = null, bd = maxD;
    for (const n of this.nodes) { if (n.amount <= 0 || n.b >= 0 || (kind && n.kind !== kind)) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  /** Zone de terre d'un bâtiment (case libre la plus proche de son bord), mise en cache. */
  private bReg = new Map<number, number>();
  private regionOfB(b: Building): number {
    let r = this.bReg.get(b.id);
    if (r === undefined) { const c = this.nav.nearestFree(b.x, b.z, 0, undefined, undefined, Math.ceil(b.r) + 6); r = c >= 0 ? this.nav.region[c] : -1; this.bReg.set(b.id, r); }
    return r;
  }
  private nearestDepot(u: Unit, res: ResKind): Building | null {
    let best: Building | null = null, bd = INF;
    const uc = this.nav.cell(u.x, u.z), ur = uc >= 0 ? this.nav.region[uc] : -1;
    for (const b of this.buildings) {
      if (b.owner !== u.owner || !b.done || !DEPOT[b.kind]?.includes(res)) continue;
      // Un dépôt sur une autre île n'est accessible qu'en dernier recours.
      const d = Math.hypot(b.x - u.x, b.z - u.z) - b.r + (ur >= 0 && this.regionOfB(b) !== ur ? 1e6 : 0);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  private startGather(u: Unit, n: ResNode) {
    if (n.b >= 0 && this.units.some((v) => v !== u && v.job?.t === 'gather' && v.job.node === n.id)) { this.msg(u.owner, 'Le recycleur a déjà son ouvrier'); return; }
    if (!this.buildings.some((b) => b.owner === u.owner && b.done && DEPOT[b.kind]?.includes(n.res))) { this.msg(u.owner, n.res === 'solarite' ? 'Construis une Raffinerie pour récolter la solarite' : 'Aucun dépôt disponible'); return; }
    if (u.carry > 0 && u.carryKind !== n.res) { u.carry = 0; u.carryKind = null; }
    u.job = { t: 'gather', node: n.id, phase: 'go', depot: -1, tries: 0 }; u.working = false; u.lastNode = n.id;
    this.approach(u, n.x, n.z, n.r, ((u.id % 5) - 2) * 0.3);
  }
  private startBuild(u: Unit, b: Building) {
    u.job = { t: 'build', b: b.id, phase: 'go', tries: 0 }; u.working = false;
    this.approach(u, b.x, b.z, b.r, ((u.id % 5) - 2) * 0.35);
  }
  /** Après une construction : chantier voisin, sinon retour à la récolte la plus proche. */
  private afterBuild(u: Unit) {
    u.job = null; u.working = false;
    let next: Building | null = null, bd = 32;
    for (const b of this.buildings) { if (b.owner !== u.owner || b.done) continue; const d = Math.hypot(b.x - u.x, b.z - u.z); if (d < bd) { bd = d; next = b; } }
    if (next) return this.startBuild(u, next);
    const last = this.nodes[u.lastNode];
    const n = last && last.amount > 0 ? last : this.nearestNode(u.x, u.z, null, 40);
    if (n) this.startGather(u, n);
  }

  private workers(u: Unit) {
    const j = u.job!;
    if (j.t === 'repair' || j.t === 'capture') return this.fix(u, j);
    if (j.t === 'gather') {
      const n = this.nodes[j.node];
      if (j.phase !== 'return' && n.amount <= 0) {
        const alt = this.nearestNode(n.x, n.z, n.kind, 26);
        if (alt) { const keep = u.carry; this.startGather(u, alt); u.carry = keep; }
        else if (u.carry > 0) { j.phase = 'return'; u.working = false; this.toDepot(u, j); }
        else { u.job = null; u.working = false; }
        return;
      }
      if (j.phase === 'go') {
        if (u.group) return;
        if (Math.hypot(n.x - u.x, n.z - u.z) <= n.r + u.radius + 1.7) { j.phase = 'work'; u.working = true; u.heading = Math.atan2(n.x - u.x, n.z - u.z); }
        else if (j.tries++ < 4) this.approach(u, n.x, n.z, n.r, j.tries * 0.9);
        else u.job = null;
      } else if (j.phase === 'work') {
        const rate = (n.b >= 0 ? RECYCLEUR.parSeconde : GAME.recolteParSeconde) * (this.players[u.owner].research.has('recolte') ? 1.2 : 1) * (this.players[u.owner].doctrine === 'industrielle' ? 1.15 : 1);
        const take = Math.min(rate * DT, n.amount, GAME.chargeOuvrier - u.carry);
        u.carry += take; u.carryKind = n.res; n.amount -= take;
        if (n.amount <= 0.001 && n.b < 0) { n.amount = 0; this.nav.setDisc(n.x, n.z, n.r, false); this.events.push({ t: 'depleted', node: n.id }); }
        if (u.carry >= GAME.chargeOuvrier - 0.001 || n.amount <= 0) { j.phase = 'return'; u.working = false; this.toDepot(u, j); }
      } else {
        if (u.group) return;
        const d = this.bById.get(j.depot);
        if (d && Math.hypot(d.x - u.x, d.z - u.z) <= d.r + u.radius + 1.7) {
          if (u.carryKind) { this.players[u.owner][u.carryKind] += Math.round(u.carry); this.stats[u.owner].recolte += Math.round(u.carry); this.stats[u.owner].rec[u.carryKind] += Math.round(u.carry); }
          u.carry = 0; u.carryKind = null; j.tries = 0;
          if (n.amount > 0) { j.phase = 'go'; this.approach(u, n.x, n.z, n.r, ((u.id % 5) - 2) * 0.3); }
          else { const alt = this.nearestNode(n.x, n.z, n.kind, 26); if (alt) this.startGather(u, alt); else u.job = null; }
        } else if (j.tries++ < 4) this.toDepot(u, j);
        else u.job = null;
      }
    } else {
      const b = this.bById.get(j.b);
      if (!b || b.done) return this.afterBuild(u);
      if (j.phase === 'go') {
        if (u.group) return;
        if (Math.hypot(b.x - u.x, b.z - u.z) <= b.r + u.radius + 1.7) { j.phase = 'work'; u.working = true; u.heading = Math.atan2(b.x - u.x, b.z - u.z); }
        else if (j.tries++ < 4) this.approach(u, b.x, b.z, b.r, j.tries * 0.9);
        else u.job = null;
      } else {
        const sp = this.spd(b.owner);
        b.progress += sp * DT / Math.max(BUILDINGS[b.kind].construction, 1);
        b.hp = Math.min(b.maxHp, b.hp + sp * b.maxHp * 0.9 * DT / Math.max(BUILDINGS[b.kind].construction, 1));
        if (b.progress >= 1) {
          b.progress = 1; b.done = true; b.hp = b.maxHp; b.doneT = this.tick; this.events.push({ t: 'built', b: b.id }); this.stats[b.owner].batimentsConstruits++;
          if (b.kind === 'ascenseur') for (let o = 0; o < this.players.length; o++) this.msg(o, o === b.owner ? 'Ascenseur orbital achevé : tiens-le 5 minutes pour gagner' : 'L\'ennemi a achevé un Ascenseur orbital : détruis-le en moins de 5 minutes !');
          if (b.kind === 'bouclier') b.shield = SHIELD.max * 0.3;
          if (b.kind === 'recycleur') { b.node = this.nodes.length; this.nodes.push({ id: b.node, kind: 'glace', res: 'eau', x: b.x, z: b.z, r: b.r, amount: 1e9, b: b.id }); this.startGather(u, this.nodes[b.node]); if (u.job?.t === 'gather') return; }
          this.afterBuild(u);
        }
      }
    }
  }
  private toDepot(u: Unit, j: Extract<Job, { t: 'gather' }>) {
    const d = u.carryKind ? this.nearestDepot(u, u.carryKind) : null;
    if (!d) { u.job = null; return; }
    j.depot = d.id;
    this.approach(u, d.x, d.z, d.r, ((u.id % 5) - 2) * 0.25 + j.tries * 0.8);
  }

  private count() {
    for (const p of this.players) { p.pop = 0; p.popCap = 0; }
    for (const u of this.units) { this.players[u.owner].pop += UNITS[u.kind].pop; for (const c of u.cargo) this.players[u.owner].pop += UNITS[c.kind].pop; }
    for (const b of this.buildings) if (b.done) this.players[b.owner].popCap += b.kind === 'centre' ? GAME.popCentre : b.kind === 'habitat' ? GAME.popParHabitat : 0;
    for (const p of this.players) p.popCap = Math.min(p.popCap, GAME.popMax);
    if (this.sandbox >= 0) this.players[this.sandbox].popCap = Sim.SANDBOX.pop;
  }

  private applyOrder(o: Order) {
    const mine = (ids: number[]) => ids.map((id) => this.byId.get(id)).filter((u): u is Unit => !!u);
    const reset = (u: Unit) => { u.board = -1; u.drop = null; u.job = null; u.working = false; u.tu = -1; u.tb = -1; u.explicit = false; u.amove = null; u.hunt = false; u.patrol = -1; u.anchored = false; if (u.group) this.halt(u); };
    if (o.type === 'move') { const us = mine(o.ids); us.forEach(reset); this.moveGroup(us, o.x, o.z, o.formation); }
    else if (o.type === 'stop') mine(o.ids).forEach(reset);
    else if (o.type === 'amove') { const us = mine(o.ids); us.forEach(reset); for (const u of us) if (u.kind !== 'ouvrier') u.amove = { x: o.x, z: o.z }; this.moveGroup(us, o.x, o.z, o.formation); }
    else if (o.type === 'attack') { for (const u of mine(o.ids)) if (u.kind !== 'ouvrier' && UNITS[u.kind].degats > 0) { reset(u); u.tu = o.unit; u.tb = o.b; u.explicit = true; } }
    else if (o.type === 'posture') for (const u of mine(o.ids)) u.posture = o.posture;
    else if (o.type === 'patrol') { for (const u of mine(o.ids)) if (u.kind !== 'ouvrier') {
      reset(u);
      // On commence la ronde par le point le plus proche.
      const P = this.patrolPoints(); let bi = 0, bd = 1e9;
      P.forEach((p, i) => { const d = Math.hypot(p.x - u.x, p.z - u.z); if (d < bd) { bd = d; bi = i; } });
      u.patrol = bi; this.moveGroup([u], P[bi].x, P[bi].z, 'libre');
    } }
    else if (o.type === 'gather') { const n = this.nodes[o.node]; if (n && n.amount > 0) for (const u of mine(o.ids)) if (u.kind === 'ouvrier') { u.fleeT = -99; this.startGather(u, n); } }
    else if (o.type === 'repair') {
      const b = this.bById.get(o.b);
      if (!b || !b.done || b.hp >= b.maxHp) return;
      for (const u of mine(o.ids)) if ((u.kind === 'ouvrier' || u.kind === 'ingenieur') && u.owner === b.owner) { reset(u); u.job = { t: 'repair', b: b.id, phase: 'go', tries: 0, t0: 0 }; u.working = false; this.approach(u, b.x, b.z, b.r, ((u.id % 5) - 2) * 0.35); }
    } else if (o.type === 'capture') {
      const b = this.bById.get(o.b), us = mine(o.ids).filter((u) => u.kind === 'ingenieur');
      if (!b || !us.length || !this.foe(b.owner, us[0].owner) || this.players[b.owner].neutral) return;
      if (b.kind === 'centre' || b.kind === 'mur' || b.kind === 'ascenseur' || b.hp > b.maxHp * 0.3) return this.msg(us[0].owner, 'Capture possible sous 30 % de PV (sauf Centre, Ascenseur et murs)');
      for (const u of us) { reset(u); u.job = { t: 'capture', b: b.id, phase: 'go', tries: 0, t0: 0 }; u.working = false; this.approach(u, b.x, b.z, b.r, ((u.id % 5) - 2) * 0.35); }
    } else if (o.type === 'ferry') {
      const nv = this.byId.get(o.navette);
      if (!nv || nv.kind !== 'navette') return;
      this.applyOrder({ type: 'load', ids: o.ids, navette: o.navette });
      nv.ferryTo = { x: o.x, z: o.z };
    }
    else if (o.type === 'assist') { const b = this.bById.get(o.b); if (b && !b.done) for (const u of mine(o.ids)) if (u.kind === 'ouvrier' && u.owner === b.owner) this.startBuild(u, b); }
    else if (o.type === 'place') {
      const rule = BUILDINGS[o.kind];
      if (!rule || rule.ere > this.players[o.owner].ere) return this.msg(o.owner, 'Disponible à l\'âge ' + (GAME.eres[(rule?.ere ?? 2) - 1]?.nom ?? ''));
      if (rule.ereMax && this.players[o.owner].ere > rule.ereMax) return this.msg(o.owner, 'Bâtiment d\'un âge révolu');
      const under = o.kind === 'porte' ? this.wallsUnder(o.owner, o.x, o.z) : [];
      if (!this.canPlace(o.kind, o.x, o.z, under)) return this.msg(o.owner, 'Emplacement impossible');
      const lack = this.canPay(o.owner, this.buildCost(o.owner, o.kind));
      if (lack) return this.msg(o.owner, 'Pas assez de ' + lack);
      this.pay(o.owner, this.buildCost(o.owner, o.kind));
      if (under.length) this.embedGate(o.owner, o.x, o.z, under);
      const b = this.addBuilding(o.kind, o.owner, o.x, o.z, false);
      for (const u of mine(o.ids)) if (u.kind === 'ouvrier' && u.owner === o.owner) this.startBuild(u, b);
    } else if (o.type === 'train') {
      const b = this.bById.get(o.b), rule = UNITS[o.kind];
      if (!b || !b.done || rule.produitA !== b.kind || rule.ere > this.players[b.owner].ere || (rule.ereMax && this.players[b.owner].ere > rule.ereMax)) return;
      if (rule.faction !== undefined && rule.faction !== this.players[b.owner].faction) return;
      if (b.task?.kind === 'age') return this.msg(b.owner, 'Le Centre est occupé par le passage à l\'âge suivant');
      if (b.queue.length >= 5) return this.msg(b.owner, 'File de production pleine');
      const lack = this.canPay(b.owner, rule.cout);
      if (lack) return this.msg(b.owner, 'Pas assez de ' + lack);
      this.pay(b.owner, rule.cout);
      b.queue.push({ kind: o.kind, left: rule.temps, total: rule.temps });
    } else if (o.type === 'load') {
      const nv = this.byId.get(o.navette);
      if (!nv || nv.kind !== 'navette') return;
      const us = mine(o.ids).filter((u) => !u.fly && u.owner === nv.owner);
      if (!us.length) return;
      us.forEach(reset);
      for (const u of us) { u.board = nv.id; u.boardT = -99; }
      // La navette vient se poser près du groupe.
      let cx = 0, cz = 0; for (const u of us) { cx += u.x; cz += u.z; } cx /= us.length; cz /= us.length;
      if (Math.hypot(nv.x - cx, nv.z - cz) > 5) { nv.drop = null; this.moveGroup([nv], cx, cz, 'libre'); }
    } else if (o.type === 'unload') {
      const nv = this.byId.get(o.id);
      if (!nv || nv.kind !== 'navette') return;
      let dx = o.x, dz = o.z;
      if (!this.nav.walkable(dx, dz, 0)) {
        // Point occupé (gisement, rocher) : on se pose sur la case libre la plus proche.
        const c = this.nav.nearestFree(dx, dz, 0, undefined, undefined, 8);
        if (c < 0) return this.msg(nv.owner, 'Impossible de débarquer ici');
        dx = this.nav.cx(c); dz = this.nav.cz(c);
      }
      reset(nv); nv.drop = { x: dx, z: dz };
      this.moveGroup([nv], dx, dz, 'libre');
    } else if (o.type === 'surrender') {
      // Abandon : la partie s'arrête, gagnée par la première équipe adverse encore en jeu.
      const t = this.players[o.owner].team, foes = this.aliveTeams().filter((x) => x !== t);
      this.endGame(foes[0] ?? (t === 0 ? 1 : 0), 'Abandon');
    } else if (o.type === 'kill') {
      // Le joueur supprime ses propres unités ou un de ses bâtiments (sauf le Centre).
      for (const u of mine(o.ids)) if (u.owner === o.owner && u.hp > 0) { u.hp = 0; this.stats[u.owner].perdus++; this.events.push({ t: 'dead', x: u.x, z: u.z, big: u.wide === 1, id: u.id, kind: u.kind, fly: u.fly }); }
      const b = this.bById.get(o.b);
      if (b && b.owner === o.owner && b.kind !== 'centre') b.hp = 0;
    } else if (o.type === 'age') {
      const b = this.bById.get(o.b); if (!b || b.kind !== 'centre' || b.task) return;
      const P = this.players[b.owner], next = GAME.eres[P.ere];
      if (!next || !('cout' in next)) return this.msg(b.owner, 'Âge maximal atteint');
      const need = NEED[P.ere] ?? ERA2;
      const kinds = new Set(this.buildings.filter((x) => x.owner === b.owner && x.done && need.includes(x.kind)).map((x) => x.kind));
      if (kinds.size < 2) return this.msg(b.owner, 'Il faut 2 types de bâtiments de l\'âge en cours');
      const lack = this.canPay(b.owner, next.cout);
      if (lack) return this.msg(b.owner, 'Pas assez de ' + lack);
      this.pay(b.owner, next.cout);
      b.task = { kind: 'age', key: '', left: next.duree, total: next.duree };
    } else if (o.type === 'ion') {
      const P = this.players[o.owner];
      if (!P || !P.research.has('barriere')) return;
      if (o.on && P.energie < this.ionCost(o.owner)) return this.msg(o.owner, 'Pas assez d\'énergie pour la barrière ionique');
      P.ion = o.on; this.msg(o.owner, o.on ? 'Barrière ionique activée' : 'Barrière ionique coupée');
    } else if (o.type === 'research') {
      const b = this.bById.get(o.b), r = RESEARCH[o.key];
      if (!b || b.kind !== 'labo' || !b.done || b.task || !r) return;
      const P = this.players[b.owner];
      if ((r.ere ?? 4) > P.ere) return this.msg(b.owner, 'Disponible à l\'âge ' + GAME.eres[(r.ere ?? 4) - 1].nom);
      if (P.research.has(o.key) || this.buildings.some((x) => x.owner === b.owner && x.task?.key === o.key)) return;
      const lack = this.canPay(b.owner, r.cout);
      if (lack) return this.msg(b.owner, 'Pas assez de ' + lack);
      this.pay(b.owner, r.cout);
      b.task = { kind: 'research', key: o.key, left: r.temps, total: r.temps };
    } else if (o.type === 'rally') { const b = this.bById.get(o.b); if (b) b.rally = { x: o.x, z: o.z, node: o.node }; }
  }

  step() {
    if (this.sandbox >= 0) { const P = this.players[this.sandbox], k = Sim.SANDBOX.stock; P.eau = k; P.minerai = k; P.energie = k; P.solarite = k; }
    for (const o of this.queue) this.applyOrder(o);
    this.queue.length = 0;
    if (this.storms) {
      const S = Sim.STORM, k = this.tick - S.first;
      if (k >= -S.warn && (k + S.warn) % S.every === 0) for (let o = 0; o < this.players.length; o++) this.msg(o, 'Tempête de poussière dans 15 s : les tourelles vont s\'arrêter');
      if (this.stormIn(this.tick) !== this.stormIn(this.tick - 1)) this.events.push({ t: 'storm', on: this.stormIn(this.tick) });
    }
    const nav = this.nav; let refreshed = 0;
    // Passage d'ère, recherches, bouclier.
    for (const b of this.buildings) {
      if (!b.done) continue;
      if (b.task) {
        b.task.left -= DT * this.spd(b.owner);
        if (b.task.left <= 0) {
          const P = this.players[b.owner];
          if (b.task.kind === 'age') { P.ere++; this.stats[b.owner].ereT[P.ere - 1] = this.tick; this.msg(b.owner, GAME.eres[P.ere - 1].nom + ' atteint (âge ' + P.ere + ')'); this.events.push({ t: 'age', owner: b.owner, ere: P.ere }); }
          else {
            P.research.add(b.task.key); this.stats[b.owner].recherches++; this.msg(b.owner, 'Recherche terminée : ' + RESEARCH[b.task.key].nom);
            if (b.task.key === 'murs') for (const w of this.buildings) if (w.owner === b.owner && (w.kind === 'mur' || w.kind === 'porte')) { w.maxHp *= 1.5; w.hp *= 1.5; }
            if (b.task.key === 'moteurs') for (const u of this.units) if (u.owner === b.owner && MOTOR.has(u.kind)) u.speed *= 1.15;
            if (b.task.key === 'propulseurs') for (const u of this.units) if (u.owner === b.owner && u.kind === 'navette') u.speed *= 1.25;
          }
          b.task = null;
        }
      }
      if (b.kind === 'centre' && this.tick % 10 === 0 && this.players[b.owner].ion && this.buildings.find((c) => c.kind === 'centre' && c.owner === b.owner) === b) {
        const P = this.players[b.owner], c = this.ionCost(b.owner);
        if (P.energie >= c) P.energie -= c; else { P.ion = false; this.msg(b.owner, 'Barrière ionique coupée : plus d\'énergie'); }
      }
      if (b.kind === 'bouclier' && b.shield < SHIELD.max && this.tick % 10 === 0) {
        const P = this.players[b.owner];
        if (P.energie >= SHIELD.energieParSeconde) { P.energie -= SHIELD.energieParSeconde; b.shield = Math.min(SHIELD.max, b.shield + SHIELD.recharge); }
      }
    }
    // Production et énergie.
    for (const b of this.buildings) {
      if (!b.done || !b.queue.length || b.task?.kind === 'age') continue;
      const q = b.queue[0];
      q.left = Math.max(0, q.left - DT * this.spd(b.owner));
      if (q.left > 0) continue;
      const p = this.players[b.owner];
      if (p.pop + UNITS[q.kind].pop > p.popCap) { if (!b.waiting) { b.waiting = true; this.msg(b.owner, 'Population maximale : construis un Habitat'); } continue; }
      b.waiting = false; b.queue.shift();
      const rl = b.rally, ax = rl ? rl.x - b.x : -b.x, az = rl ? rl.z - b.z : -b.z, al = Math.hypot(ax, az) || 1;
      const u = this.spawn(q.kind, b.owner, b.x + ax / al * (b.r + 1.2), b.z + az / al * (b.r + 1.2));
      p.pop += UNITS[q.kind].pop; const st = this.stats[b.owner]; st.produits++; st.produitsPar[q.kind] = (st.produitsPar[q.kind] ?? 0) + 1; if (q.kind === 'ouvrier') st.ouvriersProduits++;
      this.events.push({ t: 'ready', owner: b.owner, kind: q.kind });
      if (rl) { const n = this.nodes[rl.node]; if (n && n.amount > 0 && u.kind === 'ouvrier') this.startGather(u, n); else this.moveGroup([u], rl.x, rl.z, 'libre'); }
    }
    if (this.tick % 5 === 0) this.patrolStep();
    if (this.tick % 10 === 0) {
      if (this.contested) this.center();
      for (const b of this.buildings) if (b.done && b.kind === 'centrale') { this.players[b.owner].energie += 1; this.stats[b.owner].rec.energie += 1; }
      this.count();
      for (let o = 0; o < this.players.length; o++) {
        const st = this.stats[o], army = this.units.reduce((a, u) => a + (u.owner === o && u.kind !== 'ouvrier' && u.kind !== 'navette' ? 1 + u.cargo.length : 0), 0);
        st.popMax = Math.max(st.popMax, this.players[o].pop); st.armeeMax = Math.max(st.armeeMax, army);
      }
      if (this.tick % 300 === 0 || !this.history.length) this.history.push(this.snapshot());
      // Régénération hors combat (recherche Réparation automatique, doctrine Frappe chirurgicale).
      for (const u of this.units) {
        if (u.hp >= u.maxHp || this.tick - u.hitT < 50) continue;
        const P = this.players[u.owner], regen = (P.research.has('reparation') ? 3 : 0) + (P.doctrine === 'frappe' && u.kind !== 'ouvrier' ? 1 : 0);
        if (regen) u.hp = Math.min(u.maxHp, u.hp + regen);
      }
      for (const b of this.buildings) if (b.kind === 'ascenseur' && b.done && this.winner < 0 && this.tick - (b.doneT ?? this.tick) >= WONDER_TICKS) {
        this.winner = this.players[b.owner].team; this.events.push({ t: 'over', winner: this.winner, wonder: true });
      }
      if (this.blitzEnd && this.tick >= this.blitzEnd && this.winner < 0) {
        // Blitz : l'équipe au meilleur score total (en cas d'égalité, la plus petite).
        const ts = new Map<number, number>(); for (const o of this.sides) { const t = this.players[o].team; ts.set(t, (ts.get(t) ?? 0) + this.score(o)); }
        this.winner = [...ts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
        this.events.push({ t: 'over', winner: this.winner, blitz: true });
      }
    }

    for (const u of [...this.units]) {
      if (u.hp <= 0 || this.boarded.includes(u)) continue;
      u.px = u.x; u.pz = u.z;
      if (u.cd > 0) u.cd -= DT;
      if (u.board >= 0) this.boarding(u);
      if (u.kind === 'navette') this.shuttle(u);
      else if (u.job) this.workers(u); else if (u.kind !== 'ouvrier') this.combat(u);
      const g = u.group;
      if (!g) {
        // Une unité à sa place qui se fait bousculer y retourne (pendant 15 s après son arrivée).
        if (this.tick < u.homeUntil && !u.job) {
          const hx = u.slotX - u.x, hz = u.slotZ - u.z, hd = Math.hypot(hx, hz);
          if (hd > 0.15) { const st = Math.min(u.speed * DT * 0.6, hd), nx = u.x + hx / hd * st, nz = u.z + hz / hd * st; if (this.pass(u, nx, nz)) { u.x = nx; u.z = nz; } }
        }
        continue;
      }
      // La carte a changé (bâtiment posé) : nouveau chemin. Au plus 3 groupes par tour, les autres attendent
      // le tour suivant avec l'ancien chemin (les cases devenues bloquées sont de toute façon évitées).
      if (g.ver !== nav.version && refreshed < 3) {
        g.ver = nav.version; refreshed++;
        if (g.fields[0]) g.fields[0] = nav.field(g.tx, g.tz, 0, g.owner, g.reach);
        if (g.fields[1]) g.fields[1] = nav.field(g.tx, g.tz, 1, g.owner, g.reach);
      }
      const dxs = u.slotX - u.x, dzs = u.slotZ - u.z, dSlot = Math.hypot(dxs, dzs);
      if (dSlot < 0.2) { this.halt(u); u.homeUntil = this.tick + 150; continue; }
      const field = u.fly ? null : g.fields[u.wide];
      const c = nav.cell(u.x, u.z);
      const fd = field && c >= 0 ? field[c] : INF;
      const direct = u.fly || fd >= INF || dSlot < 2.5 || (fd < g.extent + 8 && this.clear(u.x, u.z, u.slotX, u.slotZ, u.wide, u.owner));
      let dx: number, dz: number;
      if (direct) { dx = dxs / dSlot; dz = dzs / dSlot; }
      else {
        const nc = nav.next(field!, c, u.wide);
        dx = nav.cx(nc) - u.x; dz = nav.cz(nc) - u.z;
        const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      }
      let step = Math.min(u.speed, g.speed) * DT * (this.storm ? 0.8 : 1);
      if (direct) step = Math.min(step, dSlot);
      const nx = u.x + dx * step, nz = u.z + dz * step;
      const ox = u.x, oz = u.z;
      if (this.pass(u, nx, nz)) { u.x = nx; u.z = nz; }
      else if (this.pass(u, nx, u.z)) u.x = nx;
      else if (this.pass(u, u.x, nz)) u.z = nz;
      const moved = Math.hypot(u.x - ox, u.z - oz);
      if (moved > 1e-4) {
        const want = Math.atan2(u.x - ox, u.z - oz);
        let d = want - u.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
        u.heading += Math.max(-0.9, Math.min(0.9, d));
      }
      // Progression : si l'unité ne se rapproche plus (place prise, foule), elle s'arrête sur place
      // quand elle est dans la zone d'arrivée ; loin de l'arrivée, elle abandonne après 30 s.
      const metric = direct ? dSlot : 1000 + fd;
      if (metric < u.best - 0.25) { u.best = metric; u.stuck = 0; } else u.stuck++;
      const inZone = direct || fd < g.extent + 4;
      if ((inZone && u.stuck > (u.job ? 8 : 30)) || u.stuck > 300 || this.tick > g.deadline) this.halt(u);
    }
    if (this.boarded.length) { for (const u of this.boarded) { const i = this.units.indexOf(u); if (i >= 0) this.units.splice(i, 1); this.byId.delete(u.id); } this.boarded.length = 0; }
    this.towers();
    this.sweep();
    this.separate();
    this.tick++;
  }


  // ---------------------------------------------------------------- transport
  /** Unité au sol qui rejoint une navette pour embarquer. */
  private boarding(u: Unit) {
    const nv = this.byId.get(u.board);
    const full = !!nv && this.navUsed(nv) + this.slot(u) > this.navCap(nv.owner);
    if (!nv || nv.hp <= 0 || full) { if (full) this.msg(u.owner, 'La navette est pleine'); u.board = -1; return; }
    if (Math.hypot(nv.x - u.x, nv.z - u.z) <= 3.6 && !nv.moving) {
      // Embarquement : l'unité quitte le terrain et voyage dans la soute.
      this.halt(u); u.board = -1; u.job = null; u.working = false;
      nv.cargo.push(u); this.boarded.push(u);
      return;
    }
    if (!nv.moving && (!u.group || this.tick - u.boardT > 15)) { u.boardT = this.tick; this.moveGroup([u], nv.x, nv.z, 'libre'); }
  }
  /** Navette : débarque sa cargaison une fois arrivée au point demandé. */
  private shuttle(nv: Unit) {
    // « Transporter ici » : dès que tout le monde est à bord, on part déposer la troupe.
    if (nv.ferryTo && !nv.group && !nv.drop && nv.cargo.length && !this.units.some((u) => u.board === nv.id)) {
      const f = nv.ferryTo; nv.ferryTo = null; this.applyOrder({ type: 'unload', id: nv.id, x: f.x, z: f.z }); return;
    }
    if (nv.ferryTo && !nv.cargo.length && !this.units.some((u) => u.board === nv.id) && this.tick % 50 === 0) nv.ferryTo = null;
    if (!nv.drop || nv.group) return;
    if (Math.hypot(nv.x - nv.drop.x, nv.z - nv.drop.z) > 3) { nv.drop = null; return; }
    const taken = new Set<number>(), left: Unit[] = [];
    for (const u of nv.cargo) {
      const c = this.nav.nearestFree(nv.x, nv.z, u.wide, taken, undefined, 7);
      if (c < 0) { left.push(u); continue; }
      taken.add(c);
      u.x = u.px = this.nav.cx(c); u.z = u.pz = this.nav.cz(c); u.slotX = u.x; u.slotZ = u.z; u.group = null; u.moving = false;
      this.units.push(u); this.byId.set(u.id, u);
    }
    if (left.length) this.msg(nv.owner, 'Pas assez de place pour débarquer tout le monde');
    nv.cargo = left; nv.drop = null;
    this.units.sort((a, b) => a.id - b.id);   // ordre stable, indépendant des embarquements
  }
  private boarded: Unit[] = [];
  /** Places occupées dans une navette : 1 par fantassin, 2 pour un éclaireur, 3 pour un véhicule lourd. */
  slot(u: Unit): number { return u.wide ? 3 : u.kind === 'eclaireur' ? 2 : 1; }
  navCap(owner: number): number { const P = this.players[owner]; return NAVETTE.places + (P.research.has('propulseurs') ? 2 : 0) + (P.doctrine === 'aeronavale' ? 2 : 0); }
  navUsed(nv: Unit): number { return nv.cargo.reduce((a, c) => a + this.slot(c), 0); }
  /** Coût réel d'un bâtiment (Réseau énergétique, doctrine Industrielle). */
  buildCost(owner: number, kind: string): Cost {
    const c: Cost = { ...BUILDINGS[kind].cout }, P = this.players[owner];
    if (P.research.has('reseau') && c.energie) c.energie = Math.round(c.energie * 0.8);
    if (P.doctrine === 'industrielle' && c.minerai) c.minerai = Math.round(c.minerai * 0.9);
    return c;
  }
  /** Score (mode Blitz et fin de partie). */
  score(owner: number): number { const p = this.scoreParts(owner); return p.militaire + p.economie + p.technologie + p.societe; }
  /** Score détaillé, à la manière d'Age of Empires : militaire, économie, technologie, société. */
  scoreParts(owner: number): { militaire: number; economie: number; technologie: number; societe: number } {
    const s = this.stats[owner];
    return {
      militaire: Math.round(s.tues * 5 + s.batimentsDetruits * 20 + s.degats / 40),
      economie: Math.round((s.recolte + s.rec.energie) / 10),
      technologie: s.recherches * 30 + (this.players[owner].ere - this.startAge) * 80,
      societe: s.batimentsConstruits * 5 + s.popMax * 2 + s.captures * 15,
    };
  }
  /** État résumé des deux camps à cet instant (courbes de l'écran de fin). */
  snapshot(): Snapshot {
    const n = this.players.length, z = () => new Array<number>(n).fill(0);
    const sn: Snapshot = { t: this.tick, score: z(), mil: z(), eco: z(), armee: z(), ouvriers: z(), recolte: z(), batiments: z(), pop: z() };
    for (let o = 0; o < n; o++) { const p = this.scoreParts(o); sn.score[o] = this.score(o); sn.mil[o] = p.militaire; sn.eco[o] = p.economie; sn.recolte[o] = this.stats[o].recolte; sn.pop[o] = this.players[o].pop; }
    for (const u of this.units) { if (u.kind === 'ouvrier') sn.ouvriers[u.owner]++; else if (u.kind !== 'navette') sn.armee[u.owner] += 1; for (const c of u.cargo) if (c.kind === 'ouvrier') sn.ouvriers[c.owner]++; else sn.armee[c.owner]++; }
    for (const b of this.buildings) if (b.done) sn.batiments[b.owner]++;
    return sn;
  }
  // ---------------------------------------------------------------- réparation et capture
  private fix(u: Unit, j: Extract<Job, { t: 'repair' | 'capture' }>) {
    const b = this.bById.get(j.b);
    const over = !b || b.hp <= 0 || (j.t === 'repair' ? b.owner !== u.owner || b.hp >= b.maxHp : !this.foe(b.owner, u.owner) || b.hp > b.maxHp * 0.3);
    if (over) { u.job = null; u.working = false; return; }
    if (j.phase === 'go') {
      if (u.group) return;
      if (Math.hypot(b.x - u.x, b.z - u.z) <= b.r + u.radius + 1.7) { j.phase = 'work'; j.t0 = this.tick; u.working = true; u.heading = Math.atan2(b.x - u.x, b.z - u.z); }
      else if (j.tries++ < 4) this.approach(u, b.x, b.z, b.r, j.tries * 0.9);
      else { u.job = null; u.working = false; }
    } else if (j.t === 'repair') b.hp = Math.min(b.maxHp, b.hp + (u.kind === 'ingenieur' ? 18 : 7) * DT);
    else if (this.tick - j.t0 >= 30) {
      // Capture : le bâtiment change de camp, sa file de production est vidée.
      const old = b.owner;
      this.stats[u.owner].captures++; this.stats[old].batimentsPerdus++;
      b.owner = u.owner; b.queue.length = 0; b.task = null; b.rally = null; b.waiting = false;
      if (OPEN.has(b.kind)) this.nav.setGate(b.x, b.z, b.r, u.owner);
      this.msg(u.owner, 'Bâtiment capturé : ' + BUILDINGS[b.kind].nom); this.msg(old, 'Un de tes bâtiments a été capturé');
      this.events.push({ t: 'attacked', owner: old, x: b.x, z: b.z });
      u.job = null; u.working = false;
    }
  }

  // ---------------------------------------------------------------- vétérance
  /** Seuils d'éliminations pour 1, 2 et 3 étoiles. Chaque étoile : +10 % PV et dégâts, +5 % de cadence. */
  static readonly VET = [2, 5, 10];
  private promote(u: Unit) {
    u.xp++;
    if (u.vet < 3 && u.xp >= Sim.VET[u.vet]) {
      u.vet++; u.maxHp *= 1.1; u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.1);
      this.stats[u.owner].promotions++;
      this.events.push({ t: 'promo', id: u.id, owner: u.owner, vet: u.vet });
      if (u.vet === 3) this.msg(u.owner, UNITS[u.kind].nom + ' vétéran : 3 étoiles');
    }
  }

  // ---------------------------------------------------------------- combat
  private mult(kind: string, victim: Unit | null): number {
    const bo = (UNITS as Record<string, { bonus?: Record<string, number> }>)[kind]?.bonus;
    if (bo) {   // toutes les unités : bonus lus dans les règles
      if (!victim) return (bo.batiment ?? 1) * (bo.sol ?? 1);
      const m = bo[victim.kind] ?? (victim.fly ? bo.air : MACHINE.has(victim.kind) ? bo.machine ?? bo.vehicule : VEHICLE.has(victim.kind) ? bo.vehicule : INFANTRY.has(victim.kind) || victim.kind === 'ouvrier' ? bo.infanterie : undefined) ?? 1;
      return victim.fly ? m : m * (bo.sol ?? 1);
    }
    if (!victim) return kind === 'blinde' ? 2 : kind === 'artillerie' ? 3 : kind === 'antiblindage' ? 1.6 : kind === 'cuirasse' ? 1.6 : 1;       // bâtiment
    if (kind === 'tourelle') return victim.kind === 'fantassin' || victim.kind === 'ouvrier' ? 1.5 : 1;
    if (kind === 'tourelleAA') return victim.kind === 'drone' ? 2 : 1;
    if (kind === 'defense') return victim.fly ? 1.3 : 1;
    return 1;
  }
  private high(x0: number, z0: number, x1: number, z1: number): number {
    return this.map.levelAt(x0, z0) > this.map.levelAt(x1, z1) ? GAME.bonusHauteur : 1;
  }
  private alert(owner: number, x: number, z: number) {
    if (this.tick - this.alertT[owner] > 100) { this.alertT[owner] = this.tick; this.events.push({ t: 'attacked', owner, x, z }); }
  }
  /** Le bouclier du camp absorbe les dégâts infligés sous son dôme. Renvoie les dégâts restants. */
  private shielded(owner: number, x: number, z: number, dmg: number, r = 0): number {
    for (const b of this.buildings) {
      if (b.kind !== 'bouclier' || b.owner !== owner || !b.done || b.shield <= 0 || Math.hypot(b.x - x, b.z - z) > SHIELD.rayon + r) continue;
      const a = Math.min(b.shield, dmg); b.shield -= a; dmg -= a;
      if (dmg <= 0) return 0;
    }
    return dmg;
  }
  private hitUnit(v: Unit, dmg: number, by: number, fx: number, fz: number, attacker: Unit | null) {
    if (v.hp <= 0) return;
    if (this.players[by].research.has('degats')) dmg *= 1.15;
    if (this.players[v.owner].research.has('armure')) dmg *= 0.85;
    if (this.players[v.owner].research.has('nano')) dmg *= 0.85;
    dmg = this.shielded(v.owner, v.x, v.z, dmg);
    this.alert(v.owner, v.x, v.z);
    if (dmg <= 0) return;
    this.stats[by].degats += Math.min(dmg, v.hp); if (this.firstFight < 0 && by !== v.owner) this.firstFight = this.tick;
    v.hp -= dmg; v.hitT = this.tick;
    this.alert(v.owner, v.x, v.z);
    if (v.hp <= 0) { if (attacker && attacker.hp > 0) this.promote(attacker); this.stats[v.owner].perdus++; this.stats[by].tues++; this.events.push({ t: 'dead', x: v.x, z: v.z, big: v.wide === 1, id: v.id, kind: v.kind, fly: v.fly }); return; }
    if (v.kind === 'ouvrier') {
      // Un ouvrier attaqué fuit vers son Centre.
      if (this.tick - v.fleeT > 60) {
        v.fleeT = this.tick; v.job = null; v.working = false;
        const c = this.buildings.find((b) => b.owner === v.owner && b.kind === 'centre');
        if (c) this.approach(v, c.x, c.z, c.r, 0);
      }
    } else if (attacker && v.tu < 0 && v.tb < 0 && (!v.group || v.amove) && v.posture !== 'tenir' && v.posture !== 'passive') {
      v.tu = attacker.id; v.explicit = false;                                          // riposte
      if (!v.anchored) { v.anchored = true; v.anchorX = v.x; v.anchorZ = v.z; }
    }
    // Les alliés inoccupés à proximité viennent prêter main-forte.
    if (attacker && this.tick - (v.helpT ?? -99) > 10) {
      v.helpT = this.tick;
      for (const w of this.units) {
        if (w === v || w.owner !== v.owner || w.hp <= 0 || w.tu >= 0 || w.tb >= 0 || (w.group && !w.amove) || w.job || w.kind === 'ouvrier' || w.kind === 'navette') continue;
        if (w.posture === 'passive' || w.posture === 'tenir' || (attacker.fly && !UNITS[w.kind].viseAir) || UNITS[w.kind].degats <= 0) continue;
        if (Math.hypot(w.x - v.x, w.z - v.z) > 13) continue;
        w.tu = attacker.id; w.explicit = false;
        if (!w.anchored) { w.anchored = true; w.anchorX = w.x; w.anchorZ = w.z; }
      }
    }
    void fx; void fz;
  }
  private hitBuilding(b: Building, dmg: number, by: number) {
    if (b.hp <= 0) return;
    if (this.players[by].research.has('degats')) dmg *= 1.15;
    dmg = this.shielded(b.owner, b.x, b.z, dmg, b.r);
    if (dmg <= 0) { this.alert(b.owner, b.x, b.z); return; }
    this.stats[by].degats += Math.min(dmg, b.hp); if (this.firstFight < 0 && by !== b.owner) this.firstFight = this.tick;
    b.hp -= dmg;
    this.alert(b.owner, b.x, b.z);
    if (b.hp <= 0) {
      this.stats[by].batimentsDetruits++;
      if (b.kind === 'sentinelle') { this.players[by].solarite += 100; this.msg(by, 'Sentinelle détruite : +100 solarite, le gisement est libre'); }
    }
  }

  /** Ronde de patrouille : un anneau de points autour de la carte, puis le centre. */
  private patrolPoints(): { x: number; z: number }[] {
    const h = this.map.half, pts: { x: number; z: number }[] = [];
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; pts.push({ x: Math.cos(a) * h * 0.72, z: Math.sin(a) * h * 0.72 }); }
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.5; pts.push({ x: Math.cos(a) * h * 0.35, z: Math.sin(a) * h * 0.35 }); }
    return pts;
  }
  private patrolStep() {
    let P: { x: number; z: number }[] | null = null;
    for (const u of this.units) {
      if (u.patrol < 0 || u.group || u.tu >= 0 || u.tb >= 0) continue;
      P ??= this.patrolPoints();
      u.patrol = (u.patrol + 1) % P.length;
      this.moveGroup([u], P[u.patrol].x, P[u.patrol].z, 'libre');
    }
  }

  private combat(u: Unit) {
    const rule = UNITS[u.kind];
    if (rule.degats <= 0) return;
    let tu = u.tu >= 0 ? this.byId.get(u.tu) : undefined, tb = u.tb >= 0 ? this.bById.get(u.tb) : undefined;
    if (tu && (tu.hp <= 0 || (tu.fly && !rule.viseAir))) tu = undefined;
    if (tb && tb.hp <= 0) tb = undefined;
    if (!tu && !tb) {
      const had = u.tu >= 0 || u.tb >= 0;
      // Cible désignée abattue : on enchaîne sur l'ennemi le plus proche (unités d'abord, puis bâtiments).
      if (had && u.explicit) u.hunt = true;
      u.tu = -1; u.tb = -1; u.explicit = false;
      // Recherche d'une cible : seulement à l'arrêt ou en attaque-déplacement (un simple déplacement ne s'interrompt pas).
      if (u.patrol < 0 && (!u.group || u.amove || u.hunt) && (had || (this.tick + u.id) % 3 === 0) && (u.posture !== 'passive' || u.amove || u.hunt)) {
        // Posture agressive : l'unité repère d'elle-même un ennemi proche (unité ou bâtiment) et va l'abattre.
        const sight = u.hunt ? Math.max(rule.portee + 8, 16) : u.posture === 'tenir' ? rule.portee + 0.5 : u.posture === 'agressive' ? Math.max(rule.portee + 7, 15) : Math.max(rule.portee + 4, 10);
        let bd = sight;
        for (const v of this.units) {
          if (!this.foe(v.owner, u.owner) || v.hp <= 0 || (v.fly && !rule.viseAir)) continue;
          const d = Math.hypot(v.x - u.x, v.z - u.z) - v.radius;
          if (d < bd) { bd = d; tu = v; }
        }
        if (!tu && (u.amove || u.hunt || u.posture === 'agressive') && rule.degats > 0) for (const b of this.buildings) {
          if (!this.foe(b.owner, u.owner) || b.hp <= 0) continue;
          if (!u.amove && !u.hunt && this.players[b.owner].neutral) continue;          // une sentinelle neutre ne s'attaque que sur ordre
          const d = Math.hypot(b.x - u.x, b.z - u.z) - b.r;
          if (d < bd) { bd = d; tb = b; }
        }
        if (tu) u.tu = tu.id; else if (tb) u.tb = tb.id;
        if ((tu || tb) && !u.anchored) { u.anchored = true; u.anchorX = u.x; u.anchorZ = u.z; }
      }
      if (!tu && !tb) {
        u.hunt = false;
        // Fin du combat : on reprend l'attaque-déplacement, ou on revient à sa position (posture défensive).
        if (u.amove && !u.group) {
          if (Math.hypot(u.amove.x - u.x, u.amove.z - u.z) > 4 && (this.tick + u.id) % 5 === 0) this.moveGroup([u], u.amove.x, u.amove.z, 'libre'); else if (Math.hypot(u.amove.x - u.x, u.amove.z - u.z) <= 4) u.amove = null;
        } else if (u.anchored && !u.group) {
          u.anchored = false;
          if (u.posture === 'defensive' && Math.hypot(u.anchorX - u.x, u.anchorZ - u.z) > 1.5) this.moveGroup([u], u.anchorX, u.anchorZ, 'libre');
        }
        return;
      }
    }
    const tx = tu ? tu.x : tb!.x, tz = tu ? tu.z : tb!.z, tr = tu ? tu.radius : tb!.r;
    const d = Math.hypot(tx - u.x, tz - u.z) - tr;
    if (!u.explicit && u.posture === 'defensive' && Math.hypot(u.anchorX - u.x, u.anchorZ - u.z) > 10) {
      u.tu = -1; u.tb = -1; this.moveGroup([u], u.anchorX, u.anchorZ, 'libre'); return;
    }
    if (d <= rule.portee) {
      if (u.group) this.halt(u);
      u.heading = Math.atan2(tx - u.x, tz - u.z);
      if (u.cd <= 0) {
        u.cd = rule.cadence / (this.players[u.owner].doctrine === 'frappe' ? 1.15 : 1) / (1 + 0.05 * u.vet);
        const dmg = rule.degats * this.mult(u.kind, tu ?? null) * this.high(u.x, u.z, tx, tz) * (1 + 0.1 * u.vet);
        this.events.push({ t: 'shot', x0: u.x, z0: u.z, x1: tx, z1: tz, big: u.kind === 'blinde' || u.kind === 'artillerie' || u.kind === 'araigneeCanon' || u.kind === 'strikerMissiles' || u.kind === 'strikerAssaut', air: !!tu?.fly, from: u.fly, melee: MELEE.has(u.kind) || undefined, kind: u.kind, id: u.id });
        if (tu) this.hitUnit(tu, dmg, u.owner, u.x, u.z, u); else this.hitBuilding(tb!, dmg, u.owner);
      }
    } else if (u.posture === 'tenir' && !u.explicit) { u.tu = -1; u.tb = -1; }
    else if (!u.group || this.tick - u.chaseT > 10) {
      // Poursuite : on vise le bord de la cible.
      u.chaseT = this.tick;
      // Chaque unité prend un angle un peu différent : le groupe se déploie en arc au lieu de faire la queue.
      const a = Math.atan2(u.z - tz, u.x - tx) + ((u.id % 7) - 3) * 0.2, reach = tr + Math.max(rule.portee - 0.8, 0.6);
      this.moveGroup([u], tx + Math.cos(a) * reach, tz + Math.sin(a) * reach, 'libre');
    }
  }

  private towers() {
    for (const b of this.buildings) {
      const T = TURRETS[b.kind as keyof typeof TURRETS];
      if (!T || !b.done || b.hp <= 0) continue;
      if (b.kind !== 'centre' && this.storm) continue;                     // la poussière aveugle les tourelles
      if (b.cd > 0) { b.cd -= DT; continue; }
      let best: Unit | null = null, bd = T.portee + (this.players[b.owner].research.has('portee') ? 2 : 0);
      for (const v of this.units) {
        if (!this.foe(v.owner, b.owner) || v.hp <= 0 || (!('both' in T) && v.fly !== T.air)) continue;
        const d = Math.hypot(v.x - b.x, v.z - b.z) - v.radius;
        if (d < bd) { bd = d; best = v; }
      }
      if (!best) continue;
      b.cd = T.cadence;
      this.events.push({ t: 'shot', x0: b.x, z0: b.z, x1: best.x, z1: best.z, big: T.air || 'both' in T, air: best.fly, bk: b.kind });
      const over = b.kind !== 'centre' && this.players[b.owner].research.has('surcharge') ? 1.25 : 1;
      this.hitUnit(best, T.degats * over * this.mult(b.kind, best) * this.high(b.x, b.z, best.x, best.z), b.owner, b.x, b.z, null);
    }
  }

  /** Retire les unités mortes et les bâtiments détruits ; détecte la fin de partie. */
  private sweep() {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.hp > 0) continue;
      this.units.splice(i, 1); this.byId.delete(u.id);
      const pp = this.stats[u.owner].perdusPar; pp[u.kind] = (pp[u.kind] ?? 0) + 1;
      for (const c of u.cargo) { this.stats[c.owner].perdus++; const cp = this.stats[c.owner].perdusPar; cp[c.kind] = (cp[c.kind] ?? 0) + 1; }          // la cargaison est perdue avec la navette
      u.cargo = [];
    }
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      if (b.hp > 0) continue;
      this.buildings.splice(i, 1); this.bById.delete(b.id);
      this.stats[b.owner].batimentsPerdus++;
      if (OPEN.has(b.kind)) this.nav.setGate(b.x, b.z, b.r, -1); else this.nav.setDisc(b.x, b.z, b.r, false);
      if (b.node >= 0) this.nodes[b.node].amount = 0;
      this.events.push({ t: 'destroyed', b: b.id, x: b.x, z: b.z, r: b.r });
      if (b.kind === 'centre' && this.winner < 0) {
        // Un camp sans Centre est éliminé ; victoire : la dernière équipe qui possède encore un Centre.
        if (!this.buildings.some((x) => x.kind === 'centre' && x.owner === b.owner)) for (const o of this.sides) this.msg(o, o === b.owner ? 'Ton Centre est détruit' : (this.factionName(b.owner) || 'Un camp') + ' est éliminé');
        const alive = this.aliveTeams();
        if (alive.length === 1) { this.winner = alive[0]; this.events.push({ t: 'over', winner: this.winner }); }
      }
    }
  }

  /** Unité ennemie la plus proche d'un point (pour désigner une cible). */
  enemyAt(owner: number, x: number, z: number, r = 1.6): Unit | null {
    let best: Unit | null = null, bd = r;
    for (const v of this.units) { if (!this.foe(v.owner, owner)) continue; const d = Math.hypot(v.x - x, v.z - z) - v.radius; if (d < bd) { bd = d; best = v; } }
    return best;
  }

  /** Écarte les unités qui se chevauchent, pour qu'elles se contournent au lieu de s'empiler. */
  private separate() {
    const H = this.hash; H.clear();
    const key = (x: number, z: number) => ((Math.floor(x / 3) + 512) << 10) | (Math.floor(z / 3) + 512);
    for (const u of this.units) { const k = key(u.x, u.z); let a = H.get(k); if (!a) H.set(k, a = []); a.push(u); }
    for (let pass = 0; pass < 3; pass++) for (const u of this.units) {
      const kx = Math.floor(u.x / 3), kz = Math.floor(u.z / 3);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const a = H.get(((kx + dx + 512) << 10) | (kz + dz + 512));
        if (!a) continue;
        for (const v of a) {
          if (v.id <= u.id || v.fly !== u.fly) continue;
          let ex = v.x - u.x, ez = v.z - u.z;
          // les ouvriers au travail ou en trajet de récolte se croisent sans se gêner (comme dans AoE)
          const soft = u.job && v.job ? 0.45 : 1;
          const min = (u.radius + v.radius + 0.1) * soft, d2 = ex * ex + ez * ez;
          if (d2 >= min * min) continue;
          let d = Math.sqrt(d2);
          if (d < 1e-4) { ex = ((u.id * 37 + v.id * 17) % 7) - 3 || 1; ez = ((u.id * 13 + v.id * 29) % 5) - 2; d = Math.hypot(ex, ez); ex *= 1e-3 / d; ez *= 1e-3 / d; d = 1e-3; }
          const push = (min - d) * 0.5;
          const mu = u.moving && !u.working, mv = v.moving && !v.working;
          const wu = mu === mv ? 0.5 : mu ? 0.35 : 0.65, wv = 1 - wu;
          const ax = ex / d, az = ez / d, full = push * 2;
          const uOk = !u.working && this.pass(u, u.x - ax * full * wu, u.z - az * full * wu);
          const vOk = !v.working && this.pass(v, v.x + ax * full * wv, v.z + az * full * wv);
          const su = uOk ? (vOk ? wu : 1) : 0, sv = vOk ? (uOk ? wv : 1) : 0;
          if (su && this.pass(u, u.x - ax * full * su, u.z - az * full * su)) { u.x -= ax * full * su; u.z -= az * full * su; }
          if (sv && this.pass(v, v.x + ax * full * sv, v.z + az * full * sv)) { v.x += ax * full * sv; v.z += az * full * sv; }
          if (!su && !sv && !u.working && !v.working) {
            for (const sg of [1, -1]) {
              if (this.pass(u, u.x - az * full * sg, u.z + ax * full * sg)) { u.x -= az * full * sg; u.z += ax * full * sg; break; }
              if (this.pass(v, v.x + az * full * sg, v.z - ax * full * sg)) { v.x += az * full * sg; v.z -= ax * full * sg; break; }
            }
          }
        }
      }
    }
  }
}
