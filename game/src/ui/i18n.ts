// Traduction de l'interface (français → anglais), appliquée à tout ce qui s'affiche.
// Le jeu est écrit en français ; en anglais, chaque texte affiché est traduit à la volée :
// phrase entière d'abord, sinon morceau par morceau (séparés par « · »), en remplaçant les nombres (#)
// et les noms d'unités, de bâtiments et de recherches (@) pour retrouver le modèle de phrase.
import { EN, EN_NAMES } from './en';

export type Lang = 'fr' | 'en';
const KEY = 'langue';
function stored(): Lang | null { try { const v = localStorage.getItem(KEY); return v === 'fr' || v === 'en' ? v : null; } catch { return null; } }
export let LANG: Lang = stored() ?? (typeof navigator !== 'undefined' && !/^fr/i.test(navigator.language || 'fr') ? 'en' : 'fr');
export function setLang(l: Lang) { try { localStorage.setItem(KEY, l); } catch { /* indisponible */ } }

const LOWER: Record<string, string> = {};
for (const [k, v] of Object.entries(EN_NAMES)) LOWER[k.toLowerCase()] = v;
const NAMES = Object.keys(EN_NAMES).sort((a, b) => b.length - a.length);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Noms entiers seulement (pas « Mur » dans « Murs »), majuscules ou minuscules.
const NAME_RE = new RegExp('(?<![A-Za-zÀ-ÿ])(' + NAMES.map(esc).join('|') + ')(?![A-Za-zÀ-ÿ])', 'gi');
const NUM_RE = /[+\-−]?\d+(?:[.,]\d+)?/g;
const memo = new Map<string, string>();
/** Modèle d'une phrase : noms remplacés par @, nombres par #. */
export function template(t: string, names?: string[], nums?: string[]): string {
  return t.replace(NAME_RE, (m) => { names?.push(m); return '@'; }).replace(NUM_RE, (m) => { nums?.push(m); return '#'; });
}
const nameEn = (m: string) => { const e = EN_NAMES[m] ?? LOWER[m.toLowerCase()] ?? m; return m === m.toLowerCase() && m !== m.toUpperCase() ? e.toLowerCase() : e; };
// Les clés du dictionnaire sont écrites en français « naturel » : on les ramène à leur modèle une fois pour toutes.
const TPL: Record<string, string> = {};
for (const [k, v] of Object.entries(EN)) { TPL[k] = v; TPL[template(k)] = v; }

function seg(s: string): string {
  const t0 = s.trim(); if (!t0) return s;
  if (t0.startsWith('· ')) { const r = seg(t0.slice(2)); return r === t0.slice(2) ? s : s.replace(t0, '· ' + r.trim()); }
  const t = t0;
  const lead = s.slice(0, s.indexOf(t[0])), tail = s.slice(s.lastIndexOf(t[t.length - 1]) + 1);
  const ex0 = EN[t] ?? EN_NAMES[t] ?? LOWER[t.toLowerCase()];
  const exact = ex0 !== undefined && !/[#@]/.test(ex0) ? ex0 : undefined;   // un modèle (# ou @) se remplit plus bas
  if (exact !== undefined) return lead + (t === t.toLowerCase() && EN[t] === undefined ? exact.toLowerCase() : exact) + tail;
  const names: string[] = [], nums: string[] = [];
  const en = TPL[template(t, names, nums)];
  if (en === undefined) return s;
  let i = 0, j = 0;
  return lead + en.replace(/[@#]/g, (c) => c === '@' ? nameEn(names[i++] ?? '') : (nums[j++] ?? '').replace('−', '-').replace(',', '.')) + tail;
}
/** Texte traduit dans la langue choisie (inchangé en français ou s'il est inconnu). */
export function tr(s: string): string {
  if (LANG === 'fr' || !s || !/[A-Za-zÀ-ÿ]/.test(s)) return s;
  let r = memo.get(s);
  if (r !== undefined) return r;
  r = seg(s);
  if (r === s && s.includes(' · ')) r = s.split(' · ').map(seg).join(' · ');
  if (r === s && s.includes(' — ')) r = s.split(' — ').map(seg).join(' — ');
  if (memo.size > 5000) memo.clear();
  memo.set(s, r);
  return r;
}

/** Traduit en continu tout ce qui apparaît dans la page (textes, infobulles, champs). */
export function translatePage() {
  if (LANG === 'fr') return;
  document.documentElement.lang = 'en';
  const done = new WeakMap<Node, string>();
  const text = (n: Node) => { const v = n.nodeValue ?? ''; if (done.get(n) === v) return; const t = tr(v); done.set(n, t); if (t !== v) n.nodeValue = t; };
  const attrs = (e: Element) => { for (const a of ['title', 'placeholder', 'aria-label']) { const v = e.getAttribute(a); if (v) { const t = tr(v); if (t !== v) e.setAttribute(a, t); } } };
  const walk = (root: Node) => {
    if (root.nodeType === 3) { text(root); return; }
    if (root.nodeType !== 1) return;
    const el = root as Element; if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
    attrs(el);
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) text(n); else attrs(n as Element); }
  };
  walk(document.body);
  document.title = tr(document.title);
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') text(m.target);
      else if (m.type === 'attributes') attrs(m.target as Element);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] });
}
