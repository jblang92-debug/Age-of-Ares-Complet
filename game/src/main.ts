// Point d'entrée. Jalon 2 « Unités libres » : simulation à ticks, sélection, ordres, formations.
import { devTree } from './ui/words';
import { translatePage, LANG, setLang, tr } from './ui/i18n';
import { ACHIEVEMENTS, unlocked, unlock, challengeDone, CAMPAIGN, campaignDone, campaignWin } from './ui/progress';
import * as THREE from 'three';
import { generateMap, SIZES, type MapSize } from './mapgen/index';
import { toMapKind, KINDS_4P } from './mapgen/terrain';
import { orient } from './ui/orient';
import { World, type Quality } from './render/world';
import { RtsCamera } from './input/camera';
import { Hud } from './ui/hud';
import { FixedClock } from './sim/clock';
import { Sim } from './sim/sim';
import { GAME, UNITS } from './data/rules';
import { BuildingViews } from './render/buildings';
import { Effects, type Weapon } from './render/effects';
import { Ai, type Level } from './sim/ai';
import { GameAudio } from './audio/audio';
import { UnitViews } from './render/units';
import { Controller } from './input/controller';
import { replayTo, type SaveGame } from './sim/replay';
import { WONDER_TICKS, type Order, type Doctrine, type UnitKind } from './sim/sim';
import { FogOfWar } from './render/fog';
import { showEnd } from './ui/stats';
import { WorkerLabels } from './render/labels';
import { CenterViews } from './render/center';
import { Scenario, SCENARIOS, SCEN_MAP, type ScenId } from './sim/scenario';
import { Tutorial } from './ui/tuto';
import { Bench } from './ui/bench';
import { Lobby, type OnlineConfig } from './net/lobby';
import { Online, simHash } from './net/online';

/** Arme de chaque unité qui tire à distance : effet, hauteur de la bouche à feu, écart entre deux canons. */
const UNIT_WEAPON: Partial<Record<UnitKind, { w: Weapon; y?: number; twin?: number }>> = {
  tireur: { w: 'precision', y: 1.4 }, grenadier: { w: 'grenade', y: 1.4 }, garde: { w: 'pompe', y: 1.4 }, commando: { w: 'mitrailleuse', y: 1.3 }, vigile: { w: 'flak', y: 1.4 }, exo: { w: 'mitrailleuse', y: 2.2, twin: 0.5 }, sam: { w: 'salve', y: 2, twin: 0.5 },
  chasseurChars: { w: 'canon', y: 1.5 }, avc: { w: 'mitrailleuse', y: 1.9, twin: 0.2 }, huit: { w: 'canon', y: 1.9 }, canonAA: { w: 'flak', y: 2.2, twin: 0.4 },
  challenger: { w: 'plasmaBleu', y: 5.2, twin: 0.7 }, spitfire: { w: 'mitrailleuse', y: 5.4, twin: 0.6 }, zenith: { w: 'bombes', y: 5.6 }, pancake: { w: 'laser', y: 5.1, twin: 0 },
  executioner: { w: 'cuirasse', y: 6.1, twin: 1.4 }, imperial: { w: 'cuirasse', y: 6.6, twin: 2 },
  fantassin: { w: 'fusil', y: 1.3 }, eclaireur: { w: 'mitrailleuse', y: 0.9, twin: 0.35 }, antiblindage: { w: 'roquette', y: 1.55 },
  blinde: { w: 'canon', y: 1.45 }, artillerie: { w: 'artillerie', y: 1.9 }, drone: { w: 'plasma', y: 4.2, twin: 0.6 }, intercepteur: { w: 'plasmaBleu', y: 5.2, twin: 0.8 },
  cuirasse: { w: 'cuirasse', y: 6.3, twin: 1.6 }, araignee: { w: 'mitrailleuse', y: 1.35, twin: 0.35 }, araigneeCanon: { w: 'canon', y: 1.85 },
  strikerLaser: { w: 'laser', y: 2.55, twin: 1.05 }, strikerMissiles: { w: 'salve', y: 3.1, twin: 0.9 }, strikerAssaut: { w: 'assaut', y: 2.6, twin: 1.05 },
};
/** Arme des bâtiments qui tirent. */
const TOWER_WEAPON: Record<string, { w: Weapon; y?: number; twin?: number }> = {
  centre: { w: 'mitrailleuse', y: 3.2, twin: 0.4 }, tourelle: { w: 'tourelle', twin: 0.3 }, tourelleAA: { w: 'flak', twin: 1 }, defense: { w: 'rayon', y: 3.4 }, sentinelle: { w: 'rayonRouge' },
};

const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* indisponible */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* indisponible */ } },
};

