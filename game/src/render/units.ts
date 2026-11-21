// Affichage des unités : position interpolée entre deux ticks, animation, anneaux d'équipe et de sélection.
// Véhicules et anneaux sont instanciés (quelques appels de dessin pour toute l'armée) ;
// les personnages animés gardent pour l'instant un modèle chacun.
import * as THREE from 'three';
import type { Sim, Unit, UnitKind } from '../sim/sim';
import { spawn, animations, instanced } from './assets';
import type { Effects } from './effects';
import { UNITS } from '../data/rules';

/** Arès (joueur) : rouge-ambre. Boréale : bleu glacier. */
/** Niveau de l'eau aux âges anciens (le vide intersidéral est alors une mer). */
export const WATER_Y = -1.3;
export const TEAM_COLORS = [0xff6a2e, 0x38d0ff, 0x6fdc5a, 0xc07bff, 0xb9b2a6];
/** Couleur d'un camp : Arès, Boréale, Ligue Australe, Syndicat Solaris ; le camp neutre (sentinelles) est gris. */
export function colorIndex(sim: Sim, owner: number): number { return sim.players[owner]?.neutral ? 4 : owner % 4; }
/** Les camps impairs (Boréale, Solaris) utilisent les modèles « Boréale ». */
export const altStyle = (sim: Sim, owner: number) => !sim.players[owner]?.neutral && (sim.players[owner]?.faction ?? owner) % 2 === 1;
const CAP = 256;
const CARRY_COLORS: Record<string, THREE.Color> = { eau: new THREE.Color(0xd8343e), bois: new THREE.Color(0x8a5a2e), minerai: new THREE.Color(0x9a9a9a), energie: new THREE.Color(0xffcc33), solarite: new THREE.Color(0xffa53a) };

/** Arme de mech fixée sur un os (elle suit l'animation) ou sur le corps.
 *  at : décalage depuis l'os (ou le sommet du modèle), en tailles du modèle · dir : direction du canon · len : longueur (en tailles) · center : arme centrée sur le point. */
interface Mount { f: string; bone?: string; at: [number, number, number]; dir: [number, number, number]; len: number; center?: boolean; /** Striker : bloc d'épaule porteur et emplacement. */ pod?: 'R' | 'L'; slot?: 'arm' | 'top' }
const ST_W = { canon: 'mech/ScifiMech20cmCanonBarrel.json', laser: 'mech/ScifiMechMediumStandardLaser.json', mg: 'mech/ScifiMechMGBarrel.json', lrm: 'mech/ScifiMechLRMRackX5.json', srm: 'mech/ScifiMechSRMRackX2.json' } as const;
const ST_LEN = { canon: 0.42, laser: 0.30, mg: 0.20, lrm: 0.24, srm: 0.16 } as const;
type StW = keyof typeof ST_W;
/** Arme du Striker posée sur un bras : sous l'avant du bloc d'épaule (« arm ») ou dessus (« top »). */
const ARM = (k: StW, side: 'R' | 'L'): Mount => ({ f: ST_W[k], pod: side, slot: 'arm', at: [0, 0, 0], dir: [0, 0, 1], len: ST_LEN[k], center: k === 'laser' });
const BACK = (k: StW, side: 'R' | 'L'): Mount => ({ f: ST_W[k], pod: side, slot: 'top', at: [0, 0, 0], dir: [0, 0, 1], len: ST_LEN[k], center: true });
/** Mech « Striker » : animé (repos, marche, coup de poing). */
const STRIKER = (c: string, mounts: Mount[], work = 'a4IdlePose'): Look => ({ model: `mech/striker_${c}.json`, height: 4.1, idle: 'a4IdlePose', run: 'a5WalkCycle', work, shoot: true, runSpeed: 1, mounts, workStill: work === 'a4IdlePose' ? 0 : undefined });
/** Soldat « Toon » de la Salle d'armes : armes de corps à corps tenues comme le couteau d'origine. */
const MELEE_LOOK = (wpn: string | null, wlen: number, style: Strike): Look => ({ model: 'toon/Soldier.json', height: 2.25, idle: 'Idle', run: 'Run', work: 'Idle', shoot: true, runSpeed: 1.15, weapon: wpn ? 'none' : 'Knife_1', wpn: wpn ?? undefined, wlen, strike: style });
/** Geste d'attaque propre à l'arme : estoc (couteau), taille en diagonale (épée), frappe de haut en bas à deux mains (marteau). */
type Strike = 'estoc' | 'taille' | 'masse';

interface Look { /** Arme de corps à corps (modèle) tenue en main, longueur rapportée au couteau d'origine. */ wpn?: string; wlen?: number; mounts?: Mount[]; strike?: Strike; /** Robot araignée : pattes animées en code. */ legs?: boolean;
  /** Modèle statique affiché un par unité (armes montées dessus). */ custom?: boolean;
  /** Arme posée à part dans le fichier, remise dans la main (os `bone`). */ prop?: { name: string; bone: string; len: number };
  /** Véhicule articulé : roues qui tournent, tourelle qui vise. `alt` : modèle de la faction Boréale. */ rig?: boolean; alt?: string; model: string; height?: number; footprint?: number; idle?: string; run?: string; work?: string; /** L'animation `work` sert au tir. */ shoot?: boolean; /** Tir en courant (cible en vue pendant un déplacement). */ runShoot?: string; /** Tir à l'arrêt figé (pose de visée stable, sans balancement). */ workStill?: number; /** Canon relevé (artillerie), en radians. */ barrelUp?: number; /** Rotation du modèle de la faction Boréale. */ altYaw?: number; /** Teinte appliquée au modèle (robots tout blancs). */ paint?: number; /** Arme tenue à deux mains en visant (main gauche ramenée sous le canon). */ twoHands?: boolean; /** Arme penchée dans l'animation d'origine : remise à l'horizontale en visant. */ level?: boolean; yaw?: number; hover?: number; runSpeed?: number; /** Personnages « Toon » : arme laissée visible (les autres sont cachées). */ weapon?: string;
  /** Personnages KayKit (âges anciens) : accessoires gardés (les autres sont cachés), pièces à cacher. */ kk?: string[]; hide?: string[];
  /** Cavalerie : cavalier KayKit assis sur le cheval (os du dos suivi), et son geste d'attaque. */ rider?: { model: string; kk: string[]; attack: string; seat: number };
  /** Bateau (âges anciens) : flotte sur l'eau au lieu de voler. */ boat?: boolean; /** Taille mesurée sur la pose du squelette (cheval). */ precise?: boolean;
  /** Engin de siège : coup de bélier ou détente de catapulte joués en code. */ siege?: 'ram' | 'throw';
  /** Arme KayKit remplacée par une arme dessinée en code (arc, mousquet), posée à sa place dans la main. */ swap?: { of: string; make: 'arc' | 'mousquet' };
  /** Villageois (Quaternius) : geste selon la tâche (récolte, bûcheronnage, chantier), outil en main, démarche chargée. */ vill?: boolean }
/** Accessoires des personnages KayKit : tous cachés sauf ceux que l'unité garde. */
const KK_EXTRAS = ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '1H_Sword', '2H_Sword', '1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', '2H_Axe', 'Mug',
  'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable', 'Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff'];
const KK = (model: string, keep: string[], work: string, extra: Partial<Look> = {}): Look => ({ model: `kk/${model}.json`, height: 2.05, idle: 'Idle', run: 'Running_A', work, shoot: true, runSpeed: 0.95, kk: keep, weapon: keep[0], ...extra });
const HORSE = 'anim/Horse.json';
/** Une jambe à deux segments : cuisse, jarret, sabot (cible animée), longueurs et direction du genou au repos. */
type LegIk = { up: THREE.Object3D; low: THREE.Object3D; foot: THREE.Object3D; l1: number; l2: number; tip: THREE.Vector3; pole: THREE.Vector3 };
/** Les animations du cheval (Quaternius) ne déplacent que les sabots : sans cinématique inverse, les jambes s'étirent.
 *  On prépare ici, pour chaque jambe, ce qu'il faut pour replier cuisse et jarret jusqu'au sabot. */
