// Banc d'essai des animations : chaque unité du jeu, seule face à une cible invulnérable,
// avec des boutons pour la voir au repos, en marche, en tir (ou au travail), et mourir.
import type { Sim, Unit, UnitKind, Building } from '../sim/sim';
import { UNITS, BUILDINGS, GAME } from '../data/rules';

type Act = 'repos' | 'marche' | 'tir' | 'marchetir' | 'travail' | 'mort';
const $ = (id: string) => document.getElementById(id)!;
const r = (u: Unit) => UNITS[u.kind];

export class Bench {
  readonly kinds: UnitKind[];
  i = 0;
  act: Act = 'repos';
  auto = false;
  /** Filtre de l'Atelier : null = toutes, -1 = communes, sinon indice de faction. */
  fac: number | null = null;
  private u: Unit | null = null;
  /** Cible fixe et invulnérable (un habitat ennemi) : elle ne fuit pas, contrairement à une unité. */
  private dummy: Building | null = null;
  /** Cible des combattants au corps à corps : un ouvrier ennemi tenu sur place (sinon le mur du bâtiment cache le geste). */
  private dummyU: Unit | null = null;
  private x: number; private z: number; private dx: number; private dz: number;
  private leg = 0;
  private respawnAt = -1;
  private autoT = 0;
  side = true;
  constructor(private sim: Sim, private hooks: { focus: (x: number, z: number, d: number) => void; speed: (k: number) => void; quit: () => void; info: (id: number) => string; view: (side: boolean, turn: number) => void; follow: (x: number, z: number) => void }) {
    const a = sim.map.starts[0], b = sim.map.starts[1];
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    this.dx = (b.x - a.x) / L; this.dz = (b.z - a.z) / L;
    this.x = a.x + this.dx * L * 0.3; this.z = a.z + this.dz * L * 0.3;
    // Ordre : unités communes d'abord, puis par faction ; bâtiment de production pour regrouper.
    this.kinds = (Object.keys(UNITS) as UnitKind[]).sort((p, q) => ((UNITS[p].faction ?? -1) - (UNITS[q].faction ?? -1)) || (UNITS[p].ere - UNITS[q].ere));
    for (const P of sim.players) { P.ere = 6; P.eau = P.bois = P.minerai = P.energie = P.solarite = 99999; }
    this.dummy = sim.placeNear('habitat', 1, this.x + this.dx * 8, this.z + this.dz * 8);
    if (this.dummy) { this.dummy.progress = 1; this.dummy.done = true; }
    this.paint();
    this.hooks.view(true, 0);
    this.pick(0);
  }
  private get kind() { return this.kinds[this.i]; }
  /** Indices (dans kinds) des unités visibles avec le filtre courant. */
  private get shown() { return this.kinds.map((k, j) => j).filter((j) => this.fac === null || (UNITS[this.kinds[j]].faction ?? -1) === this.fac); }
  /** Unité suivante ou précédente dans la liste filtrée. */
  private nav(n: number) { const L = this.shown, p = L.indexOf(this.i); this.pick(L[((p < 0 ? 0 : p + n) % L.length + L.length) % L.length]); }

  /** Remplace l'unité en essai par une neuve de ce type, et sa cible. */
  pick(i: number) {
    this.i = (i + this.kinds.length) % this.kinds.length;
    this.clear();
    const k = this.kind, r = UNITS[k];
    // L'unité est placée à portée de tir de la cible (un peu en deçà).
    const T = this.dummy ?? { x: this.x + this.dx * 8, z: this.z + this.dz * 8, r: 2 };
    const d = (T.r ?? 2) + (r.degats > 0 ? Math.min(Math.max(r.portee * 0.75, 1.5), 9) : 6);
    this.x = T.x - this.dx * d; this.z = T.z - this.dz * d;
    const melee = r.degats > 0 && r.portee <= 1.5;
    if (melee) { this.x -= this.dx * 4; this.z -= this.dz * 4; }
    this.u = this.sim.spawn(k, 0, this.x, this.z);
    if (melee) {
      // Corps à corps : mannequin à découvert, à deux pas, de profil pour la caméra.
      this.dummyU = this.sim.spawn('ouvrier', 1, this.x + this.dx * 1.6, this.z + this.dz * 1.6);
      this.sim.issue({ type: 'posture', ids: [this.dummyU.id], posture: 'passive' });
    }
    this.hooks.focus(this.x + this.dx * Math.min(d * 0.25, 2), this.z + this.dz * Math.min(d * 0.25, 2), r.vole ? 22 : r.pv > 600 || (r as any).vitesse < 0 ? 17 : 10);
    this.go(this.act === 'mort' ? 'repos' : this.act);
    this.paint();
  }
  private clear() {
    if (this.u) this.u.hp = 0;   // retirée au prochain tick, sans animation de mort
    if (this.dummyU) this.dummyU.hp = 0;
    this.u = null; this.dummyU = null;
  }

