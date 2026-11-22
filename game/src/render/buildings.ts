// Affichage des bâtiments de la simulation : modèle, chantier qui monte, anneau d'équipe, sélection.
import * as THREE from 'three';
import type { Sim, Building } from '../sim/sim';
import { spawn } from './assets';
import { TEAM_COLORS, colorIndex, altStyle } from './units';
import type { Effects } from './effects';
import { SHIELD, TURRETS, lookAge } from '../data/rules';
import { WallViews, wallPairs, makeGate, makeTurret, animateTurret, turretFired, TURRET_KINDS, type WallNode } from './defenses';

type BLook = { model: string; footprint?: number; height?: number; roof?: { model: string; footprint: number };
  /** Éléments posés autour du modèle principal (en mètres, avant rotation). */ extra?: { model: string; footprint?: number; height?: number; x: number; z: number; ry?: number }[] };
const LOOKS: Record<string, BLook> = {
  centre: { model: 'kaykit/basemodule_A.json', footprint: 9, roof: { model: 'kaykit/roofmodule_solarpanels.json', footprint: 5.6 } },
  habitat: { model: 'kaykit/basemodule_B.json', footprint: 5 },
  stationEau: { model: 'kaykit/drill_structure.json', height: 5.2 },
  depotMinier: { model: 'kaykit/cargodepot_A.json', footprint: 5.4 },
  centrale: { model: 'kaykit/roofmodule_solarpanels.json', footprint: 4.8 },
  caserne: { model: 'kaykit/basemodule_garage.json', footprint: 7 },
  quai: { model: 'kaykit/landingpad_large.json', footprint: 8.4 },
  raffinerie: { model: 'kaykit/cargodepot_B.json', footprint: 5.6 },
  recycleur: { model: 'kaykit/windturbine_low.json', height: 4 },
  scierie: { model: 'kaykit/containers_A.json', footprint: 5 },
  usine: { model: 'kaykit/basemodule_C.json', footprint: 8.4 },
  hangar: { model: 'kaykit/basemodule_D.json', footprint: 7.6 },
  labo: { model: 'kaykit/basemodule_E.json', footprint: 6.4 },
  arene: { model: 'kaykit/structure_tall.json', footprint: 6 },
  atelier: { model: 'kindus/building-n.json', footprint: 8.2 },
  bouclier: { model: 'quat/GeodesicDome.json', footprint: 4.6 },
  // Ère 3 (Small Hearth Studios, « Low Poly Sci-fi RTS pack ») :
  defense: { model: 'shs/Laser_Turret.json', footprint: 4.4 },
  ascenseur: { model: 'shs/SatelliteDish.json', height: 13 },
};
/** Compagnie Boréale : son architecture à elle pour les bâtiments-clés, dès l'ère 1 (Small Hearth Studios). */
const BOREALE: Record<string, BLook> = {
  centre: { model: 'shs/Eco_hub.json', footprint: 9.6 },
  caserne: { model: 'shs/Barracks.json', footprint: 7.8 },
  centrale: { model: 'shs/Power_plant.json', footprint: 5.6 },
  quai: { model: 'shs/Teleporter.json', footprint: 8.6 },
  labo: { model: 'shs/SatelliteDish.json', height: 7.5 },
  bouclier: { model: 'shs/ShieldGenerator.json', footprint: 5 },
};
/** Antiquité : village de bois (Quaternius, « Ultimate Fantasy RTS », CC0). */
const LOOKS_A1: Record<string, BLook> = {
  centre: { model: 'antique/Barracks_FirstAge_Level3.json', footprint: 9.6 },
  habitat: { model: 'antique/Houses_FirstAge_1_Level1.json', footprint: 4.8 },
  stationEau: { model: 'antique/Windmill_FirstAge.json', height: 6.5 },
  depotMinier: { model: 'antique/Storage_FirstAge_Level1.json', footprint: 5.4, extra: [{ model: 'antique/Resource_Rock_2.json', footprint: 1.4, x: 2.6, z: 1.6 }, { model: 'antique/Resource_Gold_1.json', footprint: 1.3, x: -2.6, z: 1.8 }] },
  scierie: { model: 'antique/Resource_PineTree_Group_Cut.json', footprint: 5.2, extra: [{ model: 'antique/Logs.json', footprint: 2.4, x: 0.4, z: -0.3, ry: 0.4 }] },
  recycleur: { model: 'antique/Farm_Dirt_Level1.json', footprint: 5.6, extra: [{ model: 'antique/Farm_FirstAge_Level3_Wheat.json', footprint: 5.2, x: 0, z: 0 }] },
  caserne: { model: 'antique/Barracks_FirstAge_Level1.json', footprint: 7.2 },
  archerie: { model: 'antique/Archery_FirstAge_Level1.json', footprint: 6.8 },
  ecurie: { model: 'antique/Storage_FirstAge_Leve3.json', footprint: 7 },
  quai: { model: 'antique/Port_FirstAge_Level1.json', footprint: 8.4 },
  tourelle: { model: 'antique/WatchTower_FirstAge_Level3.json', height: 7.5 },
};
/** Moyen Âge : bourg coloré aux couleurs du camp (KayKit, « Medieval Hexagon », CC0) ; @ = couleur du camp. */
const LOOKS_A2: Record<string, BLook> = {
  centre: { model: 'medieval/castle_@.json', footprint: 9.6 },
  habitat: { model: 'medieval/home_A_@.json', footprint: 4.6 },
  stationEau: { model: 'medieval/windmill_@.json', footprint: 4.8 },
  depotMinier: { model: 'medieval/mine_@.json', footprint: 5.6 },
  scierie: { model: 'antique/Storage_SecondAge_Level1.json', footprint: 5.4, extra: [{ model: 'antique/Logs.json', footprint: 2.4, x: 2.2, z: 2.4, ry: 0.3 }] },
  recycleur: { model: 'antique/Farm_Dirt_Level1.json', footprint: 5.6, extra: [{ model: 'antique/Farm_SecondAge_Level3_Wheat.json', footprint: 5.2, x: 0, z: 0 }] },
  caserne: { model: 'medieval/barracks_@.json', footprint: 7.4 },
  archerie: { model: 'medieval/archeryrange_@.json', footprint: 6.8 },
  ecurie: { model: 'medieval/tavern_@.json', footprint: 6.6 },
  atelierSiege: { model: 'medieval/blacksmith_@.json', footprint: 7.4 },
  quai: { model: 'antique/Port_SecondAge_Level1.json', footprint: 8.4 },
  tourelle: { model: 'medieval/tower_A_@.json', footprint: 3.4 },
};
/** Âge de la poudre : bourg de pierre (Quaternius, « Ultimate Fantasy RTS », bâtiments du second âge, CC0). */
const LOOKS_A3: Record<string, BLook> = {
  centre: { model: 'antique/Temple_SecondAge_Level3.json', footprint: 9.2 },
  habitat: { model: 'antique/Houses_SecondAge_1_Level1.json', footprint: 4.8 },
  stationEau: { model: 'antique/Windmill_SecondAge.json', height: 7 },
  depotMinier: { model: 'antique/Storage_SecondAge_Level3.json', footprint: 5.6, extra: [{ model: 'antique/Resource_Rock_2.json', footprint: 1.4, x: 2.8, z: 1.8 }, { model: 'antique/Resource_Gold_1.json', footprint: 1.3, x: -2.8, z: 2 }] },
  scierie: { model: 'antique/Storage_SecondAge_Level2.json', footprint: 5.4, extra: [{ model: 'antique/Logs.json', footprint: 2.4, x: 2.2, z: 2.4, ry: 0.3 }] },
  recycleur: { model: 'antique/Farm_Dirt_Level1.json', footprint: 5.6, extra: [{ model: 'antique/Farm_SecondAge_Level3_Wheat.json', footprint: 5.2, x: 0, z: 0 }] },
  caserne: { model: 'antique/Barracks_SecondAge_Level3.json', footprint: 7.4 },
  archerie: { model: 'antique/Archery_SecondAge_Level3.json', footprint: 6.8 },
  ecurie: { model: 'antique/Barracks_SecondAge_Level2.json', footprint: 7 },
  atelierSiege: { model: 'antique/Barracks_SecondAge_Level1.json', footprint: 7.4 },
  quai: { model: 'antique/Port_SecondAge_Level3.json', footprint: 8.4 },
  tourelle: { model: 'antique/WatchTower_SecondAge_Level3.json', height: 7.5 },
};
/** Couleur KayKit la plus proche de chaque couleur de camp (orange, cyan, vert, violet). */
const KK_COLOR = ['red', 'blue', 'green', 'yellow', 'yellow'];
const KK_ALL = ['red', 'blue', 'green', 'yellow'];
/** Ère 3 « Orbitale » : un satellite tourne au-dessus des grands bâtiments. */
const ORBITAL = new Set(['centre', 'caserne', 'usine', 'hangar', 'labo', 'quai', 'ascenseur']);
const SAT = 'shs/Satellite.json';
/** Ère 2 : le même rôle, une architecture industrielle (Kenney City Kit Industrial, CC0). */
const LOOKS2: Record<string, BLook> = {
  centre: { model: 'kindus/building-e.json', footprint: 9.4 },
  habitat: { model: 'kindus/building-h.json', footprint: 5.2 },
  stationEau: { model: 'kindus/water-tower.json', height: 6.5 },
  depotMinier: { model: 'kindus/building-j.json', footprint: 5.6 },
  centrale: { model: 'kindus/building-m.json', footprint: 5.2 },
  caserne: { model: 'kindus/building-g.json', footprint: 7.2 },
  raffinerie: { model: 'kindus/building-c.json', footprint: 5.8 },
  usine: { model: 'kindus/building-b.json', footprint: 8.6 },
  arene: { model: 'kindus/building-d.json', footprint: 6.2 },
};
/** Ère 3 « Orbitale » : chaque bâtiment reçoit une tour en alliage sombre (Asset Arena, Sci-Fi Buildings) dont les modules
 *  s'allument aux couleurs du camp, un anneau lumineux au sol et un alliage bleuté sur la structure d'origine. */
