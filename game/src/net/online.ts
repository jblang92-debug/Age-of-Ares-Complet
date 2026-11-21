// Partie en ligne : « lockstep » piloté par l'hôte. La simulation est déterministe, seuls les ordres circulent.
// L'hôte numérote chaque ordre avec le tick où il s'appliquera et annonce jusqu'où chacun peut avancer (upTo).
import { Host, Guest, type Msg } from './net';
import { loadRelay } from './turn';
import type { Sim, Order } from '../sim/sim';
import type { OnlineConfig } from './lobby';

/** Ordre réseau : [tick, camp, ordre] ; un ordre spécial bascule un camp en IA (joueur parti) ou le rend au joueur. */
export type NetCmd = [number, number, Order | { type: '__ia'; on: boolean }];
const LEAD = 3;          // avance de l'hôte (ticks de 100 ms) : délai d'exécution des ordres
const SLACK = 40;        // l'hôte attend un invité qui a plus de 4 s de retard
const WAIT_START = 45;   // s : au-delà, un joueur absent au départ est remplacé par l'IA

export function simHash(sim: Sim): number {
  let h = sim.tick | 0;
  for (const u of sim.units) h = (Math.imul(h, 31) + Math.round(u.x * 64) * 7 + Math.round(u.z * 64) * 13 + Math.round(u.hp)) | 0;
  for (const b of sim.buildings) h = (Math.imul(h, 17) + Math.round(b.hp) + b.queue.length) | 0;
  for (const p of sim.players) h = (Math.imul(h, 7) + Math.round(p.minerai + p.eau * 3 + p.energie * 5 + p.bois * 11)) | 0;
  return h;
}

export class Online {
  /** Tous les ordres, dans l'ordre d'application (l'hôte les garde pour les retours en cours de partie). */
  log: NetCmd[] = [];
  private next = 0;           // prochain ordre du journal à appliquer
  upTo = 0;                   // la simulation peut calculer les ticks < upTo
  started = false;
  hostGone = false;
  /** Camps actuellement joués par l'IA à la place d'un humain. */
  readonly aiSides = new Set<number>();
  waitingFor: string[] = [];
  onIa: (side: number, on: boolean) => void = () => {};
  onInfo: (text: string, bad?: boolean) => void = () => {};
  onStart: () => void = () => {};
  /** Invité : la liaison avec l'hôte est coupée (l'interface propose de se reconnecter ou de continuer seul). */
  onLost: () => void = () => {};
  lost = false;
  lastTurn = 0;
  private pingTimer = 0;
  /** Invité : rattrapage en cours (ticks restants). */
  catching = 0;
  private host: Host | null = null;
  private guest: Guest | null = null;
  private connOf = new Map<string, number>();       // connexion -> camp
  private connected = new Set<number>();            // camps humains présents
  private ack = new Map<number, number>();          // camp -> dernier tick confirmé
  private hashes = new Map<number, number>();
  private seen = new Map<string, number>();         // connexion -> dernier message reçu (ms)
  private desynced = false;
  private startedAt = 0;
  /** Hôte revenu après un rechargement : il rejoue la partie jusqu'à ce tick, puis attend le retour des joueurs (60 s au plus). */
  private resumeTo = 0;
  private resumeAt = 0;
  get resuming() { return this.resumeAt > 0; }

  constructor(readonly cfg: OnlineConfig, private sim: Sim) {}
  get gameId() { return this.cfg.code + '-' + this.cfg.nonce; }
  name(side: number) { return this.cfg.sides[side]?.name ?? '?'; }

