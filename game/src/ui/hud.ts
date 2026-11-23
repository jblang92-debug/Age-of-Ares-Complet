import { dev } from './words';
import { GEN_ICONS } from './icons_gen';
import { MAP_KINDS, type MapKind } from '../mapgen/terrain';
import { generateMap, SIZES, type MapSize } from '../mapgen/index';
/** Carte choisie dans le menu (appliquée au lancement). */
export interface MapChoice { seed: number; size: string; kind: string; players: string }
// Interface (HTML/CSS par-dessus le rendu 3D) : barre de ressources, mini-carte, réglages.
import * as THREE from 'three';
import type { TerrainMap } from '../mapgen/terrain';
import type { RtsCamera } from '../input/camera';
import { GAME, RES_NOM, lookAge } from '../data/rules';
import { BASE } from '../render/assets';
import type { Controller } from '../input/controller';
import { orient } from './orient';
import type { Sim, Formation, Posture, UnitKind } from '../sim/sim';
import { unitClass, DEPOT } from '../sim/sim';
import { UNITS, BUILDINGS, RESEARCH, nomBat, nomUnit, dispo } from '../data/rules';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const UI = (f: string) => BASE + 'assets/ui/' + f;
/** Icônes disponibles (illustrations découpées) ; les autres boutons restent sans image. */
const ICONS = new Set(['b_centre', 'b_depotMinier', 'b_centrale', 'b_habitat', 'b_caserne', 'b_raffinerie', 'b_usine', 'b_hangar', 'b_tourelle', 'b_tourelleAA', 'b_bouclier', 'b_labo',
  't_recolte', 't_moteurs', 't_portee', 't_armure', 't_degats', 't_murs', 'u_ouvrier', 'u_fantassin', 'u_blinde', 'u_drone', 'u_navette', 'a_attaque', 'a_ere',
  'b_stationEau', 'b_quai', 'b_recycleur', 'b_mur', 'b_porte', 'u_eclaireur', 'u_ingenieur', 'u_antiblindage', 'u_intercepteur', 't_propulseurs', 't_reseau',
  'u_artillerie', 'u_cuirasse', 'b_defense', 'b_ascenseur', 't_reparation', 't_nano', 't_surcharge', 'a_ere3',
  'b_arene', 'b_atelier', 'u_lame', 'u_marteleur', 'u_sabreur', 'u_aether', 'u_araignee', 'u_araigneeCanon', 'u_cogneur', 'u_strikerLaser', 'u_strikerMissiles', 'u_strikerAssaut',
  'u_tireur', 'u_grenadier', 'u_garde', 'u_commando', 'u_vigile', 'u_exo', 'u_sam', 'u_chasseurChars', 'u_avc', 'u_huit', 'u_canonAA', 'u_challenger', 'u_spitfire', 'u_zenith', 'u_pancake', 'u_executioner', 'u_imperial',
  'u_milicien', 'u_hachier', 'u_champion', 'u_archer', 'u_arbaletrier', 'u_cavalier', 'u_chevalier', 'u_belier', 'u_catapulte', 'b_archerie', 'b_ecurie', 'b_atelierSiege',
  'u_mousquetaire', 'u_canon', 'u_galere', 'u_galion', 'u_ouvrier_a', 'u_navette_a', 'u_pecheur', 'b_scierie', 'b_mur_a1', 'b_mur_a2',
  ...['centre', 'habitat', 'stationEau', 'scierie', 'depotMinier', 'recycleur', 'caserne', 'archerie', 'ecurie', 'quai', 'tourelle', 'porte'].flatMap((k) => [`b_${k}_a1`, `b_${k}_a2`]), 'b_atelierSiege_a2',
  'r_or', 'a_stop', 'a_repli', 'a_agressive', 'a_defensive', 'a_tenir', 'a_passive', 'a_debarquer', 'a_reparer', 'a_capturer', 'a_transporter', ...GEN_ICONS]);
/** Recherches sans illustration propre : on réutilise une icône proche. */
const ALIAS: Record<string, string> = { t_barriere: 'b_bouclier', t_monnaie: 'r_or', t_banque: 'r_or' };
/** Icône d'un bâtiment ou d'une unité, dans la version de l'âge du joueur quand elle existe (Antiquité, Moyen Âge et poudre). */
const ageIcon = (n: string, ere?: number) => { if (n === 'u_ouvrier' && ICONS.has('u_ouvrier_a')) return 'u_ouvrier_a';   // le villageois à tous les âges
  if (!ere) return n;
  // Bâtiments : l'icône de l'âge exact (photo du vrai modèle de cet âge), sinon celle de l'âge ancien le plus proche.
  if (n.startsWith('b_')) { for (const e of ere >= 4 ? [ere] : ere === 3 ? [3, 2, 1] : ere === 2 ? [2, 1] : [1]) if (ICONS.has(`${n}_a${e}`)) return `${n}_a${e}`; return n; }
  if (ere > 3) return n; const v = `${n}_a`; return ICONS.has(v) ? v : n; };
const icon = (n: string, ere?: number) => (n = ALIAS[ageIcon(n, ere)] ?? ageIcon(n, ere), ICONS.has(n))  ? `<img src="${UI('icons/' + n + '.png')}" alt=""/>` : '';
const RES = ['eau', 'bois', 'minerai', 'energie', 'solarite'] as const;
const RI: Record<string, string> = { eau: 'r_nourriture', bois: 'r_bois', minerai: 'r_pierre', energie: 'r_or', solarite: 'r_solarite' };
const pills = (c: object) => `<span class="cost">${RES.filter((k) => (c as Record<string, number>)[k]).map((k) => `<b class="p-${k}">${(c as Record<string, number>)[k]}</b>`).join('')}</span>`;

const BN: Record<string, string> = { infanterie: 'infanterie', vehicule: 'véhicules', machine: 'machines', batiment: 'bâtiments', air: 'appareils volants', sol: 'cibles au sol', ouvrier: 'ouvriers' };
const bname = (k: string) => BN[k] ?? (UNITS[k] ? UNITS[k].nom : k);
const fr = (v: number) => String(Math.round(v * 100) / 100).replace('.', ',');
const COMBAT = () => Object.keys(UNITS).filter((k) => UNITS[k].degats > 0 && k !== 'ouvrier');
/** Unités qui ont un bonus d'au moins ×1,5 contre celle-ci (et peuvent la toucher). */
export function counters(kind: string, n = 3): string[] {
  const c = unitClass(kind);
  return COMBAT().filter((j) => j !== kind && (c !== 'air' || UNITS[j].viseAir)).map((j) => {
    const bo = UNITS[j].bonus ?? {};
    const m = bo[kind] ?? (c === 'air' ? bo.air : c === 'machine' ? bo.machine ?? bo.vehicule : c === 'vehicule' ? bo.vehicule : c === 'infanterie' ? bo.infanterie : undefined) ?? 1;
    return { j, m: c === 'air' ? m : m * (bo.sol ?? 1) };
  }).filter((x) => x.m >= 1.5).sort((a, b) => b.m - a.m).slice(0, n).map((x) => UNITS[x.j].nom);
}
/** Tableau des forces et faiblesses de toutes les unités de combat (aide du menu). */
export function unitsTable(): string {
  const rows = COMBAT().map((k) => {
    const r = UNITS[k], bo = Object.entries(r.bonus ?? {});
    const good = bo.filter(([, v]) => v > 1).map(([b, v]) => `${bname(b)} ×${fr(v)}`);
    const bad = bo.filter(([, v]) => v < 1).map(([b, v]) => `${bname(b)} ×${fr(v)}`);
    if (!r.viseAir) bad.push('ne vise pas l\'air');
    const ct = counters(k);
    return `<tr><td>${r.nom}</td><td>${BUILDINGS[r.produitA]?.nom ?? ''} · ${r.ere}</td><td>${r.faction === undefined ? 'toutes' : GAME.factions[r.faction].split(' ').pop()}</td><td class="good">${good.join(', ') || '—'}</td><td class="bad">${bad.join(', ')}${ct.length ? `${bad.length ? ' · ' : ''}contré par ${ct.join(', ')}` : ''}</td></tr>`;
  });
  return `<h4>Unités : forces et faiblesses</h4><div class="utab"><table><tr><th>Unité</th><th>Bâtiment · ère</th><th>Faction</th><th>▲ Fort contre</th><th>▼ Faible</th></tr>${rows.join('')}</table></div>`;
}