const TOWER: Record<string, number> = { centre: 10, habitat: 4, stationEau: 2, depotMinier: 7, centrale: 1, caserne: 5, quai: 9, raffinerie: 3, recycleur: 2, usine: 8, hangar: 6, labo: 9, bouclier: 1, arene: 3, atelier: 8, ascenseur: 10 };
const ALLOY = new THREE.Color(0x8fb0dc);
const towerBody = new THREE.MeshStandardMaterial({ color: 0xdfe6ef, metalness: 0.55, roughness: 0.3 });
const plazaMat = new THREE.MeshStandardMaterial({ color: 0x2c3442, metalness: 0.6, roughness: 0.45 });
const glowMats = new Map<number, THREE.MeshStandardMaterial>();
const glow = (c: number) => { let m = glowMats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.4 }); glowMats.set(c, m); } return m; };
const ringMats = new Map<number, THREE.MeshBasicMaterial>();
const ringMat = (c: number) => { let m = ringMats.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false, transparent: true, opacity: 0.9 }); ringMats.set(c, m); } return m; };
/** Habille un bâtiment pour l'ère 3 : alliage, tour lumineuse et esplanade bordée d'un anneau lumineux (qui remplace l'anneau du camp). */
function orbitalize(g: THREE.Object3D, kind: string, r: number, color: number) {
  const base = (g.userData.height as number) ?? 5;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => { const c = (x as THREE.MeshStandardMaterial).clone(); c.color?.lerp(ALLOY, 0.68); if ('emissive' in c) { (c as THREE.MeshStandardMaterial).emissive.set(0x1c3a66).multiplyScalar(0.5); } if ('metalness' in c) { c.metalness = Math.max(c.metalness, 0.45); c.roughness = Math.min(c.roughness, 0.5); } return c; });
    m.material = Array.isArray(m.material) ? mats : mats[0];
  });
  const big = r >= 3.4, h = Math.min(12, Math.max(4.2, r * (big ? 2.1 : 1.8)));
  const tower = (n: number, hh: number, x: number, z: number) => {
    const t = spawn(`e3/tour${n}.json`, { height: hh });
    t.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = /^Part/.test(m.name) ? glow(color) : towerBody; });
    t.scale.set(1.7, 1, 1.7); t.position.set(x, 0, z); g.add(t);
  };
  tower(TOWER[kind] ?? 1, h, r * 0.86, r * 0.1);
  if (big) tower(((TOWER[kind] ?? 1) % 10) + 1, h * 0.62, -r * 0.88, -r * 0.2);
  // Pylônes d'énergie aux coins de l'esplanade.
  for (const [px, pz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const py = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 1.6, 6), glow(color)); py.position.set(px * r * 0.8, 0.9, pz * r * 0.8); g.add(py); }
  // Esplanade sombre bordée d'un anneau lumineux : bien lisible vue de dessus.
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.12, 0.22, 8), plazaMat); plaza.position.y = 0.05; plaza.receiveShadow = true; g.add(plaza);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.08, 0.12, 6, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 8), ringMat(color)); ring.position.y = 0.2; g.add(ring);
  g.userData.plaza = true;
  g.userData.height = Math.max(base, h);
}
export const BUILDING_MODELS = [...new Set([...Object.values(LOOKS), ...Object.values(LOOKS2), ...Object.values(BOREALE), ...Object.values(LOOKS_A1), ...Object.values(LOOKS_A2), ...Object.values(LOOKS_A3), { model: SAT }, ...Array.from({ length: 10 }, (_, i) => ({ model: `e3/tour${i + 1}.json` }))]
  .flatMap((l: BLook) => (l.model.includes('@') ? KK_ALL.map((c) => l.model.replace('@', c)) : [l.model]).concat(l.roof ? [l.roof.model] : [], (l.extra ?? []).map((e) => e.model))))];