  /** Reprise par l'hôte : journal et limite sauvegardés avant le rechargement. */
  resumeHost(s: { log: NetCmd[]; upTo: number; tick: number }) {
    this.log = s.log; this.upTo = s.upTo; this.resumeTo = s.tick; this.resumeAt = performance.now(); this.started = true; this.pending = [];
  }
  /** Ce qu'il faut garder pour reprendre la partie (hôte). */
  snapshot() { return { nonce: this.cfg.nonce, log: this.log.slice(0, this.log.length - this.pending.length), upTo: this.upTo, tick: this.sim.tick }; }
  async connect() {
    await loadRelay();
    if (this.cfg.host) {
      this.host = this.resuming ? await Host.reopen(this.gameId) : await Host.open(this.gameId, 20000);
      const h = this.host;
      this.connected.add(this.cfg.me);
      h.onJoin = (id, meta) => {
        const side = this.cfg.sides.findIndex((s, i) => s.human && i !== this.cfg.me && s.token && s.token === meta?.token);
        if (side < 0) { h.send(id, { t: 'refuse', why: 'Tu ne fais pas partie de cette partie.' }); setTimeout(() => h.drop(id), 300); return; }
        this.connOf.set(id, side); this.connected.add(side); this.ack.set(side, this.started ? this.sim.tick : 0); this.seen.set(id, performance.now());
        // Les ordres pas encore diffusés partiront avec le prochain tour : on ne les envoie pas deux fois.
        h.send(id, { t: 'sync', log: this.log.slice(0, this.log.length - this.pending.length), upTo: this.upTo, started: this.started });
        if (this.started) {
          if (this.aiSides.has(side)) this.schedule(side, { type: '__ia', on: false });
          this.onInfo(this.name(side) + ' a rejoint la partie');
        }
        this.refreshWait();
      };
      h.onLeave = (id) => {
        this.seen.delete(id);
        const side = this.connOf.get(id); this.connOf.delete(id); if (side === undefined) return;
        if ([...this.connOf.values()].includes(side)) return;
        this.connected.delete(side); this.ack.delete(side);
        if (this.started) { this.schedule(side, { type: '__ia', on: true }); this.onInfo(this.name(side) + ' est déconnecté : l\'IA prend le relais', true); }
        this.refreshWait();
      };
      h.onMsg = (id, m) => {
        this.seen.set(id, performance.now());
        const side = this.connOf.get(id); if (side === undefined) return;
        if (m.t === 'cmd' && this.started && m.o && typeof m.o === 'object' && m.o.type !== '__ia') this.schedule(side, m.o);
        else if (m.t === 'ack') this.ack.set(side, m.tick | 0);
        else if (m.t === 'hash') this.checkHash(side, m.tick, m.h);
        else if (m.t === 'chat' && typeof m.text === 'string') this.relayChat(side, m.text.slice(0, 120), !!m.team, m.ping);
      };
      this.startedAt = performance.now();
      this.refreshWait();
    } else {
      // Deux essais : la première négociation peut échouer sur un réseau mobile lent.
      try { this.guest = await Guest.connect(this.gameId, { token: this.cfg.token, name: this.cfg.sides[this.cfg.me]?.name }, 40000); }
      catch (e: any) { if (/introuvable/i.test(e?.message ?? '') && !/délai|injoignable/.test(e?.message ?? '')) throw e; this.onInfo('Nouvel essai de connexion…'); this.guest = await Guest.connect(this.gameId, { token: this.cfg.token, name: this.cfg.sides[this.cfg.me]?.name }, 40000); }
      const g = this.guest;
      g.onMsg = (m: Msg) => {
        if (m.t === 'sync') { this.log = m.log; this.upTo = m.upTo; this.applyIaFlags(); if (m.started) this.begin(); else this.onInfo('Connecté : en attente des autres joueurs…'); }
        else if (m.t === 'turn') { this.lastTurn = performance.now(); for (const c of m.cmds as NetCmd[]) this.log.push(c); this.upTo = Math.max(this.upTo, m.upTo); if (!this.started) this.begin(); }
        else if (m.t === 'refuse') { this.onInfo(m.why, true); g.close(); }
        else if (m.t === 'chat') this.gotChat(m.from | 0, String(m.text), !!m.team, m.ping);
        else if (m.t === 'bye') { this.lost = true; this.goSolo(); this.onBye(); }
        else if (m.t === 'desync') this.onInfo('Désynchronisation détectée : la partie peut diverger', true);
        else if (m.t === 'info') this.onInfo(m.text, !!m.bad);
      };
      g.onClose = () => { if (this.lost) return; this.lost = true; this.onLost(); };
      // Signe de vie régulier, même si l'affichage ralentit (onglet en arrière-plan).
      this.pingTimer = window.setInterval(() => { if (!this.lost) g.send({ t: 'ack', tick: this.sim.tick }); }, 2000);
    }
  }
  /** Avant le départ, les invités savent quels camps sont déjà passés à l'IA (cas d'un retour). */
  private applyIaFlags() { for (const [, side, o] of this.log) if ((o as any).type === '__ia') { if ((o as any).on) this.aiSides.add(side); else this.aiSides.delete(side); } }
  private begin() { if (this.started) return; this.started = true; this.onStart(); }

