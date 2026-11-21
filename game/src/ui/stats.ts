import { LANG } from './i18n';
import { dev } from './words';
// Écran de fin façon Age of Empires : onglets de statistiques comparées (étoile au meilleur), détail par unité
// et courbes dans le temps. Les chiffres viennent de la simulation (sim.stats, sim.history), donc ils sont
// identiques après une reprise de partie.
import type { Sim, Snapshot } from '../sim/sim';
import { GAME, UNITS, RESEARCH } from '../data/rules';
import { BASE } from '../render/assets';

const UI = (f: string) => BASE + 'assets/ui/' + f;
const COL = ['#ff8a3d', '#46d6ff', '#7be866', '#c98bff'];
const DOCTRINES: Record<string, string> = { industrielle: 'Industrielle', aeronavale: 'Aéronavale', frappe: 'Frappe chirurgicale', '': '—' };
const ICON_UNITS = new Set(['ouvrier', 'fantassin', 'eclaireur', 'blinde', 'drone', 'navette', 'ingenieur', 'antiblindage', 'intercepteur', 'artillerie', 'cuirasse']);
const clock = (tick: number) => { const s = Math.round(tick / 10); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmt = (v: number) => Math.round(v).toLocaleString('fr-FR');

export interface EndInfo { /** Équipe gagnante. */ winnerTeam?: number; won: boolean; blitz: boolean; /** Victoire par l'Ascenseur orbital. */ wonder?: boolean; /** IA contre IA : on annonce le camp gagnant. */ spectator?: boolean; names: string[]; terrain: string; onNew: () => void; /** Titre imposé (défis). */ title?: string; /** Boutons en plus en bas de l'écran. */ buttons?: [string, () => void][]; /** Libellé du bouton principal. */ newLabel?: string }
interface Col { label: string; get: (o: number) => number; low?: boolean; show?: (o: number) => string }

export function showEnd(el: HTMLElement, sim: Sim, info: EndInfo) {
  const S = sim.stats, P = sim.players, SIDES = sim.sides;
  const hist: Snapshot[] = [...sim.history.filter((h) => h.t < sim.tick), sim.snapshot()];
  if (hist.length < 2) hist.unshift({ ...hist[0], t: 0 });
  const parts = sim.players.map((_, o) => sim.scoreParts(o));
  const ere2 = (o: number) => S[o].ereT[sim.startAge] ?? -1;

  const tabs: Record<string, () => string> = {
    'Score': () => table([
      { label: 'Total', get: (o) => sim.score(o) },
      { label: 'Militaire', get: (o) => parts[o].militaire },
      { label: 'Économie', get: (o) => parts[o].economie },
      { label: 'Technologie', get: (o) => parts[o].technologie },
      { label: 'Société', get: (o) => parts[o].societe },
    ]) + bars([['Militaire', (o) => parts[o].militaire], ['Économie', (o) => parts[o].economie], ['Technologie', (o) => parts[o].technologie], ['Société', (o) => parts[o].societe]]),
    'Militaire': () => table([
      { label: 'Unités tuées', get: (o) => S[o].tues },
      { label: 'Unités perdues', get: (o) => S[o].perdus, low: true },
      { label: 'Bâtiments détruits', get: (o) => S[o].batimentsDetruits },
      { label: 'Bâtiments perdus', get: (o) => S[o].batimentsPerdus, low: true },
      { label: 'Dégâts infligés', get: (o) => S[o].degats },
      { label: 'Armée max', get: (o) => S[o].armeeMax },
      { label: 'Promotions', get: (o) => S[o].promotions ?? 0 },
      { label: 'Captures', get: (o) => S[o].captures },
    ]),
    'Économie': () => table([
      { label: 'Total récolté', get: (o) => S[o].recolte },
      { label: 'Nourriture', get: (o) => S[o].rec.eau },
      { label: 'Bois', get: (o) => S[o].rec.bois ?? 0 },
      { label: 'Pierre', get: (o) => S[o].rec.minerai },
      { label: 'Or', get: (o) => S[o].rec.energie },
      { label: 'Solarite', get: (o) => S[o].rec.solarite },
      { label: 'Dépensé', get: (o) => S[o].depense },
      { label: 'Ouvriers produits', get: (o) => S[o].ouvriersProduits },
    ]),
    'Technologie': () => table([
      { label: 'Âge atteint', get: (o) => P[o].ere, show: (o) => `${P[o].ere} · ${GAME.eres[P[o].ere - 1].nom}` },
      { label: 'Premier passage d\'âge', get: (o) => ere2(o) < 0 ? 1e9 : ere2(o), low: true, show: (o) => ere2(o) < 0 ? '—' : clock(ere2(o)) },
      { label: 'Arrivée à l\'âge galactique', get: (o) => (S[o].ereT[5] ?? -1) < 0 ? 1e9 : S[o].ereT[5], low: true, show: (o) => (S[o].ereT[5] ?? -1) < 0 ? '—' : clock(S[o].ereT[5]) },
      { label: 'Recherches', get: (o) => S[o].recherches },
      { label: 'Doctrine', get: () => 0, show: (o) => DOCTRINES[P[o].doctrine] ?? '—' },
    ]) + `<div class="st-list">${SIDES.map((o) => `<p><b style="color:${COL[o]}">${info.names[o]}</b> : ${[...P[o].research].map((k) => RESEARCH[k]?.nom ?? k).join(', ') || 'aucune recherche'}</p>`).join('')}</div>`,
    'Société': () => table([
      { label: 'Population max', get: (o) => S[o].popMax },
      { label: 'Unités produites', get: (o) => S[o].produits },
      { label: 'Bâtiments construits', get: (o) => S[o].batimentsConstruits },
      { label: 'Bâtiments perdus', get: (o) => S[o].batimentsPerdus, low: true },
      { label: 'Captures', get: (o) => S[o].captures },
    ]),
    'Unités': () => units(),
    'Chronologie': () => `<div class="st-chips">${CURVES.map((c, i) => `<button data-curve="${i}" class="${i === curve ? 'on' : ''}">${c[0]}</button>`).join('')}</div>
      <canvas id="st-chart"></canvas><div id="st-tip"></div>
      <div class="st-list">${moments()}</div>`,
  };

  // --- tableaux
  function table(cols: Col[]): string {
    const head = `<tr><th>Camp</th>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr>`;
    // Étoile : la meilleure valeur, si elle est unique.
    const best = cols.map((c) => { if (c.label === 'Doctrine') return -1; const v = SIDES.map((o) => c.get(o)), b = c.low ? Math.min(...v) : Math.max(...v); return v.filter((x) => x === b).length === 1 ? SIDES[v.indexOf(b)] : -1; });
    const rows = SIDES.map((o) => `<tr><td class="who"><i style="background:${COL[o]}"></i>${info.names[o]}</td>${cols.map((c, i) => `<td class="${best[i] === o ? 'best' : ''}">${c.show ? c.show(o) : fmt(c.get(o))}${best[i] === o ? ' <span class="star">★</span>' : ''}</td>`).join('')}</tr>`).join('');
    return `<div class="st-scroll"><table class="st">${head}${rows}</table></div>`;
  }
  function bars(items: [string, (o: number) => number][]): string {
    const max = Math.max(1, ...items.flatMap(([, f]) => [f(0), f(1)]));
    return `<div class="st-bars">${items.map(([n, f]) => `<div class="st-bar"><span>${n}</span><div>${SIDES.map((o) => `<em style="width:${(f(o) / max) * 100}%;background:${COL[o]}">${fmt(f(o))}</em>`).join('')}</div></div>`).join('')}</div>`;
  }
  function units(): string {
    const kinds = Object.keys(UNITS).filter((k) => SIDES.some((o) => S[o].produitsPar[k] || S[o].perdusPar[k]));
    if (!kinds.length) return '<p class="st-empty">Aucune unité produite.</p>';
    const icon = (k: string) => ICON_UNITS.has(k) ? `<img src="${UI('icons/u_' + k + '.png')}" alt=""/>` : '';
    return `<div class="st-scroll"><table class="st units"><tr><th>Unité</th>${SIDES.map((o) => `<th style="color:${COL[o]}">${info.names[o]}<br/><small>produites · perdues</small></th>`).join('')}</tr>${kinds.map((k) => `<tr><td class="who">${icon(k)}${UNITS[k].nom}</td>${SIDES.map((o) => `<td>${S[o].produitsPar[k] ?? 0} · <span class="lost">${S[o].perdusPar[k] ?? 0}</span></td>`).join('')}</tr>`).join('')}</table></div>`;
  }
  function moments(): string {
    const ev: [number, string][] = [];
    for (const o of SIDES) for (let e = 1; e < S[o].ereT.length; e++) if (S[o].ereT[e] > 0) ev.push([S[o].ereT[e], `<b style="color:${COL[o]}">${info.names[o]}</b> atteint : ${GAME.eres[e].nom}`]);
    if (sim.firstFight >= 0) ev.push([sim.firstFight, 'Premier combat']);
    ev.push([sim.tick, info.blitz ? 'Fin du Blitz : victoire aux points' : info.wonder ? 'L\'Ascenseur orbital a tenu 5 minutes' : 'Chute d\'un Centre de commandement']);
    ev.sort((a, b) => a[0] - b[0]);
    return `<h3>Moments clés</h3>${ev.map(([t, s]) => `<p><span class="t">${clock(t)}</span> ${s}</p>`).join('')}`;
  }

  // --- courbes
  const CURVES: [string, keyof Snapshot][] = [['Score', 'score'], ['Militaire', 'mil'], ['Économie', 'eco'], ['Armée', 'armee'], ['Ouvriers', 'ouvriers'], ['Récolte cumulée', 'recolte'], ['Bâtiments', 'batiments'], ['Population', 'pop']];
  let curve = 0, hover = -1;
  function draw() {
    const cv = el.querySelector<HTMLCanvasElement>('#st-chart'); if (!cv) return;
    const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const key = CURVES[curve][1], vals = hist.map((h) => h[key] as number[]);
    const tMax = Math.max(1, hist[hist.length - 1].t), vMax = Math.max(1, ...vals.flat()) * 1.08;
    const L = 44, R = 10, T = 10, B = 24, x = (t: number) => L + (t / tMax) * (W - L - R), y = (v: number) => T + (1 - v / vMax) * (H - T - B);
    g.font = '11px system-ui,sans-serif'; g.fillStyle = '#c9b29c'; g.strokeStyle = 'rgba(255,196,140,.14)'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const v = (vMax / 1.08) * i / 4, yy = y(v); g.beginPath(); g.moveTo(L, yy); g.lineTo(W - R, yy); g.stroke(); g.textAlign = 'right'; g.fillText(fmt(v), L - 6, yy + 4); }
    const step = tMax > 18000 ? 3000 : tMax > 6000 ? 1200 : 600;
    g.textAlign = 'center';
    for (let t = 0; t <= tMax; t += step) { g.textAlign = x(t) > W - 40 ? 'right' : 'center'; g.fillText(Math.round(t / 600) + ' min', Math.min(x(t), W - R), H - 6); }
    // repères : passage en ère 2 et premier combat
    const mark = (t: number, c: string, label: string) => { g.save(); g.setLineDash([4, 4]); g.strokeStyle = c; g.beginPath(); g.moveTo(x(t), T); g.lineTo(x(t), H - B); g.stroke(); g.restore(); g.fillStyle = c; g.textAlign = 'left'; g.fillText(label, x(t) + 3, T + 10); };
    for (const o of SIDES) if (ere2(o) > 0) mark(ere2(o), COL[o], GAME.eres[sim.startAge]?.nom ?? '');
    if (sim.firstFight > 0) mark(sim.firstFight, '#c9b29c', '⚔');
    for (const o of SIDES) {
      g.beginPath(); hist.forEach((h, i) => { const px = x(h.t), py = y(vals[i][o]); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.strokeStyle = COL[o]; g.lineWidth = 2.5; g.stroke();
      g.lineTo(x(hist[hist.length - 1].t), y(0)); g.lineTo(x(0), y(0)); g.closePath(); g.fillStyle = COL[o] + '22'; g.fill();
    }
    const tip = el.querySelector<HTMLElement>('#st-tip')!;
    if (hover >= 0) {
      const h = hist[hover], px = x(h.t);
      g.strokeStyle = '#fff8'; g.lineWidth = 1; g.beginPath(); g.moveTo(px, T); g.lineTo(px, H - B); g.stroke();
      for (const o of SIDES) { g.fillStyle = COL[o]; g.beginPath(); g.arc(px, y(vals[hover][o]), 4, 0, Math.PI * 2); g.fill(); }
      tip.innerHTML = `<b>${clock(h.t)}</b> · ${SIDES.map((o) => `<span style="color:${COL[o]}">${info.names[o]} ${fmt(vals[hover][o])}</span>`).join(' · ')}`;
    } else tip.innerHTML = `${SIDES.map((o) => `<span style="color:${COL[o]}">■ ${info.names[o]}</span>`).join(' &nbsp; ')} · ${dev('touche la courbe pour lire les valeurs')}`;
    cv.onpointermove = cv.onpointerdown = (e) => {
      const r = cv.getBoundingClientRect(), t = ((e.clientX - r.left) / r.width * W - L) / (W - L - R) * tMax;
      let bi = 0; hist.forEach((h, i) => { if (Math.abs(h.t - t) < Math.abs(hist[bi].t - t)) bi = i; });
      if (bi !== hover) { hover = bi; draw(); }
    };
  }

  // --- assemblage
  // Camp(s) vainqueur(s) : l'équipe gagnante.
  const wt = info.winnerTeam ?? (info.won ? P[0].team : 1);
  const winner = SIDES.filter((o) => P[o].team === wt).map((o) => info.names[o].replace(/ \(.*$/, '')).join(' et ');
  const how = info.blitz ? ' AUX POINTS' : info.wonder ? ' PAR L\'ASCENSEUR' : '';
  const title = info.title ? info.title : info.spectator ? `${winner.toUpperCase()} ${winner.includes(' et ') ? 'L\'EMPORTENT' : 'L\'EMPORTE'}${how}` : info.wonder ? (info.won ? 'VICTOIRE PAR L\'ASCENSEUR' : 'DÉFAITE : ASCENSEUR ENNEMI') : info.blitz ? (info.won ? 'VICTOIRE AUX POINTS' : 'DÉFAITE AUX POINTS') : info.won ? 'VICTOIRE' : 'DÉFAITE';
  el.innerHTML = `<div class="st-wrap">
    <div class="st-head"><div class="banwrap"><img class="banner" src="${UI(info.won || info.spectator ? 'victoire.jpg' : 'defaite.jpg')}" alt="${title}"/>${LANG === 'en' ? `<span class="banword">${info.won || info.spectator ? 'VICTORY' : 'DEFEAT'}</span>` : ''}</div>
      <div class="st-sub">${title} · ${clock(sim.tick)} · ${info.terrain} · score ${SIDES.map((o) => fmt(sim.score(o))).join(' – ')}</div></div>
    <div class="st-tabs">${Object.keys(tabs).map((k, i) => `<button data-tab="${k}" class="${i ? '' : 'on'}">${k}</button>`).join('')}</div>
    <div class="st-body"></div>
    <div class="st-foot">${(info.buttons ?? []).map(([t], i) => `<button data-extra="${i}">${t}</button>`).join('')}<button id="btn-new">${info.newLabel ?? 'Nouvelle partie'}</button></div></div>`;
  const body = el.querySelector<HTMLElement>('.st-body')!;
  let tab = 'Score';
  const paint = () => { body.innerHTML = tabs[tab](); el.querySelectorAll<HTMLButtonElement>('.st-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab)); if (tab === 'Chronologie') { hover = -1; draw(); } };
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button'); if (!b) return;
    if (b.dataset.extra) info.buttons?.[+b.dataset.extra]?.[1]();
    else if (b.dataset.tab) { tab = b.dataset.tab; paint(); }
    else if (b.dataset.curve) { curve = Number(b.dataset.curve); paint(); }
  });
  window.addEventListener('resize', () => { if (tab === 'Chronologie' && el.classList.contains('show')) draw(); });
  el.classList.add('show');
  paint();
  el.querySelector('#btn-new')!.addEventListener('click', info.onNew);
}