function horseIk(body: THREE.Object3D): LegIk[] {
  body.updateMatrixWorld(true);
  const out: LegIk[] = [], w = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  for (const side of ['FrontLegL', 'FrontLegR', 'BackLegL', 'BackLegR']) {
    const pre = side.replace('Leg', '').replace(/[LR]$/, ''), lr = side.slice(-1);
    const up = body.getObjectByName(`${pre}UpLeg${lr}`), low = body.getObjectByName(`${pre}LowLeg${lr}`), foot = body.getObjectByName(`${pre}Foot${lr}`);
    if (!up || !low || !foot || !up.parent) continue;
    const a = w(up), b = w(low), c = w(foot);
    const ax = c.clone().sub(a).normalize(), kb = b.clone().sub(a), pole = kb.sub(ax.multiplyScalar(kb.dot(ax)));
    if (pole.lengthSq() < 1e-8) pole.set(0, 0, pre === 'Front' ? -1 : 1);
    // Direction du genou exprimée dans le repère du parent de la cuisse (elle suit le corps).
    const pq = up.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    out.push({ up, low, foot, l1: a.distanceTo(b), l2: b.distanceTo(c), tip: low.worldToLocal(c.clone()), pole: pole.normalize().applyQuaternion(pq) });
  }
  return out;
}
const IKV = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const IKQ = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
/** Tourne un os pour que le point `from` (monde) vienne sur `to`, autour de `pivot`. */
function ikAim(bone: THREE.Object3D, pivot: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3) {
  const d0 = IKV[4].copy(from).sub(pivot).normalize(), d1 = IKV[5].copy(to).sub(pivot).normalize();
  const rot = IKQ[0].setFromUnitVectors(d0, d1), wq = bone.getWorldQuaternion(IKQ[1]), pq = bone.parent!.getWorldQuaternion(IKQ[2]).invert();
  bone.quaternion.copy(pq.multiply(rot.multiply(wq)));
  bone.updateMatrixWorld(true);
}
function solveIk(legs: LegIk[]) {
  const [a, t, k, c] = IKV;
  for (const L of legs) {
    L.up.getWorldPosition(a); L.foot.getWorldPosition(t);
    const axis = t.clone().sub(a); let d = axis.length(); if (d < 1e-5) continue; axis.divideScalar(d);
    d = Math.min(Math.max(d, Math.abs(L.l1 - L.l2) + 1e-3), L.l1 + L.l2 - 1e-3);
    const pole = L.pole.clone().applyQuaternion(L.up.parent!.getWorldQuaternion(IKQ[1]));
    const v = pole.sub(axis.clone().multiplyScalar(pole.dot(axis))).normalize();
    const cosA = (L.l1 * L.l1 + d * d - L.l2 * L.l2) / (2 * L.l1 * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    k.copy(a).addScaledVector(axis, L.l1 * cosA).addScaledVector(v, L.l1 * sinA);
    ikAim(L.up, a, L.low.getWorldPosition(c), k);
    const kn = L.low.getWorldPosition(IKV[3].clone());
    ikAim(L.low, kn, L.low.localToWorld(c.copy(L.tip)), t);
  }
}
const CAV = (rider: string, keep: string[], attack: string): Look => ({ model: HORSE, height: 2.3, precise: true, idle: 'Armature|Idle', run: 'Armature|Run', work: 'Armature|Idle', shoot: true, runSpeed: 1.25, rider: { model: `kk/${rider}.json`, kk: keep, attack, seat: 0.62 } });
/** Aspect aux âges anciens des unités qui traversent toutes les époques. */
const OLD_LOOKS: Partial<Record<UnitKind, Look>> = {
  ouvrier: { model: 'vill/Villageois.json', height: 1.8, idle: 'Idle_Loop', run: 'Walk_Loop', work: 'TreeChopping_Loop', runSpeed: 1.25, vill: true },
  navette: { model: 'boat/viking.json', footprint: 5.4, custom: true, boat: true, yaw: Math.PI / 2 },
};
/** Villageoise (un ouvrier sur deux aux âges anciens). */
const OUVRIERE: Look = { model: 'vill/Villageoise.json', height: 1.72, idle: 'Idle_Loop', run: 'Walk_Loop', work: 'TreeChopping_Loop', runSpeed: 1.25, vill: true };
const LOOKS: Record<UnitKind, Look> = {
  milicien:  KK('Knight', ['1H_Sword', 'Round_Shield'], '1H_Melee_Attack_Chop', { hide: ['Knight_Helmet'] }),
  hachier:   KK('Barbarian', ['2H_Axe'], '2H_Melee_Attack_Chop', { idle: '2H_Melee_Idle' }),
  champion:  KK('Knight', ['2H_Sword'], '2H_Melee_Attack_Slice', { idle: '2H_Melee_Idle', height: 2.2 }),
  archer:    KK('Rogue_Hooded', ['1H_Crossbow'], '1H_Ranged_Shoot', { swap: { of: '1H_Crossbow', make: 'arc' } }),
  arbaletrier: KK('Rogue', ['2H_Crossbow'], '2H_Ranged_Shoot', { height: 2.15 }),
  cavalier:  CAV('Rogue_Hooded', ['Knife'], '1H_Melee_Attack_Stab'),
  chevalier: CAV('Knight', ['1H_Sword', 'Badge_Shield'], '1H_Melee_Attack_Chop'),
  mousquetaire: KK('Rogue', ['2H_Crossbow'], '2H_Ranged_Shoot', { height: 2.1, swap: { of: '2H_Crossbow', make: 'mousquet' } }),
  canon:     { model: 'naval/canon.json', footprint: 2.3, custom: true, siege: 'throw', yaw: Math.PI },
  pecheur:   { model: 'naval/pecheur.json', footprint: 3.6, custom: true, boat: true, yaw: Math.PI },
  galere:    { model: 'naval/galere.json', footprint: 6.5, custom: true, boat: true, yaw: Math.PI },
  galion:    { model: 'naval/galion.json', footprint: 9, custom: true, boat: true, yaw: Math.PI },
  belier:    { model: 'siege/siege-ram.json', footprint: 3.3, custom: true, siege: 'ram', yaw: Math.PI },
  catapulte: { model: 'siege/siege-catapult.json', footprint: 3.1, custom: true, siege: 'throw', yaw: Math.PI },
  ouvrier:   { model: 'quat/Astronaut_FinnTheFrog.json', height: 2.1, idle: 'Idle', run: 'Run', work: 'Idle', runSpeed: 1.1 },
  fantassin: { model: 'quat/Astronaut_RaeTheRedPanda.json', height: 2.3, idle: 'Idle_Gun', run: 'Run_Gun', work: 'Run_Gun_Shoot+Idle_Gun', runShoot: 'Run_Gun_Shoot', shoot: true, runSpeed: 1.1 },
  eclaireur: { model: 'hoverbike.json', footprint: 2.6, hover: 0.55 },
  blinde:    { model: 'vehic/blinde_ares.json', alt: 'vehic/blinde_boreale.json', footprint: 3.3, rig: true },
  artillerie: { model: 'vehic/artillerie_ares.json', alt: 'vehic/artillerie_boreale.json', footprint: 3.4, rig: true, yaw: Math.PI, barrelUp: 0.6 },
  ingenieur: { model: 'toon/Hazmat.json', height: 2.1, idle: 'Idle', run: 'Run', work: 'Punch', runSpeed: 1.1, weapon: 'Shovel' },
  antiblindage: { model: 'toon/Soldier.json', height: 2.25, idle: 'Idle', run: 'Run_Gun', work: 'Idle_Shoot', shoot: true, workStill: 0.1, twoHands: true, runShoot: 'Run_Shoot', runSpeed: 1.1, weapon: 'RocketLauncher' },
  intercepteur: { model: 'vehic/intercepteur.json', footprint: 3.1, hover: 5.2 },
  drone:     { model: 'quat/Spaceship.json', footprint: 2.8, hover: 4.2 },
  cuirasse:  { model: 'vehic/cuirasse_ares.json', alt: 'vehic/cuirasse_boreale.json', footprint: 6.2, rig: true, hover: 6.5 },
  navette:   { model: 'quat/Navette.json', footprint: 5.2, hover: 4.6 },
  tireur:    { model: 'toon/Soldier.json', height: 2.25, idle: 'Idle', run: 'Run_Gun', work: 'Idle_Shoot', shoot: true, workStill: 0.1, twoHands: true, runShoot: 'Run_Shoot', runSpeed: 1.1, weapon: 'Sniper' },
  grenadier: { model: 'toon/Soldier.json', height: 2.25, idle: 'Idle', run: 'Run_Gun', work: 'Idle_Shoot', shoot: true, workStill: 0.1, twoHands: true, runShoot: 'Run_Shoot', runSpeed: 1.1, weapon: 'GrenadeLauncher' },
  garde:     { model: 'toon/Soldier.json', idle: 'Idle', run: 'Run_Gun', work: 'Idle_Shoot', shoot: true, workStill: 0.1, twoHands: true, runShoot: 'Run_Shoot', runSpeed: 1.1, weapon: 'Shotgun', level: true, paint: 0x8a8f99, height: 2.45 },
  commando:  { model: 'toon/Soldier.json', height: 2.25, idle: 'Idle', run: 'Run_Gun', work: 'Idle_Shoot', shoot: true, workStill: 0.1, twoHands: true, runShoot: 'Run_Shoot', runSpeed: 1.3, weapon: 'SMG', paint: 0xcfdbe8 },
  vigile:    { model: 'toon/Soldier.json', height: 2.25, idle: 'Idle', run: 'Run_Gun', work: 'Idle_Shoot', shoot: true, workStill: 0.1, twoHands: true, runShoot: 'Run_Shoot', runSpeed: 1.1, weapon: 'AK', paint: 0xe0b45a },
  exo:       { model: 'fac/exo_finn.json', height: 3.3, idle: 'Idle', run: 'Walk', work: 'Shoot_Small', shoot: true, runSpeed: 1.25 },
  sam:       { model: 'fac/avs_6.json', footprint: 3.6, rig: true, yaw: Math.PI },
  chasseurChars: { model: 'fac/avs_7.json', footprint: 3.7, rig: true, yaw: Math.PI },
  avc:       { model: 'fac/avs_2.json', footprint: 3.4, rig: true, yaw: Math.PI },
  huit:      { model: 'fac/avs_4.json', footprint: 3.7, rig: true, yaw: Math.PI },
  canonAA:   { model: 'fac/avs_8.json', footprint: 3.6, rig: true, yaw: Math.PI },
  challenger: { model: 'fac/ship_Challenger.json', footprint: 3.2, hover: 5.2 },
  spitfire:  { model: 'fac/ship_Spitfire.json', footprint: 3, hover: 5.4 },
  zenith:    { model: 'fac/ship_Zenith.json', footprint: 3.8, hover: 5.8 },
  pancake:   { model: 'fac/ship_Pancake.json', footprint: 4.2, hover: 5.2 },
  executioner: { model: 'fac/ship_Executioner.json', footprint: 5, hover: 6.2 },
  imperial:  { model: 'fac/ship_Imperial.json', footprint: 6.4, hover: 6.8 },
  lame:      MELEE_LOOK(null, 1, 'estoc'),
  marteleur: MELEE_LOOK('melee/w_SCI-FI_Hammer.json', 1.4, 'masse'),
  sabreur:   MELEE_LOOK('melee/w_SCI-FI_Sword.json', 1.5, 'taille'),
  aether:    MELEE_LOOK('melee/w_Aether.json', 1.6, 'taille'),
  araignee:  { model: 'mech/quadshell.json', footprint: 2.6, custom: true, legs: true, paint: 0x5b6470 },
  araigneeCanon: { model: 'mech/quadshell.json', footprint: 2.7, custom: true, legs: true, paint: 0x4d5560, mounts: [{ f: ST_W.canon, at: [0, 0.03, -0.15], dir: [0, 0, 1], len: 0.5 }] },
  cogneur:   STRIKER('Blue', [], 'c1PunchRight'),
  strikerLaser: STRIKER('Blue', [ARM('laser', 'R'), ARM('laser', 'L')]),
  strikerMissiles: STRIKER('Black', [ARM('mg', 'R'), ARM('mg', 'L'), BACK('lrm', 'R'), BACK('lrm', 'L')]),
  strikerAssaut: STRIKER('White', [ARM('canon', 'R'), ARM('laser', 'L'), BACK('srm', 'R')]),
};
const WEAPONS = ['AK', 'GrenadeLauncher', 'Knife_1', 'Knife_2', 'Pistol', 'Revolver', 'Revolver_Small', 'RocketLauncher', 'ShortCannon', 'Shotgun', 'Shovel', 'SMG', 'Sniper', 'Sniper_2'];
export const UNIT_MODELS = [...new Set([...Object.values(LOOKS), ...Object.values(OLD_LOOKS), OUVRIERE].flatMap((l) => [l.model, ...(l.alt ? [l.alt] : []), ...(l.wpn ? [l.wpn] : []), ...(l.rider ? [l.rider.model] : []), ...(l.mounts ?? []).map((m) => m.f)]))];

const AX = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const longAxis = (v: THREE.Vector3) => (v.x >= v.y && v.x >= v.z ? 0 : v.y >= v.z ? 1 : 2);
/** Arme posée sur un groupe : poignée (extrémité « min » de son axe long) à l'origine, sauf si `center`. */
function holderFor(weapon: THREE.Object3D, center: boolean): { h: THREE.Group; axis: number; len: number } {
  weapon.updateMatrixWorld(true);
  const wb = new THREE.Box3().setFromObject(weapon), ws = wb.getSize(new THREE.Vector3()), wa = longAxis(ws), wc = wb.getCenter(new THREE.Vector3());
  weapon.traverse((o) => { o.userData.weapon = true; if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  const off = wc.clone().negate(); if (!center) off.setComponent(wa, -wb.min.getComponent(wa) - ws.getComponent(wa) * 0.08 * (center ? 0 : 1));
  weapon.position.add(off);
  const h = new THREE.Group(); h.add(weapon);
  return { h, axis: wa, len: ws.getComponent(wa) };
}
/** Arme de corps à corps tenue comme le couteau d'origine du soldat (même main, même direction). */
function attachMelee(body: THREE.Object3D, weapon: THREE.Object3D, wlen: number): THREE.Group | undefined {
  const ref = body.getObjectByName('Knife_1'); if (!ref?.parent) return;
  body.updateMatrixWorld(true);
  const parent = ref.parent, inv = parent.matrixWorld.clone().invert(), mm = new THREE.Matrix4(), kb = new THREE.Box3();
  ref.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.computeBoundingBox(); kb.union(m.geometry.boundingBox!.clone().applyMatrix4(mm.multiplyMatrices(inv, m.matrixWorld))); } });
  const ks = kb.getSize(new THREE.Vector3()), ka = longAxis(ks), c = kb.getCenter(new THREE.Vector3());
  const e1 = c.clone().setComponent(ka, kb.min.getComponent(ka)), e2 = c.clone().setComponent(ka, kb.max.getComponent(ka));
  const near = e1.length() < e2.length() ? e1 : e2, far = near === e1 ? e2 : e1;
  const { h, axis, len } = holderFor(weapon, false);
  h.scale.setScalar(ks.getComponent(ka) * wlen / len);
  h.quaternion.setFromUnitVectors(AX[axis].clone(), far.clone().sub(near).normalize());
  h.position.copy(near);
  parent.add(h);
  h.userData.axis = axis; h.userData.home = { p: h.position.clone(), q: h.quaternion.clone(), s: h.scale.clone(), parent };
  h.userData.gripLen = ks.getComponent(ka) * wlen;
  return h;
}
/** Arme de mech : point et direction donnés dans le repère du modèle (corps non tourné, posé à l'origine). */
function attachMount(body: THREE.Object3D, weapon: THREE.Object3D, m: Mount) {
  body.updateMatrixWorld(true);
  if (m.pod) {
    // Striker : on mesure le bloc d'épaule dans sa pose actuelle et on y fixe l'arme, qui suit ensuite le bras.
    const pod = body.getObjectByName('MediumMechStrikerArm' + (m.pod === 'R' ? 'Right' : 'Left')) as THREE.SkinnedMesh | undefined;
    const bone = body.getObjectByName((m.slot === 'top' ? 'UpperArm_' : 'LowerArm_') + m.pod);
    if (!pod) return;
    pod.skeleton?.update();
    const pb = new THREE.Box3().setFromObject(pod, true), ps = pb.getSize(new THREE.Vector3()), pc = pb.getCenter(new THREE.Vector3());
    const H = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).y;
    const { h, axis, len } = holderFor(weapon, !!m.center);
    h.scale.setScalar(m.len * H / len);
    h.quaternion.setFromUnitVectors(AX[axis].clone(), new THREE.Vector3(...m.dir).normalize());
    if (m.slot === 'top') h.position.set(pc.x, pb.max.y + 0.06 * H * m.len, pc.z - ps.z * 0.1);
    else h.position.set(pc.x, pb.min.y + ps.y * 0.18, m.center ? pb.max.z : pc.z);
    body.add(h); (bone ?? body).attach(h);
    return h;
  }
  const box = new THREE.Box3(); body.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.weapon) box.expandByObject(o); });
  const sz = box.getSize(new THREE.Vector3()), S = Math.max(sz.x, sz.y, sz.z);
  const bone = m.bone ? body.getObjectByName(m.bone) : undefined;
  const P = new THREE.Vector3(); if (bone) bone.getWorldPosition(P); else P.set(0, box.max.y, 0);
  P.add(new THREE.Vector3(...m.at).multiplyScalar(S));
  const { h, axis, len } = holderFor(weapon, !!m.center);
  h.scale.setScalar(m.len * S / len);
  h.quaternion.setFromUnitVectors(AX[axis].clone(), new THREE.Vector3(...m.dir).normalize());
  h.position.copy(P);
  body.add(h); (bone ?? body).attach(h);
  return h;
}
/** Mecha à épée : l'épée, posée à part dans le fichier, est remise dans la main, lame vers l'avant. */
function attachProp(body: THREE.Object3D, p: { name: string; bone: string; len: number }) {
  const prop = body.getObjectByName(p.name), hand = body.getObjectByName(p.bone);
  if (!prop || !hand) return;
  prop.removeFromParent(); prop.position.set(0, 0, 0); prop.quaternion.identity();
  body.updateMatrixWorld(true);
  const H = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).y;
  const { h, axis, len } = holderFor(prop, false);
  const pq = hand.getWorldQuaternion(new THREE.Quaternion()), ps = hand.getWorldScale(new THREE.Vector3());
  h.scale.setScalar(0.55 * H * p.len / ps.x / len);
  h.quaternion.setFromUnitVectors(AX[axis].clone(), new THREE.Vector3(0, 0.35, 1).normalize().applyQuaternion(pq.invert()));
  hand.add(h);
}

