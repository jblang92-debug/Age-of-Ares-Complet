// Progression du joueur : succès débloqués et campagne « Opération Arès » (5 missions enchaînées).
import type { ScenId } from '../sim/scenario';

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* indisponible */ } };

export interface Achievement { id: string; nom: string; desc: string }
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'premiere', nom: 'Premier sang', desc: 'Gagner une partie' },
  { id: 'difficile', nom: 'Stratège', desc: 'Battre une IA Difficile' },
  { id: 'f0', nom: 'Fer d\'Arès', desc: 'Gagner avec le Consortium Arès' },
  { id: 'f1', nom: 'Vent boréal', desc: 'Gagner avec la Compagnie Boréale' },
  { id: 'f2', nom: 'Croix du Sud', desc: 'Gagner avec la Ligue Australe' },
  { id: 'f3', nom: 'Soleil levant', desc: 'Gagner avec le Syndicat Solaris' },
  { id: 'iles', nom: 'Corsaire du vide', desc: 'Gagner sur une carte d\'îles' },
  { id: 'quatre', nom: 'Dernier debout', desc: 'Gagner une partie à 4 joueurs' },
  { id: 'equipe', nom: 'Frères d\'armes', desc: 'Gagner en 2 contre 2' },
  { id: 'rapide', nom: 'Guerre éclair', desc: 'Gagner en moins de 12 minutes' },
  { id: 'ere3', nom: 'Âge orbital', desc: 'Atteindre l\'ère 3' },
  { id: 'merveille', nom: 'Vers les étoiles', desc: 'Gagner grâce à l\'Ascenseur orbital' },
  { id: 'carnage', nom: 'Rouleau compresseur', desc: 'Détruire 100 unités dans une partie' },
  { id: 'blitz', nom: 'Aux points', desc: 'Gagner une partie Blitz' },
  { id: 'enligne', nom: 'Sans frontières', desc: 'Gagner une partie en ligne' },
  { id: 'defis', nom: 'Vétéran', desc: 'Réussir Défense, Raid et Course' },
  { id: 'campagne', nom: 'Opération Arès', desc: 'Terminer la campagne' },
];
export function unlocked(): Set<string> { try { return new Set(JSON.parse(get('succes') || '[]')); } catch { return new Set(); } }
/** Débloque des succès ; renvoie ceux qui sont nouveaux. */
export function unlock(ids: string[]): Achievement[] {
  const have = unlocked(), fresh = ACHIEVEMENTS.filter((a) => ids.includes(a.id) && !have.has(a.id));
  if (fresh.length) { for (const a of fresh) have.add(a.id); set('succes', JSON.stringify([...have])); }
  return fresh;
}
/** Défis réussis (pour le succès « Vétéran »). */
export function challengeDone(id: string): boolean {
  let s: string[] = []; try { s = JSON.parse(get('defis-reussis') || '[]'); } catch { /* aucun */ }
  if (!s.includes(id)) { s.push(id); set('defis-reussis', JSON.stringify(s)); }
  return ['defense', 'raid', 'course'].every((k) => s.includes(k));
}

export interface Mission { titre: string; recit: string; but: string; scen?: ScenId; partie?: { niveau: string; joueurs: 'duel' | 'ffa' | 'equipes'; terrain: string; taille: string; graine: number; faction: number; options?: Record<string, string> } }
export const CAMPAIGN: Mission[] = [
  { titre: '1 · Atterrissage', scen: 'tuto', but: 'Suivre le tutoriel jusqu\'au bout',
    recit: 'An 2214. Le Consortium Arès pose sa première colonie sur la planète rouge. Commandant, installez la base : récoltez la glace, produisez des ouvriers, formez vos premiers soldats.' },
  { titre: '2 · Tête de pont', scen: 'defense', but: 'Tenir 5 minutes',
    recit: 'Nos sondes ont réveillé les colonies rivales. Leurs vagues approchent de la base. Fortifiez-vous et tenez jusqu\'à l\'arrivée des renforts.' },
  { titre: '3 · Raid éclair', scen: 'raid', but: 'Détruire le Centre ennemi en 4 minutes',
    recit: 'Une base adverse s\'est installée trop près. Une force de frappe est à vos ordres : frappez vite, avant qu\'elle ne se renforce.' },
  { titre: '4 · Course à l\'orbite', scen: 'course', but: 'Atteindre l\'ère 3 en 12 minutes',
    recit: 'La planète ne suffit plus. Celui qui maîtrisera l\'orbite tiendra la planète entière. Développez votre économie et atteignez l\'ère Orbitale avant vos rivaux.' },
  { titre: '5 · Assaut final', but: 'Rester le dernier debout face aux trois colonies rivales',
    partie: { niveau: 'normal', joueurs: 'ffa', terrain: 'continentale', taille: 'moyenne', graine: 214, faction: 0, options: { brouillard: 'oui', duree: 'normale', evenements: 'non', centre: 'calme', ressources: 'normales', doctrine: 'industrielle' } },
    recit: 'Trois puissances se disputent encore Mars. Il est temps d\'en finir : écrasez les trois colonies rivales et faites de la planète rouge le domaine d\'Arès.' },
];
export const campaignDone = () => Math.max(0, Math.min(CAMPAIGN.length, Number(get('campagne') || 0)));
export function campaignWin(i: number): boolean { const d = campaignDone(); if (i + 1 > d) set('campagne', String(i + 1)); return i + 1 >= CAMPAIGN.length; }