// Partie en ligne en cours (lancée depuis le salon, ou à reprendre après une coupure) : la carte vient de sa configuration.
let onlineCfg: OnlineConfig | null = null;
try { onlineCfg = JSON.parse(store.get('online') || 'null'); } catch { /* aucune */ }
if (onlineCfg && Date.now() - onlineCfg.at > 4 * 3600e3) { onlineCfg = null; store.del('online'); }
if (onlineCfg) { store.set('graine', String(onlineCfg.seed)); store.set('taille', onlineCfg.size); store.set('terrain', onlineCfg.kind); store.set('joueurs', onlineCfg.players); }
/** Camp du joueur sur cet appareil (0 hors ligne). */
const me = onlineCfg ? onlineCfg.me : 0;
// La graine vient de l'adresse (#carte-1234), sinon de la dernière carte jouée.
const fromHash = /^#carte-(\d{1,9})$/.exec(location.hash);
const seed = onlineCfg ? onlineCfg.seed : fromHash ? Number(fromHash[1]) : Number(store.get('graine')) || 20261113;
store.set('graine', String(seed));
// Joueurs : 1 contre 1, 4 chacun pour soi, ou 2 contre 2 (toi + une IA alliée contre deux IA).
const players = (['duel', 'ffa', 'equipes'].includes(store.get('joueurs') || '') ? store.get('joueurs') : 'duel') as 'duel' | 'ffa' | 'equipes';
const nP = players === 'duel' ? 2 : 4;
const size0 = ((store.get('taille') || 'petite') in SIZES ? store.get('taille') || 'petite' : 'petite') as MapSize;
const size = (onlineCfg ? onlineCfg.size : nP === 4 && size0 === 'petite' ? 'moyenne' : size0) as MapSize;     // à 4, la petite carte est trop serrée
orient.refresh();
if (store.get('pivot') === '1' && innerHeight > innerWidth) orient.set(true);
const kind0 = toMapKind(store.get('terrain'));
const kind = onlineCfg ? toMapKind(onlineCfg.kind) : nP === 4 && !KINDS_4P.has(kind0) ? 'terre' : kind0;
const game = generateMap(seed, SIZES[size], kind, nP);
const map = game.terrain;
const view = document.getElementById('view')!;
const objects = game.objects;
const sim = new Sim(map, objects);
const world = new World(view, map, objects);
const cam = new RtsCamera(world.renderer.domElement, map);
const hud = new Hud(map, cam);
devTree(document.body);   // consignes « clique / clic droit » à la souris
translatePage();          // anglais si choisi (ou appareil réglé dans une autre langue que le français)
const fog = new FogOfWar(map, sim, me);
let opts = { doctrine: 'industrielle' as Doctrine, fog: true, blitz: false, storms: false, contested: false, res: 'normales', faction: 0 };
let ai: Ai | null = null, ai0: Ai | null = null, ais: Ai[] = [];
// --- Enregistrement des ordres du joueur (sauvegarde par rejeu).
let log: [number, Order][] = [], recording = false, level = 'normal', aiTurn = false;
/** Partie lancée (sinon : menu, caméra qui flotte). */
let started = false;
/** Défi en cours (tutoriel, défense, raid, course). */
let scen: Scenario | null = null, tuto: Tutorial | null = null, bench: Bench | null = null;
/** Rediffusion : ordres du joueur réinjectés tick par tick ; le joueur ne peut plus donner d'ordres. */
let replay: { orders: [number, Order][]; i: number; total: number } | null = null;
/** Partie en ligne : les ordres du joueur partent vers l'hôte et s'appliquent au tick fixé par lui. */
let online: Online | null = null;
/** IA qui jouent un camp en ligne (places IA ou joueur déconnecté), par camp. */
const netAis = new Map<number, Ai>();
const rawIssue = sim.issue.bind(sim);
sim.issue = (o: Order) => {
  if (online && !aiTurn) { online.local(JSON.parse(JSON.stringify(o))); return; }
  if (replay && !aiTurn) return;
  if (recording && !aiTurn) log.push([sim.tick, JSON.parse(JSON.stringify(o))]);
  rawIssue(o);
};
/** Un tick de jeu : ordres rediffusés, script du défi, IA, simulation. */
const stepOnce = () => {
  if (sim.winner >= 0 || !started) return;
  if (online) {
    if (!online.canStep()) return;
    aiTurn = true;
    online.apply(rawIssue);
    for (const k of [...netAis.keys()].sort((a, b) => a - b)) netAis.get(k)!.step();
    aiTurn = false;
    sim.step();
    const rec = (window as any).__h as Map<number, number> | undefined; if (rec && sim.tick % 20 === 0) rec.set(sim.tick, simHash(sim));
    return;
  }
  aiTurn = true;
  if (replay) while (replay.i < replay.orders.length && replay.orders[replay.i][0] <= sim.tick) rawIssue(replay.orders[replay.i++][1]);
  scen?.step(); bench?.step();
  ai0?.step(); for (const a of ais) a.step(); aiTurn = false;
  sim.step();
};
const clock = new FixedClock(stepOnce);
// --- Pause tactique et vitesse.
let paused = false, speed = 1;
let SPEEDS = [1, 1.5, 2];
const paintSpeed = () => {
  document.getElementById('btn-speed')!.textContent = '×' + String(speed).replace('.', ',');
  document.getElementById('rb-speed')!.textContent = '×' + speed; document.getElementById('rb-pause')!.textContent = paused ? '▶' : 'II';
  document.getElementById('btn-pause')!.textContent = paused ? '▶' : 'II';
  document.getElementById('btn-pause')!.classList.toggle('on', paused);
  document.body.classList.toggle('paused', paused);
};
const togglePause = () => { if (online) return; paused = !paused; paintSpeed(); };
const nextSpeed = (dir: number) => { if (online) return; speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + dir))]; paintSpeed(); };
document.getElementById('btn-pause')!.addEventListener('click', togglePause);
document.getElementById('btn-speed')!.addEventListener('click', () => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; paintSpeed(); });
// --- Sauvegarde automatique (toutes les 20 s de jeu, et quand on quitte l'appli).
const saveData = (): SaveGame => ({ v: 1, seed, size, kind, level, doctrine: opts.doctrine, fog: opts.fog, blitz: opts.blitz, storms: opts.storms, contested: opts.contested, ressources: opts.res, faction: opts.faction, players, tick: sim.tick, orders: log, at: Date.now() });
const save = () => {
  if (!recording || !started || sim.winner >= 0) return;
  store.set('sauvegarde', JSON.stringify(saveData()));
};
/** Emplacements : la sauvegarde automatique, puis trois emplacements choisis par le joueur. */
const SLOTS = ['sauvegarde', 'slot1', 'slot2', 'slot3'];
const readSlot = (k: string): SaveGame | null => { try { const v = JSON.parse(store.get(k) || 'null'); return v && v.v === 1 ? v : null; } catch { return null; } };
const KIND_FR: Record<string, string> = { terre: 'Terre ferme', cotiere: 'Côtière', continentale: 'Continentale', mont: 'Mont de solarite', rivieres: 'Rivières', grandesiles: 'Grandes îles', petitesiles: 'Petites îles' };
const describe = (d: SaveGame) => `${Math.floor(d.tick / 600)} min · ${KIND_FR[d.kind] ?? d.kind} · IA ${d.level}${d.at ? ' · ' + new Date(d.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}`;
/** Lance une mission de la campagne (défi existant ou partie réglée d'avance). */
const launchMission = (i: number) => {
  const m = CAMPAIGN[i]; if (!m) return;
  store.set('campagne-mission', String(i)); store.del('sauvegarde');
  if (m.scen) {
    store.set('options', JSON.stringify({ faction: '0' })); store.set('scenario', m.scen);
    store.set('graine', String(SCEN_MAP.seed)); store.set('taille', SCEN_MAP.size); store.set('terrain', SCEN_MAP.kind); store.set('joueurs', SCEN_MAP.players);
  } else if (m.partie) {
    const p = m.partie;
    store.set('graine', String(p.graine)); store.set('taille', p.taille); store.set('terrain', p.terrain); store.set('joueurs', p.joueurs);
    store.set('niveau', p.niveau); store.set('mode', 'joueur'); store.set('options', JSON.stringify({ ...(p.options ?? {}), faction: String(p.faction) })); store.set('autostart', '1');
  }
  relaunch();
};
const openCampaign = () => {
  const done = campaignDone();
  picker('Campagne · Opération Arès', CAMPAIGN.map((m, i) => ({ label: (i < done ? '✔ ' : i === done ? '▶ ' : '🔒 ') + m.titre, sub: i <= done ? m.recit + ' — Objectif : ' + m.but : 'Termine la mission précédente', off: i > done, act: () => launchMission(i) })));
};
const openAchievements = () => {
  const have = unlocked();
  picker(`Succès · ${have.size}/${ACHIEVEMENTS.length}`, ACHIEVEMENTS.map((a) => ({ label: (have.has(a.id) ? '🏆 ' : '· ') + a.nom, sub: a.desc, off: !have.has(a.id) })));
};
/** Fenêtre de choix générique (sauvegardes, rediffusions, réglages). */
const picker = (title: string, items: { label: string; sub?: string; act?: () => void; off?: boolean }[], extra = '') => {
  const el = document.getElementById('picker')!;
  el.innerHTML = `<div class="gm-box"><h3>${title}</h3>${items.map((it, i) => `<button data-i="${i}"${it.off ? ' disabled' : ''}>${it.label}${it.sub ? `<small>${it.sub}</small>` : ''}</button>`).join('')}${extra}<button data-close>Fermer</button></div>`;
  el.hidden = false;
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (e.target === el) { el.hidden = true; return; } if (!b) return;
    if (b.hasAttribute('data-close')) { el.hidden = true; return; }
    const it = items[Number(b.dataset.i)]; if (it?.act) { el.hidden = true; it.act(); }
  };
  return el;
};
let savedAt = 0;
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
window.addEventListener('pagehide', save);
const readSave = (): SaveGame | null => { try { const v = JSON.parse(store.get('sauvegarde') || 'null'); return v && v.v === 1 ? v : null; } catch { return null; } };
const fx = new Effects(world.scene, (x, z) => map.heightAt(x, z));
const audio = new GameAudio();
audio.muted = store.get('muet') === '1';
try { Object.assign(audio.vol, JSON.parse(store.get('volumes') || '{}')); } catch { /* réglages par défaut */ }
/** Réglages : volumes séparés (musique, bruitages, voix). */
const openSettings = () => {
  const row = (k: 'musique' | 'effets' | 'voix', label: string) => `<div class="opt-row"><span>${label}</span><input type="range" min="0" max="100" step="5" data-v="${k}" value="${Math.round(audio.vol[k] * 100)}"><b data-o="${k}">${Math.round(audio.vol[k] * 100)}</b></div>`;
  const lang = `<div class="opt-row"><span>Langue</span><select id="opt-lang"><option value="fr"${LANG === 'fr' ? ' selected' : ''}>Français</option><option value="en"${LANG === 'en' ? ' selected' : ''}>English</option></select><b></b></div>`;
  const el = picker('Réglages', [], row('musique', 'Musique') + row('effets', 'Bruitages') + row('voix', 'Voix') + lang);
  el.querySelector<HTMLSelectElement>('#opt-lang')!.addEventListener('change', (e) => { setLang((e.target as HTMLSelectElement).value as 'fr' | 'en'); save(); relaunch(); });
  el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
    const k = inp.dataset.v as 'musique' | 'effets' | 'voix'; audio.unlock(); audio.setVolume(k, Number(inp.value) / 100);
    el.querySelector(`[data-o="${k}"]`)!.textContent = inp.value; store.set('volumes', JSON.stringify(audio.vol));
    if (k === 'effets') audio.sfx('click', 0.6, 120); else if (k === 'voix') audio.voice('select1', true, 300);
  }));
};
document.getElementById('menu-opts')?.addEventListener('click', openSettings);
document.getElementById('btn-campaign')?.addEventListener('click', () => { audio.unlock(); audio.sfx('click'); openCampaign(); });
document.getElementById('menu-succes')?.addEventListener('click', openAchievements);
const soundBtn = document.getElementById('btn-sound')!;
const paintSound = () => { soundBtn.textContent = audio.muted ? '♪ off' : '♪'; soundBtn.classList.toggle('on', !audio.muted); };
soundBtn.addEventListener('click', () => { audio.unlock(); audio.setMuted(!audio.muted); store.set('muet', audio.muted ? '1' : '0'); paintSound(); });
paintSound();
/** Volume d'un son selon sa distance au point regardé par la caméra. */
const near = (x: number, z: number) => Math.max(0, 1 - Math.hypot(x - cam.target.x, z - cam.target.z) / (cam.dist * 1.3 + 15));
// Impact d'un projectile qui a volé (obus, roquette, missile) : explosion sonore à son arrivée.
fx.onImpact = (x, z, size) => { const v = near(x, z); if (v > 0.05 && !audio.sfxVar("expl_veh", (0.25 + 0.3 * Math.min(1, size)) * v, 60)) audio.sfx(size > 0.6 ? "boom2" : "boom1", 0.4 * v, 60); };
const say = (text: string) => {
  hud.toast(text);
  if (text.startsWith('Pas assez')) { audio.voice('lack'); audio.sfx('error', 0.4, 400); }
  else if (text.startsWith('Population maximale')) audio.voice('pop');
  else if (text.startsWith('Ère 2')) { audio.voice('era2', true); audio.sfx('age', 0.5); }
  else if (text.startsWith('Ère 3')) { audio.voice('era3', true); audio.sfx('age', 0.5); }
  else if (text.startsWith('Emplacement impossible')) audio.sfx('error', 0.4, 400);
};
const togglePivot = () => { orient.set(!orient.rot); store.set('pivot', orient.rot ? '1' : '0'); };
document.getElementById('btn-rot')!.addEventListener('click', togglePivot);
document.getElementById('btn-rot2')!.addEventListener('click', togglePivot);
/** Relance la page pour construire une autre carte. On n'écrit plus la graine dans l'adresse (#carte-…) :
 *  un fichier ouvert depuis le téléphone (adresse content://) ne se recharge pas avec un # ajouté. */
