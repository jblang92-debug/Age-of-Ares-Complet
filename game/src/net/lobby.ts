// Salon en ligne : l'hôte crée un code, ses amis le rejoignent, chacun choisit faction et équipe,
// l'hôte règle la carte et les places vides (IA ou fermées), puis lance la partie.
import { loadRelay } from './turn';
import { Host, Guest, randomCode, cleanCode, type Msg } from './net';
import { GAME } from '../data/rules';

export type SlotKind = 'humain' | 'ouvert' | 'ia-facile' | 'ia-normal' | 'ia-difficile' | 'ferme';
export interface Slot { kind: SlotKind; name?: string; token?: string; conn?: string; faction: number; team: number; ready?: boolean }
export interface LobbyState { code: string; slots: Slot[]; size: string; kind: string; res: string; fog: boolean }
/** Configuration d'une partie en ligne, gardée par chaque joueur (sert aussi à revenir après une coupure). */
export interface OnlineConfig {
  code: string; nonce: string; seed: number; size: string; kind: string; players: 'duel' | 'ffa'; res: string; fog: boolean;
  sides: { name: string; human: boolean; level: string; faction: number; team: number; token?: string }[];
  me: number; host: boolean; token: string; at: number;
}

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* indisponible */ } } };
export const myToken = () => { let t = ls.get('aoa-jeton'); if (!t) { t = randomCode(12); ls.set('aoa-jeton', t); } return t; };
const FAC = () => GAME.factions.map((f) => f.split(' ').pop()!);
const TEAMS = ['A', 'B', 'C', 'D'];
const KIND_TXT: Record<SlotKind, string> = { humain: 'Joueur', ouvert: 'Place libre', 'ia-facile': 'IA facile', 'ia-normal': 'IA normale', 'ia-difficile': 'IA difficile', ferme: 'Fermée' };
const SIZES: [string, string][] = [['petite', 'Petite'], ['moyenne', 'Moyenne'], ['grande', 'Grande']];
const KINDS: [string, string][] = [['terre', 'Terre ferme'], ['cotiere', 'Côtière'], ['continentale', 'Continentale'], ['mont', 'Mont de solarite'], ['rivieres', 'Rivières'], ['grandesiles', 'Grandes îles'], ['petitesiles', 'Petites îles']];
const RES: [string, string][] = [['normales', 'Normales'], ['riches', 'Riches']];
const KINDS_4 = new Set(['terre', 'continentale', 'rivieres', 'grandesiles']);

/** Lien à partager : ouvre le jeu directement sur le salon. */
export const shareLink = (code: string) => location.href.split('#')[0].split('?')[0] + '#salon-' + code;

export class Lobby {
  private host: Host | null = null;
  private guest: Guest | null = null;
  private st: LobbyState | null = null;
  private you = -1;
  private busy = false;
  constructor(private onGo: (cfg: OnlineConfig) => void) {}

  open(code?: string) {
    const el = $('online'); el.hidden = false;
    if (!this.st) this.paintStart(code);
  }
  private close() {
    this.host?.close(); this.guest?.close(); this.host = null; this.guest = null; this.st = null; this.you = -1;
    $('online').hidden = true;
  }
  private status(t: string, bad = false) { const s = document.querySelector<HTMLElement>('#online .on-status'); if (s) { s.textContent = t; s.classList.toggle('bad', bad); } }

  // ------------------------------------------------------------ écran d'accueil
  private paintStart(code?: string) {
    const name = ls.get('aoa-nom') || '';
    $('online').innerHTML = `<div class="on-box">
      <h3>Jouer en ligne</h3>
      <p class="on-help">Gratuit et sans compte : crée un salon, envoie le code ou le lien à tes amis (jusqu'à 4 joueurs, les places vides peuvent être des IA).</p>
      <label class="on-row"><span>Ton pseudo</span><input id="on-name" maxlength="14" value="${esc(name)}" placeholder="Commandant"/></label>
      <div class="on-row"><button id="on-create" class="on-main">Créer un salon</button></div>
      <div class="on-row"><input id="on-code" maxlength="8" placeholder="CODE" value="${esc(code ?? '')}" autocapitalize="characters"/><button id="on-join" class="on-main">Rejoindre</button></div>
      <p class="on-status"></p>
      <div class="on-row end"><button id="on-close">Fermer</button></div></div>`;
    $('on-close').onclick = () => this.close();
    $('on-create').onclick = () => this.create();
    $('on-join').onclick = () => this.join(cleanCode((($('on-code') as HTMLInputElement).value)));
    if (code) this.status('Code du salon rempli : choisis ton pseudo puis « Rejoindre ».');
  }
  private pseudo() { const v = (($('on-name') as HTMLInputElement).value || '').trim().slice(0, 14) || 'Commandant'; ls.set('aoa-nom', v); return v; }