  private refreshWait() {
    if (!this.host) return;
    const missing = this.cfg.sides.map((s, i) => ({ s, i })).filter(({ s, i }) => s.human && !this.connected.has(i));
    this.waitingFor = missing.map(({ s }) => s.name);
    if (!this.started && (!missing.length || (performance.now() - this.startedAt) / 1000 > WAIT_START)) {
      for (const { i } of missing) this.log.push([0, i, { type: '__ia', on: true }]);
      this.started = true;
      this.upTo = LEAD; this.host.broadcast({ t: 'turn', upTo: this.upTo, cmds: this.log });
      this.applyIaFlags();
      this.onStart();
    }
  }

  /** Ordre du joueur local : l'hôte le programme, un invité l'envoie à l'hôte. */
  local(o: Order) {
    if (this.hostGone) { this.log.push([this.sim.tick, this.cfg.me, o]); return; }
    if (this.host) this.schedule(this.cfg.me, o); else this.guest?.send({ t: 'cmd', o });
  }
  private pending: NetCmd[] = [];
  private schedule(side: number, o: NetCmd[2]) { const c: NetCmd = [Math.max(this.upTo, this.sim.tick), side, o]; this.log.push(c); this.pending.push(c); }

  /** Avant chaque tick : applique les ordres prévus pour ce tick. */
  apply(issue: (o: Order) => void) {
    const t = this.sim.tick;
    while (this.next < this.log.length && this.log[this.next][0] <= t) {
      const [, side, o] = this.log[this.next++];
      if ((o as any).type === '__ia') { const on = (o as any).on; if (on) this.aiSides.add(side); else this.aiSides.delete(side); this.onIa(side, on); }
      else { const ok = this.sim.own(o as Order, side); if (ok) issue(ok); }
    }
  }
  canStep() { return this.hostGone || (this.started && this.sim.tick < this.upTo); }
  /** Retard de l'invité sur ce que l'hôte a annoncé (en ticks). */
  behind() { return this.hostGone ? 0 : this.cfg.host ? Math.max(0, this.resumeTo - this.sim.tick) : this.upTo - this.sim.tick; }
  /** Retard normal d'un invité : l'avance de l'hôte plus la latence du réseau. */
  static readonly CATCHUP = LEAD + 5;