interface View {
  pos: THREE.Vector3; heading: number; look: Look; body?: THREE.Group;
  mixer?: THREE.AnimationMixer; acts: THREE.AnimationAction[]; state: number; tool?: THREE.Object3D;
  swing?: Swing;
  wheels?: { o: THREE.Object3D; r: number }[]; turret?: THREE.Object3D; turretQ?: THREE.Quaternion; aim?: number; lx?: number; lz?: number;
  /** Corps à corps : arme, os des bras, phase du geste. */
  strike?: { wpn?: THREE.Group; upR: THREE.Object3D; loR: THREE.Object3D; hR: THREE.Object3D; upL: THREE.Object3D; loL: THREE.Object3D; hL: THREE.Object3D; t: number; P: number; on: boolean };
  /** Robot araignée : épaules, pose de repos, axe de levée ; phase de la marche. */
  legs?: { bone: THREE.Object3D; rest: THREE.Quaternion; out: THREE.Vector3; ph: number }[]; gait?: number; legBody?: THREE.Object3D; legBodyY?: number;
  /** Bouches à feu (arme tenue, canon, lanceur…) et type d'arme pour les mechs à armes mixtes. */
  guns?: { o: THREE.Object3D; tag: string }[]; gunTurn?: number; /** Rotation propre du modèle chargé (modèles tournés à l'envers). */ yaw?: number;
  /** Recul procédural après un tir (s). */ kick?: number;
  /** Arme à remettre à l'horizontale : nœud, pose de repos, axe long local. */ lev?: { o: THREE.Object3D; q: THREE.Quaternion; p: THREE.Vector3; ax: THREE.Vector3 };
  /** Villageois : outils en main et gestes supplémentaires (4 récolte, 5 chantier, 6 marche chargée). */ vt?: Record<string, THREE.Group>;
  /** Villageois qui mine (pierre, or) : buste penché vers le rocher, le coup de hache devient un coup de pioche. */ mine?: { bone: THREE.Object3D; k: number };
  /** Cheval : jambes résolues en cinématique inverse (les animations n'animent que les sabots). */ ik?: LegIk[];
  /** Cavalerie : cavalier, os du dos du cheval et sa hauteur au repos, animations du cavalier. */ ride?: { body: THREE.Group; bone: THREE.Object3D; y0: number; seat: number; mixer: THREE.AnimationMixer; sit: THREE.AnimationAction; hit: THREE.AnimationAction; on: boolean };
  /** Engin de siège : pièce mobile et phase du geste. */ siegeT?: number;
  /** Bras gauche pour tenir l'arme à deux mains. */ arms?: { upL: THREE.Object3D; loL: THREE.Object3D; hL: THREE.Object3D; hR: THREE.Object3D };
}

const HANDLE = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 }), HEAD = new THREE.MeshStandardMaterial({ color: 0xc4c8d0, roughness: 0.35, metalness: 0.8 });
/** Pioche en mètres : manche le long de +Z (les mains tiennent le bas), fer en croissant le long de ±Y. */
function pickaxe(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 1.0, 6).rotateX(Math.PI / 2).translate(0, 0, 0.42), HANDLE));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.12).translate(0, 0, 0.9), HEAD));
  for (const side of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.36, 5).translate(0, 0.18, 0), HEAD);
    arm.position.set(0, side * 0.04, 0.9); arm.rotation.x = side > 0 ? -0.25 : Math.PI + 0.25; g.add(arm);
  }
  g.traverse((m) => { m.castShadow = true; });
  return g;
}

const WOOD_M = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8 }), STRING_M = new THREE.MeshStandardMaterial({ color: 0xe8e0c8, roughness: 0.9 }), IRON_M = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.4, metalness: 0.8 });
/** Remplace une arme KayKit (arbalète) par un arc ou un mousquet, aux mêmes dimensions et dans la même main. */
function swapWeapon(body: THREE.Object3D, of: string, make: 'arc' | 'mousquet') {
  const o = body.getObjectByName(of) as THREE.Mesh | undefined;
  if (!o) return;
  let geo: THREE.BufferGeometry | undefined; o.traverse((x) => { if (!geo && (x as THREE.Mesh).isMesh) geo = (x as THREE.Mesh).geometry; });
  if (!geo) return;
  geo.computeBoundingBox(); const bb = geo.boundingBox!, size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  const dims = [size.x, size.y, size.z], order = [0, 1, 2].sort((a, b) => dims[b] - dims[a]), L = dims[order[0]], W = dims[order[1]];
  const g = new THREE.Group();
  // Repère canonique : X = axe long de l'arme (tir), Y = sa largeur.
  if (make === 'arc') {
    const r = W * 0.5, arc = new THREE.Mesh(new THREE.TorusGeometry(r, L * 0.022, 5, 18, 2.3).rotateZ(-1.15), WOOD_M); arc.position.x = -r * 0.55; g.add(arc);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.006, L * 0.006, 2 * r * Math.sin(1.15), 4), STRING_M); str.position.x = -r * 0.55 + r * Math.cos(1.15); g.add(str);
  } else {
    const len = L * 1.6, br = L * 0.03;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(br, br * 1.15, len * 0.62, 7).rotateZ(Math.PI / 2), IRON_M); barrel.position.x = len * 0.19; g.add(barrel);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(len * 0.45, br * 3.2, br * 2.4), WOOD_M); stock.position.set(-len * 0.2, -br * 0.8, 0); g.add(stock);
    const butt = new THREE.Mesh(new THREE.BoxGeometry(len * 0.12, br * 5, br * 2.6), WOOD_M); butt.position.set(-len * 0.4, -br * 1.8, 0); g.add(butt);
  }
  // Axes canoniques vers les axes de l'arme d'origine.
  const ax = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const m = new THREE.Matrix4().makeBasis(ax[order[0]], ax[order[1]], ax[order[0]].clone().cross(ax[order[1]]));
  g.quaternion.setFromRotationMatrix(m); g.position.copy(c);
  g.traverse((x) => { if ((x as THREE.Mesh).isMesh) (x as THREE.Mesh).castShadow = true; });
  // L'arme d'origine est cachée, le remplaçant prend sa place (même parent, même pose).
  const wrap = new THREE.Group(); wrap.position.copy(o.position); wrap.quaternion.copy(o.quaternion); wrap.scale.copy(o.scale); wrap.add(g);
  o.parent?.add(wrap); o.visible = false;
}

const MINE_Q = new THREE.Quaternion(), MINE_AX = new THREE.Vector3(1, 0, 0), MINE_BEND = 0.7;
/** Outils du villageois, tenus dans la main droite : hache (bois), pioche (pierre, or), marteau (chantiers). */
function villTools(): Record<'hache' | 'pioche' | 'marteau', THREE.Group> {
  const mk = (head: THREE.BufferGeometry[]) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.62, 6).translate(0, 0.2, 0), HANDLE));
    for (const h of head) g.add(new THREE.Mesh(h, HEAD));
    g.traverse((m) => { m.castShadow = true; }); return g;
  };
  return {
    hache: mk([new THREE.BoxGeometry(0.03, 0.12, 0.16).translate(0, 0.45, 0.07)]),
    pioche: mk([new THREE.ConeGeometry(0.03, 0.2, 5).rotateX(Math.PI / 2).translate(0, 0.48, 0.1), new THREE.ConeGeometry(0.03, 0.2, 5).rotateX(-Math.PI / 2).translate(0, 0.48, -0.1)]),
    marteau: mk([new THREE.BoxGeometry(0.07, 0.08, 0.16).translate(0, 0.48, 0)]),
  };
}