const relaunch = () => {
  const base = location.href.split('#')[0];
  if (location.hash) location.replace(base); else location.reload();
};
/** Rediffusion de la dernière partie : on recharge sa carte puis on rejoue ses ordres. */
const replays = (): SaveGame[] => { try { const a = JSON.parse(store.get('rediffusions') || '[]'); if (Array.isArray(a) && a.length) return a; } catch { /* aucune */ } const d = readSlot('derniere'); return d ? [d] : []; };
const watchLast = (d0?: SaveGame) => {
  let d: SaveGame | null = d0 ?? null; if (!d) try { d = JSON.parse(store.get('derniere') || 'null'); } catch { /* aucune */ }
  if (!d) return;
  store.set('derniere', JSON.stringify(d));
  store.set('graine', String(d.seed)); store.set('taille', d.size); store.set('terrain', d.kind); store.set('joueurs', d.players ?? 'duel');
  store.set('revoir', '1'); relaunch();
};
const newGame = () => {
  store.del('sauvegarde'); store.del('scenario'); store.del('revoir'); store.del('online'); store.del('online-go');
  const next = 1 + Math.floor(Math.random() * 999999);
  store.set('graine', String(next));
  relaunch();
};

// --- Succès et campagne.
const mission = (() => { const v = store.get('campagne-mission'); return v === null ? -1 : Number(v); })();
const award = (ids: string[]) => { const n = unlock(ids); n.forEach((a, i) => setTimeout(() => { hud.toast(tr('🏆 Succès :') + ' ' + tr(a.nom) + ' — ' + tr(a.desc)); audio.sfx('age', 0.45); }, 600 + i * 2800)); };
const missionWon = (i: number) => {
  store.del('campagne-mission');
  const all = campaignWin(i);
  setTimeout(() => hud.toast(all ? tr('🎖 Campagne terminée !') : tr('🎖 Mission réussie :') + ' ' + tr(CAMPAIGN[i].titre)), 300);
  if (all) award(['campagne']);
};
// --- Menu de la partie (☰ ou Échap) : reprendre, abandonner, quitter vers le menu.
const gmenu = document.getElementById('gmenu')!;
let gmWasPaused = false;
const gmOpen = (on: boolean) => {
  if (on === !gmenu.hidden) return;
  if (on) {
    if (!started && !replay) return;
    const solo = !online && !replay && !bench;
    const sur = document.getElementById('gm-surrender')!;
    sur.hidden = !solo || !!ai0 || sim.winner >= 0;
    document.getElementById('gm-save')!.hidden = !solo || !recording || sim.winner >= 0;
    document.getElementById('gm-quit')!.textContent = online ? 'Quitter la partie en ligne' : 'Quitter vers le menu';
    document.getElementById('gm-note')!.textContent = online ? (online.cfg.host ? 'Tu es l\'hôte : les autres joueurs continueront contre l\'IA. (Un simple rechargement de la page, lui, reprend la partie.)' : 'L\'IA prendra ta place.') : solo && sim.winner < 0 ? 'La partie est sauvegardée : « Reprendre » depuis le menu.' : '';
    gmWasPaused = paused; if (!online) { paused = true; paintSpeed(); }
  } else if (!online) { paused = gmWasPaused; paintSpeed(); }
  gmenu.hidden = !on;
};
document.getElementById('btn-menu')!.addEventListener('click', () => gmOpen(gmenu.hidden));
document.getElementById('gm-opts')!.addEventListener('click', openSettings);
document.getElementById('gm-save')!.addEventListener('click', () => {
  if (!recording || sim.winner >= 0) return;
  const items = [1, 2, 3].map((n) => { const d = readSlot('slot' + n); return { label: 'Emplacement ' + n, sub: d ? 'remplacer : ' + describe(d) : 'vide', act: () => { const data = saveData(); store.set('slot' + n, JSON.stringify(data)); if (readSlot('slot' + n)?.at !== data.at) hud.toast('Mémoire pleine : sauvegarde impossible'); else hud.toast('Partie sauvegardée dans l\'emplacement ' + n); } }; });
  picker('Sauvegarder la partie', items);
});
document.getElementById('gm-resume')!.addEventListener('click', () => gmOpen(false));
gmenu.addEventListener('click', (e) => { if (e.target === gmenu) gmOpen(false); });
document.getElementById('gm-surrender')!.addEventListener('click', (e) => {
  const b = e.currentTarget as HTMLButtonElement;
  if (!b.classList.contains('warn')) { b.classList.add('warn'); b.textContent = 'Confirmer l\'abandon'; setTimeout(() => { b.classList.remove('warn'); b.textContent = 'Abandonner la partie'; }, 4000); return; }
  b.classList.remove('warn'); b.textContent = 'Abandonner la partie';
  gmOpen(false); paused = false; paintSpeed();
  sim.issue({ type: 'surrender', owner: me });
});
document.getElementById('gm-quit')!.addEventListener('click', () => {
  save();
  store.del('scenario'); store.del('revoir');
  if (online) { online.quit(); store.del('online-go'); store.del('online'); store.del('online-host'); store.del('online-retry'); setTimeout(relaunch, 500); return; }
  relaunch();
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('playing') && !document.querySelector('#sheet:not([hidden])')) { const c = ctrl; if (!gmenu.hidden || !(c && (c.placing || c.selection.size || c.building >= 0))) gmOpen(gmenu.hidden); } });

// Départ : 4 ouvriers et 1 éclaireur par camp.
for (let owner = 0; owner < map.starts.length; owner++) {
  for (let i = 0; i < GAME.depart.ouvriers; i++) sim.spawn('ouvrier', owner, objects.spawns[owner][i + 4].x, objects.spawns[owner][i + 4].z);
  sim.spawn('eclaireur', owner, objects.spawns[owner][10].x, objects.spawns[owner][10].z);
}
let buildings: BuildingViews | null = null;
let units: UnitViews | null = null;
let ctrl: Controller | null = null;
let labels: WorkerLabels | null = null;
let center: CenterViews | null = null;

const touch = matchMedia('(pointer: coarse)').matches;
const order: Quality[] = ['basse', 'moyenne', 'haute'];
let auto = !store.get('qualite');
let quality: Quality = (store.get('qualite') as Quality) || (touch ? 'moyenne' : 'haute');
world.setQuality(quality);
hud.setQualityLabel(quality + (auto ? ' (auto)' : ''));
hud.setSeed(seed, newGame);
hud.onQuality = () => {
  auto = false;
  quality = order[(order.indexOf(quality) + 1) % 3];
  world.setQuality(quality); store.set('qualite', quality);
  return quality;
};

function resize() { world.resize(); cam.setAspect(view.clientWidth / Math.max(view.clientHeight, 1)); }
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(view);
resize();

cam.focus(map.starts[0].x, map.starts[0].z + 6);