  go(a: Act) {
    const u = this.u; if (!u) return;
    this.act = a; this.leg = 0;
    const id = [u.id];
    if (a === 'repos') { this.sim.issue({ type: 'posture', ids: id, posture: 'passive' }); this.sim.issue({ type: 'stop', ids: id }); }
    if (a === 'marche') { this.sim.issue({ type: 'posture', ids: id, posture: 'passive' }); this.walk(); }
    if (a === 'tir' && this.dummyU) { this.sim.issue({ type: 'posture', ids: id, posture: 'agressive' }); this.sim.issue({ type: 'attack', ids: id, unit: this.dummyU.id, b: -1 }); }
    else if (a === 'tir' && this.dummy) { this.sim.issue({ type: 'posture', ids: id, posture: 'tenir' }); this.sim.issue({ type: 'attack', ids: id, unit: -1, b: this.dummy.id }); }
    if (a === 'marchetir') { this.sim.issue({ type: 'posture', ids: id, posture: 'agressive' }); this.walk(true); }
    if (a === 'travail') {
      if (u.kind === 'ouvrier') {
        const n = this.sim.nodes.filter((n) => n.amount > 0).sort((p, q) => Math.hypot(p.x - u.x, p.z - u.z) - Math.hypot(q.x - u.x, q.z - u.z))[0];
        if (n) this.sim.issue({ type: 'gather', ids: id, node: n.id });
      } else this.go('tir');
    }
    if (a === 'mort') { this.sim.issue({ type: 'kill', owner: 0, ids: id, b: -1 }); this.respawnAt = this.sim.tick + 25; }
    this.paint();
  }
  /** Va-et-vient de 10 m perpendiculaire à la cible (avec tir en chemin si demandé). */
  private walk(fire = false) {
    const u = this.u!; const s = this.leg++ % 2 === 0 ? 1 : -1;
    const px = -this.dz, pz = this.dx;
    const o = { ids: [u.id], x: this.x + px * 6 * s, z: this.z + pz * 6 * s, formation: 'libre' as const };
    this.sim.issue(fire ? { type: 'amove', ...o } : { type: 'move', ...o });
  }

  /** À chaque tick : cible et unité invulnérables, va-et-vient, réapparition, défilé automatique. */
  step() {
    const u = this.u;
    if (this.dummy) this.dummy.hp = this.dummy.maxHp;
    if (this.dummyU) { this.dummyU.hp = this.dummyU.maxHp; this.dummyU.fleeT = this.sim.tick; }
    if (u && this.act !== 'mort') u.hp = u.maxHp;
    if (u && (this.act === 'marche' || this.act === 'marchetir') && !u.moving && this.sim.tick % 5 === 0) this.walk(this.act === 'marchetir');
    if (this.act === 'mort' && this.respawnAt > 0 && this.sim.tick >= this.respawnAt) { this.respawnAt = -1; this.act = 'repos'; this.pick(this.i); }
    if (this.auto) {
      this.autoT++;
      const seq: Act[] = UNITS[this.kind].degats > 0 ? ['marche', 'tir', 'marchetir'] : this.kind === 'ouvrier' ? ['marche', 'travail'] : ['marche', 'repos'];
      const k = Math.floor(this.autoT / 40);
      if (k >= seq.length) { this.autoT = 0; this.act = 'marche'; this.nav(1); }
      else if (this.autoT % 40 === 0 || (this.autoT === 1 && this.act !== seq[0])) this.go(seq[k]);
    }
  }
  /** Texte d'état mis à jour à chaque image. */
  frame() {
    // La caméra suit l'unité quand elle se déplace (marche, récolte).
    const u = this.u;
    if (u && this.sim.units.includes(u) && (this.act === 'marche' || this.act === 'marchetir' || this.act === 'travail')) this.hooks.follow(u.x, u.z);
    const el = document.getElementById('bn-anim'); if (!el) return;
    const t = this.u && this.sim.units.includes(this.u) ? this.hooks.info(this.u.id) : this.act === 'mort' ? 'chute…' : '';
    if (el.textContent !== t) el.textContent = t;
  }