  private async create() {
    if (this.busy) return; this.busy = true;
    const name = this.pseudo();
    this.status('Création du salon…');
    for (let tries = 0; tries < 3 && !this.host; tries++) {
      const code = randomCode(5);
      await loadRelay();
      try { this.host = await Host.open(code); this.st = { code, slots: [
        { kind: 'humain', name, token: myToken(), faction: 0, team: 0, ready: true },
        { kind: 'ouvert', faction: 1, team: 1 }, { kind: 'ferme', faction: 2, team: 2 }, { kind: 'ferme', faction: 3, team: 3 }], size: 'petite', kind: 'terre', res: 'normales', fog: true }; }
      catch (e: any) { if (e?.type !== 'unavailable-id') { this.status('Impossible de créer le salon : ' + (e?.message || e) + '. Vérifie ta connexion Internet.', true); break; } }
    }
    this.busy = false;
    if (!this.host || !this.st) return;
    this.you = 0;
    const h = this.host;
    h.onJoin = (id, meta) => {
      const st = this.st!; const tok = String(meta?.token || ''), nm = String(meta?.name || 'Invité').slice(0, 14);
      let i = st.slots.findIndex((s) => s.kind === 'humain' && s.token === tok && tok);
      if (i < 0) i = st.slots.findIndex((s) => s.kind === 'ouvert');
      if (i < 0) { h.send(id, { t: 'kick', why: 'Salon complet' }); setTimeout(() => h.drop(id), 300); return; }
      Object.assign(st.slots[i], { kind: 'humain', name: nm, token: tok, conn: id, ready: false });
      this.sync();
    };
    h.onLeave = (id) => { const s = this.st?.slots.find((x) => x.conn === id); if (s) { Object.assign(s, { kind: 'ouvert', name: undefined, token: undefined, conn: undefined, ready: false }); this.sync(); } };
    h.onMsg = (id, m) => {
      const s = this.st?.slots.find((x) => x.conn === id); if (!s) return;
      if (m.t === 'set') { if (m.faction !== undefined) s.faction = Math.max(0, Math.min(3, m.faction | 0)); if (m.team !== undefined) s.team = Math.max(0, Math.min(3, m.team | 0)); if (m.ready !== undefined) s.ready = !!m.ready; this.sync(); }
    };
    this.paintLobby();
  }

  private async join(code: string) {
    if (this.busy) return;
    if (code.length < 4) { this.status('Entre le code du salon (5 lettres).', true); return; }
    this.busy = true;
    const name = this.pseudo();
    this.status('Connexion au salon ' + code + '…');
    await loadRelay();
    try { this.guest = await Guest.connect(code, { name, token: myToken() }); }
    catch (e: any) { this.status(e?.message || 'Connexion impossible', true); this.busy = false; return; }
    this.busy = false;
    const g = this.guest;
    g.onMsg = (m: Msg) => {
      if (m.t === 'state') { this.st = m.st; this.you = m.you; this.paintLobby(); }
      else if (m.t === 'kick') { this.status(m.why || 'Refusé par l\'hôte', true); g.close(); this.guest = null; this.st = null; this.paintStart(code); this.status(m.why || 'Refusé', true); }
      else if (m.t === 'go') { const cfg = m.cfg as OnlineConfig; cfg.me = m.you; cfg.host = false; cfg.token = myToken(); cfg.at = Date.now(); this.onGo(cfg); }
    };
    g.onClose = () => { if (!this.st) return; this.st = null; this.paintStart(code); this.status('Connexion perdue avec l\'hôte.', true); };
    this.status('Connecté, en attente des informations du salon…');
  }

  /** Hôte : envoie l'état à chacun (avec sa place) et redessine. */
  private sync() {
    const h = this.host, st = this.st; if (!h || !st) return;
    for (const [id] of h.conns) { const you = st.slots.findIndex((s) => s.conn === id); h.send(id, { t: 'state', st: { ...st, slots: st.slots.map((s) => ({ ...s, token: undefined, conn: undefined })) }, you }); }
    this.paintLobby();
  }
  private set(patch: { faction?: number; team?: number; ready?: boolean }) {
    if (this.host && this.st) { Object.assign(this.st.slots[0], patch); this.sync(); }
    else this.guest?.send({ t: 'set', ...patch });
  }