  /** À chaque image : l'hôte avance la limite et diffuse les nouveaux ordres ; l'invité confirme son avancement. */
  pump() {
    if (this.host) {
      // Un appareil qui ne donne plus de nouvelles depuis 12 s (écran éteint, réseau coupé) est considéré parti.
      const now = performance.now();
      for (const [id, t] of this.seen) if (now - t > 12000) { this.host.drop(id); this.host.onLeave(id); }
      if (!this.started) { this.refreshWait(); return; }
      if (this.resumeAt) {
        // Reprise : on rattrape la partie, puis on attend les joueurs humains (ils se reconnectent et rattrapent à leur tour).
        const missing = this.cfg.sides.map((x, i) => ({ x, i })).filter(({ x, i }) => x.human && i !== this.cfg.me && !this.connected.has(i) && !this.aiSides.has(i));
        this.waitingFor = missing.map(({ x }) => x.name);
        if (this.sim.tick < this.resumeTo) return;
        if (missing.length && (now - this.resumeAt) / 1000 < 60) return;
        for (const { i } of missing) { this.schedule(i, { type: '__ia', on: true }); this.onInfo(this.name(i) + ' n\'est pas revenu : l\'IA prend le relais', true); }
        this.resumeAt = 0;
      }
      const minAck = Math.min(this.sim.tick, ...[...this.ack.values()]);
      const slow = [...this.ack.entries()].filter(([, a]) => a < this.sim.tick - SLACK).map(([s]) => this.name(s));
      this.waitingFor = slow;
      const target = slow.length ? Math.max(this.upTo, minAck + SLACK) : this.sim.tick + LEAD;
      if (target > this.upTo || this.pending.length) {
        this.upTo = Math.max(this.upTo, target);
        this.host.broadcast({ t: 'turn', upTo: this.upTo, cmds: this.pending });
        this.pending = [];
      }
      if (this.sim.tick % 50 === 0) this.hashes.set(this.sim.tick, simHash(this.sim));
    } else if (this.guest && !this.hostGone) {
      const t = this.sim.tick, now = performance.now();
      if (now - this.lastPing > 2000) { this.lastPing = now; this.guest.send({ t: 'ack', tick: t }); }
      if (!this.started) return;
      if (t !== this.lastAck && (t % 5 === 0 || this.upTo - t > 20)) { this.lastAck = t; this.guest.send({ t: 'ack', tick: t }); }
      if (t % 100 === 0 && t > 0 && t !== this.lastHash) { this.lastHash = t; this.guest.send({ t: 'hash', tick: t, h: simHash(this.sim) }); }
    }
  }
  private lastAck = -1;
  private lastPing = 0;
  private lastHash = -1;
  private checkHash(side: number, tick: number, h: number) {
    const mine = this.hashes.get(tick);
    if (mine !== undefined && mine !== h && !this.desynced) { this.desynced = true; this.onInfo('Désynchronisation avec ' + this.name(side) + ' : la partie peut diverger', true); this.host?.broadcast({ t: 'desync' }); }
    for (const k of this.hashes.keys()) if (k < tick - 500) this.hashes.delete(k);
  }
  /** L'hôte est parti : on continue seul, l'IA joue tous les autres humains. */
  goSolo() {
    this.hostGone = true; clearInterval(this.pingTimer);
    this.onInfo('L\'hôte a quitté la partie : tu continues contre l\'IA', true);
    this.cfg.sides.forEach((s, i) => { if (s.human && i !== this.cfg.me && !this.aiSides.has(i)) { this.aiSides.add(i); this.onIa(i, true); } });
    this.started = true;
  }
  close() { clearInterval(this.pingTimer); this.host?.close(); this.guest?.close(); }
  /** L'hôte quitte volontairement : les invités continuent aussitôt contre l'IA (sans attendre son retour). */
  quit() { if (this.host) { this.host.broadcast({ t: 'bye' }); setTimeout(() => this.close(), 400); } else this.close(); }
  onBye: () => void = () => {};
  /** Message reçu : expéditeur, texte, destiné à son équipe seulement, point signalé sur la carte. */
  onChat: (from: number, text: string, team: boolean, ping?: { x: number; z: number }) => void = () => {};
  /** Envoie un message (et éventuellement un signal sur la carte) aux autres joueurs, ou à son équipe. */
  say(text: string, team: boolean, ping?: { x: number; z: number }) {
    text = text.trim().slice(0, 120); if (!text && !ping) return;
    if (this.host) this.relayChat(this.cfg.me, text, team, ping);
    else if (this.guest && !this.lost) { this.guest.send({ t: 'chat', text, team, ping }); this.gotChat(this.cfg.me, text, team, ping); }
  }
  private relayChat(from: number, text: string, team: boolean, ping?: any) {
    const p = ping && Number.isFinite(ping.x) && Number.isFinite(ping.z) ? { x: +ping.x, z: +ping.z } : undefined;
    for (const [id, side] of this.connOf) if (side !== from && (!team || this.cfg.sides[side].team === this.cfg.sides[from].team)) this.host!.send(id, { t: 'chat', from, text, team, ping: p });
    if (from === this.cfg.me || !team || this.cfg.sides[this.cfg.me].team === this.cfg.sides[from].team) this.gotChat(from, text, team, p);
  }
  private gotChat(from: number, text: string, team: boolean, ping?: { x: number; z: number }) { this.onChat(from, text, team, ping); }
  /** Invité : plus de nouvelles de l'hôte depuis un moment (hôte en pause, réseau lent). */
  hostSilent() { return !!this.guest && this.started && !this.hostGone && !this.lost && performance.now() - this.lastTurn > 3000; }
}