/** Os utilisés pour le coup de pioche (cinématique inverse à deux os pour chaque bras). */
interface Swing { upR: THREE.Object3D; loR: THREE.Object3D; hR: THREE.Object3D; upL: THREE.Object3D; loL: THREE.Object3D; hL: THREE.Object3D; abd: THREE.Object3D; t: number; rest: THREE.Quaternion[] }
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qc = new THREE.Quaternion();
/** Oriente un os (axe +Y vers son enfant) dans une direction donnée, en repère monde. */
/** Bras de « A » sur le reste du corps de « B » (nom « A+B ») : tirer à l'arrêt quand le modèle n'a qu'un tir en courant. */
const MIXED = new Map<string, THREE.AnimationClip>();
const UPPER = /(Shoulder|UpperArm|LowerArm|Hand|Wrist|Index|Middle|Pinky|Thumb|Ring|Neck|Head)/;
function upperMix(model: string, clips: THREE.AnimationClip[], name: string): THREE.AnimationClip {
  const key = model + '|' + name, hit = MIXED.get(key); if (hit) return hit;
  const [a, b] = name.split('+'), A = clips.find((c) => c.name === a) ?? clips[0], B = clips.find((c) => c.name === b) ?? clips[0];
  const bone = (t: THREE.KeyframeTrack) => t.name.split('.')[0];
  const clip = new THREE.AnimationClip(name, A.duration, [...B.tracks.filter((t) => !UPPER.test(bone(t))).map((t) => t.clone()), ...A.tracks.filter((t) => UPPER.test(bone(t))).map((t) => t.clone())]);
  MIXED.set(key, clip); return clip;
}
function aimBone(bone: THREE.Object3D, dir: THREE.Vector3) {
  bone.getWorldQuaternion(_qa);
  _v1.set(0, 1, 0).applyQuaternion(_qa).normalize();
  _qb.setFromUnitVectors(_v1, _v2.copy(dir).normalize());
  _qa.premultiply(_qb);
  bone.parent!.getWorldQuaternion(_qc);
  bone.quaternion.copy(_qc.invert().multiply(_qa));
  bone.updateMatrixWorld(true);
}
/** Place la main (bout de la chaîne épaule-coude-main) sur une cible, coude rejeté vers `pole`. */
function reach(up: THREE.Object3D, lo: THREE.Object3D, hand: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3) {
  const S = up.getWorldPosition(new THREE.Vector3()), E0 = lo.getWorldPosition(new THREE.Vector3()), H0 = hand.getWorldPosition(new THREE.Vector3());
  const l1 = S.distanceTo(E0), l2 = E0.distanceTo(H0);
  const toT = _v3.copy(target).sub(S); let d = toT.length();
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.999);
  const u = toT.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const n = _v4.copy(pole).addScaledVector(u, -pole.dot(u)).normalize();
  const E = S.clone().addScaledVector(u, a).addScaledVector(n, h);
  aimBone(up, E.clone().sub(S));
  aimBone(lo, target.clone().sub(lo.getWorldPosition(new THREE.Vector3())));
}
/** Angle du manche au cours d'un coup (1,2 s) : on lève, petite pause en haut, frappe qui accélère, impact et rebond.
 *  0 = manche vertical au-dessus de la tête ; + vers l'avant. */
export const SWING_PERIOD = 1.2;
function swingAngle(t: number): number {
  const c = t % SWING_PERIOD, ease = (x: number) => x * x * (3 - 2 * x), LOW = 2.3, TOP = 0.15;
  if (c < 0.62) return LOW + (TOP - LOW) * ease(c / 0.62);                   // on lève la pioche au-dessus de la tête
  if (c < 0.72) return TOP - 0.06 * Math.sin(((c - 0.62) / 0.1) * Math.PI);  // élan, en haut
  if (c < 0.86) { const x = (c - 0.72) / 0.14; return TOP + (LOW - TOP) * x * x; }   // frappe
  const x = (c - 0.86) / 0.34; return LOW - 0.16 * Math.sin(Math.min(1, x * 1.6) * Math.PI) * (1 - x);   // impact, rebond
}

/** Vue stratégique : catégorie d'icône de chaque unité. */
type IconCat = 'eco' | 'inf' | 'veh' | 'air';
const ICON_CAT: Record<UnitKind, IconCat> = { ouvrier: 'eco', ingenieur: 'eco', fantassin: 'inf', antiblindage: 'inf', eclaireur: 'veh', blinde: 'veh', artillerie: 'veh', drone: 'air', intercepteur: 'air', navette: 'air', cuirasse: 'air',
  milicien: 'inf', hachier: 'inf', champion: 'inf', archer: 'inf', arbaletrier: 'inf', cavalier: 'veh', chevalier: 'veh', belier: 'veh', catapulte: 'veh', mousquetaire: 'inf', canon: 'veh', galere: 'veh', galion: 'veh', pecheur: 'eco',
  tireur: 'inf', grenadier: 'inf', exo: 'inf', garde: 'inf', commando: 'inf', vigile: 'inf', sam: 'veh', chasseurChars: 'veh', avc: 'veh', huit: 'veh', canonAA: 'veh', challenger: 'air', spitfire: 'air', zenith: 'air', pancake: 'air', executioner: 'air', imperial: 'air',
  lame: 'inf', marteleur: 'inf', sabreur: 'inf', aether: 'inf', araignee: 'veh', araigneeCanon: 'veh', cogneur: 'veh', strikerLaser: 'veh', strikerMissiles: 'veh', strikerAssaut: 'veh' };
/** Pastille ronde aux couleurs du camp avec un symbole blanc : pioche, fantassin, char, avion. */
function iconTexture(cat: IconCat, color: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, col = '#' + color.toString(16).padStart(6, '0');
  g.fillStyle = 'rgba(16,8,4,.85)'; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = col; g.beginPath(); g.arc(32, 32, 25, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  if (cat === 'eco') { g.moveTo(22, 44); g.lineTo(40, 22); g.stroke(); g.beginPath(); g.moveTo(28, 18); g.quadraticCurveTo(42, 14, 48, 30); g.stroke(); }
  else if (cat === 'inf') { g.arc(32, 22, 6, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(21, 46); g.lineTo(32, 31); g.lineTo(43, 46); g.closePath(); g.fill(); }
  else if (cat === 'veh') { g.fillRect(17, 30, 30, 13); g.fillRect(26, 22, 13, 9); g.fillRect(38, 25, 13, 4); }
  else { g.moveTo(32, 15); g.lineTo(47, 44); g.lineTo(32, 37); g.lineTo(17, 44); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Étoile dorée des vétérans. */
function starTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 12 : 29; g.lineTo(32 + Math.cos(a) * r, 34 + Math.sin(a) * r); }
  g.closePath(); g.fillStyle = '#ffd76a'; g.strokeStyle = '#3a1d08'; g.lineWidth = 5; g.stroke(); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const flat = (inner: number, outer: number, color: number, opacity: number, offset: number) => {
  const m = new THREE.InstancedMesh(new THREE.RingGeometry(inner, outer, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: offset, polygonOffsetUnits: offset }), CAP);
  m.frustumCulled = false; m.count = 0;
  return m;
};

const capeMats = new Map<number, THREE.Material>();
/** Cape d'un personnage KayKit teintée aux couleurs du camp (le reste garde sa texture). */
function kkCape(body: THREE.Object3D, color: number) {
  body.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh || !/Cape/.test(o.name)) return;
    let mat = capeMats.get(color);
    if (!mat) { const c = (m.material as THREE.MeshStandardMaterial).clone(); c.color = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.15); capeMats.set(color, mat = c); }
    m.material = mat;
  });
}
/** Garde du clip `base` les os du bas du corps et prend ceux du haut dans `top` (cavalier qui frappe sans se lever). */
const RIDER_TOP = /^(spine|chest|upperarm|lowerarm|wrist|hand|handslot|head|neck|elbowIK|handIK)/i;
function riderMix(clips: THREE.AnimationClip[], top: string, base: string): THREE.AnimationClip {
  const key = 'rider|' + top + '+' + base, hit = MIXED.get(key); if (hit) return hit;
  const A = clips.find((c) => c.name === top) ?? clips[0], B = clips.find((c) => c.name === base) ?? clips[0];
  const bone = (t: THREE.KeyframeTrack) => t.name.split('.')[0];
  const clip = new THREE.AnimationClip(key, A.duration, [...B.tracks.filter((t) => !RIDER_TOP.test(bone(t))).map((t) => t.clone()), ...A.tracks.filter((t) => RIDER_TOP.test(bone(t))).map((t) => t.clone())]);
  MIXED.set(key, clip); return clip;
}

