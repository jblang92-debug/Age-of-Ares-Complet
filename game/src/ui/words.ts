// Consignes adaptées à l'appareil : « touche / appui long » au doigt, « clique / clic droit » à la souris.
export const MOUSE = typeof matchMedia !== 'undefined' && !matchMedia('(pointer: coarse)').matches;
const RULES: [RegExp, string][] = [
  [/un doigt déplace, deux doigts zooment/g, 'flèches, ZQSD ou bord de l\'écran : déplacer ; molette : zoomer'],
  [/Appui long puis glisser/g, 'Glisser'], [/appui long puis glisser/g, 'glisser'],
  [/Appui long \(ou clic droit\)/g, 'Clic droit'], [/appui long \(ou clic droit\)/g, 'clic droit'],
  [/Appui long/g, 'Clic droit'], [/appui long/g, 'clic droit'],
  [/Touche maintenant/g, 'Clique maintenant sur'], [/Touche pour/g, 'Clique pour'],
  [/\bToucher\b/g, 'Cliquer'], [/\btoucher\b/g, 'cliquer'],
  [/\bTouche\b/g, 'Clique sur'], [/\btouche\b/g, 'clique sur'],
];
export function dev(s: string): string { if (!MOUSE) return s; for (const [r, t] of RULES) s = s.replace(r, t); return s; }
/** Adapte d'un coup les textes et infobulles d'un bloc de la page. */
export function devTree(root: HTMLElement) {
  if (!MOUSE) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.nodeValue ?? ''; const d = dev(t); if (d !== t) n.nodeValue = d; }
  root.querySelectorAll<HTMLElement>('[title]').forEach((e) => { e.title = dev(e.title); });
}