const CAP = 600;
const COLORS = TEAM_COLORS.map((c) => new THREE.Color(c));

export class BuildingViews {
  private views = new Map<number, THREE.Object3D>();
  private domes = new Map<number, THREE.Mesh>();
  private walls: WallViews;
  private wallSig = ''; private pairs: [number, number][] = []; private gateDir = new Map<number, [number, number]>();
  private nodes = new Map<number, WallNode>();
  private last = performance.now();
  private ghostRange: { x: number; z: number; range?: number } | null = null;
  private rings: THREE.InstancedMesh[];
  private sel: THREE.Mesh;
  private ghost: THREE.Mesh;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3(); private p = new THREE.Vector3();
  selected = -1;
  /** Une porte s'ouvre ou se ferme (bruitage du champ d'énergie). */
  onGate?: (x: number, z: number) => void;
  private razed = new Set<number>();
  private falling: { g: THREE.Object3D; t: number; tx: number; tz: number; y0: number; h: number }[] = [];
  private range: THREE.Mesh;
  /** Bâtiment détruit au combat : sa disparition sera animée. */
  raze(id: number) { this.razed.add(id); }

  constructor(private scene: THREE.Scene, private sim: Sim) {
    this.walls = new WallViews(scene);
    this.rings = TEAM_COLORS.map((c) => {
      const r = new THREE.InstancedMesh(new THREE.RingGeometry(0.93, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), CAP);
      r.frustumCulled = false; r.count = 0; return r;
    });
    this.sel = new THREE.Mesh(new THREE.RingGeometry(1.03, 1.1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9dffb8, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
    this.sel.visible = false;
    this.ghost = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6dff9a, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }));
    this.ghost.visible = false;
    // Portée d'une tourelle : cercle pointillé quand on la sélectionne ou qu'on la place.
    this.range = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -7, polygonOffsetUnits: -7 }));
    this.range.visible = false; scene.add(this.range);
    scene.add(...this.rings, this.sel, this.ghost);
  }

  private create(b: Building): THREE.Object3D {
    const era = this.style(b);
    const anc = era === 1 ? LOOKS_A1[b.kind] : era === 2 ? LOOKS_A2[b.kind] : era === 6 ? LOOKS_A3[b.kind] : undefined;
    const look: BLook | undefined = anc ? { ...anc, model: anc.model.replace('@', KK_COLOR[colorIndex(this.sim, b.owner)]) }
      : (altStyle(this.sim, b.owner) && BOREALE[b.kind]) || (era >= 4 && LOOKS2[b.kind]) || LOOKS[b.kind];
    let g: THREE.Object3D;
    if (look) {
      g = spawn(look.model, { footprint: look.footprint, height: look.height });
      if (look.roof) { const r = spawn(look.roof.model, { footprint: look.roof.footprint }); r.position.y = g.userData.height; g.add(r); }
      for (const e of look.extra ?? []) { const x = spawn(e.model, { footprint: e.footprint, height: e.height }); x.position.set(e.x, 0, e.z); x.rotation.y = e.ry ?? 0; g.add(x); }
    } else {
      // Défenses dessinées en code : porte à champ d'énergie, tourelles orientables.
      const color = b.kind === 'sentinelle' ? 0xff4a3a : TEAM_COLORS[colorIndex(this.sim, b.owner)];
      g = b.kind === 'porte' ? makeGate(color, era) : TURRET_KINDS.has(b.kind) ? makeTurret(b.kind, color) : new THREE.Group();
    }
    if (anc && b.kind === 'tourelle') g.userData.muzzleY = (g.userData.height ?? 7) * 0.82;   // tour de guet : les archers tirent du sommet
    if (era === 5 && look) orbitalize(g, b.kind, b.r, TEAM_COLORS[colorIndex(this.sim, b.owner)]);
    if (era === 5 && ORBITAL.has(b.kind)) {
      // Satellites en orbite (et, pour l'Ascenseur, un faisceau aux couleurs du camp).
      const orbit = new THREE.Group(), h = (g.userData.height ?? 5) + (b.kind === 'ascenseur' ? 4 : 3);
      const n = b.kind === 'ascenseur' ? 3 : 1;
      for (let i = 0; i < n; i++) { const sat = spawn(SAT, { footprint: b.kind === 'ascenseur' ? 3.2 : 2.2 }); const a = i * Math.PI * 2 / n; sat.position.set(Math.cos(a) * (b.r + 1), h + i * 2.5, Math.sin(a) * (b.r + 1)); sat.rotation.y = -a; orbit.add(sat); }
      g.add(orbit); g.userData.orbit = orbit;
      if (b.kind === 'ascenseur') {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 80, 10, 1, true).translate(0, 40, 0), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[colorIndex(this.sim, b.owner)], transparent: true, opacity: 0.35, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
        g.add(beam);
      }
    }
    g.position.set(b.x, this.sim.map.heightAt(b.x, b.z), b.z);
    if (anc) g.rotation.y = b.kind === 'recycleur' ? 0 : ((b.id * 2.39996) % (Math.PI * 2));   // fermes alignées en damier   // villages anciens : orientations variées
    else if (altStyle(this.sim, b.owner) && look) g.rotation.y = Math.PI;
    g.userData.alt = altStyle(this.sim, b.owner);
    g.userData.era = era; g.userData.kind = b.kind; g.userData.born = performance.now();
    this.scene.add(g);
    this.views.set(b.id, g);
    return g;
  }

  /** Un tir part de (x0, z0) : si c'est une tourelle, ses canons reculent ; renvoie la hauteur de la bouche à feu. */
  turretShot(x0: number, z0: number, x1: number, z1: number, air: boolean): number | null {
    for (const b of this.sim.buildings) {
      if (!TURRET_KINDS.has(b.kind) || Math.abs(b.x - x0) > 0.05 || Math.abs(b.z - z0) > 0.05) continue;
      const v = this.views.get(b.id);
      if (!v) return null;
      turretFired(v as THREE.Group, x1, z1, air, performance.now());
      return (v.userData.muzzleY as number) * v.scale.y;
    }
    return null;
  }

  /** Style d'un bâtiment selon l'âge de son camp : 1 (Antiquité), 2 (Moyen Âge), 3 (moderne), 4 (industriel), 5 (galactique). */
  private style(b: Building): number {
    const real = this.sim.players[b.owner]?.ere ?? 4, ere = lookAge(real);
    if (b.kind === 'porte') return Math.min(ere, 3);
    if (real === 3 && LOOKS_A3[b.kind]) return 6;   // âge de la poudre : style propre (6 = pierre du second âge)
    if (ere === 1 && LOOKS_A1[b.kind]) return 1;
    if (ere === 2 && (LOOKS_A2[b.kind] || LOOKS_A1[b.kind])) return LOOKS_A2[b.kind] ? 2 : 1;
    if (ere >= 5 && (LOOKS[b.kind] || BOREALE[b.kind])) return 5;
    return ere >= 4 && LOOKS2[b.kind] ? 4 : 3;
  }

  /** Aperçu de placement : disque vert (possible) ou rouge (impossible). */
  setGhost(g: { x: number; z: number; r: number; ok: boolean; range?: number } | null) {
    this.ghost.visible = !!g;
    this.ghostRange = g?.range ? g : null;
    if (!g) return;
    this.ghost.position.set(g.x, this.sim.map.heightAt(g.x, g.z) + 0.15, g.z);
    this.ghost.scale.setScalar(g.r);
    (this.ghost.material as THREE.MeshBasicMaterial).color.set(g.ok ? 0x6dff9a : 0xff5a4d);
  }

  /** Brouillard : 0 jamais vu, 1 exploré, 2 visible (sans brouillard : toujours 2). */
  seen: (x: number, z: number) => number = () => 2;
  update(fx?: Effects) {
    const { m, q, s, p } = this, map = this.sim.map;
    for (const [id, v] of this.views) if (!this.sim.building(id)) {
      // Détruit : le bâtiment s'effondre (il s'enfonce en penchant) pendant les explosions ; sinon il disparaît.
      if (this.razed.has(id)) this.falling.push({ g: v, t: performance.now(), tx: (Math.random() - 0.5) * 0.5, tz: (Math.random() - 0.5) * 0.5, y0: v.position.y, h: (v.userData.height as number) ?? 5 });
      else this.scene.remove(v);
      this.views.delete(id); this.razed.delete(id);
      const d = this.domes.get(id); if (d) { this.scene.remove(d); this.domes.delete(id); }
    }
    this.falling = this.falling.filter((f) => {
      const el = (performance.now() - f.t) / 1000;
      const k = Math.min(1, el / 1.8), drop = k * k;
      f.g.position.y = f.y0 - drop * (f.h + 1.5) + Math.sin(el * 60) * 0.06 * (1 - k);
      f.g.rotation.x = f.tx * drop; f.g.rotation.z = f.tz * drop;
      if (k >= 1) { this.scene.remove(f.g); return false; }
      return true;
    });
    const nRing = this.rings.map(() => 0), now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // Murs et portes : liaisons recalculées seulement quand l'ensemble change.
    let sig = 0, cnt = 0;
    for (const b of this.sim.buildings) if (b.kind === 'mur' || b.kind === 'porte') { sig += b.id; cnt++; }
    if (`${cnt}:${sig}` !== this.wallSig) { this.wallSig = `${cnt}:${sig}`; const t = wallPairs(this.sim); this.pairs = t.pairs; this.gateDir = t.dirs; }
    this.nodes.clear();
    this.sel.visible = false;
    for (const b of this.sim.buildings) {
      const y = map.heightAt(b.x, b.z), grow = b.done ? 1 : 0.18 + 0.82 * b.progress;
      // Bâtiment ennemi jamais aperçu : caché. Déjà exploré : affiché, sans barre de vie.
      const vis = !this.sim.foe(b.owner, 0) ? 2 : this.seen(b.x, b.z);
      const view = this.views.get(b.id);
      if (view) view.visible = vis > 0;
      if (b.kind === 'mur' || b.kind === 'porte') {
        const dir = this.gateDir.get(b.id) ?? [1, 0];
        this.nodes.set(b.id, { id: b.id, x: b.x, z: b.z, y, grow, vis, color: COLORS[colorIndex(this.sim, b.owner)], gate: b.kind === 'porte', dx: dir[0], dz: dir[1], ion: !!this.sim.players[b.owner].ion && b.done, style: Math.min(3, lookAge(this.sim.players[b.owner]?.ere ?? 4)) });
      }
      if (vis === 0) { const d = this.domes.get(b.id); if (d) d.visible = false; if (b.kind !== 'mur' && !view) this.create(b).visible = false; continue; }
      if (b.kind === 'mur') { /* dessiné par WallViews */ }
      else {
        let v = this.views.get(b.id) ?? this.create(b);
        if (v.userData.era !== this.style(b) || v.userData.kind !== b.kind || (v.userData.alt !== undefined && v.userData.alt !== altStyle(this.sim, b.owner))) {
          // Passage d'ère : le bâtiment est reconstruit dans le nouveau style.
          this.scene.remove(v); this.views.delete(b.id); v = this.create(b);
          fx?.boom(b.x, y + 1.5, b.z, Math.max(1.6, b.r * 0.6), 0.6);
        }
        v.scale.y = grow * Math.min(1, 0.25 + (performance.now() - v.userData.born) / 900);
        if (v.userData.orbit) v.userData.orbit.rotation.y = performance.now() * 0.00035 + b.id;
        if (v.userData.yaw) animateTurret(this.sim, b, v as THREE.Group, dt, now);
        if (v.userData.gate) {
          // Porte : alignée sur le mur ; le champ s'efface (ou les battants s'ouvrent) quand une unité du camp passe.
          const dir = this.gateDir.get(b.id) ?? [1, 0];
          v.rotation.y = Math.atan2(-dir[1], dir[0]);
          const open = this.sim.units.some((u) => !this.sim.foe(u.owner, b.owner) && Math.hypot(u.x - b.x, u.z - b.z) < 3.4);
          if (b.done && open !== !!v.userData.open && vis === 2) this.onGate?.(b.x, b.z);
          v.userData.open = open;
          const f = v.userData.field as THREE.Mesh | undefined;
          if (f) {
            const mat = f.material as THREE.MeshBasicMaterial;
            const want = !b.done ? 0 : open ? 0.04 : 0.24 + 0.06 * Math.sin(now * 0.004 + b.id);
            mat.opacity += (want - mat.opacity) * Math.min(1, dt * 8);
            f.visible = mat.opacity > 0.01;
          }
          const leaves = v.userData.leaves as THREE.Group | undefined;
          if (leaves) for (const pv of leaves.children) { const want = b.done && open ? pv.userData.sg * 1.45 : 0; pv.rotation.y += (want - pv.rotation.y) * Math.min(1, dt * 5); }
          const bars = v.userData.bars as THREE.Group | undefined;
          if (bars) { const k = !b.done || open ? 0.02 : 1; bars.scale.x += (k - bars.scale.x) * Math.min(1, dt * 7); bars.visible = bars.scale.x > 0.06; }
        }
        if (b.kind === 'bouclier' && b.done) {
          // Dôme du bouclier : plus il est chargé, plus il est visible.
          let d = this.domes.get(b.id);
          if (!d) {
            d = new THREE.Mesh(new THREE.SphereGeometry(SHIELD.rayon, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2),
              new THREE.MeshBasicMaterial({ color: TEAM_COLORS[colorIndex(this.sim, b.owner)], transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, fog: false }));
            d.position.set(b.x, y - 0.5, b.z); this.scene.add(d); this.domes.set(b.id, d);
          }
          d.visible = b.shield > 0;
          (d.material as THREE.MeshBasicMaterial).opacity = 0.05 + 0.13 * (b.shield / SHIELD.max);
        }
        const o = colorIndex(this.sim, b.owner);
        // Ère 3 : le bord lumineux de l'esplanade tient lieu d'anneau de camp.
        if (nRing[o] < CAP && !v.userData.plaza) this.rings[o].setMatrixAt(nRing[o]++, m.compose(p.set(b.x, y + 0.07, b.z), q.identity(), s.set(b.r + 0.5, 1, b.r + 0.5)));
      }
      if (fx && vis === 2 && b.done && b.hp < b.maxHp) fx.bar(b.x, y + (b.kind === 'mur' ? 2.8 : 5.5), b.z, Math.max(2, b.r * 1.3), Math.max(0, b.hp / b.maxHp));
      if (b.id === this.selected) { this.sel.visible = true; this.sel.position.set(b.x, y + 0.1, b.z); this.sel.scale.setScalar(b.r + 0.9); }
    }
    this.walls.update(this.nodes, this.pairs);
    // Cercle de portée : tourelle sélectionnée, ou tourelle en cours de placement.
    const sb = this.selected >= 0 ? this.sim.building(this.selected) : undefined, T = sb ? TURRETS[sb.kind as keyof typeof TURRETS] : undefined;
    const rg = this.ghostRange ? { x: this.ghostRange.x, z: this.ghostRange.z, r: this.ghostRange.range! } : sb && T && sb.kind !== 'centre' ? { x: sb.x, z: sb.z, r: T.portee + (this.sim.players[sb.owner].research.has('portee') ? 2 : 0) } : null;
    this.range.visible = !!rg;
    if (rg) { this.range.position.set(rg.x, map.heightAt(rg.x, rg.z) + 0.2, rg.z); this.range.scale.setScalar(rg.r); }
    this.rings.forEach((r, i) => { r.count = nRing[i]; r.instanceMatrix.needsUpdate = true; });
  }
}
