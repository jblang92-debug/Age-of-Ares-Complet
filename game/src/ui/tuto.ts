import { dev } from './words';
// Tutoriel guidé : une suite d'objectifs vérifiés à chaque image, affichés dans la carte d'objectif.
import type { Sim } from '../sim/sim';
import type { Controller } from '../input/controller';
import type { Hud } from './hud';

interface Step { txt: string; done: (s: Sim, c: Controller, h: Hud) => boolean }
const mine = (s: Sim, k: string) => s.units.filter((u) => u.owner === 0 && u.kind === k);
const has = (s: Sim, k: string) => s.buildings.some((b) => b.owner === 0 && b.kind === k);
export const TUTO: Step[] = [
  { txt: 'Touche un ouvrier pour le sélectionner (les petits astronautes près du Centre).', done: (s, c) => [...c.selection].some((id) => s.get(id)?.kind === 'ouvrier') },
  { txt: 'Touche maintenant un gisement de glace (cristaux bleus) ou de minerai : l\'ouvrier va récolter.', done: (s) => mine(s, 'ouvrier').some((u) => u.job?.t === 'gather') },
  { txt: 'Bien ! Le bouton « Inactifs » sélectionne les ouvriers qui ne font rien : envoie-les tous récolter.', done: (s) => s.idleWorkers(0).length <= 1 },
  { txt: 'Touche le Centre de commandement puis « Ouvrier » pour en produire un nouveau.', done: (s) => s.buildings.some((b) => b.owner === 0 && b.kind === 'centre' && b.queue.length > 0) || mine(s, 'ouvrier').length > 4 },
  { txt: 'Sélectionne un ouvrier, onglet Économie : construis un Habitat (il augmente la population).', done: (s) => has(s, 'habitat') },
  { txt: 'Onglet Armée : construis une Caserne.', done: (s) => s.buildings.some((b) => b.owner === 0 && b.kind === 'caserne' && b.done) },
  { txt: 'Touche la Caserne et forme 3 Fantassins (le bouton ×5 en lance plusieurs d\'un coup).', done: (s) => mine(s, 'fantassin').length >= 3 },
  { txt: 'Appui long (ou clic droit) sur un bouton d\'unité : sa fiche montre ses points forts et faibles.', done: (_s, _c, h) => h.sheetSeen },
  { txt: 'Touche « Armée » pour sélectionner tes soldats, puis appui long sur 1 : c\'est ton groupe 1.', done: (_s, _c, h) => h.groupSize(0) >= 3 },
  { txt: 'Touche le sol loin devant ta base : ton groupe s\'y rend. Touche un ennemi pour l\'attaquer.', done: (s) => { const c = s.buildings.find((b) => b.owner === 0 && b.kind === 'centre'); return !!c && mine(s, 'fantassin').some((u) => Math.hypot(u.x - c.x, u.z - c.z) > 26); } },
  { txt: 'Bravo, tu connais l\'essentiel ! Développe-toi, passe à l\'ère 2 au Centre, et détruis le Centre ennemi pour gagner.', done: () => false },
];

export class Tutorial {
  i = 0;
  readonly last = TUTO.length - 1;
  private flash = 0;
  constructor(private el: HTMLElement) { this.paint(); }
  update(s: Sim, c: Controller, h: Hud): boolean {
    let changed = false;
    while (this.i < TUTO.length - 1 && TUTO[this.i].done(s, c, h)) { this.i++; changed = true; }
    if (changed) { this.flash = performance.now(); this.paint(); }
    this.el.classList.toggle('flash', performance.now() - this.flash < 900);
    return changed;
  }
  private paint() {
    const n = TUTO.length - 1;
    this.el.innerHTML = `<b>Tutoriel · ${Math.min(this.i + 1, n)}/${n}</b><span>${dev(TUTO[this.i].txt)}</span><i style="width:${Math.round(this.i / n * 100)}%"></i>`;
  }
}