  private paint() {
    const el = $('bench'); el.hidden = false;
    const k = this.kind, r = UNITS[k];
    const fac = r.faction === undefined ? 'toutes factions' : GAME.factions[r.faction];
    const can = r.degats > 0;
    const L = this.shown;
    // Liste groupée par faction ; les nouvelles unités sont marquées d'une étoile.
    const NEW = new Set<string>(['garde', 'commando', 'vigile']);
    const groups = [-1, ...GAME.factions.map((_, f) => f)].map((f) => {
      const js = L.filter((j) => (UNITS[this.kinds[j]].faction ?? -1) === f); if (!js.length) return '';
      return `<optgroup label="${f < 0 ? 'Communes' : GAME.factions[f]}">${js.map((j) => `<option value="${j}"${j === this.i ? ' selected' : ''}>${NEW.has(this.kinds[j]) ? '★ ' : ''}${UNITS[this.kinds[j]].nom}</option>`).join('')}</optgroup>`;
    }).join('');
    const F = (f: number | null, t: string) => { const n = this.kinds.filter((k) => f === null || (UNITS[k].faction ?? -1) === f).length; return `<button data-f="${f ?? ''}" class="${this.fac === f ? 'on' : ''}">${t} <small>${n}</small></button>`; };
    const B = (a: Act, t: string, on = true) => on ? `<button data-a="${a}" class="${this.act === a ? 'on' : ''}">${t}</button>` : '';
    el.innerHTML = `<div class="bn-top"><button data-n="-1">◀</button><select id="bn-sel">${groups}</select><button data-n="1">▶</button><span class="bn-c">${L.indexOf(this.i) + 1}/${L.length}</span></div>
      <div class="bn-row bn-fac">${F(null, 'Toutes')}${F(-1, 'Communes')}${GAME.factions.map((n, f) => F(f, n.split(' ').pop()!)).join('')}</div>
      <div class="bn-sub">${BUILDINGS[r.produitA]?.nom ?? ''} · ère ${r.ere} · ${fac}${r.vole ? ' · volant' : ''}${['garde', 'commando', 'vigile'].includes(k) ? ' · ★ nouveau' : ''}</div>
      <div class="bn-row">${B('repos', 'Repos')}${B('marche', 'Marche')}${B('tir', r.portee <= 1.5 ? 'Frappe' : 'Tir', can)}${B('marchetir', 'Marche + tir', can)}${B('travail', 'Récolte', k === 'ouvrier')}${B('mort', 'Mort')}</div>
      <div class="bn-row"><span>Caméra</span><button data-v="side" class="${this.side ? 'on' : ''}">Vue de côté</button><button data-v="turn">↻ Tourner</button></div>
      <div class="bn-row"><span>Vitesse</span><button data-s="0.25">×¼</button><button data-s="0.5">×½</button><button data-s="1">×1</button><button data-auto class="${this.auto ? 'on' : ''}">${this.auto ? '■ Défilé' : '▶ Défilé auto'}</button><button data-q>Quitter</button></div>
      <div class="bn-anim" id="bn-anim"></div>`;
    el.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.onclick = () => {
      if (b.dataset.n) this.nav(+b.dataset.n);
      else if (b.dataset.f !== undefined) { this.fac = b.dataset.f === '' ? null : +b.dataset.f; const L = this.shown; if (!L.includes(this.i)) this.pick(L[0]); else this.paint(); }
      else if (b.dataset.a) this.go(b.dataset.a as Act);
      else if (b.dataset.s) { this.hooks.speed(+b.dataset.s); el.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('on', x === b)); }
      else if (b.dataset.v === 'side') { this.side = !this.side; this.hooks.view(this.side, 0); this.paint(); }
      else if (b.dataset.v === 'turn') this.hooks.view(this.side, Math.PI / 4);
      else if (b.dataset.auto !== undefined) { this.auto = !this.auto; this.autoT = 0; this.paint(); }
      else if (b.dataset.q !== undefined) this.hooks.quit();
    });
    ($('bn-sel') as HTMLSelectElement).onchange = (e) => this.pick(+(e.target as HTMLSelectElement).value);
  }
}
