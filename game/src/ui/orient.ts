// Orientation : sur un téléphone tenu (ou bloqué) à la verticale, le jeu peut se dessiner tourné d'un quart de tour.
// Tout le code qui lit une position de doigt passe par ces fonctions pour retrouver le repère du jeu.
let forced = false;
const stage = () => document.getElementById('stage')!;

export const orient = {
  get rot() { return forced; },
  set(v: boolean) {
    forced = v;
    document.body.classList.toggle('rot', v);
    orient.refresh();
    window.dispatchEvent(new Event('resize'));
  },
  /** Met à jour le mode compact (petits écrans) selon la hauteur réellement disponible pour le jeu. */
  refresh() {
    document.body.classList.toggle('compact', orient.height() < 480);
    document.body.classList.toggle('portrait', !forced && innerHeight > innerWidth && matchMedia('(pointer: coarse)').matches);
    stage().style.setProperty('--h', orient.height() + 'px');
  },
  /** Point de l'écran -> point dans le repère du jeu. */
  local(cx: number, cy: number): { x: number; y: number } { return forced ? { x: cy, y: innerWidth - cx } : { x: cx, y: cy }; },
  width(): number { return forced ? innerHeight : innerWidth; },
  height(): number { return forced ? innerWidth : innerHeight; },
  /** Rectangle d'un élément, dans le repère du jeu. */
  rect(el: Element): { left: number; top: number; width: number; height: number } {
    const r = el.getBoundingClientRect();
    return forced ? { left: r.top, top: innerWidth - r.right, width: r.height, height: r.width } : { left: r.left, top: r.top, width: r.width, height: r.height };
  },
};
window.addEventListener('resize', () => orient.refresh());