export class Hud {
  private mini = $<HTMLCanvasElement>('minimap');
  private ctx = this.mini.getContext('2d')!;
  private bg: HTMLCanvasElement;
  private fpsEl = $('fps');
  private tmp = new THREE.Vector3();
  onQuality: (() => string) | null = null;
  private sim: Sim | null = null;
  private ctrl: Controller | null = null;
  private refresh: (() => void) | null = null;
  private toastTimer = 0;
  private level = '';
  private cams: ({ x: number; z: number; d: number } | null)[] = [null, null];
  private alertAt: { x: number; z: number; t: number } | null = null;
  private v4 = new THREE.Vector3();

  constructor(private map: TerrainMap, private cam: RtsCamera) {
    try {
      const f = new FontFace('Orbitron', `url(${BASE}assets/fonts/Orbitron.ttf)`, { weight: '400 900' });
      f.load().then((ff) => (document.fonts as any).add(ff)).catch(() => {});
    } catch { /* police de secours */ }
    const d = GAME.depart;
    $('r-eau').textContent = String(d.eau); $('r-bois').textContent = String(d.bois);
    $('r-minerai').textContent = String(d.minerai);
    $('r-energie').textContent = String(d.energie);
    $('r-solarite').textContent = String(d.solarite);
    $('r-pop').textContent = `${d.ouvriers + d.eclaireurs * 2}/${GAME.popCentre + 5}`;
    $('r-ere').textContent = `Âge 1 · ${GAME.eres[0].nom}`;
    this.bg = this.paintBackground();
    // Illustrations : chargées par le script (adresse de base, et version en un seul fichier).
    document.querySelectorAll<HTMLImageElement>('img[data-ui]').forEach((img) => {
      img.addEventListener('load', () => img.classList.add('on'), { once: true });
      img.src = UI(img.dataset.ui!);
    });
    ($('fav') as HTMLLinkElement).href = UI('favicon.png');
    ($('touch-icon') as HTMLLinkElement).href = UI('apple-touch-icon.png');
    // Mini-carte : toucher = déplacer la caméra ; appui long (ou clic droit) = envoyer la sélection à cet endroit.
    let pressT = 0, pressXY = [0, 0];
    const world = (e: PointerEvent | MouseEvent) => { const r = orient.rect(this.mini), l = orient.local(e.clientX, e.clientY); return { x: ((l.x - r.left) / r.width * 2 - 1) * map.half, z: ((l.y - r.top) / r.height * 2 - 1) * map.half }; };
    const orderAt = (p: { x: number; z: number }) => { if (this.ctrl && this.ctrl.selection.size) { this.ctrl.orderAt(p.x, p.z); this.toast('Ordre envoyé'); } };
    this.mini.addEventListener('pointerdown', (e) => { pressXY = [e.clientX, e.clientY]; const p = world(e); clearTimeout(pressT); pressT = window.setTimeout(() => orderAt(p), 480); });
    this.mini.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - pressXY[0], e.clientY - pressXY[1]) > 8) clearTimeout(pressT); });
    this.mini.addEventListener('pointerup', () => clearTimeout(pressT));
    this.mini.addEventListener('contextmenu', (e) => { e.preventDefault(); clearTimeout(pressT); orderAt(world(e)); });
    $('btn-mapbig').addEventListener('click', () => $('mapframe').classList.toggle('big'));
    // Vues enregistrées C1 / C2 : appui long = enregistrer, toucher = y aller.
    this.cams[0] = { x: map.starts[0].x, z: map.starts[0].z + 6, d: 52 };
    (['cam1', 'cam2'] as const).forEach((id, i) => {
      const b = $(id); let t = 0, long = false, down = 0;
      b.addEventListener('pointerdown', () => { long = false; down = performance.now(); clearTimeout(t); t = window.setTimeout(() => { long = true; this.camSave(i); }, 550); });
      b.addEventListener('pointerup', () => { clearTimeout(t); if (!long && down && performance.now() - down >= 550) { long = true; this.camSave(i); } down = 0; });
      b.addEventListener('pointerleave', () => { clearTimeout(t); down = 0; });
      b.addEventListener('click', () => { if (!long) this.camGo(i); });
    });
    this.paintCams();
    $('btn-alert').addEventListener('click', () => this.goAlert());
    const go = (e: PointerEvent) => {
      const r = orient.rect(this.mini), l = orient.local(e.clientX, e.clientY);
      cam.focus(((l.x - r.left) / r.width * 2 - 1) * map.half, ((l.y - r.top) / r.height * 2 - 1) * map.half);
    };
    this.mini.addEventListener('pointerdown', (e) => { this.mini.setPointerCapture(e.pointerId); if (e.button !== 2) go(e); e.stopPropagation(); });
    this.mini.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') go(e); });
    $('btn-quality').addEventListener('click', () => { if (this.onQuality) this.setQualityLabel(this.onQuality()); });
    // ☰ : déroule (ou replie) les options ; un toucher ailleurs les replie.
    $('btn-more').addEventListener('click', (e) => { e.stopPropagation(); document.body.classList.toggle('sysopen'); });
    window.addEventListener('pointerdown', (e) => { if (document.body.classList.contains('sysopen') && !(e.target as HTMLElement).closest('#sys')) document.body.classList.remove('sysopen'); }, true);
    $('sysdrop').addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('#btn-menu,#btn-trib,#btn-chat,#btn-rot,#btn-full')) document.body.classList.remove('sysopen'); });
    $('btn-full').addEventListener('click', () => {
      try {
        if (document.fullscreenElement) void document.exitFullscreen();
        else document.documentElement.requestFullscreen?.().then(() => (screen.orientation as any)?.lock?.('landscape').catch(() => {})).catch(() => {});
      } catch { /* refusé par le navigateur */ }
    });
    $('btn-home').addEventListener('click', () => { const st = map.starts[this.ctrl?.player ?? 0] ?? map.starts[0]; cam.focus(st.x, st.z); });
    const hint = $('hint');
    hint.textContent = matchMedia('(pointer: coarse)').matches
      ? 'Touche un ouvrier puis un gisement pour récolter · touche le Centre pour produire des ouvriers · appui long puis glisser : cadre de sélection'
      : 'Clic gauche : sélectionner (glisser = cadre) · clic droit : récolter, construire, envoyer · flèches ou ZQSD : caméra · molette : zoom';
    const hide = () => { hint.classList.add('gone'); };
    window.addEventListener('pointerdown', () => setTimeout(hide, 9000), { once: true });
    setTimeout(hide, 20000);   // disparaît de toute façon au bout de 20 s
  }

  /** Relie le panneau de sélection au contrôleur. */
  bind(ctrl: Controller, sim: Sim) {
    { const st = this.map.starts[ctrl.player] ?? this.map.starts[0]; this.cams[0] = { x: st.x, z: st.z + 6, d: 52 }; }
    this.sim = sim; this.ctrl = ctrl;
    const panel = $('panel');
    const cost = (c: object) => Object.entries(c as Record<string, number>).filter(([, v]) => v).map(([k, v]) => `${v} ${(RES_NOM[k] ?? k).toLowerCase()}`).join(', ');
    const CATS: Record<string, { nom: string; items: string[] }> = {
      eco: { nom: 'Économie', items: ['habitat', 'recycleur', 'stationEau', 'scierie', 'depotMinier', 'quai', 'raffinerie', 'marche', 'labo', 'temple'] },
      armee: { nom: 'Armée', items: ['caserne', 'archerie', 'ecurie', 'atelierSiege', 'arene', 'usine', 'atelier', 'hangar', 'ascenseur'] },
      defense: { nom: 'Défense', items: ['tourelle', 'chateau', 'mur', 'porte', 'tourelleAA', 'bouclier', 'defense'] },
    };
    let cat = 'eco';
    const SHORT: Record<string, string> = { habitat: 'Habitat', stationEau: 'Silo', scierie: 'Scierie', depotMinier: 'Dépôt minier', centrale: 'Centrale', quai: 'Quai orbital', caserne: 'Caserne', tourelle: 'Tourelle', mur: 'Mur', porte: 'Porte', raffinerie: 'Raffinerie', recycleur: 'Ferme', usine: 'Usine', hangar: 'Hangar', arene: 'Salle d\'armes', atelier: 'Atelier méca', archerie: 'Archerie', ecurie: 'Écurie', atelierSiege: 'Atelier de siège', labo: 'Laboratoire', tourelleAA: 'Anti-aérien', bouclier: 'Bouclier', defense: 'Défense orbitale', ascenseur: 'Ascenseur orbital' };
    const short = (c: object) => cost(c).replace(' minerai', ' min.').replace('energie', 'én.').replace('solarite', 'sol.');
    let sig = '', killArm = false, killTimer = 0, folded = false, batch = 1;
    // Le panneau occupe le coin bas gauche sans passer sous les boutons rapides et la mini-carte ;
    // si l'écran est trop étroit, il passe au-dessus d'eux, sur toute la largeur.
    const fit = () => {
      const side = $('side'), room = side.offsetLeft - 16;
      if (room >= 300) { panel.style.maxWidth = Math.min(room, 560) + 'px'; panel.style.bottom = '8px'; panel.style.right = ''; }
      else { panel.style.maxWidth = 'none'; panel.style.right = '8px'; panel.style.bottom = (side.offsetHeight + 16) + 'px'; }
    };
    window.addEventListener('resize', () => setTimeout(fit, 50));
    /** Bouton avec icône, nom et pastilles de coût (grisé si on ne peut pas payer). */
    const ib = (attrs: string, ic: string, name: string, c: object, extra = '') =>
      `<button ${attrs} class="ib${sim.canPay(ctrl.player, c) ? ' no' : ''}">${icon(ic, sim.players[ctrl.player]?.ere)}<span class="tx"><span class="nm">${name}</span>${pills(c)}</span>${extra}</button>`;
    void short;
    const refresh = () => {
      const n = ctrl.selection.size, b = ctrl.building >= 0 ? sim.building(ctrl.building) : undefined;
      panel.classList.toggle('on', n > 0 || !!b);
      $('btn-box').classList.toggle('on', ctrl.boxMode);
      let html = '';
      if (ctrl.placing) {
        const r = BUILDINGS[ctrl.placing.kind];
        html = `<div id="sel-info">${r.nom} <small>· ${ctrl.placing.kind === 'mur' ? 'touche le début puis la fin du mur' : ctrl.placing.kind === 'porte' ? 'touche un de tes murs : la porte s\'y intègre' : 'touche l\'emplacement'}</small></div><div class="row"><button data-act="cancel">Annuler</button></div>`;
      } else if (n) {
        const count: Record<string, number> = {};
        for (const id of ctrl.selection) { const u = sim.get(id); if (u) count[u.kind] = (count[u.kind] ?? 0) + 1; }
        const one = n === 1 ? sim.get([...ctrl.selection][0]) : undefined;
        const vet = one ? (one.vet ? ` <span class="vet">${'★'.repeat(one.vet)}</span>` : '') + (one.kind !== 'ouvrier' ? ` <small>· ${one.xp} élimination${one.xp > 1 ? 's' : ''}</small>` : '') : '';
        const kinds = Object.keys(count);
        html = `<div id="sel-info">${n} unité${n > 1 ? 's' : ''}${vet} <small>· ${Object.entries(count).map(([k, c]) => `${c} ${nomUnit(k, sim.players[ctrl.player]?.ere ?? 4).toLowerCase()}${c > 1 ? 's' : ''}`).join(', ')}</small>${kinds.length === 1 ? ` <button data-sheet="${kinds[0]}" class="info" title="Fiche de l'unité">ⓘ</button>` : ''}</div>`;
        if (count.ouvrier) {
          const ere = sim.players[ctrl.player].ere;
          html += `<div class="row tabs">${Object.entries(CATS).map(([k, c]) => `<button data-cat="${k}" class="${cat === k ? 'on' : ''}">${c.nom}</button>`).join('')}</div>`;
          html += `<div class="row grid">${CATS[cat].items.filter((k) => dispo(BUILDINGS[k], ere)).map((k) => ib(`data-build="${k}" title="${nomBat(k, ere)} : ${cost(sim.buildCost(ctrl.player, k))}"`, 'b_' + k, nomBat(k, ere) !== BUILDINGS[k].nom ? nomBat(k, ere) : SHORT[k] ?? BUILDINGS[k].nom, sim.buildCost(ctrl.player, k))).join('')}</div><small class="hint2">appui long sur un bâtiment : à quoi il sert</small>`;
        }
        if (n > 1 && Object.keys(count).some((k) => k !== 'ouvrier')) html += `<div class="row">${(['libre', 'ligne', 'colonne', 'carre'] as Formation[]).map((f) => `<button data-f="${f}" class="${ctrl.formation === f ? 'on' : ''}">${f === 'carre' ? 'Carré' : f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>`;
        if (Object.keys(count).some((k) => k !== 'ouvrier')) {
          const post = new Set([...ctrl.selection].map((id) => sim.get(id)).filter((u) => u && u.kind !== 'ouvrier').map((u) => u!.posture));
          const one = post.size === 1 ? [...post][0] : '';
          // Une seule bascule de posture : agressive (poursuit l'ennemi) ou défensive (revient à son poste).
          const def = one === 'defensive';
          const acts = [`<button data-post="${def ? 'agressive' : 'defensive'}" class="ib cmd" title="Touche pour passer en ${def ? 'agressive' : 'défensive'}">${icon(def ? 'a_defensive' : 'a_agressive')}<span class="tx"><span class="nm">${def ? 'Défensive' : 'Agressive'}</span><i>${def ? 'garde son poste' : 'poursuit l\'ennemi'}</i></span></button>`,
            `<button data-act="repli" class="ib cmd" title="Ramène la sélection près du Centre">${icon('a_repli')}Repli</button>`];
          if (count.eclaireur) acts.push(`<button data-act="patrol" class="ib cmd" title="L'éclaireur fait le tour de la carte et dissipe le brouillard">${icon('a_transporter')}Patrouiller</button>`);
          html += `<div class="row grid">${acts.join('')}</div>`;
        }
        if (count.navette || count.galion) {
          const aboard = [...ctrl.selection].reduce((a, id) => a + (sim.get(id)?.cargo.length ?? 0), 0);
          html += `<div class="row"><button data-act="unload" class="ib cmd${ctrl.unloadMode ? ' on' : ''}">${icon('a_debarquer')}Débarquer<i>${aboard} à bord</i></button></div>`;
        }
        // Ordres au toucher, rappelés en boutons d'aide : réparer, capturer, transporter.
        const tips: string[] = [];
        if (count.ingenieur) tips.push(`<button data-tip="capturer" class="ib cmd">${icon('a_capturer')}Capturer</button>`);
        if (Object.keys(count).some((k) => !UNITS[k].vole) && sim.units.some((u) => u.owner === ctrl.player && u.kind === 'navette')) tips.push(`<button data-tip="transporter" class="ib cmd">${icon('a_transporter')}Transporter</button>`);
        if (tips.length) html += `<div class="row grid">${tips.join('')}</div>`;
        html += `<div class="row g3"><button data-act="stop" class="ib cmd">${icon('a_stop')}Stop</button><button data-act="desel">Fermer</button><button data-act="kill" class="danger${killArm ? ' arm' : ''}">${killArm ? 'Confirmer ?' : 'Détruire'}</button></div>`;
      } else if (b) {
        html = `<div id="sel-info">${nomBat(b.kind, sim.players[b.owner]?.ere ?? 4)} <small id="b-info"></small> <button data-bsheet="${b.kind}" class="info" title="À quoi sert ce bâtiment">ⓘ</button></div>`;
        const P = sim.players[ctrl.player];
        const techs = (lieu: string) => b.done && !b.task ? Object.entries(RESEARCH).filter(([k, r]) => (r.lieu ?? 'labo') === lieu && !P.research.has(k) && (!r.requiert || P.research.has(r.requiert)) && (r.ere ?? 5) <= P.ere && !sim.buildings.some((x) => x.owner === ctrl.player && x.task?.key === k))
          .map(([k, r]) => ib(`data-research="${k}" title="${r.effet}"`, 't_' + k, r.nom, r.cout)).join('') : '';
        const makes = Object.entries(UNITS).filter(([, r]) => r.produitA === b.kind && dispo(r, P.ere) && (r.faction === undefined || r.faction === P.faction));
        const queued = (k: string) => { const c = b.queue.filter((q) => q.kind === k).length; return (c ? `<em class="cnt">${c}</em>` : '') + (b.queue[0]?.kind === k ? `<span class="prog"><span id="prog-${k}"></span></span>` : ''); };
        if (makes.length && b.done) html += `<div class="row"><button data-act="batch" class="batch${batch > 1 ? ' on' : ''}" title="Produire par 5">×${batch}</button><small class="hint2">appui long sur une unité : sa fiche</small></div>`;
        if (makes.length && b.done) html += `<div class="row grid">${makes.map(([k, r]) => ib(`data-train="${k}" title="${nomUnit(k, P.ere)}"`, 'u_' + k, nomUnit(k, P.ere), r.cout, queued(k))).join('')}${b.kind === 'centre' && P.ere < GAME.eres.length && !b.task ? ib('data-act="age"', P.ere >= 4 ? 'a_ere3' : 'a_ere', GAME.eres[P.ere].nom, (GAME.eres[P.ere] as { cout: object }).cout) : ''}${b.kind === 'centre' ? techs('centre') : ''}</div><div id="b-hint">Touche le sol${b.kind === 'centre' ? ' ou un gisement' : ''} pour fixer le point de ralliement.</div>`;
        else if (b.kind === 'labo' && b.done && !b.task) html += `<div class="row grid">${techs('labo')}</div>`;
        if (b.kind === 'marche' && b.done && b.owner === ctrl.player) {
          // Marché : acheter / vendre 100 unités contre de l'or ; le cours bouge à chaque échange.
          const T = (['eau', 'bois', 'minerai'] as const).map((r) => `<div class="trade"><span>${icon(RI[r])}</span><button data-trade="${r}" data-buy="1" class="cmd">Acheter 100<i>${sim.price(ctrl.player, r, true)} or</i></button><button data-trade="${r}" class="cmd">Vendre 100<i>${sim.price(ctrl.player, r, false)} or</i></button></div>`).join('');
          html += `<div class="row trades">${T}</div>`;
          if (!b.task) { const tt = techs('marche'); if (tt) html += `<div class="row grid">${tt}</div>`; }
        }
        if ((b.kind === 'mur' || b.kind === 'porte') && b.owner === ctrl.player && P.research.has('barriere'))
          html += `<div class="row"><button data-act="ion" class="ib cmd${P.ion ? ' on' : ''}" title="Les appareils ennemis ne peuvent plus franchir tes murs et portes">${icon('t_barriere')}<span class="tx"><span class="nm">Barrière ionique</span><i>${P.ion ? 'activée · ' + sim.ionCost(ctrl.player) + ' én./s' : 'coupée · touche pour l\'activer'}</i></span></button></div>`;
        html += `<div class="row g3"><button data-act="desel">Fermer</button>${b.kind !== 'centre' ? `<button data-act="kill" class="danger${killArm ? ' arm' : ''}">${killArm ? 'Confirmer ?' : 'Détruire'}</button>` : ''}</div>`;
      }
      if (html) html = `<button data-act="fold" class="fold" title="Replier / déplier">${folded ? '▴' : '▾'}</button>` + html;
      panel.classList.toggle('folded', folded);
      if (html !== sig) { sig = html; panel.innerHTML = dev(html); fit(); }
      this.live();
    };
    this.refresh = refresh;
    ctrl.onChange = refresh;
    panel.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('button'); if (!t) return;
      const d = t.dataset;
      if (d.act !== 'kill') killArm = false;
      if (d.f) ctrl.formation = d.f as Formation;
      else if (d.build) { if (sheetPress) { sheetPress = false; return; } ctrl.startPlacing(d.build); }
      else if (d.train && ctrl.building >= 0) {
        if (sheetPress) { sheetPress = false; return; }
        const bb = sim.building(ctrl.building)!, r = UNITS[d.train], P = sim.players[ctrl.player];
        // Par lots : autant que la file (5 places) et les réserves le permettent.
        let n = Math.min(batch, 5 - bb.queue.length);
        if (batch > 1) for (const k of RES) { const c = (r.cout as Record<string, number>)[k]; if (c) n = Math.min(n, Math.floor(P[k] / c)); }
        n = Math.max(1, n);
        for (let i = 0; i < n; i++) sim.issue({ type: 'train', b: ctrl.building, kind: d.train as 'ouvrier' });
        if (batch > 1 && n < batch) this.toast(n + ' en production (file ou réserves limitées)');
      }
      else if (d.act === 'batch') batch = batch === 1 ? 5 : 1;
      else if (d.sheet) this.sheet(d.sheet);
      else if (d.bsheet) this.bsheet(d.bsheet);
      else if (d.trade && ctrl.building >= 0) sim.issue({ type: 'trade', b: ctrl.building, res: d.trade as 'eau', buy: !!d.buy });
      else if (d.cat) cat = d.cat;
      else if (d.research && ctrl.building >= 0) sim.issue({ type: 'research', b: ctrl.building, key: d.research });
      else if (d.act === 'age' && ctrl.building >= 0) sim.issue({ type: 'age', b: ctrl.building });
      else if (d.post) sim.issue({ type: 'posture', ids: ctrl.military(), posture: d.post as Posture });
      else if (d.act === 'attack') ctrl.attackMode = !ctrl.attackMode;
      else if (d.act === 'patrol') { const ids = [...ctrl.selection].filter((id) => sim.get(id)?.kind === 'eclaireur'); sim.issue({ type: 'patrol', ids }); this.toast('Patrouille : l\'éclaireur fait le tour de la carte'); }
      else if (d.act === 'repli') {
        const c = sim.buildings.find((x) => x.owner === ctrl.player && x.kind === 'centre');
        if (c) { const l = Math.hypot(c.x, c.z) || 1; sim.issue({ type: 'move', ids: ctrl.military(), x: c.x - c.x / l * 11, z: c.z - c.z / l * 11, formation: 'libre' }); this.toast('Repli vers la base'); }
      }
      else if (d.act === 'kill') {
        // Deux appuis pour éviter les accidents : le premier arme le bouton pendant 2,5 s.
        if (!killArm) { killArm = true; clearTimeout(killTimer); killTimer = window.setTimeout(() => { killArm = false; refresh(); }, 2500); }
        else { killArm = false; sim.issue({ type: 'kill', owner: ctrl.player, ids: [...ctrl.selection], b: ctrl.building }); ctrl.select([]); }
      }
      else if (d.act === 'unload') { ctrl.unloadMode = !ctrl.unloadMode; if (ctrl.unloadMode) this.toast('Touche l\'endroit où débarquer'); }
      else if (d.act === 'ion') { sim.issue({ type: 'ion', owner: ctrl.player, on: !sim.players[ctrl.player].ion }); setTimeout(refresh, 250); }
      else if (d.act === 'fold') folded = !folded;
      else if (d.tip) this.toast({ reparer: 'Touche un de tes bâtiments abîmé pour le réparer', capturer: 'Touche un bâtiment ennemi sous 30 % de vie pour le capturer (ingénieurs)', transporter: 'Touche un point sur une autre île : une navette vient chercher la sélection' }[d.tip] ?? '');
      else if (d.act === 'stop') ctrl.stop();
      else if (d.act === 'desel') ctrl.select([]);
      else if (d.act === 'cancel') ctrl.cancelPlacing();
      refresh();
    });
    // Fiche d'unité : appui long (tactile) ou clic droit sur un bouton de production.
    let sheetPress = false, sheetT = 0, sheetDown = 0, sheetBtn: HTMLElement | null = null;
    const openSheet = () => { if (sheetPress || !sheetBtn) return; sheetPress = true; if (sheetBtn.dataset.build) this.bsheet(sheetBtn.dataset.build); else this.sheet(sheetBtn.dataset.train!); try { navigator.vibrate?.(15); } catch { /* sans vibration */ } };
    panel.addEventListener('pointerdown', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('button[data-train],button[data-build]'); if (!t) return;
      sheetPress = false; clearTimeout(sheetT); sheetBtn = t; sheetDown = performance.now();
      sheetT = window.setTimeout(openSheet, 480);
    });
    // Le minuteur peut être retardé si l'appareil est chargé : la durée réelle de l'appui fait foi au relâchement.
    panel.addEventListener('pointerup', () => { clearTimeout(sheetT); if (sheetBtn && performance.now() - sheetDown >= 480) openSheet(); sheetBtn = null; });
    const unpress = () => { clearTimeout(sheetT); sheetBtn = null; };
    panel.addEventListener('pointercancel', unpress);
    panel.addEventListener('contextmenu', (e) => { const t = (e.target as HTMLElement).closest<HTMLElement>('button[data-train],button[data-build]'); if (t) { e.preventDefault(); clearTimeout(sheetT); if (t.dataset.build) this.bsheet(t.dataset.build); else this.sheet(t.dataset.train!); } });
    $('sheet').addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-close]') || e.target === $('sheet')) $('sheet').hidden = true; });
    // Groupes de contrôle 1 à 5.
    const gb = $('groups');
    gb.innerHTML = [1, 2, 3, 4, 5].map((i) => `<button data-g="${i - 1}">${i}<i></i></button>`).join('');
    gb.querySelectorAll<HTMLButtonElement>('button').forEach((bt) => {
      const i = +bt.dataset.g!; let t = 0, long = false, down = 0;
      bt.addEventListener('pointerdown', () => { long = false; down = performance.now(); clearTimeout(t); t = window.setTimeout(() => { long = true; this.groupSet(i); }, 550); });
      bt.addEventListener('pointerup', () => { clearTimeout(t); if (!long && down && performance.now() - down >= 550) { long = true; this.groupSet(i); } down = 0; });
      bt.addEventListener('pointerleave', () => { clearTimeout(t); down = 0; });
      bt.addEventListener('contextmenu', (e) => { e.preventDefault(); clearTimeout(t); long = true; this.groupSet(i); });
      bt.addEventListener('click', () => { if (!long) this.groupGo(i); });
    });
    window.addEventListener('keydown', (e) => {
      const m = /^Digit([1-5])$/.exec(e.code) ?? /^Numpad([1-5])$/.exec(e.code);
      if (!m || !document.body.classList.contains('playing') || (e.target as HTMLElement).tagName === 'INPUT') return;
      const i = +m[1] - 1;
      if (e.shiftKey || e.ctrlKey || e.metaKey) { e.preventDefault(); this.groupSet(i); } else this.groupGo(i);
    });
    $('btn-box').addEventListener('click', () => { ctrl.boxMode = !ctrl.boxMode; refresh(); });
    $('btn-army').addEventListener('click', () => ctrl.selectAll(Object.keys(UNITS).filter((k) => UNITS[k].degats > 0 && k !== 'ouvrier' && k !== 'ingenieur') as UnitKind[]));
    $('btn-idle').addEventListener('click', () => { const idle = sim.idleWorkers(ctrl.player); if (idle.length) { ctrl.select(idle.map((u) => u.id)); this.cam.focus(idle[0].x, idle[0].z); } });
    refresh();
  }

  /** Valeurs qui bougent en continu : ressources, population, file de production. */
  private live() {
    const sim = this.sim, ctrl = this.ctrl;
    if (!sim || !ctrl) return;
    const P = sim.players[ctrl.player];
    $('r-eau').textContent = String(Math.floor(P.eau)); $('r-bois').textContent = String(Math.floor(P.bois)); $('r-minerai').textContent = String(Math.floor(P.minerai));
    $('r-energie').textContent = String(Math.floor(P.energie)); $('r-solarite').textContent = String(Math.floor(P.solarite));
    $('r-pop').textContent = `${P.pop}/${P.popCap}`;
    if (this.qLabel) { const want = '✦  Qualité : ' + this.qLabel; if ($('btn-quality').textContent !== want) $('btn-quality').textContent = want; }
    $('chip-sol').classList.toggle('sol-off', P.ere < 5 && P.solarite <= 0);
    { const t = `Âge ${P.ere} · ${GAME.eres[P.ere - 1].nom}`; if ($('sysage').textContent !== t) $('sysage').textContent = t; }
    $('r-ere').textContent = document.body.classList.contains('compact') ? GAME.eres[P.ere - 1].nom : `Âge ${P.ere} · ${GAME.eres[P.ere - 1].nom}${this.level ? (this.level.startsWith('#') ? ' · ' + this.level.slice(1) : ' · IA ' + this.level) : ''}`;
    $('r-pop').parentElement!.classList.toggle('warn', P.pop >= P.popCap);
    const idle = sim.idleWorkers(ctrl.player).length;
    this.paintGroups();
    $('btn-idle').textContent = 'Inactifs ' + idle; $('btn-idle').classList.toggle('on', idle > 0);
    const info = document.getElementById('b-info'), b = ctrl.building >= 0 ? sim.building(ctrl.building) : undefined;
    const q0 = b?.queue[0], bar = q0 ? document.getElementById('prog-' + q0.kind) : null;
    if (bar && q0) bar.style.width = Math.round((1 - q0.left / q0.total) * 100) + '%';
    if (info && b) {
      const q = b.queue[0];
      const tk = b.task;
      info.textContent = tk ? `· ${tk.kind === 'age' ? 'passage à l\'ère 2' : RESEARCH[tk.key].nom} ${Math.round((1 - tk.left / tk.total) * 100)} %` : b.kind === 'bouclier' && b.done ? `· bouclier ${Math.round(b.shield)}` : !b.done ? `· chantier ${Math.round(b.progress * 100)} %` : q ? `· ${UNITS[q.kind].nom} ${Math.round((1 - q.left / q.total) * 100)} %${b.queue.length > 1 ? ' (+' + (b.queue.length - 1) + ')' : ''}${b.waiting ? ' · en attente de place' : ''}` : `· ${Math.round(b.hp)} PV`;
    }
  }

  /** Écran de fin de partie. */
  end(won: boolean, lines: [string, string][], onNew: () => void) {
    const e = $('end');
    e.innerHTML = `<img class="banner" src="${UI(won ? 'victoire.jpg' : 'defaite.jpg')}" alt="${won ? 'VICTOIRE' : 'DÉFAITE'}"/><table>${lines.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table><button id="btn-new">Nouvelle partie</button>`;
    e.classList.add('show');
    $('btn-new').addEventListener('click', onNew);
  }

  toast(text: string) {
    const t = $('toast'); t.textContent = dev(text); t.classList.add('show');
    clearTimeout(this.toastTimer); this.toastTimer = window.setTimeout(() => t.classList.remove('show'), 2600);
  }

  setSeed(_seed: number, _onNew: () => void) { /* la carte se choisit sur l'écran d'accueil */ }
  private qLabel = '';
  setQualityLabel(q: string) {
    this.qLabel = q; $('btn-quality').textContent = '✦  Qualité : ' + q; }
  setLoading(f: number) { $('bar').style.width = Math.round(f * 100) + '%'; }
  hideLoading() { $('loading').classList.add('gone'); }
  /** Écran d'accueil : adversaire, taille de carte, terrain, puis « Jouer ». */
  menu(o: { level: string; size: string; kind: string; seed: number; players: string; mode: string; resume: string | null; replay: string | null; opts: Record<string, string> }, cb: { play: (level: string, mode: string, opts: Record<string, string>, map: MapChoice) => void; resume: () => void; replay: () => void; scenario: (id: string, opts: Record<string, string>) => void; rot: () => void; sound: () => string }) {
    $('track').style.display = 'none'; $('load-sub').style.display = 'none';
    $('loading').classList.add('live');
    $('menu').classList.add('show');
    let level = o.level, mode = o.mode;
    const modes = [...document.querySelectorAll<HTMLButtonElement>('#seg-mode button')];
    const paintMode = () => modes.forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    modes.forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode!; paintMode(); }));
    paintMode();
    // Options à choix (doctrine, brouillard, durée…) : une rangée « seg » par option.
    const opts = { ...o.opts };
    document.querySelectorAll<HTMLElement>('#menu [data-opt]').forEach((seg) => {
      const key = seg.dataset.opt!, bs = [...seg.querySelectorAll<HTMLButtonElement>('button')];
      const pt = () => bs.forEach((b) => b.classList.toggle('on', b.dataset.v === opts[key]));
      bs.forEach((b) => b.addEventListener('click', () => { opts[key] = b.dataset.v!; pt(); }));
      pt();
    });
    if (o.resume) { const r = $('btn-resume'); r.hidden = false; r.textContent = o.resume; r.addEventListener('click', cb.resume); }
    if (o.replay) { const r = $('btn-replay'); r.hidden = false; r.textContent = o.replay; r.addEventListener('click', cb.replay); }
    document.querySelectorAll<HTMLButtonElement>('#seg-scen button').forEach((b) => b.addEventListener('click', () => cb.scenario(b.dataset.scen!, opts)));
    const levels = [...document.querySelectorAll<HTMLButtonElement>('#seg-level button')];
    const paintLevel = () => levels.forEach((b) => b.classList.toggle('on', b.dataset.level === level));
    levels.forEach((b) => b.addEventListener('click', () => { level = b.dataset.level!; paintLevel(); }));
    paintLevel();

    // Onglets (sur téléphone).
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('.mtabs button')], pages = [...document.querySelectorAll<HTMLElement>('.mpage')];
    const openTab = (t: string) => { tabs.forEach((b) => b.classList.toggle('on', b.dataset.mtab === t)); pages.forEach((p) => p.classList.toggle('on', p.dataset.page === t)); };
    tabs.forEach((b) => b.addEventListener('click', () => openTab(b.dataset.mtab!)));
    openTab('partie');

    // --- Carte : choisir joueurs, taille, terrain ou une nouvelle graine ne fait qu'actualiser l'aperçu ;
    // la carte n'est vraiment construite qu'au moment de « Jouer ».
    const sel: MapChoice = { seed: o.seed, size: o.size, kind: o.kind, players: o.players };
    const SIZE_N: Record<string, string> = { petite: 'Petite', moyenne: 'Moyenne', grande: 'Grande' };
    $('seg-kind').innerHTML = MAP_KINDS.map((k) => `<button data-kind="${k.key}" title="${k.desc}">${k.nom}</button>`).join('');
    const kinds = [...document.querySelectorAll<HTMLButtonElement>('#seg-kind button')], sizes = [...document.querySelectorAll<HTMLButtonElement>('#seg-size button')], plays = [...document.querySelectorAll<HTMLButtonElement>('#seg-players button')];
    const cv = $<HTMLCanvasElement>('menu-map'), g = cv.getContext('2d')!;
    const col = ['#ff8a3d', '#46d6ff', '#7be866', '#c98bff'];
    const draw = (map: TerrainMap, bg: HTMLCanvasElement, res: { kind: string; x: number; z: number }[]) => {
      g.drawImage(bg, 0, 0, cv.width, cv.height);
      const P = (x: number, z: number) => [(x / map.half * 0.5 + 0.5) * cv.width, (z / map.half * 0.5 + 0.5) * cv.height];
      for (const r of res) { const [x, y] = P(r.x, r.z); g.fillStyle = r.kind === 'solarite' ? '#ffb02e' : r.kind === 'glace' ? '#e0505a' : r.kind === 'arbre' ? '#2f6b2a' : r.kind === 'or' ? '#ffd84a' : '#a8a8a8'; g.fillRect(x - 1, y - 1, 2, 2); }
      map.starts.forEach((st, i) => { const [x, y] = P(st.x, st.z); g.fillStyle = col[i % 4]; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); g.stroke(); });
    };
    let pending = 0;
    const refresh = (regen: boolean) => {
      const four = sel.players !== 'duel';
      if (four && sel.size === 'petite') sel.size = 'moyenne';                      // à 4, la petite carte est trop serrée
      plays.forEach((b) => b.classList.toggle('on', b.dataset.players === sel.players));
      sizes.forEach((b) => { b.classList.toggle('on', b.dataset.size === sel.size); b.classList.toggle('off', four && b.dataset.size === 'petite'); });
      kinds.forEach((b) => b.classList.toggle('on', b.dataset.kind === sel.kind));
      const K = MAP_KINDS.find((k) => k.key === sel.kind);
      $('map-name').textContent = K?.nom ?? sel.kind;
      $('map-desc').textContent = K?.desc ?? '';
      $('map-meta').textContent = `${SIZE_N[sel.size] ?? sel.size} · ${four ? 4 : 2} bases · carte n° ${sel.seed}`;
      if (!regen) return;
      const key = `${sel.seed}|${sel.size}|${sel.kind}|${four ? 4 : 2}`, hit = cache.get(key);
      const ticket = ++pending;
      if (hit) { cv.classList.remove('busy'); draw(hit.map, hit.bg, hit.res); return; }
      cv.classList.add('busy');
      // On laisse le clic s'afficher (double image) avant de générer, et seul le dernier choix est calculé.
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
        if (ticket !== pending) return;
        const gm = generateMap(sel.seed, SIZES[sel.size as MapSize], sel.kind as MapKind, four ? 4 : 2);
        const e = { map: gm.terrain, bg: this.paintBackground(gm.terrain), res: gm.objects.resources };
        cache.set(key, e);
        if (ticket === pending) { draw(e.map, e.bg, e.res); cv.classList.remove('busy'); }
      }, 0)));
    };
    // Aperçu initial : la carte déjà chargée (gardée en cache pour y revenir sans recalcul).
    const cache = new Map<string, { map: TerrainMap; bg: HTMLCanvasElement; res: { kind: string; x: number; z: number }[] }>();
    const res0 = this.sim ? this.sim.nodes : [];
    cache.set(`${sel.seed}|${sel.size}|${sel.kind}|${sel.players !== 'duel' ? 4 : 2}`, { map: this.map, bg: this.bg, res: res0 });
    draw(this.map, this.bg, res0);
    refresh(false);
    plays.forEach((b) => b.addEventListener('click', () => { if (b.dataset.players !== sel.players) { sel.players = b.dataset.players!; refresh(true); } }));
    sizes.forEach((b) => b.addEventListener('click', () => { if (b.dataset.size !== sel.size) { sel.size = b.dataset.size!; refresh(true); } }));
    kinds.forEach((b) => b.addEventListener('click', () => { if (b.dataset.kind !== sel.kind) { sel.kind = b.dataset.kind!; refresh(true); } }));
    $('menu-seed').addEventListener('click', () => { sel.seed = 1 + Math.floor(Math.random() * 999999); refresh(true); });

    $('btn-how').addEventListener('click', () => { const h = $('how'); h.hidden = !h.hidden; if (!h.hidden && !$('units-table').innerHTML) $('units-table').innerHTML = unitsTable(); });
    $('menu-rot').addEventListener('click', cb.rot);
    $('menu-sound').addEventListener('click', () => { $('menu-sound').textContent = cb.sound(); });
    $('btn-play').addEventListener('click', () => { cb.play(level, mode, opts, { ...sel }); });
    // Résumé de la partie, mis à jour à chaque choix.
    const NAMES: Record<string, string> = { duel: '1 contre 1', ffa: '4 joueurs, chacun pour soi', equipes: '2 contre 2', facile: 'IA facile', normal: 'IA normale', difficile: 'IA difficile', industrielle: 'Industrielle', aeronavale: 'Aéronavale', frappe: 'Frappe' };
    const sum = () => {
      const K = MAP_KINDS.find((k) => k.key === sel.kind);
      const bits = [opts.epoque === 'moderne' ? 'départ à l\'âge moderne' : opts.epoque === 'moyen' ? 'départ au Moyen Âge' : 'de l\'Antiquité à l\'âge galactique', NAMES[sel.players], NAMES[level], mode === 'spectateur' ? 'spectateur' : GAME.factions[+opts.faction || 0] + ' · doctrine ' + NAMES[opts.doctrine], `${K?.nom ?? ''} (${(SIZE_N[sel.size] ?? '').toLowerCase()})`,
        opts.brouillard === 'non' ? 'sans brouillard' : 'brouillard', opts.duree === 'blitz' ? 'Blitz 10 min' : '', opts.centre === 'dispute' ? 'centre disputé' : '', opts.evenements === 'tempetes' ? 'tempêtes' : '', opts.ressources === 'riches' ? 'départ riche' : opts.ressources === 'bacasable' ? 'BAC À SABLE' : ''].filter(Boolean);
      $('msum').innerHTML = bits.map((b) => `<b>${b}</b>`).join(' · ');
    };
    $('menu').addEventListener('click', () => setTimeout(sum, 0));
    sum();
  }

  setLevel(level: string) { this.level = level; }

  /** Âge pour lequel la mini-carte a été peinte (prairies et mer aux âges anciens, désert et vide à l'âge galactique). */
  private bgAge = 1;
  private resLayer: HTMLCanvasElement | null = null;
  private resT = 0;
  private paintBackground(map: TerrainMap = this.map, ere = 1): HTMLCanvasElement {
    const { half, ext, n, heights, levels } = map;
    const S = half * 2;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d')!;
    const img = g.createImageData(S, S);
    // Même progression que le terrain 3D : vert jusqu'à l'âge moderne, puis sec, puis désert ; la mer devient le vide.
    const la = lookAge(ere), k = la >= 5 ? 1 : la >= 3 ? 0.35 + (la - 3) * 0.2 : 0, green = 1 - Math.min(1, k / 0.75);
    const OLD = [[70, 112, 50], [92, 134, 62], [120, 154, 80], [176, 160, 112], [42, 108, 150]], NEW = [[150, 86, 52], [186, 112, 68], [222, 150, 98], [240, 205, 150], [8, 6, 16]];
    const pal = NEW.map((c, i) => i === 4 ? (la >= 5 ? c : OLD[4]) : c.map((v, j) => v + (OLD[i][j] - v) * green));
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const k = (j + ext - half) * n + (i + ext - half);
      const lv = levels[k] === 4 ? 4 : map.rampMask[k] ? 3 : Math.min(levels[k], 2);
      const sh = lv === 4 ? 1 : 1 + Math.max(-2, Math.min(2, heights[k] - heights[k + 1 + n])) * 0.22; // ombrage du relief
      const p = pal[lv], o = (j * S + i) * 4;
      img.data[o] = p[0] * sh; img.data[o + 1] = p[1] * sh; img.data[o + 2] = p[2] * sh; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** Brouillard (null : désactivé) : 0 jamais vu, 1 exploré, 2 visible. */
  fogAt: ((x: number, z: number) => number) | null = null;
  private fogCv: HTMLCanvasElement | null = null;
  /** Mode Blitz : compte à rebours et scores en haut de l'écran. */
  blitz(left: number, a: number, b: number) {
    const el = $('blitz'); el.hidden = false;
    const t = Math.ceil(left), txt = `⏱ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} · ${a} – ${b}`;
    if (el.textContent !== txt) { el.textContent = txt; el.classList.toggle('hot', t <= 60); }
  }
  private fogLayer(): HTMLCanvasElement {
    const N = 72, c = this.fogCv ?? (this.fogCv = Object.assign(document.createElement('canvas'), { width: N, height: N }));
    const g = c.getContext('2d')!, img = g.createImageData(N, N), half = this.map.half;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = this.fogAt!(((i + 0.5) / N * 2 - 1) * half, ((j + 0.5) / N * 2 - 1) * half), o = (j * N + i) * 4;
      img.data[o] = 6; img.data[o + 1] = 4; img.data[o + 2] = 3; img.data[o + 3] = v === 2 ? 0 : v === 1 ? 110 : 225;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  update(fps: number) {
    this.fpsEl.textContent = fps.toFixed(0) + ' i/s';
    this.refresh?.();
    const { ctx, mini, map, cam } = this;
    const W = mini.width, H = mini.height, half = map.half;
    const myAge = this.sim && this.ctrl ? this.sim.players[this.ctrl.player]?.ere ?? 1 : 1;
    if (myAge !== this.bgAge) { this.bgAge = myAge; this.bg = this.paintBackground(this.map, myAge); }
    ctx.drawImage(this.bg, 0, 0, W, H);
    const px = (x: number) => (x / half * 0.5 + 0.5) * W, pz = (z: number) => (z / half * 0.5 + 0.5) * H;
    const colors = ['#ff8a3d', '#46d6ff', '#7be866', '#c98bff', '#bdb6aa'];
    const ci = (o: number) => this.sim!.players[o]?.neutral ? 4 : o % 4;
    const fogAt = this.fogAt;
    // Gisements en couleur (or, pierre, baies, poisson, solarite ; forêts discrètes) : on les repère d'un coup d'œil.
    if (this.sim) {
      if (!this.resLayer || performance.now() - this.resT > 1500) {
        this.resT = performance.now();
        const c = this.resLayer ?? document.createElement('canvas'); c.width = W; c.height = H; this.resLayer = c;
        const g = c.getContext('2d')!; g.clearRect(0, 0, W, H);
        const COL: Record<string, string> = { or: '#ffd23a', minerai: '#e4ddd2', glace: '#ff4d6d', poisson: '#7fe8ff', solarite: '#ff9a2e', arbre: 'rgba(20,70,25,.55)' };
        for (const n of this.sim.nodes) {
          if (n.amount <= 0 || n.b >= 0) continue;
          const col = COL[n.kind] ?? (myAge >= 6 && n.kind === 'glace' ? '#9fe8ff' : ''); if (!col) continue;
          const w = n.kind === 'arbre' ? 2 : 4.2;
          g.fillStyle = col; g.fillRect(px(n.x) - w / 2, pz(n.z) - w / 2, w, w);
          if (n.kind !== 'arbre') { g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 0.8; g.strokeRect(px(n.x) - w / 2, pz(n.z) - w / 2, w, w); }
        }
      }
      ctx.drawImage(this.resLayer, 0, 0);
    }
    if (fogAt) { ctx.imageSmoothingEnabled = true; ctx.drawImage(this.fogLayer(), 0, 0, W, H); }
    if (this.sim) for (const u of this.sim.units) { if (fogAt && this.sim.foe(u.owner, this.ctrl?.player ?? 0) && fogAt(u.x, u.z) < 2) continue; ctx.fillStyle = colors[ci(u.owner)]; ctx.fillRect(px(u.x) - 1.5, pz(u.z) - 1.5, 3, 3); }
    if (this.sim) for (const b of this.sim.buildings) { if (fogAt && this.sim.foe(b.owner, this.ctrl?.player ?? 0) && fogAt(b.x, b.z) === 0) continue; ctx.fillStyle = colors[ci(b.owner)]; const w = Math.max(2, b.r * 1.4); ctx.fillRect(px(b.x) - w / 2, pz(b.z) - w / 2, w, w); }
    // Centre disputé : relais (losanges) et capsules (points blancs).
    if (this.sim) {
      for (const r of this.sim.relays) { ctx.fillStyle = r.owner >= 0 ? colors[ci(r.owner)] : '#e8e0d0'; ctx.save(); ctx.translate(px(r.x), pz(r.z)); ctx.rotate(Math.PI / 4); ctx.fillRect(-4, -4, 8, 8); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(-4, -4, 8, 8); ctx.restore(); }
      ctx.fillStyle = '#fff'; for (const c of this.sim.capsules) { ctx.beginPath(); ctx.arc(px(c.x), pz(c.z), 3, 0, Math.PI * 2); ctx.fill(); }
    }
    // Zone vue par la caméra.
    const vw = orient.width(), vh = orient.height();
    const corners = [[0, 0], [vw, 0], [vw, vh], [0, vh]];
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath();
    corners.forEach(([cx, cy], i) => { const p = cam.groundLocal(cx, cy, this.tmp); if (i) ctx.lineTo(px(p.x), pz(p.z)); else ctx.moveTo(px(p.x), pz(p.z)); });
    ctx.closePath(); ctx.stroke();
    // Alerte : onde rouge sur la mini-carte pendant 8 s.
    const a = this.alertAt;
    if (a && performance.now() - a.t < 8000) {
      const k = ((performance.now() - a.t) / 900) % 1;
      ctx.strokeStyle = `rgba(255,70,50,${1 - k})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(px(a.x), pz(a.z), 5 + k * 22, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // ------------------------------------------------------------ groupes de contrôle
  private groups: number[][] = [[], [], [], [], []];
  /** Le joueur a ouvert au moins une fiche d'unité (tutoriel). */
  sheetSeen = false;
  groupSize(i: number) { return this.groups[i].filter((id) => !!this.sim?.get(id)).length; }
  private groupTap = { i: -1, t: 0 };
  groupSet(i: number) {
    const c = this.ctrl; if (!c) return;
    this.groups[i] = [...c.selection];
    this.toast(this.groups[i].length ? `Groupe ${i + 1} : ${this.groups[i].length} unité${this.groups[i].length > 1 ? 's' : ''}` : `Groupe ${i + 1} vidé`);
    this.paintGroups();
  }
  groupGo(i: number) {
    const c = this.ctrl, sim = this.sim; if (!c || !sim) return;
    const ids = this.groups[i] = this.groups[i].filter((id) => sim.get(id)?.owner === c.player);
    if (!ids.length) { this.toast(`Groupe ${i + 1} vide : sélectionne des unités puis appui long sur ${i + 1}`); return; }
    const now = performance.now(), again = this.groupTap.i === i && now - this.groupTap.t < 450;
    this.groupTap = { i, t: now };
    c.select(ids);
    if (again) { const us = ids.map((id) => sim.get(id)!); this.cam.focus(us.reduce((a, u) => a + u.x, 0) / us.length, us.reduce((a, u) => a + u.z, 0) / us.length); }
    this.paintGroups();
  }
  private paintGroups() {
    const c = this.ctrl, sim = this.sim; if (!c || !sim) return;
    $('groups').querySelectorAll<HTMLButtonElement>('button').forEach((b, i) => {
      const n = this.groups[i].filter((id) => !!sim.get(id)).length, on = n > 0 && this.groups[i].every((id) => !sim.get(id) || c.selection.has(id)) && c.selection.size === n;
      b.classList.toggle('set', n > 0); b.classList.toggle('on', on);
      const t = n ? String(n) : ''; const el = b.querySelector('i')!; if (el.textContent !== t) el.textContent = t;
    });
  }

  // ------------------------------------------------------------ fiche d'unité
  /** Fiche d'un bâtiment : à quoi il sert, ce qu'il produit, son coût. */
  bsheet(kind: string) {
    const r = BUILDINGS[kind], sim = this.sim; if (!r) return;
    const ere = sim && this.ctrl ? sim.players[this.ctrl.player]?.ere ?? 1 : 1;
    const makes = Object.entries(UNITS).filter(([, u]) => u.produitA === kind && dispo(u, ere)).map(([k]) => nomUnit(k, ere));
    const techs = Object.entries(RESEARCH).filter(([, t]) => (t.lieu ?? 'labo') === kind).map(([, t]) => t.nom + ' (âge ' + t.ere + ')');
    const dep = DEPOT[kind]?.map((k) => (RES_NOM[k] ?? k).toLowerCase());
    const rows: [string, string][] = [
      ['Rôle', r.role],
      ...(makes.length ? [['Produit', makes.join(', ')]] as [string, string][] : []),
      ...(techs.length ? [['Recherches', techs.join(', ')]] as [string, string][] : []),
      ...(dep?.length ? [['Dépôt', dep.join(', ')]] as [string, string][] : []),
      ['Disponible', 'dès l\'âge ' + r.ere + (r.ereMax ? ' jusqu\'à l\'âge ' + r.ereMax : '')],
      ['Points de vie', String(r.pv)], ['Construction', r.construction + ' s'],
      ['Coût', Object.entries(sim ? sim.buildCost(this.ctrl!.player, kind) : r.cout).filter(([, v]) => v).map(([k, v]) => `${v} ${(RES_NOM[k] ?? k).toLowerCase()}`).join(', ') || 'gratuit'],
    ];
    const el = $('sheet');
    el.innerHTML = `<div class="sh-top">${icon('b_' + kind, ere)}<div><h3>${nomBat(kind, ere)}</h3><div class="sh-tag">Bâtiment</div></div></div>
      <table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>
      <div class="row"><button data-close>Fermer</button></div>`;
    el.hidden = false;
  }
  sheet(kind: string) {
    const r = UNITS[kind], sim = this.sim; if (!r) return;
    const nm = bname;
    const bo = Object.entries(r.bonus ?? {});
    const good = bo.filter(([, v]) => v > 1).map(([k, v]) => `×${fr(v)} contre ${nm(k)}`);
    const bad = bo.filter(([, v]) => v < 1).map(([k, v]) => `×${fr(v)} contre ${nm(k)}`);
    if (!r.viseAir && r.degats > 0) bad.push('ne peut pas viser les appareils volants');
    if (r.vole) good.push('vole : franchit le relief et les murs');
    const ct = counters(kind); if (ct.length) bad.push('contré par ' + ct.join(', '));
    const dps = r.degats > 0 ? r.degats / r.cadence : 0;
    const rows: [string, string][] = [
      ['Points de vie', String(r.pv)],
      ...(r.degats > 0 ? [['Dégâts', `${r.degats} toutes les ${fr(r.cadence)} s (${fr(dps)}/s)`], ['Portée', r.portee <= 1.5 ? 'corps à corps' : fr(r.portee) + ' m']] as [string, string][] : []),
      ['Vitesse', fr(r.vitesse)], ['Population', String(r.pop)], ['Production', `${r.temps} s · ${nomBat(r.produitA, r.ere)} · âge ${r.ere}`],
      ['Coût', Object.entries(r.cout).filter(([, v]) => v).map(([k, v]) => `${v} ${(RES_NOM[k] ?? k).toLowerCase()}`).join(', ')],
    ];
    const tag = r.faction === undefined ? 'Commune à toutes les factions' : 'Propre à : ' + GAME.factions[r.faction];
    const mine = sim && this.ctrl ? sim.units.filter((u) => u.owner === this.ctrl!.player && u.kind === kind).length : 0;
    const el = $('sheet');
    el.innerHTML = `<div class="sh-top">${icon('u_' + kind)}<div><h3>${r.nom}</h3><div class="sh-tag">${tag}${mine ? ` · ${mine} en jeu` : ''}</div></div></div>
      <table>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>
      ${good.length ? `<div class="good">▲ ${good.join(' · ')}</div>` : ''}${bad.length ? `<div class="bad">▼ ${bad.join(' · ')}</div>` : ''}
      <div class="row"><button data-close>Fermer</button></div>`;
    el.hidden = false; this.sheetSeen = true;
  }

  // ------------------------------------------------------------ vues enregistrées et alertes
  camSave(i: number) { this.cams[i] = { x: this.cam.target.x, z: this.cam.target.z, d: this.cam.dist }; this.paintCams(); this.toast(`Vue ${i + 1} enregistrée`); }
  camGo(i: number) { const c = this.cams[i]; if (!c) return this.camSave(i); this.cam.focus(c.x, c.z); this.cam.dist = c.d; }
  private paintCams() { (['cam1', 'cam2'] as const).forEach((id, i) => $(id).classList.toggle('set', !!this.cams[i])); }
  alert(x: number, z: number) { this.alertAt = { x, z, t: performance.now() }; $('btn-alert').classList.add('show'); }
  goAlert() { const a = this.alertAt; if (!a) return; this.cam.focus(a.x, a.z); this.alertAt = null; $('btn-alert').classList.remove('show'); $('alert-arrow').style.display = 'none'; }
  /** À chaque image : flèche au bord de l'écran vers une attaque hors champ. */
  frame() {
    const a = this.alertAt, arrow = $('alert-arrow');
    if (!a || performance.now() - a.t > 8000) { if (a) { this.alertAt = null; $('btn-alert').classList.remove('show'); } arrow.style.display = 'none'; return; }
    const p = this.v4.set(a.x, this.map.heightAt(a.x, a.z), a.z).project(this.cam.camera);
    const behind = p.z > 1;
    let nx = behind ? -p.x : p.x, ny = behind ? -p.y : p.y;
    if (!behind && Math.abs(nx) < 0.95 && Math.abs(ny) < 0.95) { arrow.style.display = 'none'; return; }
    const W = orient.width(), H = orient.height(), m = Math.max(Math.abs(nx), Math.abs(ny)) || 1;
    nx /= m; ny /= m;
    const x = (nx * 0.5 + 0.5) * (W - 70) + 35, y = (-ny * 0.5 + 0.5) * (H - 150) + 70;   // sous la barre du haut
    arrow.style.display = 'block';
    arrow.style.left = (x - 13) + 'px'; arrow.style.top = (y - 13) + 'px';
    arrow.style.transform = `rotate(${Math.atan2(nx, ny)}rad)`;
  }
}
