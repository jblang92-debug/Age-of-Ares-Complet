// Liaison réseau directe entre navigateurs (WebRTC via PeerJS) : gratuite, sans serveur de jeu.
// Le serveur public de PeerJS ne sert qu'à se trouver ; les données passent ensuite d'appareil à appareil.
import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { relayIce } from './turn';

const PREFIX = 'ageofares-v1-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const randomCode = (n = 5) => Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

/** Options PeerJS : ?peer=hote:port pour un serveur local (tests), sinon le service public gratuit. */
function opts(): PeerOptions {
  const ice = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }, ...relayIce()] };
  let q: string | null = null;
  try { q = new URLSearchParams(location.search).get('peer'); } catch { /* adresse illisible */ }
  if (q) { const [host, port] = q.split(':'); return { host, port: +port || 9000, path: '/', secure: false, debug: +(new URLSearchParams(location.search).get('peerdebug') ?? 1), config: ice }; }
  return { debug: 1, config: ice };
}

export type Msg = Record<string, any>;

/** Côté hôte : un identifiant connu de tous (le code du salon), les invités s'y connectent. */
export class Host {
  readonly conns = new Map<string, DataConnection>();
  onJoin: (id: string, meta: any) => void = () => {};
  onMsg: (id: string, m: Msg) => void = () => {};
  onLeave: (id: string) => void = () => {};
  onLost: () => void = () => {};
  private constructor(readonly peer: Peer) {}
  /** Comme open(), mais réessaie tant que l'ancien identifiant n'est pas libéré (hôte qui revient après un rechargement). */
  static async reopen(name: string, tries = 10): Promise<Host> {
    for (let i = 0; ; i++) {
      try { return await Host.open(name, 15000); }
      catch (e: any) { if (i >= tries - 1 || e?.type !== 'unavailable-id') throw e; await new Promise((r) => setTimeout(r, 3000)); }
    }
  }
  static open(name: string, timeout = 15000): Promise<Host> {
    return new Promise((ok, ko) => {
      const peer = new Peer(PREFIX + name, opts());
      const h = new Host(peer);
      const t = setTimeout(() => { peer.destroy(); ko(new Error('délai dépassé')); }, timeout);
      peer.on('open', () => { clearTimeout(t); ok(h); });
      peer.on('error', (e: any) => { clearTimeout(t); if (!peer.open) { peer.destroy(); ko(e); } });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch { h.onLost(); } });
      peer.on('connection', (c) => {
        c.on('open', () => { h.conns.set(c.connectionId, c); h.onJoin(c.connectionId, c.metadata); });
        c.on('data', (d) => h.onMsg(c.connectionId, d as Msg));
        const gone = () => { if (h.conns.delete(c.connectionId)) h.onLeave(c.connectionId); };
        c.on('close', gone); c.on('error', gone);
        // Sur téléphone, une connexion coupée ne prévient pas toujours : surveillance de l'état ICE.
        c.on('iceStateChanged', (s: string) => { if (s === 'failed' || s === 'closed') { gone(); try { c.close(); } catch { /* déjà fermée */ } } });
      });
    });
  }
  send(id: string, m: Msg) { const c = this.conns.get(id); if (c?.open) c.send(m); }
  broadcast(m: Msg) { for (const c of this.conns.values()) if (c.open) c.send(m); }
  drop(id: string) { const c = this.conns.get(id); this.conns.delete(id); try { c?.close(); } catch { /* déjà fermée */ } }
  close() { try { this.peer.destroy(); } catch { /* déjà fermé */ } }
}

/** Côté invité : une seule connexion, vers l'hôte. */
export class Guest {
  onMsg: (m: Msg) => void = () => {};
  onClose: () => void = () => {};
  private closed = false;
  private constructor(readonly peer: Peer, readonly conn: DataConnection) {}
  static connect(name: string, meta: any, timeout = 30000): Promise<Guest> {
    return new Promise((ok, ko) => {
      const peer = new Peer(opts());
      const t = setTimeout(() => { peer.destroy(); ko(new Error('Connexion trop lente ou bloquée (délai dépassé)')); }, timeout);
      peer.on('error', (e: any) => { clearTimeout(t); peer.destroy(); ko(e?.type === 'peer-unavailable' ? new Error('Salon introuvable : vérifie le code') : e); });
      peer.on('open', () => {
        const c = peer.connect(PREFIX + name, { metadata: meta, reliable: true, serialization: 'json' });
        const g = new Guest(peer, c);
        c.on('open', () => { clearTimeout(t); ok(g); });
        c.on('data', (d) => g.onMsg(d as Msg));
        const gone = () => { if (!g.closed) { g.closed = true; g.onClose(); } };
        c.on('close', gone); c.on('error', gone);
        c.on('iceStateChanged', (s: string) => { if (s === 'failed' || s === 'closed') gone(); });
      });
    });
  }
  send(m: Msg) { if (this.conn.open) this.conn.send(m); }
  close() { this.closed = true; try { this.peer.destroy(); } catch { /* déjà fermé */ } }
}