  // ------------------------------------------------------------ salon
  private problems(): string[] {
    const st = this.st!; const act = st.slots.filter((s) => s.kind !== 'ferme' && s.kind !== 'ouvert');
    const out: string[] = [];
    if (st.slots.some((s) => s.kind === 'ouvert')) out.push('une place est encore libre : attends un ami, mets une IA ou ferme-la');
    if (act.length !== 2 && act.length !== 4) out.push(`il faut 2 ou 4 participants (actuellement ${act.length})`);
    if (act.length > 1 && new Set(act.map((s) => s.team)).size < 2) out.push('tout le monde est dans la même équipe');
    if (st.slots.some((s) => s.kind === 'humain' && !s.ready)) out.push('un joueur n\'est pas prêt');
    if (act.length === 4 && !KINDS_4.has(st.kind)) out.push('ce terrain se joue à 2 : choisis Terre ferme, Continentale, Rivières ou Grandes îles');
    return out;
  }
  private paintLobby() {
    const st = this.st; if (!st) return;
    const host = !!this.host, me = this.you;
    const fac = FAC();
    const opt = (list: [string, string][], v: string) => list.map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${t}</option>`).join('');
    const rows = st.slots.map((s, i) => {
      const mine = i === me, human = s.kind === 'humain', off = s.kind === 'ferme' || s.kind === 'ouvert';
      const who = human ? `<b>${esc(s.name || '?')}</b>${mine ? ' <i>(toi)</i>' : ''}${i === 0 ? ' <i>hôte</i>' : ''}`
        : host ? `<select data-k="${i}">${(['ouvert', 'ia-facile', 'ia-normal', 'ia-difficile', 'ferme'] as SlotKind[]).map((k) => `<option value="${k}"${k === s.kind ? ' selected' : ''}>${KIND_TXT[k]}</option>`).join('')}</select>` : `<span class="dim">${KIND_TXT[s.kind]}</span>`;
      const can = !off && (mine || (host && !human));
      const f = off ? '' : can ? `<select data-f="${i}">${fac.map((n, k) => `<option value="${k}"${k === s.faction ? ' selected' : ''}>${n}</option>`).join('')}</select>` : fac[s.faction];
      const t = off ? '' : can ? `<select data-t="${i}">${TEAMS.map((n, k) => `<option value="${k}"${k === s.team ? ' selected' : ''}>Équipe ${n}</option>`).join('')}</select>` : 'Équipe ' + TEAMS[s.team];
      const r = human ? (s.ready ? '<span class="ok">✔ prêt</span>' : '<span class="dim">…</span>') : s.kind.startsWith('ia') ? '<span class="ok">IA</span>' : '';
      return `<tr class="${mine ? 'me' : ''}${off ? ' off' : ''}"><td>${i + 1}</td><td>${who}</td><td>${f}</td><td>${t}</td><td>${r}</td></tr>`;
    }).join('');
    const pb = host ? this.problems() : [];
    const mapTxt = `${SIZES.find(([k]) => k === st.size)?.[1]} · ${KINDS.find(([k]) => k === st.kind)?.[1]} · ressources ${st.res} · brouillard ${st.fog ? 'oui' : 'non'}`;
    $('online').innerHTML = `<div class="on-box">
      <h3>Salon <span class="on-code">${st.code}</span></h3>
      <div class="on-row"><button id="on-share" class="on-main">Inviter (lien)</button><button id="on-copy">Copier le code</button></div>
      <table class="on-slots"><tr><th>#</th><th>Joueur</th><th>Faction</th><th>Équipe</th><th></th></tr>${rows}</table>
      <p class="on-help">Même équipe = alliés. Équipes toutes différentes = chacun pour soi.</p>
      ${host ? `<div class="on-row"><select id="on-size">${opt(SIZES, st.size)}</select><select id="on-kind">${opt(KINDS, st.kind)}</select><select id="on-res">${opt(RES, st.res)}</select><select id="on-fog"><option value="1"${st.fog ? ' selected' : ''}>Brouillard</option><option value="0"${!st.fog ? ' selected' : ''}>Sans brouillard</option></select></div>` : `<p class="on-help">Carte : ${mapTxt}</p>`}
      <p class="on-status${pb.length ? ' bad' : ''}">${host ? (pb.length ? 'Pour lancer : ' + pb.join(' ; ') + '.' : 'Tout est prêt !') : st.slots[me]?.ready ? 'Prêt : en attente du lancement par l\'hôte.' : 'Choisis ta faction et ton équipe, puis « Je suis prêt ».'}</p>
      <div class="on-row end"><button id="on-leave">Quitter le salon</button>${host ? `<button id="on-go" class="on-main"${pb.length ? ' disabled' : ''}>LANCER</button>` : `<button id="on-ready" class="on-main">${st.slots[me]?.ready ? 'Pas prêt' : 'Je suis prêt'}</button>`}</div></div>`;
    $('on-leave').onclick = () => this.close();
    $('on-copy').onclick = () => { try { navigator.clipboard.writeText(st.code); this.status('Code copié : ' + st.code); } catch { this.status('Code : ' + st.code); } };
    $('on-share').onclick = async () => {
      const url = shareLink(st.code), text = `Rejoins ma partie d'Age of Ares ! Code du salon : ${st.code}`;
      try { if (navigator.share) { await navigator.share({ title: 'Age of Ares', text, url }); return; } } catch { /* partage annulé */ }
      try { await navigator.clipboard.writeText(text + ' ' + url); this.status('Lien copié : colle-le à tes amis.'); } catch { this.status(url); }
    };
    const box = $('online');
    box.querySelectorAll<HTMLSelectElement>('select[data-f]').forEach((e) => e.onchange = () => { const i = +e.dataset.f!; if (i === me) this.set({ faction: +e.value }); else if (host) { st.slots[i].faction = +e.value; this.sync(); } });
    box.querySelectorAll<HTMLSelectElement>('select[data-t]').forEach((e) => e.onchange = () => { const i = +e.dataset.t!; if (i === me) this.set({ team: +e.value }); else if (host) { st.slots[i].team = +e.value; this.sync(); } });
    box.querySelectorAll<HTMLSelectElement>('select[data-k]').forEach((e) => e.onchange = () => { st.slots[+e.dataset.k!].kind = e.value as SlotKind; this.sync(); });
    if (host) {
      ($('on-size') as HTMLSelectElement).onchange = (e) => { st.size = (e.target as HTMLSelectElement).value; this.sync(); };
      ($('on-kind') as HTMLSelectElement).onchange = (e) => { st.kind = (e.target as HTMLSelectElement).value; this.sync(); };
      ($('on-res') as HTMLSelectElement).onchange = (e) => { st.res = (e.target as HTMLSelectElement).value; this.sync(); };
      ($('on-fog') as HTMLSelectElement).onchange = (e) => { st.fog = (e.target as HTMLSelectElement).value === '1'; this.sync(); };
      $('on-go').onclick = () => this.go();
    } else $('on-ready').onclick = () => this.set({ ready: !st.slots[me]?.ready });
  }

  /** Hôte : fige la configuration, l'envoie à tous, puis chacun charge la carte. */
  private go() {
    const h = this.host, st = this.st; if (!h || !st || this.problems().length) return;
    const act = st.slots.map((s, i) => ({ s, i })).filter(({ s }) => s.kind !== 'ferme' && s.kind !== 'ouvert');
    const base: OnlineConfig = {
      code: st.code, nonce: randomCode(4), seed: 1 + Math.floor(Math.random() * 999999), size: act.length === 4 && st.size === 'petite' ? 'moyenne' : st.size, kind: st.kind,
      players: act.length === 2 ? 'duel' : 'ffa', res: st.res, fog: st.fog,
      sides: act.map(({ s }) => ({ name: s.kind === 'humain' ? s.name || 'Joueur' : KIND_TXT[s.kind], human: s.kind === 'humain', level: s.kind.startsWith('ia-') ? s.kind.slice(3) : 'normal', faction: s.faction, team: s.team, token: s.token })),
      me: 0, host: true, token: myToken(), at: Date.now(),
    };
    for (const [id] of h.conns) { const you = act.findIndex(({ s }) => s.conn === id); if (you >= 0) h.send(id, { t: 'go', cfg: { ...base, sides: base.sides.map((x) => ({ ...x, token: undefined })), host: false }, you }); }
    this.status('Lancement…');
    // Laisse le temps aux messages de partir avant de fermer le salon.
    setTimeout(() => { h.close(); this.onGo({ ...base, me: act.findIndex(({ i }) => i === 0) }); }, 900);
  }
}