export class UnitViews {
  /** Camp du joueur sur cet appareil (parties en ligne). */
  me = 0;
  /** Banc d'essai : animation jouée par une unité (repos, déplacement, tir/travail) et nom du clip. */
  animInfo(id: number): string {
    const v = this.views.get(id); if (!v) return '';
    if (!v.mixer || !v.acts.length) return v.look.rig ? 'véhicule articulé (roues, tourelle)' : v.look.legs ? 'pattes procédurales' : 'modèle fixe (pas de squelette)';
    const names = [v.look.idle, v.look.run ?? v.look.idle, v.look.work ?? v.look.idle, v.look.runShoot ?? v.look.run ?? v.look.idle];
    return ['repos', 'déplacement', 'tir / travail', 'tir en marchant'][v.state] + ' · ' + names[v.state] + (v.strike ? ' · geste de frappe' : '');
  }
  private views = new Map<number, View>();
  private time = 0;
  private selected = new Set<number>();
  private rings = TEAM_COLORS.map((c) => flat(0.82, 1, c, 0.85, -4));
  private selRing = flat(1.06, 1.3, 0x9dffb8, 0.95, -6);
  private batches = new Map<UnitKind, THREE.InstancedMesh[]>();
  private carry = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.1 }), CAP);
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3(); private p = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private s2 = new THREE.Vector3();
  /** Brouillard : vrai si ce point est visible du joueur (sans brouillard : toujours vrai). */
  visible: (x: number, z: number) => boolean = () => true;
  /** Distance de la caméra : en vue stratégique, les anneaux grossissent pour rester lisibles. */
  zoom = 50;
  /** Caméra (pour tourner les icônes de la vue stratégique vers l'écran). */
  camera: THREE.Camera | null = null;
  private icons = new Map<string, THREE.InstancedMesh>();
  /** Étoiles de vétérance (au-dessus de la barre de vie). */
  private stars = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: starTexture(), transparent: true, depthTest: false, depthWrite: false, fog: false }), CAP * 3);
  private dotOn = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9dffb8, fog: false, depthTest: false, transparent: true }), 96);
  private dotOff = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2a3a30, fog: false, depthTest: false, transparent: true, opacity: 0.8 }), 96);

  constructor(private scene: THREE.Scene, private sim: Sim) {
    this.carry.frustumCulled = false; this.carry.count = 0; this.carry.castShadow = true;
    this.carry.setColorAt(0, CARRY_COLORS.eau);
    scene.add(...this.rings, this.selRing, this.carry);
    for (const [o, color] of TEAM_COLORS.entries()) for (const cat of ['eco', 'inf', 'veh', 'air'] as IconCat[]) {
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: iconTexture(cat, color), transparent: true, depthTest: false, depthWrite: false, fog: false }), CAP);
      im.frustumCulled = false; im.count = 0; im.renderOrder = 12; scene.add(im); this.icons.set(o + cat, im);
    }
    this.stars.frustumCulled = false; this.stars.count = 0; this.stars.renderOrder = 11; scene.add(this.stars);
    for (const d of [this.dotOn, this.dotOff]) { d.frustumCulled = false; d.count = 0; d.renderOrder = 10; scene.add(d); }
    for (const [kind, look] of Object.entries(LOOKS) as [UnitKind, Look][]) {
      if (look.idle || look.rig) continue;
      const g = instanced(look.model, Array.from({ length: CAP }, () => new THREE.Matrix4()));
      const list: THREE.InstancedMesh[] = [];
      g.traverse((o) => { const im = o as THREE.InstancedMesh; if (im.isInstancedMesh) { im.frustumCulled = false; im.count = 0; list.push(im); } });
      // Avant du modèle (point de départ des tirs des vaisseaux).
      g.updateMatrixWorld(true);
      const fb = new THREE.Box3();
      g.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { me.geometry.computeBoundingBox(); fb.union(me.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld)); } });
      if (!fb.isEmpty()) this.front.set(look.model, { z: fb.max.z * 0.92, y: (fb.min.y + fb.max.y) / 2 });
      scene.add(g);
      this.batches.set(kind, list);
    }
  }

  /** Aspect d'une unité : celui de son époque pour les unités qui traversent les âges (ouvrier, navette). */
  private lookFor(u: Unit): Look { return (this.sim.players[u.owner]?.ere ?? 4) <= 3 && OLD_LOOKS[u.kind] ? (u.kind === 'ouvrier' && u.id % 2 ? OUVRIERE : OLD_LOOKS[u.kind]!) : LOOKS[u.kind]; }
  private create(u: Unit): View {
    const look = this.lookFor(u);
    const v: View = { pos: new THREE.Vector3(u.x, this.sim.map.heightAt(u.x, u.z), u.z), heading: u.heading, look, acts: [], state: 0 };
    if (look.rig) {
      // Véhicule articulé : un modèle par unité, roues et tourelle animées à la main.
      const isAlt = altStyle(this.sim, u.owner) && !!look.alt;
      const body = v.body = spawn(isAlt ? look.alt! : look.model, { footprint: look.footprint });
      v.yaw = isAlt ? look.altYaw ?? 0 : look.yaw ?? 0;
      body.updateMatrixWorld(true);
      v.wheels = [];
      const guns: { o: THREE.Object3D; tag: string }[] = [];
      body.traverse((o) => {
        if (/^wheel/i.test(o.name)) { const b = new THREE.Box3().setFromObject(o); v.wheels!.push({ o, r: Math.max(0.05, (b.max.y - b.min.y) / 2) }); }
        if (!v.turret && /^turret(_parent)?$/i.test(o.name)) v.turret = o;
        if (/^(cannon|barrel|gun ?barrel ?\d*|rocket ?launchers)$/i.test(o.name.trim())) guns.push({ o, tag: 'arme' });
      });
      if (guns.length) v.guns = guns;
      // Artillerie : canon relevé pour tirer en cloche.
      if (look.barrelUp) for (const g of guns) g.o.rotateX(-look.barrelUp);
      if (v.turret) v.turretQ = v.turret.quaternion.clone();
      v.aim = 0; v.lx = u.x; v.lz = u.z;
      this.scene.add(body);
    } else if (look.idle) {
      const body = v.body = spawn(look.model, { height: look.height, footprint: look.footprint, precise: look.precise });
      if (look.kk) {
        // Personnage KayKit : on ne garde que ses accessoires ; sa cape prend la couleur du camp.
        for (const w of KK_EXTRAS) { const o = body.getObjectByName(w); if (o) o.visible = look.kk.includes(w); }
        for (const w of look.hide ?? []) { const o = body.getObjectByName(w); if (o) o.visible = false; }
        kkCape(body, TEAM_COLORS[colorIndex(this.sim, u.owner)]);
      }
      if (look.weapon || look.kk) {
        for (const w of WEAPONS) { const o = body.getObjectByName(w); if (o) o.visible = w === look.weapon; }
        // Les armes cachées faussaient le centrage du modèle (anneau de sélection décalé) : on recentre sur ce qui est visible.
        body.updateMatrixWorld(true);
        const box = new THREE.Box3(), seen = (o: THREE.Object3D) => { for (let x: THREE.Object3D | null = o; x; x = x.parent) if (!x.visible) return false; return true; };
        body.traverse((o) => { if ((o as THREE.Mesh).isMesh && seen(o)) box.expandByObject(o); });
        if (!box.isEmpty()) { const inner = body.children[0]; inner.position.x -= (box.min.x + box.max.x) / 2; inner.position.z -= (box.min.z + box.max.z) / 2; }
      }
      if (look.swap) swapWeapon(body, look.swap.of, look.swap.make);
      if (u.kind === 'ouvrier') {
        // Un ouvrier ne porte pas d'arme : à la place, une pioche qui apparaît quand il travaille.
        const gun = body.getObjectByName('Pistol');
        if (gun) gun.visible = false;
        // Le chargeur glTF retire les points des noms d'os (UpperArm.R → UpperArmR).
        const n = (k: string) => (body.getObjectByName(k) ?? body.getObjectByName(k.replace('.', '')))!;
        if (n('UpperArm.R') && n('UpperArm.L') && n('Abdomen')) {
          v.swing = { upR: n('UpperArm.R'), loR: n('LowerArm.R'), hR: n('Middle1.R'), upL: n('UpperArm.L'), loL: n('LowerArm.L'), hL: n('Middle1.L'), abd: n('Abdomen'), t: (u.id * 0.53) % SWING_PERIOD, rest: [] };
          v.swing.rest = [v.swing.abd, v.swing.upR, v.swing.loR, v.swing.upL, v.swing.loL].map((o) => o.quaternion.clone());
          const tool = pickaxe(); tool.visible = false; body.add(tool); v.tool = tool;
        }
      }
      const clips = animations(look.model);
      if (clips.length) {
        v.mixer = new THREE.AnimationMixer(body);
        const find = (n: string) => n.includes('+') ? upperMix(look.model, clips, n) : clips.find((c) => c.name === n) ?? clips[0];
        // Tir figé : copie du clip (sinon même action que le repos), arrêtée sur une pose de visée.
        const workClip = look.workStill !== undefined ? find(look.work ?? look.idle).clone() : find(look.work ?? look.idle);
        if (look.workStill !== undefined) workClip.name += '-vise';
        v.acts = [v.mixer.clipAction(find(look.idle)), v.mixer.clipAction(find(look.run ?? look.idle)), v.mixer.clipAction(workClip), v.mixer.clipAction(find(look.runShoot ?? look.run ?? look.idle))];
        v.acts[0].play(); v.acts[0].time = (u.id * 0.37) % 2;
        v.acts[1].timeScale = look.runSpeed ?? 1; v.acts[2].timeScale = 1.3; v.acts[3].timeScale = look.runSpeed ?? 1;
        if (look.workStill !== undefined) { v.acts[2].timeScale = 0; v.acts[2].time = look.workStill; }
        if (look.mounts) v.mixer.update(0);
        if (look.model === HORSE) v.ik = horseIk(body);
        if (look.vill) {
          body.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && /hair|beard|brow|Plane|Cube/i.test(m.name + ((m.material as THREE.Material).name ?? ''))) { const mt = (m.material as THREE.MeshStandardMaterial).clone(); mt.color.set(0x5a3a22); m.material = mt; } });   // cheveux et barbe bruns
          const clip = (n: string) => clips.find((c) => c.name === n) ?? find(look.idle!);
          v.acts.push(v.mixer.clipAction(clip('Farm_Harvest')), v.mixer.clipAction(clip('Fixing_Kneeling')), v.mixer.clipAction(clip('Walk_Carry_Loop')));
          v.acts[6].timeScale = look.runSpeed ?? 1;
          const sp = body.getObjectByName('spine_02'); if (sp) v.mine = { bone: sp, k: 0 };
          const hand = body.getObjectByName('hand_r');
          if (hand) {
            // Le squelette est à l'échelle du fichier : l'outil est ramené à la taille d'un personnage d'1,8 m.
            const k = 1 / hand.getWorldScale(new THREE.Vector3()).x * (body.scale.x || 1);
            v.vt = villTools();
            for (const t of Object.values(v.vt)) { t.scale.setScalar(k); t.rotation.set(0, 0, Math.PI / 2); t.position.set(0, 0, 0); t.visible = false; hand.add(t); }
          }
        }
      }
      this.equip(body, look, v, u.kind);
      if (look.rider) this.mountRider(v, body, look, u);
      this.scene.add(body);
    } else if (look.custom) {
      const body = v.body = spawn(look.model, { height: look.height, footprint: look.footprint });
      this.equip(body, look, v, u.kind);
      this.scene.add(body);
    }
    this.views.set(u.id, v);
    return v;
  }

  /** Cavalerie : le cavalier s'assoit sur le dos du cheval et suit ses mouvements. */
  private mountRider(v: View, horse: THREE.Group, look: Look, u: Unit) {
    const R = look.rider!, body = spawn(R.model, { height: 1.75 });
    for (const w of KK_EXTRAS) { const o = body.getObjectByName(w); if (o) o.visible = R.kk.includes(w); }
    kkCape(body, TEAM_COLORS[colorIndex(this.sim, u.owner)]);
    horse.updateMatrixWorld(true);
    const bone = horse.getObjectByName('Torso') ?? horse.getObjectByName('Back') ?? horse;
    const wp = bone.getWorldPosition(new THREE.Vector3()), lp = horse.worldToLocal(wp.clone());
    const seat = (horse.userData.height as number ?? 2.3) * R.seat;
    body.position.set(0, seat, lp.z * 0.15);
    horse.add(body);
    const clips = animations(R.model), mixer = new THREE.AnimationMixer(body);
    const sit = mixer.clipAction(clips.find((c) => c.name === 'Sit_Chair_Idle') ?? clips[0]);
    const hit = mixer.clipAction(riderMix(clips, R.attack, 'Sit_Chair_Idle'));
    sit.play(); mixer.update(0);
    // La pose assise met les hanches en arrière : on recale le bassin au-dessus du dos.
    body.updateMatrixWorld(true);
    const hips = body.getObjectByName('hips');
    if (hips) { const hp = horse.worldToLocal(hips.getWorldPosition(new THREE.Vector3())); body.position.z -= hp.z + 0.3; body.position.y -= hp.y - seat; }
    v.ride = { body, bone, y0: lp.y, seat: body.position.y, mixer, sit, hit, on: false };
    const guns: { o: THREE.Object3D; tag: string }[] = [];
    body.traverse((o) => { if (o.name === R.kk[0]) guns.push({ o, tag: 'arme' }); });
    if (guns.length) v.guns = guns;
  }
  /** Armes rapportées : arme de corps à corps, armes de mech, épée remise en main. */
  private equip(body: THREE.Group, look: Look, v?: View, kind?: UnitKind) {
    let held: THREE.Group | undefined;
    if (look.wpn) held = attachMelee(body, spawn(look.wpn), look.wlen ?? 1);
    else if (look.strike) {
      // Couteau du soldat : on en fait une arme tenue, pour orienter la lame pendant l'estoc.
      const k = body.getObjectByName('Knife_1');
      if (k) { const copy = new THREE.Group(); k.traverse((o) => { if ((o as THREE.Mesh).isMesh) { const m = (o as THREE.Mesh).clone(); m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); copy.add(m); } }); held = attachMelee(body, copy, 1); if (held) k.visible = false; }
    }
    if (look.strike && v) {
      const n = (k: string) => body.getObjectByName(k.replace('.', ''))!;
      if (n('UpperArm.R') && n('Middle1.R')) v.strike = { wpn: held, upR: n('UpperArm.R'), loR: n('LowerArm.R'), hR: n('Middle1.R'), upL: n('UpperArm.L'), loL: n('LowerArm.L'), hL: n('Middle1.L'), t: 0, P: UNITS[kind!].cadence, on: false };
    }
    if (look.legs && v) {
      const b = body.getObjectByName('Body');
      v.legs = ['Front_Shoulder.L', 'Back_Shoulder.R', 'Front_Shoulder.R', 'Back_Shoulder.L'].map((k, i) => {
        const bone = body.getObjectByName(k.replace('.', ''))!;
        const out = new THREE.Vector3(k.endsWith('L') ? 1 : -1, 0, k.startsWith('Front') ? 1 : -1).normalize();
        return { bone, rest: bone.quaternion.clone(), out, ph: i < 2 ? 0 : Math.PI };
      }).filter((l) => l.bone);
      v.gait = 0; v.legBody = b; v.legBodyY = b?.position.y;
    }
    if (look.prop) attachProp(body, look.prop);
    const guns: { o: THREE.Object3D; tag: string }[] = [];
    for (const m of look.mounts ?? []) { const h = attachMount(body, spawn(m.f), m); if (h) guns.push({ o: h, tag: (Object.entries(ST_W).find(([, f]) => f === m.f)?.[0]) ?? 'arme' }); }
    if (v && !guns.length) {
      // Arme tenue ou montée : on la retrouve par son nom dans le modèle.
      const want = look.weapon ? [look.weapon] : [];
      body.traverse((o) => {
        const nm = o.name.replace(/[_\s]/g, '').toLowerCase();
        if (want.length ? o.name === want[0] : /^(pistol|cannon|barrel|gunbarrel\d*|gunl|gunr|rocketlaunchers|mg1)$/.test(nm)) guns.push({ o, tag: 'arme' });
      });
    }
    if (v && guns.length) v.guns = guns;
    if (v && look.level && guns.length) {
      const o = guns[0].o, bx = new THREE.Box3();
      // Axe long de l'arme dans son propre repère.
      o.updateMatrixWorld(true); const inv = o.matrixWorld.clone().invert();
      o.traverse((x) => { const m = x as THREE.Mesh; if (!m.isMesh) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); bx.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld.clone().premultiply(inv))); });
      const sz = bx.getSize(new THREE.Vector3()), ax = new THREE.Vector3(); ax.setComponent(longAxis(sz), 1);
      v.lev = { o, q: o.quaternion.clone(), p: o.position.clone(), ax };
    }
    if (v && look.twoHands) {
      const n = (k: string) => body.getObjectByName(k.replace('.', ''));
      const upL = n('UpperArm.L'), loL = n('LowerArm.L'), hL = n('Middle1.L') ?? n('Hand.L'), hR = n('Middle1.R') ?? n('Hand.R');
      if (upL && loL && hL && hR) v.arms = { upL, loL, hL, hR };
    }
    if (v && look.paint !== undefined) body.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh || o.userData.weapon) return;
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => { const c = (x as THREE.MeshStandardMaterial).clone(); c.color = new THREE.Color(look.paint!).multiply(c.color.clone().lerp(new THREE.Color(1, 1, 1), 0.35)); c.metalness = 0.55; c.roughness = 0.45; return c; });
      m.material = Array.isArray(m.material) ? mats : mats[0];
    });
  }

  /** Point de départ d'un tir : bout de l'arme (ou du canon) tourné vers la cible ; plusieurs armes : à tour de rôle. */
  muzzle(id: number, tx: number, tz: number, tag?: string): THREE.Vector3 | null {
    const v = this.views.get(id); if (!v) return null;
    if (v.body && v.guns?.length) {
      v.body.updateMatrixWorld(true);
      const list = tag ? v.guns.filter((g) => g.tag === tag) : v.guns, pool = list.length ? list : v.guns;
      v.gunTurn = ((v.gunTurn ?? -1) + 1) % pool.length;
      const o = pool[v.gunTurn].o;
      // Arme d'un seul maillage : les deux bouts de son axe long ; on garde celui tourné vers la cible.
      let mesh: THREE.Mesh | null = (o as THREE.Mesh).isMesh ? o as THREE.Mesh : null;
      if (!mesh) o.traverse((x) => { if (!mesh && (x as THREE.Mesh).isMesh) mesh = x as THREE.Mesh; });
      let count = 0; o.traverse((x) => { if ((x as THREE.Mesh).isMesh) count++; });
      if (mesh && count === 1 && !(mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        const g = (mesh as THREE.Mesh).geometry; if (!g.boundingBox) g.computeBoundingBox();
        const gb = g.boundingBox!, sz = gb.getSize(new THREE.Vector3()), ax = longAxis(sz), c0 = gb.getCenter(new THREE.Vector3());
        const e1 = c0.clone(), e2 = c0.clone(); e1.setComponent(ax, gb.max.getComponent(ax)); e2.setComponent(ax, gb.min.getComponent(ax));
        e1.applyMatrix4((mesh as THREE.Mesh).matrixWorld); e2.applyMatrix4((mesh as THREE.Mesh).matrixWorld);
        const dd = new THREE.Vector3(tx, 0, tz);
        return Math.hypot(e1.x - dd.x, e1.z - dd.z) <= Math.hypot(e2.x - dd.x, e2.z - dd.z) ? e1 : e2;
      }
      const box = new THREE.Box3().setFromObject(o, true);
      if (box.isEmpty()) { o.getWorldPosition(this.mz); return this.mz.clone(); }
      const c = box.getCenter(new THREE.Vector3()), d = new THREE.Vector3(tx - c.x, 0, tz - c.z).normalize();
      let best = 0;
      for (let k = 0; k < 8; k++) { const q = new THREE.Vector3(k & 1 ? box.max.x : box.min.x, c.y, k & 4 ? box.max.z : box.min.z); best = Math.max(best, q.sub(c).dot(d)); }
      return c.addScaledVector(d, best);
    }
    if (v.body) {
      // Sans arme repérée (Exosquelette…) : devant le corps, à hauteur de bras.
      v.body.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(v.body, true), c = box.getCenter(new THREE.Vector3()), d = new THREE.Vector3(tx - c.x, 0, tz - c.z).normalize();
      const r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.42;
      return new THREE.Vector3(c.x + d.x * r, box.min.y + (box.max.y - box.min.y) * 0.62, c.z + d.z * r);
    }
    // Vaisseaux (dessinés en lot) : avant du modèle, à mi-hauteur.
    const L = this.front.get(v.look.model); if (!L) return null;
    const a = v.heading + (v.yaw ?? v.look.yaw ?? 0), f = v.look.footprint ?? 1, hov = v.look.hover ?? 0;
    return new THREE.Vector3(v.pos.x + Math.sin(a) * L.z * f, v.pos.y + hov + L.y * f, v.pos.z + Math.cos(a) * L.z * f);
  }
  private mz = new THREE.Vector3();
  /** Avant (z max) et hauteur moyenne de chaque modèle, en unités du modèle normalisé. */
  private front = new Map<string, { z: number; y: number }>();
  /** Un tir vient de partir : petit recul des tireurs (pose de visée figée). */
  recoil(id: number) { const v = this.views.get(id); if (v) v.kick = 0.16; }

  /** Un coup au corps à corps vient de porter : le geste est recalé pour que l'impact tombe à cet instant. */
  meleeHit(id: number) { const v = this.views.get(id); if (v?.strike) { v.strike.t = v.strike.P * 0.72; } }

  /** Geste d'attaque des combattants au corps à corps (cinématique inverse sur les bras, arme tenue en main). */
  private strikePose(v: View, active: boolean, dt: number) {
    const k = v.strike!, body = v.body!, style = v.look.strike!, w = k.wpn;
    if (!active) {
      if (k.on && w) { const hm = w.userData.home; hm.parent.add(w); w.position.copy(hm.p); w.quaternion.copy(hm.q); w.scale.copy(hm.s); }
      k.on = false; return;
    }
    if (!k.on && w) body.attach(w);
    k.on = true;
    k.t += dt;
    const P = Math.max(0.6, k.P), c = (k.t % P) / P, ease = (x: number) => x * x * (3 - 2 * x);
    body.updateMatrixWorld(true);
    const shR = body.worldToLocal(k.upR.getWorldPosition(new THREE.Vector3())), shL = body.worldToLocal(k.upL.getWorldPosition(new THREE.Vector3()));
    const right = new THREE.Vector3(1, 0, 0).transformDirection(body.matrixWorld), down = new THREE.Vector3(0, -1, 0).transformDirection(body.matrixWorld), back = new THREE.Vector3(0, 0, -1).transformDirection(body.matrixWorld);
    let grip: THREE.Vector3, dir: THREE.Vector3, two = false;
    if (style === 'masse') {
      // À deux mains : on lève le marteau au-dessus de la tête, puis on l'abat devant soi.
      // Arc devant le corps, côté droit en haut : les bras ne traversent ni la tête ni le buste.
      const th = swingAngle(c * SWING_PERIOD), sh = shR.clone().add(shL).multiplyScalar(0.5), r = 0.46;
      dir = new THREE.Vector3(0, Math.cos(th), Math.sin(th));
      grip = new THREE.Vector3(0.18 * Math.max(0, Math.cos(th)), sh.y + Math.cos(th) * r - 0.1, sh.z + 0.34 + Math.sin(th) * r).addScaledVector(dir, -0.1);
      two = true;
    } else if (style === 'taille') {
      // Épée : armée au-dessus de l'épaule droite, taille en diagonale vers la gauche, retour en garde.
      const UP = -0.6, LOW = 2.2, GUARD = 1.0;
      const th = c < 0.45 ? GUARD + (UP - GUARD) * ease(c / 0.45) : c < 0.55 ? UP : c < 0.7 ? UP + (LOW - UP) * Math.pow((c - 0.55) / 0.15, 2) : LOW + (GUARD - LOW) * ease((c - 0.7) / 0.3);
      const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.65);
      dir = new THREE.Vector3(0, Math.cos(th), Math.sin(th)).applyQuaternion(roll);
      grip = shR.clone().add(new THREE.Vector3(0.12, -0.05, 0.12)).addScaledVector(dir, 0.36);
    } else {
      // Couteau : on ramène la lame contre soi, puis on frappe d'estoc vers l'avant.
      // Couteau : garde basse, armé à la hanche droite, fente vers l'avant (le corps accompagne), puis retour en garde.
      const f = c < 0.45 ? 0.35 - 0.55 * ease(c / 0.45) : c < 0.62 ? -0.2 + 1.2 * ease((c - 0.45) / 0.17) : 1 - 0.65 * ease((c - 0.62) / 0.38);
      grip = new THREE.Vector3(shR.x * (0.75 - 0.6 * Math.max(0, f)), shR.y - 0.42 + Math.max(0, f) * 0.22, shR.z + 0.05 + f * 0.55);
      dir = new THREE.Vector3(-0.15 * Math.max(0, f), 0.05, 1).normalize();
      // Fente : léger pas en avant et rotation des épaules.
      const lunge = Math.max(0, f);
      body.rotation.x = lunge * 0.12; body.rotation.y += -lunge * 0.25;
      body.updateMatrixWorld(true);
    }
    const gW = body.localToWorld(grip.clone()), dW = dir.clone().transformDirection(body.matrixWorld);
    if (w) {
      w.position.copy(grip);
      w.quaternion.setFromUnitVectors(AX[w.userData.axis as number].clone(), dir);
    }
    reach(k.upR, k.loR, k.hR, gW, right.clone().multiplyScalar(-0.8).add(down).addScaledVector(back, 0.3));
    if (two) reach(k.upL, k.loL, k.hL, gW.clone().addScaledVector(dW, 0.16), right.clone().multiplyScalar(0.8).add(down).addScaledVector(back, 0.3));
  }

  /** Fusil remis à l'horizontale, pointé droit devant, en pivotant autour de la main droite. */
  private levelGun(v: View, aim: boolean) {
    const L = v.lev!, o = L.o, body = v.body!;
    o.quaternion.copy(L.q); o.position.copy(L.p);
    if (!aim || !v.arms || !o.parent) return;
    body.updateMatrixWorld(true);
    const P = v.arms.hR.getWorldPosition(new THREE.Vector3());
    const wq = o.getWorldQuaternion(new THREE.Quaternion()), wp = o.getWorldPosition(new THREE.Vector3());
    const c = new THREE.Box3().setFromObject(o, true).getCenter(new THREE.Vector3());
    const axis = L.ax.clone().applyQuaternion(wq);
    if (axis.dot(c.clone().sub(P)) < 0) axis.negate();
    const fwd = new THREE.Vector3(0, 0, 1).transformDirection(body.matrixWorld); fwd.y = 0; fwd.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(axis.normalize(), fwd);
    // Le recul relève un peu le canon au départ du coup.
    const kick = v.kick && v.kick > 0 ? Math.sin((v.kick / 0.16) * Math.PI) * 0.12 : 0;
    if (kick) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0).transformDirection(body.matrixWorld), -kick));
    // On ramène aussi la crosse au creux de la main (l'arme flottait devant).
    const np = P.clone().add(wp.clone().sub(P).applyQuaternion(q));
    const pw = o.parent.getWorldQuaternion(new THREE.Quaternion());
    o.quaternion.copy(pw.clone().invert().multiply(q.multiply(wq)));
    o.position.copy(o.parent.worldToLocal(np));
  }

  /** Main gauche sous le canon de l'arme tenue par la main droite (fusil, lance-roquettes, lance-grenades). */
  private twoHandPose(v: View) {
    const a = v.arms!, body = v.body!, gun = v.guns![0].o;
    body.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(gun, true); if (box.isEmpty()) return;
    const hR = a.hR.getWorldPosition(new THREE.Vector3());
    // Bout de l'arme le plus éloigné de la main droite : on prend la poignée avant à mi-chemin.
    let far = hR.clone(), best = -1;
    for (let k = 0; k < 8; k++) { const q = new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z); const d = q.distanceTo(hR); if (d > best) { best = d; far = q; } }
    const target = hR.clone().lerp(far, 0.42); target.y -= 0.04;
    const right = new THREE.Vector3(1, 0, 0).transformDirection(body.matrixWorld), down = new THREE.Vector3(0, -1, 0).transformDirection(body.matrixWorld), back = new THREE.Vector3(0, 0, -1).transformDirection(body.matrixWorld);
    reach(a.upL, a.loL, a.hL, target, right.clone().multiplyScalar(0.8).add(down).addScaledVector(back, 0.3));
  }

  /** Robot araignée : pattes en diagonale qui se lèvent et avancent à tour de rôle, corps qui ondule. */
  private legPose(v: View, u: Unit, dt: number) {
    const moving = u.moving;
    v.gait! += dt * (moving ? 9 : 0);
    const up = new THREE.Vector3(0, 1, 0), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), ax = new THREE.Vector3();
    for (const l of v.legs!) {
      const p = v.gait! + l.ph, swing = moving ? Math.sin(p) * 0.38 : 0, lift = moving ? Math.max(0, Math.cos(p)) * 0.42 : Math.sin(this.time * 2 + l.ph) * 0.03;
      ax.crossVectors(up, l.out).normalize();
      // Repère du corps : rotation autour de la verticale (pas) puis levée vers le haut.
      q1.setFromAxisAngle(up, swing * (l.out.x > 0 ? -1 : 1)); q2.setFromAxisAngle(ax, -lift);
      l.bone.quaternion.copy(l.rest).premultiply(q2).premultiply(q1);
    }
    if (v.legBody && v.legBodyY !== undefined) v.legBody.position.y = v.legBodyY + (moving ? Math.abs(Math.sin(v.gait! * 2)) * 0.04 : Math.sin(this.time * 2) * 0.01);
  }

  /** Coup de pioche : le manche décrit un arc devant l'ouvrier, les deux mains le tiennent, le buste accompagne. */
  private swingPose(v: View, dt: number) {
    const sw = v.swing!, body = v.body!, tool = v.tool!;
    sw.t += dt;
    const th = swingAngle(sw.t), H = 2.1;
    // On repart de la pose de repos à chaque image (sinon les rotations s'additionnent).
    [sw.abd, sw.upR, sw.loR, sw.upL, sw.loL].forEach((o, i) => o.quaternion.copy(sw.rest[i]));
    // Buste : se redresse en levant, se penche à la frappe.
    body.updateMatrixWorld(true);
    const lean = 0.05 + 0.45 * Math.max(0, Math.min(1, (th - 0.3) / 2.1));
    const right = new THREE.Vector3(1, 0, 0).transformDirection(body.matrixWorld);
    sw.abd.getWorldQuaternion(_qa); _qa.premultiply(_qb.setFromAxisAngle(right, lean));
    sw.abd.parent!.getWorldQuaternion(_qc); sw.abd.quaternion.copy(_qc.invert().multiply(_qa));
    body.updateMatrixWorld(true);
    // Prise : sur un arc autour des épaules, dans le plan de face (repère du personnage, en mètres).
    const sh = sw.upR.getWorldPosition(new THREE.Vector3()).add(sw.upL.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
    const local = body.worldToLocal(sh.clone());
    const r = 0.5 * H / 2.1;
    // Arc décalé vers l'avant et côté droit : en haut, la pioche passe au-dessus de l'épaule droite, jamais à travers la tête.
    const side = 0.34 * Math.max(0, Math.cos(th));
    const grip = new THREE.Vector3(side, local.y + Math.cos(th) * r - 0.2, local.z + 0.42 + Math.sin(th) * r);
    const radial = new THREE.Vector3(0, Math.cos(th), Math.sin(th));
    // Pioche : manche dans le prolongement des bras, fer perpendiculaire.
    tool.visible = true;
    tool.position.copy(grip).addScaledVector(radial, -0.12);
    const tangent = new THREE.Vector3(0, -Math.sin(th), Math.cos(th));
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(tangent, radial), tangent, radial);
    tool.quaternion.setFromRotationMatrix(m);
    // Mains sur le manche : la droite près du bout, la gauche un peu plus haut.
    const handR = body.localToWorld(grip.clone().addScaledVector(radial, -0.05).add(new THREE.Vector3(0.03, 0, 0)));
    const handL = body.localToWorld(grip.clone().addScaledVector(radial, 0.12).add(new THREE.Vector3(-0.03, 0, 0)));
    const down = new THREE.Vector3(0, -1, 0).transformDirection(body.matrixWorld), back = new THREE.Vector3(0, 0, -1).transformDirection(body.matrixWorld);
    reach(sw.upR, sw.loR, sw.hR, handR, right.clone().multiplyScalar(0.8).add(down).addScaledVector(back, 0.3));
    reach(sw.upL, sw.loL, sw.hL, handL, right.clone().multiplyScalar(-0.8).add(down).addScaledVector(back, 0.3));
  }

  setSelected(ids: Set<number>) { this.selected = new Set(ids); }

  private killed = new Set<number>();
  private dying: { body: THREE.Group; t: number; dir: number }[] = [];
  /** Unité tuée (et non embarquée dans une navette) : sa disparition sera animée. */
  kill(id: number) { this.killed.add(id); }

  /** Position affichée d'une unité (pour la sélection à l'écran). */
  position(id: number, out: THREE.Vector3): THREE.Vector3 | null { const v = this.views.get(id); return v ? out.copy(v.pos) : null; }

  update(alpha: number, dt: number, fx?: Effects) {
    this.time += dt;
    // Les unités mortes : les personnages s'effondrent puis s'enfoncent dans le sol ; les autres disparaissent (l'explosion est jouée à part).
    if (this.views.size > this.sim.units.length) for (const [id, v] of this.views) if (!this.sim.get(id)) {
      if (v.body && this.killed.has(id) && !v.look.footprint) { v.body.rotation.order = 'YXZ'; this.dying.push({ body: v.body, t: 0, dir: Math.random() < 0.5 ? 1 : -1 }); }
      else if (v.body) this.scene.remove(v.body);
      this.views.delete(id); this.killed.delete(id);
    }
    this.dying = this.dying.filter((d) => {
      d.t += dt;
      const k = Math.min(1, d.t / 0.45), ease = k * k * (3 - 2 * k);
      d.body.rotation.x = d.dir * ease * Math.PI * 0.48;
      if (d.t > 1.6) d.body.position.y -= dt * 0.9;
      if (d.t > 2.8) { this.scene.remove(d.body); return false; }
      return true;
    });
    const map = this.sim.map, { m, q, s, p } = this;
    const nRing = this.rings.map(() => 0); let nSel = 0;
    const nBatch = new Map<UnitKind, number>();
    let nCarry = 0, nOn = 0, nOff = 0, nStar = 0;
    const big = 1 + Math.min(1.4, Math.max(0, (this.zoom - 60) / 45));
    // Vue stratégique : au-delà de ~70 m de recul, une icône par unité, de taille constante à l'écran.
    const iconK = this.camera ? Math.min(1, Math.max(0, (this.zoom - 70) / 25)) : 0, iconS = this.zoom * 0.042, nIcon = new Map<string, number>();
    const camQ = this.camera?.quaternion;
    for (const u of this.sim.units) {
      // Ouvrier, navette : leur tenue change avec l'âge de leur camp (villageois → astronaute, barque → navette).
      const v0 = this.views.get(u.id);
      if (v0 && OLD_LOOKS[u.kind] && v0.look !== this.lookFor(u)) { if (v0.body) this.scene.remove(v0.body); this.views.delete(u.id); }
      const v = this.views.get(u.id) ?? this.create(u);
      const x = u.px + (u.x - u.px) * alpha, z = u.pz + (u.z - u.pz) * alpha;
      v.pos.y += (map.heightAt(x, z) - v.pos.y) * Math.min(1, dt * 12);
      v.pos.x = x; v.pos.z = z;
      // Unité ennemie hors de vue : rien n'est affiché (ni modèle, ni anneau, ni barre de vie).
      if (this.sim.foe(u.owner, 0) && !this.visible(x, z)) { if (v.body) v.body.visible = false; continue; }
      if (v.body) v.body.visible = true;
      let d = u.heading - v.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      v.heading += d * Math.min(1, dt * 10);
      if (fx && u.hp < u.maxHp) fx.bar(x, v.pos.y + (v.look.height ?? 1.6) + 0.7 + (u.fly ? 4.2 : 0), z, u.wide ? 2.2 : 1.3, Math.max(0, u.hp / u.maxHp));
      // anneau d'équipe + anneau de sélection
      if (iconK > 0) {
        const key = colorIndex(this.sim, u.owner) + ICON_CAT[u.kind], im = this.icons.get(key)!, i = nIcon.get(key) ?? 0;
        if (i < CAP) { m.compose(p.set(x, v.pos.y + (v.look.hover ?? 0) + 1.5 + iconS * 0.5, z), camQ!, s.set(iconS, iconS, iconS)); im.setMatrixAt(i, m); nIcon.set(key, i + 1); }
      }
      if (u.vet > 0 && camQ && iconK < 1) {
        const sy = v.pos.y + (v.look.height ?? 1.6) + 1.15 + (u.fly ? (v.look.hover ?? 4.2) : 0);
        for (let k = 0; k < u.vet && nStar < CAP * 3; k++) {
          // étoiles côte à côte, dans le plan de l'écran
          p.set((k - (u.vet - 1) / 2) * 0.45, 0, 0).applyQuaternion(camQ).add(this.s2.set(x, sy, z));
          m.compose(p, camQ, s.set(1, 1, 1)); this.stars.setMatrixAt(nStar++, m);
        }
      }
      const rs = u.radius * 1.15 * big;
      // Navette du joueur : une pastille par place, allumée si occupée.
      if (u.kind === 'navette' && u.owner === this.me) {
        const cap = this.sim.navCap(this.me), used = this.sim.navUsed(u), y = v.pos.y + (v.look.hover ?? 4) + 2.6;
        for (let k = 0; k < cap; k++) {
          m.compose(p.set(x + (k - (cap - 1) / 2) * 0.55, y, z), q.identity(), s.set(1, 1, 1));
          if (k < used) { if (nOn < 96) this.dotOn.setMatrixAt(nOn++, m); } else if (nOff < 96) this.dotOff.setMatrixAt(nOff++, m);
        }
      }
      m.compose(p.set(x, v.pos.y + 0.06, z), q.identity(), s.set(rs, 1, rs));
      const o = colorIndex(this.sim, u.owner);
      if (nRing[o] < CAP) this.rings[o].setMatrixAt(nRing[o]++, m);
      if (this.selected.has(u.id) && nSel < CAP) { m.elements[13] += 0.02; this.selRing.setMatrixAt(nSel++, m); }
      if (v.body) {
        v.body.position.copy(v.pos); v.body.rotation.y = v.heading + (v.yaw ?? v.look.yaw ?? 0);
        if (v.look.rig) {
          if (v.look.hover) v.body.position.y += v.look.hover + Math.sin(this.time * 1.5 + u.id) * 0.25;          // vaisseau en vol
          else if (altStyle(this.sim, u.owner)) v.body.position.y += 0.35 + Math.sin(this.time * 3 + u.id) * 0.06;   // chars à coussin d'air
          const step = Math.hypot(x - v.lx!, z - v.lz!); v.lx = x; v.lz = z;
          if (step > 0 && step < 3) for (const w of v.wheels!) w.o.rotation.x += step / w.r;
          if (v.turret) {
            const t = u.tu >= 0 ? this.sim.get(u.tu) : u.tb >= 0 ? this.sim.building(u.tb) : null;
            let want = 0;
            if (t) { want = Math.atan2(t.x - x, t.z - z) - v.heading; want = Math.atan2(Math.sin(want), Math.cos(want)); }
            let da = want - v.aim!; da = Math.atan2(Math.sin(da), Math.cos(da));
            v.aim! += Math.sign(da) * Math.min(Math.abs(da), dt * 2.5);
            v.turret.quaternion.copy(v.turretQ!).multiply(this.q.setFromAxisAngle(this.up, v.aim!));
          }
        }
        if (v.look.boat) {
          // Barque : posée sur l'eau (ou tirée sur la grève), légère houle.
          v.body.position.y = Math.max(v.pos.y, WATER_Y) + Math.sin(this.time * 1.6 + u.id) * 0.08;
          v.body.rotation.z = Math.sin(this.time * 1.1 + u.id * 2) * 0.035;
        }
        if (v.tool) v.tool.visible = u.working;
        // 0 repos, 1 déplacement, 2 tir (ou travail) sur place, 3 tir en se déplaçant (cible en vue).
        const aiming = !!v.look.shoot && (u.tu >= 0 || u.tb >= 0);
        let st = u.working || (aiming && !u.moving) ? 2 : u.moving ? (aiming && v.look.runShoot ? 3 : 1) : 0;
        if (v.look.vill) {
          // Villageois : le geste et l'outil dépendent de la tâche.
          const node = u.job?.t === 'gather' ? this.sim.nodes[u.job.node] : undefined, build = u.job?.t === 'build' || u.job?.t === 'repair' || u.job?.t === 'capture';
          if (st === 2) st = build ? 5 : node && node.res === 'eau' ? 4 : 2;
          else if (st === 1 && u.carry > 0.5) st = 6;
          if (v.mine) v.mine.k += ((st === 2 && node && node.res !== 'bois' ? 1 : 0) - v.mine.k) * Math.min(1, dt * 6);
          if (v.vt) { const tool = st === 5 ? 'marteau' : st === 2 ? (node && node.res === 'bois' ? 'hache' : 'pioche') : ''; for (const [k, t] of Object.entries(v.vt)) t.visible = k === tool; }
        }
        if ((u.tu >= 0 || u.tb >= 0) && !v.turret) v.heading = u.heading;
        if (v.mixer && v.acts.length && v.state !== st) {
          const from = v.acts[v.state], to = v.acts[st];
          v.state = st;
          to.reset().play(); if (st === 2 && v.look.workStill !== undefined) to.time = v.look.workStill; from.crossFadeTo(to, 0.18, false);
        }
        if (u.carry > 0.5 && u.carryKind && nCarry < CAP) {
          // charge visible sur le dos de l'ouvrier
          const vk = v.look.vill ? 0.4 : 1, back = v.look.vill ? 0.26 : 0.45;   // villageois : petit ballot sur le dos
          m.compose(p.set(x - Math.sin(v.heading) * back, v.pos.y + (v.look.vill ? 1.12 : 1.45), z - Math.cos(v.heading) * back), q.setFromAxisAngle(this.up, v.heading), s.set(vk, vk, vk));
          this.carry.setMatrixAt(nCarry, m); this.carry.setColorAt(nCarry++, CARRY_COLORS[u.carryKind] ?? CARRY_COLORS.eau);
        }
        v.mixer?.update(dt);
        if (v.ik) { v.body.updateMatrixWorld(true); solveIk(v.ik); }
        if (v.mine && v.mine.k > 0.01) v.mine.bone.quaternion.multiply(MINE_Q.setFromAxisAngle(MINE_AX, MINE_BEND * v.mine.k));
        if (v.ride) {
          // Cavalier : suit le dos du cheval ; frappe du haut du corps pendant l'attaque.
          const R = v.ride, attack = st === 2 || st === 3;
          if (attack !== R.on) { R.on = attack; const [a, b] = attack ? [R.sit, R.hit] : [R.hit, R.sit]; b.reset().play(); a.crossFadeTo(b, 0.15, false); }
          v.body.updateMatrixWorld(true);
          const by = v.body.worldToLocal(R.bone.getWorldPosition(this.mz)).y;
          R.body.position.y = R.seat + (by - R.y0);
          R.mixer.update(dt);
        }
        if (v.look.siege && v.body.children[0]) {
          // Bélier : coups de boutoir ; catapulte : la machine se cabre à chaque tir.
          const inner = v.body.children[0], work = st === 2;
          v.siegeT = work ? ((v.siegeT ?? 0) + dt) % UNITS[u.kind].cadence : 0;
          const k = v.siegeT / UNITS[u.kind].cadence;
          if (v.look.siege === 'ram') inner.position.z = (inner.userData.z0 ??= inner.position.z) + (work ? Math.sin(Math.min(1, k * 2.5) * Math.PI) * 0.45 : 0);
          else inner.rotation.x = work ? -Math.sin(Math.min(1, k * 4) * Math.PI) * 0.08 : 0;
        }
        // Recul : le tireur encaisse le coup de feu (léger basculement vers l'arrière, vite résorbé).
        if (v.kick && v.kick > 0) { v.kick = Math.max(0, v.kick - dt); v.body.rotation.x = -Math.sin((v.kick / 0.16) * Math.PI) * 0.07; } else if (v.body.rotation.x) v.body.rotation.x = 0;
        if (v.strike) this.strikePose(v, st === 2, dt);
        if (v.lev) this.levelGun(v, st === 2 || st === 3);
        if (v.arms && v.guns && (st === 2 || st === 3)) this.twoHandPose(v);
        if (v.legs) this.legPose(v, u, dt);
        if (v.swing && v.tool) {
          if (u.working) this.swingPose(v, dt); else v.swing.t = (u.id * 0.53) % SWING_PERIOD;
        }
      } else {
        const list = this.batches.get(u.kind)!, i = nBatch.get(u.kind) ?? 0;
        if (i < CAP) {
          const f = v.look.footprint ?? 1;
          const hover = v.look.hover ? v.look.hover + Math.sin(this.time * 3 + u.id) * 0.08 : 0;
          m.compose(p.set(x, v.pos.y + hover, z), q.setFromAxisAngle(this.up, v.heading + (v.look.yaw ?? 0)), s.set(f, f, f));
          for (const im of list) im.setMatrixAt(i, m);
          nBatch.set(u.kind, i + 1);
        }
      }
    }
    this.rings.forEach((r, i) => { r.count = nRing[i]; r.instanceMatrix.needsUpdate = true; });
    for (const [key, im] of this.icons) { im.count = nIcon.get(key) ?? 0; im.instanceMatrix.needsUpdate = true; (im.material as THREE.MeshBasicMaterial).opacity = iconK; }
    this.stars.count = nStar; this.stars.instanceMatrix.needsUpdate = true;
    this.dotOn.count = nOn; this.dotOn.instanceMatrix.needsUpdate = true; this.dotOff.count = nOff; this.dotOff.instanceMatrix.needsUpdate = true;
    this.selRing.count = nSel; this.selRing.instanceMatrix.needsUpdate = true;
    this.carry.count = nCarry; this.carry.instanceMatrix.needsUpdate = true; if (this.carry.instanceColor) this.carry.instanceColor.needsUpdate = true;
    for (const [kind, list] of this.batches) for (const im of list) { im.count = nBatch.get(kind) ?? 0; im.instanceMatrix.needsUpdate = true; }
  }
}