/** Bandeau réseau : attente d'un joueur lent, rattrapage, partie seule après le départ de l'hôte. */
let netTxt = '';
function netStatus() {
  if (!online) return;
  const b = online.behind(), w = online.cfg.host ? online.waitingFor : [];
  const t = online.hostGone ? '' : w.length ? 'En attente de ' + w.join(', ') + '…' : online.hostSilent() ? 'En attente de l\'hôte…' : b > 12 ? 'Rattrapage… ' + Math.ceil(b / 10) + ' s' : '';
  if (t === netTxt) return; netTxt = t;
  const el = document.getElementById('netbar')!; el.hidden = !t; el.textContent = t; el.classList.toggle('bad', !!w.length || online.hostSilent());
}
let drift = 0;
let last = performance.now(), frames = 0, acc = 0, fps = 60, slow = 0, shown = false;
function frame(now: number) {
  const dtMs = Math.min(now - last, 100); last = now;
  const dt = dtMs / 1000;
  const alpha = shown ? clock.advance(paused ? 0 : dtMs * speed) : 0;
  if (recording && sim.tick - savedAt >= 200) { savedAt = sim.tick; save(); }
  if (online) {
    online.pump();
    // Invité en retard (téléphone plus lent, reconnexion) : quelques ticks de plus par image pour rattraper,
    // jusqu'à revenir au retard normal (l'hôte, lui, avance toujours au rythme de l'horloge).
    let extra = 0; const t0 = performance.now(), big = online.behind() > 50;
    while (online.behind() > Online.CATCHUP && extra < (big ? 200 : 2) && performance.now() - t0 < 10) { stepOnce(); extra++; }
    netStatus();
  }
  hud.frame();
  if (!started && shown) { drift += dt; cam.focus(map.starts[0].x + Math.sin(drift * 0.11) * 16, map.starts[0].z + 4 + Math.cos(drift * 0.08) * 11); cam.dist = 60; }
  cam.update(dt);
  for (const e of sim.events) {
    if (e.t === 'msg') { if (e.owner === me) say(e.text); }
    else if (e.t === 'ready') { if (e.owner === me) audio.voice('ready'); }
    else if (e.t === 'built') { if (sim.building(e.b)?.owner === me && sim.building(e.b)?.kind !== 'mur') audio.voice('built'); }
    else if (e.t === 'depleted') world.hideResource(e.node);
    else if (e.t === 'promo') { if (e.owner === me) { const u = sim.get(e.id); hud.toast(`${u ? UNITS[u.kind].nom : 'Unité'} promu : ${'★'.repeat(e.vet)}`); audio.sfx('ok', 0.5, 300); } }
    else if (e.t === 'storm') { world.stormTarget = e.on ? 1 : 0; document.getElementById('stormfx')!.classList.toggle('on', e.on); hud.toast(e.on ? 'Tempête de poussière : tourelles hors service' : 'La tempête se dissipe'); if (e.on) audio.sfx('shield', 0.5); }
    else if (e.t === 'shot' && e.melee) {
      // Corps à corps : pas de traçante, un choc au point d'impact.
      const v = near(e.x0, e.z0), heavy = e.kind === 'marteleur' || e.kind === 'cogneur', y = map.heightAt(e.x1, e.z1) + (heavy ? 1.4 : 1.1);
      const hx = e.x0 + (e.x1 - e.x0) * 0.8, hz = e.z0 + (e.z1 - e.z0) * 0.8;
      fx.spark(hx, y, hz, heavy); audio.clang(0.45 * v, heavy); if (e.id !== undefined) units?.meleeHit(e.id);
      if (heavy && v > 0.6) cam.shake(0.08);
    }
    else if (e.t === 'shot') {
      // Chaque arme a son effet et son son : balles, obus, roquettes, salves de missiles, artillerie en cloche, lasers, plasma, flak.
      const v = near(e.x0, e.z0), my = buildings?.turretShot(e.x0, e.z0, e.x1, e.z1, !!e.air) ?? null;
      const W = e.kind ? UNIT_WEAPON[e.kind] : e.bk ? TOWER_WEAPON[e.bk] : undefined, w = W?.w ?? (e.big ? 'canon' : 'fusil');
      const y1 = map.heightAt(e.x1, e.z1) + (e.air ? 4.6 : 1.0);
      // Le tir part du bout de l'arme (ou du canon) de l'unité qui tire, si on la voit.
      const mz = e.id !== undefined && !my ? units?.muzzle(e.id, e.x1, e.z1) ?? null : null;
      if (e.id !== undefined && e.kind && ['fantassin', 'antiblindage', 'tireur', 'grenadier', 'exo', 'garde', 'commando', 'vigile'].includes(e.kind)) units?.recoil(e.id);
      if (w === 'assaut' && e.id !== undefined && units) {
        // Striker d'assaut : canon (bras droit), laser (bras gauche), roquettes (dos), chacun de sa propre arme.
        const id = e.id, from = (tag: string) => units!.muzzle(id, e.x1, e.z1, tag);
        const c = from('canon'); if (c) fx.weapon('canon', c.x, c.y, c.z, e.x1, y1, e.z1, 0);
        setTimeout(() => { const l = from('laser'); if (l) fx.weapon('laser', l.x, l.y, l.z, e.x1, y1, e.z1, 0); }, 110);
        setTimeout(() => { const r = from('srm'); if (r) fx.weapon('roquette', r.x, r.y, r.z, e.x1, y1, e.z1, 0); }, 240);
      } else if (mz) fx.weapon(w, mz.x, mz.y, mz.z, e.x1, y1, e.z1, 0);
      else fx.weapon(w, e.x0, map.heightAt(e.x0, e.z0) + (my ?? W?.y ?? (e.from ? 4.6 : 1.3)), e.z0, e.x1, y1, e.z1, W?.twin ?? 0);
      const shotN = 1 + Math.abs(Math.round(e.x0 * 7 + e.z0 * 3)) % 3;
      if (w === 'fusil') audio.sfx('shot' + shotN, 0.26 * v, 70);
      // Fusil à pompe : détonation grave et sèche, puis le « clac-clac » du rechargement.
      else if (w === 'pompe') { audio.sfx('shotbig', 0.4 * v, 90); audio.sfx('shot' + shotN, 0.3 * v, 0); setTimeout(() => audio.sfx('click', 0.22 * v, 0), 380); setTimeout(() => audio.sfx('click', 0.2 * v, 0), 520); }
      else if (w === 'mitrailleuse') { audio.sfx('shot' + shotN, 0.22 * v, 40); setTimeout(() => audio.sfx('shot' + (shotN % 3 + 1), 0.2 * v, 40), 140); }
      else if (w === 'canon') { if (!audio.sfxVar('tir_lourd', 0.5 * v, 120)) audio.sfx('shotbig', 0.5 * v, 120); }
      else if (w === 'assaut') { if (!audio.sfxVar('tir_lourd', 0.45 * v, 120)) audio.sfx('shotbig', 0.45 * v, 120); setTimeout(() => audio.arme('laser', 0.35 * v), 100); setTimeout(() => audio.arme('missile', 0.3 * v), 250); }
      else if (w === 'roquette' || w === 'salve') audio.arme('missile', (w === 'salve' ? 0.5 : 0.4) * v);
      else if (w === 'artillerie') audio.arme('mortier', 0.6 * v);
      else if (w === 'laser') audio.arme('laser', 0.4 * v);
      else if (w === 'plasma' || w === 'plasmaBleu' || w === 'cuirasse') audio.arme('plasma', (w === 'cuirasse' ? 0.5 : 0.35) * v);
      else if (w === 'tourelle') { if (!audio.sfxVar('tourelle', 0.4 * v, 90)) audio.arme('plasma', 0.4 * v); }
      else if (w === 'flak') audio.arme('flak', 0.45 * v);
      else if (w === 'precision') { audio.sfx('shotbig', 0.32 * v, 90); audio.sfx('shot' + shotN, 0.3 * v, 0); }
      else if (w === 'grenade') audio.arme('mortier', 0.35 * v);
      else if (w === 'bombes') audio.arme('missile', 0.35 * v);
      else audio.arme('rayon', 0.5 * v);
    }
    else if (e.t === 'dead') {
      // Fantassins : désintégration ; véhicules : explosion ; appareils : explosion en vol et épave qui s'écrase.
      const v = near(e.x, e.z), inf = !e.fly && !e.big && e.kind !== 'eclaireur', gy = map.heightAt(e.x, e.z);
      if (e.id !== undefined) units?.kill(e.id);
      if (inf) { fx.death(e.x, gy, e.z, 'inf'); if (!audio.sfxVar('mort_inf', 0.55 * v, 50)) audio.zap(0.45 * v); }
      else {
        fx.death(e.x, gy + (e.fly ? 4.6 : 0.6), e.z, e.fly ? 'air' : 'veh', e.kind === 'cuirasse');
        if (!audio.sfxVar(e.fly ? 'expl_air' : 'expl_veh', 0.75 * v, 70)) { audio.sfx(e.big || e.fly ? 'boom2' : 'boom1', 0.6 * v, 90); audio.crash(0.5 * v); }
        else audio.debris(0.35 * v, 3);
      }
    }
    else if (e.t === 'destroyed') {
      buildings?.raze(e.b);
      const v = near(e.x, e.z);
      if (e.r > 1.2) {
        fx.collapse(e.x, map.heightAt(e.x, e.z), e.z, e.r);
        if (audio.sfxVar('expl_bat', 0.4 + 0.6 * v, 150)) { setTimeout(() => audio.sfxVar('expl_veh', 0.5 * v, 0), 280); audio.debris(0.45 * v, 6); audio.rumble(0.25 * v); }
        else { audio.sfx('boombig', 0.3 + 0.6 * v, 150); audio.rumble(0.25 + 0.6 * v); }
      }
      else { fx.explode(e.x, map.heightAt(e.x, e.z) + 0.8, e.z, 0.7); if (!audio.sfxVar('expl_veh', 0.5 * v, 70)) { audio.sfx('boom1', 0.5 * v, 90); audio.crash(0.35 * v); } else audio.debris(0.3 * v, 2); }
      if (ctrl && ctrl.building === e.b) ctrl.select([]);
    }
    else if (e.t === 'attacked') { if (e.owner === me) { hud.toast('Tu es attaqué !'); hud.alert(e.x, e.z); audio.voice('alert', true, 12000); audio.tension(); } }
    else if (e.t === 'over') {
      // Dernière partie jouée : gardée pour la rediffusion.
      if (recording && !scen) {
        const d = { ...saveData(), result: e.winner === sim.players[me].team ? 'Victoire' : 'Défaite' };
        store.set('derniere', JSON.stringify(d));
        // Les 5 dernières parties restent disponibles en rediffusion (les plus anciennes partent si la mémoire manque).
        const list = [d, ...replays().filter((r) => r.at !== d.at)].slice(0, 5);
        for (let n = list.length; n > 0; n--) { try { localStorage.setItem('rediffusions', JSON.stringify(list.slice(0, n))); break; } catch { /* trop gros : une de moins */ } }
      }
      recording = false; store.del('sauvegarde');
      const won = e.winner === sim.players[me].team;
      if (!replay && !ai0 && !bench) {
        const P = sim.players[me], got: string[] = [];
        if (P.ere >= 3) got.push('ere3');
        if ((sim.stats[me].tues ?? 0) >= 100) got.push('carnage');
        if (won) {
          if (scen) { if (challengeDone(scen.id)) got.push('defis'); }
          else {
            got.push('premiere', 'f' + P.faction);
            if (online) got.push('enligne');
            const lvAll = online ? online.cfg.sides.filter((x, i) => i !== me && !x.human).map((x) => x.level) : [level];
            if (lvAll.includes('difficile')) got.push('difficile');
            if (kind === 'grandesiles' || kind === 'petitesiles') got.push('iles');
            if (players === 'ffa') got.push('quatre'); if (players === 'equipes') got.push('equipe');
            if (sim.tick < 12 * 600) got.push('rapide');
            if (e.wonder) got.push('merveille'); if (e.blitz) got.push('blitz');
          }
          if (mission > 0 && (CAMPAIGN[mission].scen ? scen?.id === CAMPAIGN[mission].scen : !scen)) missionWon(mission);
        }
        award(got);
      }
      if (online) { store.del('online'); store.del('online-go'); store.del('online-host'); store.del('online-retry'); }
      audio.voice(won ? 'win' : 'lose', true, 0);
      const K2: Record<string, string> = { terre: 'Terre ferme', cotiere: 'Côtière', continentale: 'Continentale', mont: 'Mont de solarite', rivieres: 'Rivières', grandesiles: 'Grandes îles', petitesiles: 'Petites îles' };
      showEnd(document.getElementById('end')!, sim, { spectator: !!ai0, won, winnerTeam: e.winner, blitz: !!e.blitz, wonder: !!e.wonder, names: sim.sides.map((o) => online ? `${online.name(o)} · ${sim.factionName(o).split(' ').pop()}${o === me ? ' (toi)' : online.cfg.sides[o].human ? '' : ''}` : sim.factionName(o).split(' ').pop()! + (o === 0 ? (ai0 ? ' (IA)' : ' (toi)') : ' (IA' + (players === 'equipes' && sim.players[o].team === sim.players[0].team ? ' alliée' : '') + ')')), terrain: K2[kind] ?? kind, onNew: newGame, title: e.title,
        newLabel: scen || replay ? 'Menu' : 'Nouvelle partie',
        buttons: [...(mission >= 0 && won && mission + 1 < CAMPAIGN.length ? [['Mission suivante', () => launchMission(mission + 1)] as [string, () => void]] : mission >= 0 && !won ? [['Recommencer la mission', () => launchMission(mission)] as [string, () => void]] : []),
          ...(scen ? [['Rejouer le défi', () => { store.set('scenario', scen!.id); relaunch(); }] as [string, () => void]] : store.get('derniere') ? [['Revoir la partie', () => watchLast()] as [string, () => void]] : [])] });
    }
  }
  sim.events.length = 0;
  fx.barsBegin();
  if (fog.enabled) { fog.update(dt); fog.patch(world.scene, dt); }
  if (units) { units.zoom = cam.dist; units.camera = cam.camera; }
  center?.update(dt);
  labels?.update(dt, cam.camera, view.clientWidth, view.clientHeight, cam.dist);
  // Ascenseur orbital achevé : compte à rebours de victoire, pour les deux camps.
  { const w = sim.buildings.find((b) => b.kind === 'ascenseur' && b.done), tag = document.getElementById('wondertag')!;
    tag.hidden = !w || sim.winner >= 0;
    if (w && sim.winner < 0) { const left = Math.max(0, Math.ceil((WONDER_TICKS - (sim.tick - (w.doneT ?? sim.tick))) / 10)), txt = `🛰 Ascenseur ${sim.factionName(w.owner)} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; if (tag.textContent !== txt) { tag.textContent = txt; tag.classList.toggle('foe', sim.foe(w.owner, 0)); } } }
  if (sim.storms) { const tag = document.getElementById('stormtag')!, left = Math.ceil(sim.stormLeft()), on = sim.storm; tag.hidden = !(on || left <= 30); const txt = (on ? '🌪 Tempête · ' : '🌪 Tempête dans ') + `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; if (tag.textContent !== txt) tag.textContent = txt; }
  if (sim.blitzEnd) { const ts = new Map<number, number>(); for (const o of sim.sides) ts.set(sim.players[o].team, (ts.get(sim.players[o].team) ?? 0) + sim.score(o)); const mine = ts.get(sim.players[me].team) ?? 0; ts.delete(sim.players[me].team); hud.blitz(Math.max(0, sim.blitzEnd - sim.tick) / 10, mine, Math.max(0, ...ts.values())); }
  bench?.frame();
  if (scen && ctrl) {
    if (tuto) { if (tuto.update(sim, ctrl, hud)) { audio.sfx('ok', 0.5); if (tuto.i === tuto.last && mission === 0) missionWon(0); } }
    else { const el = document.getElementById('scen')!, txt = `<b>${scen.info.nom}</b><span>${scen.status()}</span>`; if (el.innerHTML !== txt) el.innerHTML = txt; }
  }
  if (replay) { const f = (t: number) => `${Math.floor(t / 600)}:${String(Math.floor(t / 10) % 60).padStart(2, '0')}`, txt = `▶ Rediffusion · ${f(sim.tick)} / ${f(replay.total)}`; const el = document.getElementById('rb-t')!; if (el.textContent !== txt) el.textContent = txt; }
  units?.update(alpha, dt, fx);
  if (buildings && ctrl) { buildings.selected = ctrl.building; buildings.setGhost(ctrl.ghost); buildings.update(fx); }
  fx.barsEnd(); fx.update(dt, cam.camera.quaternion);
  if (fx.shake > 0) { cam.shake(fx.shake); fx.shake = 0; }
  if (ctrl && ctrl.selection.size) { let gone = false; for (const id of ctrl.selection) if (!sim.get(id)) { ctrl.selection.delete(id); gone = true; } if (gone) ctrl.select([...ctrl.selection]); }
  world.update(dt, cam.target, cam.dist);
  world.renderer.render(world.scene, cam.camera);
  frames++; acc += dtMs;
  if (acc >= 500) {
    fps = frames * 1000 / acc; frames = 0; acc = 0;
    hud.update(fps);
    // Qualité automatique : on baisse d'un cran si le jeu rame durablement.
    if (auto && shown) {
      slow = fps < 38 ? slow + 1 : 0;
      if (slow >= 4 && quality !== 'basse') {
        quality = order[order.indexOf(quality) - 1]; world.setQuality(quality);
        hud.setQualityLabel(quality + ' (auto)'); slow = 0;
      }
    }
  }
  requestAnimationFrame(frame);
}
// Raccourcis : P pause, + et - vitesse, F1/F2 vues (Maj ou Ctrl : enregistrer), Espace : aller à l'alerte.
window.addEventListener('keydown', (e) => {
  if (!shown) return;
  if (e.key === 'p' || e.key === 'P' || e.key === 'Pause') togglePause();
  else if (e.key === '+') nextSpeed(1);
  else if (e.key === '-') nextSpeed(-1);
  else if (e.key === 'F1' || e.key === 'F2') { e.preventDefault(); const i = e.key === 'F1' ? 0 : 1; if (e.shiftKey || e.ctrlKey) hud.camSave(i); else hud.camGo(i); }
  else if (e.key === ' ') { e.preventDefault(); hud.goAlert(); }
});
paintSpeed();

world.load((f) => hud.setLoading(f)).then(() => {
  units = new UnitViews(world.scene, sim);
  units.update(0, 0);
  ctrl = new Controller(world.renderer.domElement, cam, sim, units);
  buildings = new BuildingViews(world.scene, sim);
  buildings.onGate = (x, z) => audio.sfxVar('champ', 0.35 * near(x, z), 400);
  labels = new WorkerLabels(sim, document.getElementById('wlabels')!, me);
  ctrl.onOrder = (p, color) => {
    world.ping(p, color);
    if (color === 0xff5a4d) audio.voice(['attack1', 'attack2']);
    else if (color === 0xffe07a) audio.sfx('place', 0.5, 150);
    else if (color !== 0xff9ad5) audio.voice(['move1', 'move2']);
  };
  ctrl.onMsg = say;
  ctrl.onSelect = () => audio.voice(['select1', 'select2'], false, 3500);
  ctrl.player = me; units.me = me;
  hud.bind(ctrl, sim);
  (window as any).__game.ctrl = ctrl;
  world.renderer.compile(world.scene, cam.camera);
  shown = true;
  const saved = readSave();
  /** Options choisies avant la partie : doctrine du joueur, brouillard, mode Blitz. */
  const applyOpts = (spect: boolean) => {
    sim.setFaction(opts.faction);
    if (!spect) sim.players[0].doctrine = opts.doctrine;
    if (opts.blitz) sim.blitzEnd = 6000;
    sim.storms = opts.storms;
    if (opts.res === 'riches') sim.setRich();
    if (opts.res === 'bacasable' && !spect) sim.sandbox = 0;
    if (opts.contested) { sim.setupContested(); center = new CenterViews(world.scene, sim); }
    fog.setEnabled(opts.fog && !spect);
    units!.visible = fog.enabled ? (x, z) => fog.visible(x, z) : () => true;
    buildings!.seen = fog.enabled ? (x, z) => fog.at(x, z) : () => 2;
    hud.fogAt = fog.enabled ? (x, z) => fog.at(x, z) : null;
  };
  const start = (lv: string, mode: string, o: Record<string, string>) => {
    level = lv;
    opts = { doctrine: (o.doctrine || 'industrielle') as Doctrine, fog: o.brouillard !== 'non', blitz: o.duree === 'blitz', storms: o.evenements === 'tempetes', contested: o.centre === 'dispute', res: o.ressources || 'normales', faction: Math.max(0, Math.min(3, +(o.faction ?? 0) || 0)) };
    store.set('options', JSON.stringify(o));
    applyOpts(mode === 'spectateur');
    store.set('niveau', lv); store.set('mode', mode);
    if (players === 'equipes') sim.setTeams([0, 1, 0, 1]);
    ais = sim.sides.slice(1).map((o) => new Ai(sim, o, lv as Level)); ai = ais[0];
    if (mode === 'spectateur') { ai0 = new Ai(sim, 0, lv as Level); recording = false; hud.setLevel(lv + ' contre IA ' + lv); }
    else { recording = true; hud.setLevel(lv); }
    cam.focus(map.starts[0].x, map.starts[0].z + 6); cam.dist = 52;
    started = true;
  };
  // --- Partie en ligne : préparation identique chez tous, puis connexion et attente du départ donné par l'hôte.
  if (onlineCfg) {
    const cfg = onlineCfg;
    // Un hôte qui recharge sa page en cours de partie la reprend grâce au journal sauvegardé (sinon : retour au menu).
    let hostSave: { nonce: string; log: any[]; upTo: number; tick: number } | null = null;
    try { hostSave = JSON.parse(store.get('online-host') || 'null'); } catch { /* aucune */ }
    if (cfg.host && store.get('online-go') === cfg.nonce && (!hostSave || hostSave.nonce !== cfg.nonce)) { store.del('online'); store.del('online-go'); relaunch(); return; }
    if (!cfg.host || hostSave?.nonce !== cfg.nonce) hostSave = null;
    document.body.classList.add('online');
    opts = { doctrine: 'industrielle', fog: cfg.fog, blitz: false, storms: false, contested: false, res: cfg.res, faction: cfg.sides[cfg.me]?.faction ?? 0 };
    cfg.sides.forEach((x, i) => { const P = sim.players[i]; if (P) { P.faction = x.faction; P.doctrine = 'industrielle'; } });
    sim.setTeams(cfg.sides.map((x) => x.team));
    if (cfg.res === 'riches') sim.setRich();
    fog.setEnabled(cfg.fog);
    units!.visible = fog.enabled ? (x, z) => fog.visible(x, z) : () => true;
    buildings!.seen = fog.enabled ? (x, z) => fog.at(x, z) : () => 2;
    hud.fogAt = fog.enabled ? (x, z) => fog.at(x, z) : null;
    cfg.sides.forEach((x, i) => { if (!x.human) netAis.set(i, new Ai(sim, i, x.level as Level)); });
    const on = new Online(cfg, sim);
    online = on;
    on.onIa = (side, isOn) => { if (isOn) { if (!netAis.has(side)) netAis.set(side, new Ai(sim, side, 'normal')); } else if (cfg.sides[side].human) netAis.delete(side); };
    on.onInfo = (t, bad) => { hud.toast(t); if (bad) audio.sfx('error', 0.4); };
    // Invité : liaison coupée. L'hôte a peut-être juste rechargé sa page : nouvel essai automatique toutes les 10 s pendant 3 min.
    const retries = Number(store.get('online-retry') || 0);
    const autoRetry = (why: string) => {
      if (sim.winner >= 0) return;
      wait.hidden = false;
      const n = Number(store.get('online-retry') || 0);
      wait.innerHTML = `<div>${why}</div><small>${n < 18 ? 'Nouvel essai automatique dans 10 s…' : 'L\'hôte ne revient pas.'}</small><br><button id="nw-re">Se reconnecter</button> <button id="nw-solo">Continuer contre l\'IA</button>`;
      document.getElementById('nw-re')!.onclick = () => { store.set('online-retry', String(n + 1)); relaunch(); };
      document.getElementById('nw-solo')!.onclick = () => { clearTimeout(retryT); store.del('online-retry'); wait.hidden = true; on.goSolo(); store.del('online'); };
      const retryT = n < 18 ? setTimeout(() => { store.set('online-retry', String(n + 1)); relaunch(); }, 10000) : 0;
    };
    on.onLost = () => autoRetry('Connexion perdue avec l\'hôte.');
    // Messages entre joueurs : phrases rapides, texte libre, signal sur la carte.
    const chatEl = document.getElementById('chat')!, logEl = document.getElementById('chatlog')!, txt = document.getElementById('ch-text') as HTMLInputElement;
    const COLS = ['#ff9c4a', '#4fc3ff', '#7dffb0', '#ffd34a'];
    on.onChat = (from, text, team, ping) => {
      const d = document.createElement('div');
      d.innerHTML = `<b style="color:${COLS[from] ?? '#fff'}">${on.name(from).replace(/[<>&]/g, '')}</b>${team ? ' <i>(équipe)</i>' : ''} : ${(text || (ping ? '📍' : '')).replace(/[<>&]/g, '')}`;
      logEl.appendChild(d); while (logEl.children.length > 6) logEl.firstChild!.remove();
      setTimeout(() => d.classList.add('old'), 9000); setTimeout(() => d.remove(), 10000);
      if (ping) { world.ping(new THREE.Vector3(ping.x, map.heightAt(ping.x, ping.z), ping.z), 0xffe07a); if (from !== cfg.me) hud.alert(ping.x, ping.z); }
      if (from !== cfg.me) audio.sfx('click', 0.5, 200);
    };
    const here = () => { const f = cam.target; return { x: f.x, z: f.z }; };
    const send = (text: string, ping?: { x: number; z: number }) => { on.say(text, (document.getElementById('ch-to') as HTMLSelectElement).value === 'team', ping); };
    const openChat = (o: boolean) => { chatEl.hidden = !o; if (o) setTimeout(() => txt.focus(), 30); else txt.blur(); };
    document.getElementById('btn-chat')!.addEventListener('click', () => openChat(chatEl.hidden));
    document.getElementById('ch-close')!.addEventListener('click', () => openChat(false));
    document.getElementById('ch-send')!.addEventListener('click', () => { send(txt.value); txt.value = ''; openChat(false); });
    txt.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { send(txt.value); txt.value = ''; openChat(false); } else if (e.key === 'Escape') openChat(false); });
    chatEl.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => b.addEventListener('click', () => { send(b.dataset.q!, /ici|Défends/.test(b.dataset.q!) ? here() : undefined); openChat(false); }));
    chatEl.querySelector('[data-ping]')!.addEventListener('click', () => { send('', here()); openChat(false); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Enter' && chatEl.hidden && document.body.classList.contains('playing') && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); openChat(true); } });
    on.onBye = () => { store.del('online'); store.del('online-retry'); hud.toast('L\'hôte a quitté : tu continues contre l\'IA'); };
    const wait = document.getElementById('netwait')!;
    const showWait = (t: string, back = false) => {
      wait.hidden = false; wait.innerHTML = `<div>${t}</div>${back ? '<button id="nw-back">Retour au menu</button>' : ''}`;
      if (back) document.getElementById('nw-back')!.onclick = () => { on.close(); store.del('online'); store.del('online-go'); relaunch(); };
    };
    hud.setLevel('#En ligne · ' + cfg.sides[cfg.me].name);
    const sub = document.getElementById('load-sub')!; sub.style.display = ''; sub.textContent = 'CONNEXION À LA PARTIE EN LIGNE…';
    document.getElementById('menu')!.classList.remove('show');
    showWait(cfg.host ? 'Ouverture de la partie…' : 'Connexion à l\'hôte…', true);
    on.onStart = () => {
      wait.hidden = true; started = true; store.del('online-retry');
      if (cfg.host) store.set('online-go', cfg.nonce);
      window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
      hud.hideLoading(); document.body.classList.add('playing');
      cam.focus(map.starts[cfg.me].x, map.starts[cfg.me].z + 6); cam.dist = 52;
      const allies = cfg.sides.filter((x, i) => i !== cfg.me && x.team === cfg.sides[cfg.me].team).map((x) => x.name);
      hud.toast(`Partie en ligne · ${sim.factionName(cfg.me)}${allies.length ? ' · allié : ' + allies.join(', ') : ''}`);
    };
    const tick = setInterval(() => {
      if (on.started) { clearInterval(tick); return; }
      if (cfg.host && on.waitingFor.length) showWait('En attente de : ' + on.waitingFor.join(', ') + '<br><small>Sans eux sous 45 s, l\'IA prendra leur place.</small>', true);
    }, 500);
    // Hôte de retour : sauvegarde régulière du journal, et reprise immédiate si on revient d'un rechargement.
    if (cfg.host) {
      const keep = () => { if (on.started && sim.winner < 0) store.set('online-host', JSON.stringify(on.snapshot())); };
      setInterval(keep, 5000); window.addEventListener('pagehide', keep);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') keep(); });
    }
    if (hostSave) { on.resumeHost(hostSave); on.onStart(); hud.toast('Reprise de la partie : les autres joueurs se reconnectent…'); }
    on.connect().catch((e) => {
      if (!cfg.host && retries > 0 && retries < 18) { autoRetry('L\'hôte n\'est pas encore revenu.'); return; }
      showWait('Connexion impossible : ' + (e?.message || e) + '<br><small>L\'hôte a peut-être quitté la partie, ou le réseau bloque la connexion directe.</small>', true);
    });
    (window as any).__ready = true;
    (window as any).__game.online = on;
    return;
  }
  // --- Défi (tutoriel ou scénario) : carte fixe, préparée puis lancée aussitôt.
  // --- Banc d'essai des animations : chaque unité face à une cible, sans brouillard ni IA.
  if (store.get('scenario') === 'banc' && seed === SCEN_MAP.seed && size === SCEN_MAP.size && kind === SCEN_MAP.kind && players === 'duel') {
    store.del('scenario');
    opts = { doctrine: 'industrielle', fog: false, blitz: false, storms: false, contested: false, res: 'normales', faction: 0 };
    applyOpts(false);
    ais = []; started = true; recording = false;
    hud.setLevel('#Banc d\'essai');
    document.getElementById('hint')!.classList.add('gone');
    hud.hideLoading(); document.body.classList.add('playing', 'bench');
    window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
    bench = new Bench(sim, {
      focus: (x, z, d) => { cam.focus(x, z); cam.dist = d; },
      speed: (k) => { speed = k; paintSpeed(); },
      quit: () => newGame(),
      info: (id) => units?.animInfo(id) ?? '',
      // Vue de côté (caméra basse, unité vue de profil) et rotation autour d'elle.
      follow: (x, z) => { cam.focus(cam.target.x + (x - cam.target.x) * 0.08, cam.target.z + (z - cam.target.z) * 0.08); },
      view: (side, turn) => { cam.pitch = side ? 0.42 : null; if (side && !turn && !cam.orbit) cam.orbit = Math.atan2(-(map.starts[1].z - map.starts[0].z), map.starts[1].x - map.starts[0].x); cam.orbit += turn; cam.focus(cam.target.x, cam.target.z); },
    });
    (window as any).__ready = true; (window as any).__game.bench = bench;
    return;
  }
  const sid = store.get('scenario') as ScenId | null;
  if (sid && SCENARIOS[sid] && seed === SCEN_MAP.seed && size === SCEN_MAP.size && kind === SCEN_MAP.kind && players === 'duel') {
    store.del('scenario');
    let o: Record<string, string> = {}; try { o = JSON.parse(store.get('options') || '{}'); } catch { /* défaut */ }
    scen = new Scenario(sim, sid);
    opts = { doctrine: (o.doctrine || 'industrielle') as Doctrine, fog: sid === 'tuto' || sid === 'course', blitz: false, storms: false, contested: false, res: 'normales', faction: Math.max(0, Math.min(3, +(o.faction ?? 0) || 0)) };
    applyOpts(false);
    scen.setup();
    const ia = scen.info.ia; ais = ia ? [new Ai(sim, 1, ia)] : []; ai = ais[0] ?? null;
    hud.setLevel('#' + scen.info.nom); recording = false; started = true;
    const card = document.getElementById('scen')!; card.hidden = false;
    if (sid === 'tuto') tuto = new Tutorial(card);
    window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
    hud.hideLoading(); document.body.classList.add('playing');
    cam.focus(map.starts[0].x, map.starts[0].z + 6); cam.dist = sid === 'raid' ? 46 : 52;
    if (sid === 'raid') { const u = sim.units.find((x) => x.owner === 0 && x.kind === 'blinde'); if (u) cam.focus(u.x, u.z); }
    hud.toast(scen.info.nom + ' : ' + scen.info.but); document.getElementById('hint')!.classList.add('gone');
    (window as any).__ready = true;
    return;
  }
  // --- Rediffusion de la dernière partie.
  let last: SaveGame | null = null; try { last = JSON.parse(store.get('derniere') || 'null'); } catch { /* aucune */ }
  if (store.get('revoir') === '1' && last && last.seed === seed && last.size === size && last.kind === kind && (last.players ?? 'duel') === players) {
    store.del('revoir');
    level = last.level;
    opts = { doctrine: (last.doctrine || '') as Doctrine, fog: false, blitz: !!last.blitz, storms: !!last.storms, contested: !!last.contested, res: last.ressources || 'normales', faction: last.faction ?? 0 };
    if (players === 'equipes') sim.setTeams([0, 1, 0, 1]);
    applyOpts(false);
    ais = sim.sides.slice(1).map((o) => new Ai(sim, o, last!.level as Level)); ai = ais[0];
    replay = { orders: last.orders, i: 0, total: last.tick };
    SPEEDS = [1, 2, 4, 8]; speed = 2; paintSpeed();
    hud.setLevel('#Rediffusion'); recording = false; started = true;
    document.getElementById('rbar')!.hidden = false;
    document.getElementById('rb-speed')!.addEventListener('click', () => { speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]; paintSpeed(); });
    document.getElementById('rb-pause')!.addEventListener('click', togglePause);
    document.getElementById('rb-quit')!.addEventListener('click', newGame);
    window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
    hud.hideLoading(); document.body.classList.add('playing');
    cam.focus(map.starts[0].x, map.starts[0].z + 6); cam.dist = 60;
    hud.toast('Rediffusion : tu regardes ta dernière partie (sans brouillard)'); document.getElementById('hint')!.classList.add('gone');
    (window as any).__ready = true;
    return;
  }
  // Reprise : on rejoue la partie sauvegardée, par tranches, avec une barre de progression.
  if (store.get('reprendre') === '1' && saved && saved.seed === seed && saved.size === size && saved.kind === kind && (saved.players ?? 'duel') === players) {
    store.del('reprendre');
    const lv = saved.level; level = lv;
    opts = { doctrine: (saved.doctrine || '') as Doctrine, fog: !!saved.fog, blitz: !!saved.blitz, storms: !!saved.storms, contested: !!saved.contested, res: saved.ressources || 'normales', faction: saved.faction ?? 0 };
    if (players === 'equipes') sim.setTeams([0, 1, 0, 1]);
    applyOpts(false);
    ais = sim.sides.slice(1).map((o) => new Ai(sim, o, lv as Level)); ai = ais[0]; hud.setLevel(lv);
    document.getElementById('load-sub')!.textContent = 'REPRISE DE LA PARTIE…';
    let idx = 0;
    const chunk = () => {
      idx = replayTo(sim, ais, saved.orders, idx, Math.min(saved.tick, sim.tick + 300), () => { for (const e of sim.events) if (e.t === 'depleted') world.hideResource(e.node); });
      hud.setLoading(sim.tick / Math.max(1, saved.tick));
      if (sim.tick < saved.tick && sim.winner < 0) { setTimeout(chunk, 0); return; }
      log = saved.orders.slice(); recording = true; savedAt = sim.tick; started = true;
      hud.hideLoading(); document.body.classList.add('playing');
      cam.focus(map.starts[0].x, map.starts[0].z + 6); cam.dist = 52;
      audio.unlock();
      hud.toast(`Partie reprise · ${Math.floor(sim.tick / 600)} min`);
      if (sim.storm) { world.stormTarget = 1; document.getElementById('stormfx')!.classList.add('on'); }
    };
    setTimeout(chunk, 50);
    (window as any).__ready = true;
    return;
  }
  // Démarrage direct après le choix d'une nouvelle carte dans le menu.
  if (store.get('autostart') === '1') {
    store.del('autostart');
    let o: Record<string, string> = {}; try { o = JSON.parse(store.get('options') || '{}'); } catch { /* options par défaut */ }
    window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
    hud.hideLoading(); document.body.classList.add('playing');
    start(store.get('niveau') || 'normal', store.get('mode') || 'joueur', o);
    (window as any).__ready = true;
    return;
  }
  // Musique dès le menu : le navigateur exige un premier geste, on la lance au premier toucher.
  const menuMusic = () => { if (!audio.muted) audio.unlock(); };
  window.addEventListener('pointerdown', menuMusic, { once: true });
  window.addEventListener('keydown', menuMusic, { once: true });
  const K: Record<string, string> = { terre: 'Terre ferme', cotiere: 'Côtière', continentale: 'Continentale', mont: 'Mont de solarite', rivieres: 'Rivières', grandesiles: 'Grandes îles', petitesiles: 'Petites îles' };
  const lobby = new Lobby((cfg) => {
    store.set('online', JSON.stringify(cfg)); store.del('online-go');
    document.getElementById('online')!.hidden = true;
    document.getElementById('menu')!.classList.remove('show');
    const sub = document.getElementById('load-sub')!; sub.style.display = ''; sub.textContent = 'PRÉPARATION DE LA PARTIE EN LIGNE…';
    relaunch();
  });
  document.getElementById('btn-online')!.addEventListener('click', () => { audio.unlock(); audio.sfx('click'); lobby.open(); });
  const salon = /^#salon-([A-Za-z0-9]{4,8})$/.exec(location.hash);
  if (salon) { history.replaceState(null, '', location.href.split('#')[0]); lobby.open(salon[1].toUpperCase()); }
  hud.menu({ level: store.get('niveau') || 'normal', size, kind, seed, players, mode: store.get('mode') || 'joueur', opts: (() => { try { return { doctrine: 'industrielle', brouillard: 'oui', duree: 'normale', evenements: 'non', centre: 'calme', ressources: 'normales', faction: '0', ...JSON.parse(store.get('options') || '{}') }; } catch { return { doctrine: 'industrielle', brouillard: 'oui', duree: 'normale', evenements: 'non', centre: 'calme', ressources: 'normales', faction: '0' }; } })(),
    resume: (() => { const all = SLOTS.map(readSlot).filter((d): d is SaveGame => !!d); return !all.length ? null : all.length > 1 ? `Reprendre une partie (${all.length})` : `Reprendre · ${Math.floor(all[0].tick / 600)} min · ${K[all[0].kind] ?? ''}`; })(),
    replay: (() => { const r = replays(); return !r.length ? null : r.length > 1 ? `Rediffusions (${r.length})` : `Revoir la dernière partie · ${Math.floor(r[0].tick / 600)} min`; })() }, {
    replay: () => { const r = replays(); if (r.length <= 1) { watchLast(r[0]); return; } picker('Rediffusions', r.map((d) => ({ label: `${d.result ?? 'Partie'} · ${Math.floor(d.tick / 600)} min`, sub: describe(d), act: () => watchLast(d) }))); },
    scenario: (id, o) => {
      audio.unlock(); audio.sfx('click'); store.del('campagne-mission');
      store.set('options', JSON.stringify(o)); store.set('scenario', id);
      store.set('graine', String(SCEN_MAP.seed)); store.set('taille', SCEN_MAP.size); store.set('terrain', SCEN_MAP.kind); store.set('joueurs', SCEN_MAP.players);
      document.getElementById('menu')!.classList.remove('show');
      const sub = document.getElementById('load-sub')!; sub.style.display = ''; sub.textContent = 'PRÉPARATION DU DÉFI…';
      relaunch();
    },
    play: (lv, mode, o, m) => {
      audio.unlock(); audio.sfx('click'); store.del('campagne-mission');
      store.del('sauvegarde');
      if (m.seed !== seed || m.size !== size || m.kind !== kind || m.players !== players) {
        // Une autre carte a été choisie : on la construit (rechargement) et la partie démarre aussitôt.
        store.set('graine', String(m.seed)); store.set('taille', m.size); store.set('terrain', m.kind); store.set('joueurs', m.players);
        store.set('niveau', lv); store.set('mode', mode); store.set('options', JSON.stringify(o)); store.set('autostart', '1');
        document.getElementById('menu')!.classList.remove('show');
        const sub = document.getElementById('load-sub')!; sub.style.display = ''; sub.textContent = 'PRÉPARATION DE LA CARTE…';
        relaunch();
        return;
      }
      hud.hideLoading(); document.body.classList.add('playing');
      start(lv, mode, o);
    },
    resume: () => {
      const go = (d: SaveGame) => { store.set('sauvegarde', JSON.stringify(d)); resumeFrom(d); };
      const all = SLOTS.map((k) => ({ k, d: readSlot(k) })).filter((x) => !!x.d) as { k: string; d: SaveGame }[];
      if (all.length === 1) { go(all[0].d); return; }
      picker('Reprendre une partie', all.map(({ k, d }) => ({ label: k === 'sauvegarde' ? 'Sauvegarde automatique' : 'Emplacement ' + k.slice(4), sub: describe(d), act: () => go(d) })));
    },
    rot: togglePivot,
    sound: () => { audio.unlock(); audio.setMuted(!audio.muted); store.set('muet', audio.muted ? '1' : '0'); paintSound(); return audio.muted ? '♪ Son coupé' : '♪ Son activé'; },
  });
  const resumeFrom = (saved: SaveGame) => {
    {
      store.set('graine', String(saved.seed)); store.set('taille', saved.size); store.set('terrain', saved.kind); store.set('niveau', saved.level); store.set('joueurs', saved.players ?? 'duel');
      store.set('reprendre', '1');
      relaunch();
    }
  };
  (window as any).__ready = true;
});
(window as any).__game = { cam, world, map, sim, game, THREE, audio, tick: stepOnce, fx, hud, get units() { return units; } };
requestAnimationFrame(frame);
