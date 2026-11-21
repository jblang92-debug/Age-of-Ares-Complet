// LE fichier de règles : toutes les valeurs du jeu (sections 3 à 6 du cahier des charges).
// Coûts : eau / minerai / énergie / solarite.
export interface Cost { eau?: number; minerai?: number; energie?: number; solarite?: number }

export const GAME = {
  popMax: 100,
  popParHabitat: 5,
  popCentre: 10,
  chargeOuvrier: 10,
  /** Unités de ressource récoltées par seconde par un ouvrier au travail. */
  recolteParSeconde: 0.9,
  /** Quantité contenue dans chaque bloc d'un gisement. */
  gisement: { glace: 250, minerai: 300, solarite: 300 },
  bonusHauteur: 1.25,
  depart: { eau: 200, minerai: 200, energie: 50, solarite: 0, ouvriers: 4, eclaireurs: 1 },
  eres: [
    { nom: 'Atterrissage' },
    { nom: 'Expansion', cout: { eau: 500, minerai: 300 } as Cost, duree: 90 },
    { nom: 'Orbitale', cout: { eau: 800, minerai: 600, solarite: 300 } as Cost, duree: 120 },
  ],
  factions: ['Consortium Arès', 'Compagnie Boréale', 'Ligue Australe', 'Syndicat Solaris'],
  /** Style de chaque faction, pour le menu. */
  factionsDesc: ['blindés lourds', 'vitesse et aviation', 'infanterie et 8×8', 'défense anti-aérienne'],
} as const;

export interface UnitRule {
  /** Durée de production, en secondes. */
  temps: number;
  nom: string; ere: 1 | 2 | 3; produitA: string; cout: Cost; pop: number; pv: number;
  vitesse: number; degats: number; cadence: number; portee: number; viseAir: boolean; vole?: boolean;
  bonus?: Record<string, number>;
  /** Unité propre à une faction (indice dans GAME.factions) ; absente : commune à toutes. */ faction?: number;
}

export const UNITS: Record<string, UnitRule> = {
  ouvrier:   { temps: 14, nom: 'Ouvrier',   ere: 1, produitA: 'centre',  cout: { eau: 50 },                              pop: 1, pv: 40,  vitesse: 3,   degats: 3,  cadence: 1,   portee: 1, viseAir: false },
  fantassin: { temps: 18, nom: 'Fantassin', ere: 1, produitA: 'caserne', cout: { eau: 50, minerai: 20 },                 pop: 1, pv: 70,  vitesse: 3,   degats: 8,  cadence: 1,   portee: 5, viseAir: true,  bonus: { vehicule: 1.5, antiblindage: 1.4, ingenieur: 1.4 } },
  eclaireur: { temps: 20, nom: 'Éclaireur', ere: 1, produitA: 'caserne', cout: { eau: 60, energie: 40 },                 pop: 2, pv: 90,  vitesse: 6,   degats: 6,  cadence: 0.8, portee: 3, viseAir: false, bonus: { ouvrier: 2 } },
  blinde:    { temps: 30, nom: 'Blindé',    ere: 2, produitA: 'usine',   cout: { minerai: 150, energie: 60 },            pop: 3, pv: 350, vitesse: 3.5, degats: 35, cadence: 2.2, portee: 8, viseAir: false, bonus: { batiment: 2, infanterie: 1.3, antiblindage: 1 } },
  artillerie: { temps: 35, nom: 'Artillerie', ere: 2, produitA: 'usine', cout: { minerai: 180, energie: 80, solarite: 30 }, pop: 3, pv: 220, vitesse: 3, degats: 45, cadence: 4.5, portee: 13, viseAir: false, bonus: { batiment: 3 } },
  ingenieur: { temps: 16, nom: 'Ingénieur', ere: 1, produitA: 'caserne', cout: { eau: 60, minerai: 60, energie: 40 }, pop: 1, pv: 80, vitesse: 3, degats: 0, cadence: 1, portee: 1, viseAir: false },
  antiblindage: { temps: 18, nom: 'Anti-blindage', ere: 1, produitA: 'caserne', cout: { eau: 60, minerai: 60, energie: 20 }, pop: 1, pv: 90, vitesse: 2.6, degats: 14, cadence: 1.6, portee: 8, viseAir: false, bonus: { vehicule: 3, batiment: 1.6 } },
  intercepteur: { temps: 22, nom: 'Intercepteur', ere: 2, produitA: 'hangar', cout: { minerai: 110, energie: 70, solarite: 25 }, pop: 2, pv: 140, vitesse: 8.5, degats: 12, cadence: 0.8, portee: 5.5, viseAir: true, vole: true, bonus: { navette: 1.5, drone: 1.5, eclaireur: 1.5 } },
  drone:     { temps: 25, nom: 'Drone',     ere: 2, produitA: 'hangar',  cout: { minerai: 80, energie: 60, solarite: 40 }, pop: 2, pv: 110, vitesse: 7,   degats: 12, cadence: 1,   portee: 5, viseAir: false, vole: true, bonus: { blinde: 1.5 } },
  cuirasse:  { temps: 45, nom: 'Cuirassé du vide', ere: 3, produitA: 'hangar', cout: { minerai: 300, energie: 180, solarite: 120 }, pop: 5, pv: 900, vitesse: 3.6, degats: 55, cadence: 2.6, portee: 10, viseAir: true, vole: true, bonus: { batiment: 1.6 } },
  // Salle d'armes : combattants au corps à corps (le soldat « Toon » et ses armes).
  lame:      { temps: 15, nom: 'Lame',      ere: 1, produitA: 'arene', cout: { eau: 50, minerai: 30 },                  pop: 1, pv: 85,  vitesse: 3.7, degats: 9,  cadence: 0.7, portee: 1.1, viseAir: false, bonus: { infanterie: 1.3 } },
  marteleur: { temps: 20, nom: 'Marteleur', ere: 1, produitA: 'arene', cout: { eau: 60, minerai: 70 },                  pop: 1, pv: 130, vitesse: 2.8, degats: 24, cadence: 1.6, portee: 1.2, viseAir: false, bonus: { batiment: 2.5, vehicule: 1.3 } },
  sabreur:   { temps: 22, nom: 'Sabreur',   ere: 2, produitA: 'arene', cout: { eau: 70, minerai: 70, energie: 30 },     pop: 1, pv: 190, vitesse: 3.3, degats: 19, cadence: 0.95, portee: 1.3, viseAir: false, bonus: { vehicule: 2.2 } },
  aether:    { temps: 28, nom: 'Lame d\'Aether', ere: 3, produitA: 'arene', cout: { eau: 90, minerai: 90, solarite: 50 }, pop: 2, pv: 240, vitesse: 3.8, degats: 32, cadence: 0.9, portee: 1.4, viseAir: false, bonus: { infanterie: 1.3, vehicule: 1.3 } },
  // Atelier mécanique : machines de combat.
  araignee:  { temps: 24, nom: 'Robot araignée', ere: 2, produitA: 'atelier', cout: { minerai: 120, energie: 60 },      pop: 2, pv: 260, vitesse: 4.4, degats: 13, cadence: 0.9, portee: 6, viseAir: false, bonus: { infanterie: 1.4 } },
  araigneeCanon: { temps: 30, nom: 'Araignée à canon', ere: 2, produitA: 'atelier', cout: { minerai: 170, energie: 80 }, pop: 3, pv: 300, vitesse: 3.6, degats: 32, cadence: 2.3, portee: 9.5, viseAir: false, bonus: { vehicule: 1.4, batiment: 1.4 } },
  cogneur:   { temps: 34, nom: 'Striker cogneur', ere: 2, produitA: 'atelier', cout: { minerai: 220, energie: 110 },    pop: 3, pv: 720, vitesse: 3.1, degats: 46, cadence: 1.4, portee: 1.8, viseAir: false, bonus: { batiment: 2, vehicule: 1.3 } },
  strikerLaser: { temps: 36, nom: 'Striker laser', ere: 2, produitA: 'atelier', cout: { minerai: 230, energie: 130, solarite: 20 }, pop: 3, pv: 500, vitesse: 3.2, degats: 22, cadence: 1.1, portee: 8.5, viseAir: true },
  strikerMissiles: { temps: 42, nom: 'Striker lance-missiles', ere: 3, produitA: 'atelier', cout: { minerai: 260, energie: 150, solarite: 60 }, pop: 4, pv: 580, vitesse: 3, degats: 40, cadence: 2.6, portee: 12.5, viseAir: true, bonus: { batiment: 1.5 } },
  strikerAssaut: { temps: 44, nom: 'Striker d\'assaut', ere: 3, produitA: 'atelier', cout: { minerai: 280, energie: 140, solarite: 60 }, pop: 4, pv: 900, vitesse: 3, degats: 54, cadence: 1.8, portee: 9, viseAir: false, bonus: { vehicule: 1.6, machine: 1.3, infanterie: 1.2 } },
  // Communes à toutes les factions.
  tireur:    { temps: 20, nom: 'Tireur d\'élite', ere: 1, produitA: 'caserne', cout: { eau: 60, minerai: 50, energie: 20 }, pop: 1, pv: 70, vitesse: 2.9, degats: 24, cadence: 2.4, portee: 10.5, viseAir: false, bonus: { infanterie: 1.6, vehicule: 0.6 } },
  sam:       { temps: 30, nom: 'Lance-SAM', ere: 2, produitA: 'usine', cout: { minerai: 170, energie: 90 }, pop: 3, pv: 260, vitesse: 3.4, degats: 34, cadence: 2.6, portee: 12, viseAir: true, bonus: { air: 2, sol: 0.35 } },
  // Unités d'ère 1 propres à chaque faction (Caserne).
  garde:     { temps: 20, nom: 'Garde d\'assaut', ere: 1, produitA: 'caserne', cout: { eau: 60, minerai: 55 }, pop: 1, pv: 105, vitesse: 2.6, degats: 13, cadence: 1.4, portee: 4, viseAir: false, bonus: { infanterie: 1.3, batiment: 1.2 }, faction: 0 },
  commando:  { temps: 16, nom: 'Commando', ere: 1, produitA: 'caserne', cout: { eau: 55, minerai: 35 }, pop: 1, pv: 72, vitesse: 4, degats: 7, cadence: 0.55, portee: 5.5, viseAir: true, bonus: { ouvrier: 1.8, air: 1.3 }, faction: 1 },
  vigile:    { temps: 18, nom: 'Vigile antiaérien', ere: 1, produitA: 'caserne', cout: { eau: 55, minerai: 45, energie: 10 }, pop: 1, pv: 75, vitesse: 2.9, degats: 8, cadence: 1.1, portee: 7, viseAir: true, bonus: { air: 2, vehicule: 0.8 }, faction: 3 },
  // Consortium Arès : blindés lourds.
  chasseurChars: { temps: 34, nom: 'Chasseur de chars', ere: 2, produitA: 'usine', cout: { minerai: 210, energie: 80 }, pop: 3, pv: 380, vitesse: 3.2, degats: 56, cadence: 3, portee: 10, viseAir: false, bonus: { vehicule: 1.8, infanterie: 0.6 }, faction: 0 },
  exo:       { temps: 26, nom: 'Exosquelette « Finn »', ere: 2, produitA: 'caserne', cout: { eau: 80, minerai: 120, energie: 40 }, pop: 2, pv: 330, vitesse: 3, degats: 12, cadence: 0.7, portee: 6, viseAir: true, bonus: { infanterie: 1.4 }, faction: 0 },
  zenith:    { temps: 40, nom: 'Bombardier « Zenith »', ere: 3, produitA: 'hangar', cout: { minerai: 260, energie: 140, solarite: 80 }, pop: 4, pv: 430, vitesse: 5, degats: 70, cadence: 3.4, portee: 3.5, viseAir: false, vole: true, bonus: { batiment: 2.2 }, faction: 0 },
  // Compagnie Boréale : vitesse et aviation.
  avc:       { temps: 24, nom: 'Blindé léger AVC', ere: 2, produitA: 'usine', cout: { minerai: 140, energie: 60 }, pop: 2, pv: 300, vitesse: 6.2, degats: 12, cadence: 0.8, portee: 6, viseAir: false, bonus: { infanterie: 1.4 }, faction: 1 },
  challenger: { temps: 26, nom: 'Chasseur lourd « Challenger »', ere: 2, produitA: 'hangar', cout: { minerai: 130, energie: 80, solarite: 30 }, pop: 2, pv: 210, vitesse: 8, degats: 16, cadence: 0.9, portee: 6, viseAir: true, vole: true, bonus: { air: 1.6 }, faction: 1 },
  pancake:   { temps: 40, nom: 'Soucoupe « Pancake »', ere: 3, produitA: 'hangar', cout: { minerai: 260, energie: 160, solarite: 90 }, pop: 4, pv: 620, vitesse: 4.6, degats: 28, cadence: 1.3, portee: 7, viseAir: true, vole: true, bonus: { infanterie: 1.4 }, faction: 1 },
  // Ligue Australe : infanterie et blindés polyvalents.
  grenadier: { temps: 18, nom: 'Lance-grenades', ere: 1, produitA: 'caserne', cout: { eau: 60, minerai: 55, energie: 10 }, pop: 1, pv: 70, vitesse: 2.8, degats: 16, cadence: 2.2, portee: 7.5, viseAir: false, bonus: { infanterie: 1.5, batiment: 1.4 }, faction: 2 },
  huit:      { temps: 32, nom: 'Blindé 8×8', ere: 2, produitA: 'usine', cout: { minerai: 190, energie: 70 }, pop: 3, pv: 430, vitesse: 4, degats: 30, cadence: 1.8, portee: 8, viseAir: false, bonus: { vehicule: 1.2, infanterie: 1.2 }, faction: 2 },
  executioner: { temps: 42, nom: 'Croiseur « Executioner »', ere: 3, produitA: 'hangar', cout: { minerai: 280, energie: 160, solarite: 90 }, pop: 4, pv: 720, vitesse: 4, degats: 40, cadence: 2.2, portee: 9, viseAir: true, vole: true, bonus: { batiment: 1.4 }, faction: 2 },
  // Syndicat Solaris : défense et énergie.
  canonAA:   { temps: 28, nom: 'Canon anti-aérien', ere: 2, produitA: 'usine', cout: { minerai: 160, energie: 90 }, pop: 3, pv: 300, vitesse: 3.4, degats: 26, cadence: 1, portee: 10.5, viseAir: true, bonus: { air: 1.9, sol: 0.4 }, faction: 3 },
  spitfire:  { temps: 22, nom: 'Chasseur « Spitfire »', ere: 2, produitA: 'hangar', cout: { minerai: 110, energie: 70, solarite: 20 }, pop: 2, pv: 150, vitesse: 9.5, degats: 10, cadence: 0.7, portee: 5.5, viseAir: true, vole: true, bonus: { air: 1.6 }, faction: 3 },
  imperial:  { temps: 55, nom: 'Vaisseau amiral « Imperial »', ere: 3, produitA: 'hangar', cout: { minerai: 380, energie: 220, solarite: 150 }, pop: 6, pv: 1150, vitesse: 3.2, degats: 52, cadence: 2.4, portee: 11, viseAir: true, vole: true, bonus: { batiment: 1.5 }, faction: 3 },
  navette:   { temps: 25, nom: 'Navette',   ere: 1, produitA: 'quai',    cout: { minerai: 120, energie: 40 },              pop: 2, pv: 220, vitesse: 6,   degats: 0,  cadence: 1,   portee: 0, viseAir: false, vole: true },
};

export interface BuildingRule { /** Rayon au sol, en mètres. */ rayon: number; nom: string; ere: 1 | 2 | 3; cout: Cost; pv: number; construction: number; role: string }

export const BUILDINGS: Record<string, BuildingRule> = {
  centre:     { rayon: 4.7, nom: 'Centre de commandement', ere: 1, cout: {},                                         pv: 2400, construction: 0,  role: 'Ouvriers, dépôt, passage d\'ère, condition de victoire' },
  habitat:    { rayon: 2.6, nom: 'Habitat',                ere: 1, cout: { minerai: 30 },                            pv: 250,  construction: 20, role: '+5 population' },
  stationEau: { rayon: 2.4, nom: 'Station d\'eau',         ere: 1, cout: { minerai: 100 },                           pv: 400,  construction: 25, role: 'Dépôt d\'eau' },
  depotMinier:{ rayon: 2.8, nom: 'Dépôt minier',           ere: 1, cout: { minerai: 100 },                           pv: 400,  construction: 25, role: 'Dépôt de minerai' },
  centrale:   { rayon: 2.4, nom: 'Centrale solaire',       ere: 1, cout: { minerai: 80 },                            pv: 300,  construction: 20, role: '+1 énergie/s' },
  caserne:    { rayon: 3.6, nom: 'Caserne',                ere: 1, cout: { minerai: 150 },                           pv: 900,  construction: 35, role: 'Fantassins, éclaireurs' },
  mur:        { rayon: 1.0, nom: 'Mur',                    ere: 1, cout: { minerai: 5 },                             pv: 300,  construction: 5,  role: 'Bloque le passage' },
  porte:      { rayon: 2.6, nom: 'Porte',                  ere: 1, cout: { minerai: 30 },                            pv: 500,  construction: 10, role: 'S\'ouvre pour son camp' },
  tourelle:   { rayon: 1.6, nom: 'Tourelle',               ere: 1, cout: { minerai: 120, energie: 40 },              pv: 600,  construction: 25, role: 'Anti-sol, portée 9' },
  quai:       { rayon: 4.2, nom: 'Quai orbital',           ere: 1, cout: { minerai: 150 },                           pv: 800,  construction: 35, role: 'Navettes de transport ; se construit au bord du vide' },
  raffinerie: { rayon: 2.8, nom: 'Raffinerie de solarite', ere: 2, cout: { minerai: 150 },                           pv: 500,  construction: 30, role: 'Dépôt de solarite' },
  recycleur:  { rayon: 1.8, nom: 'Recycleur d\'humidité',  ere: 2, cout: { minerai: 60 },                            pv: 200,  construction: 15, role: 'Eau infinie, lente' },
  usine:      { rayon: 4.2, nom: 'Usine',                  ere: 2, cout: { minerai: 200, energie: 100 },             pv: 1200, construction: 45, role: 'Blindés' },
  hangar:     { rayon: 3.8, nom: 'Hangar de drones',       ere: 2, cout: { minerai: 150, energie: 50, solarite: 50 }, pv: 900, construction: 40, role: 'Drones' },
  tourelleAA: { rayon: 1.6, nom: 'Tourelle anti-aérienne', ere: 2, cout: { minerai: 120, energie: 50 },              pv: 500,  construction: 25, role: 'Anti-air, portée 9' },
  bouclier:   { rayon: 2.4, nom: 'Générateur de bouclier', ere: 2, cout: { minerai: 200, energie: 150, solarite: 50 }, pv: 600, construction: 45, role: 'Dôme rayon 10, absorbe 1 500' },
  sentinelle: { rayon: 1.8, nom: 'Sentinelle', ere: 3, cout: {}, pv: 1100, construction: 0, role: 'Garde neutre d\'un gros gisement' },
  defense:    { rayon: 2.2, nom: 'Défense orbitale',       ere: 3, cout: { minerai: 250, energie: 150, solarite: 100 }, pv: 1400, construction: 50, role: 'Canon lourd sol et air, portée 14' },
  ascenseur:  { rayon: 5.5, nom: 'Ascenseur orbital',      ere: 3, cout: { eau: 1000, minerai: 1000, energie: 500, solarite: 600 }, pv: 6000, construction: 240, role: 'Merveille : s\'il tient 5 min une fois achevé, c\'est la victoire' },
  arene:      { rayon: 3.4, nom: 'Salle d\'armes',         ere: 1, cout: { minerai: 150 },                           pv: 900,  construction: 35, role: 'Combattants au corps à corps' },
  atelier:    { rayon: 4.2, nom: 'Atelier mécanique',      ere: 2, cout: { minerai: 220, energie: 120 },             pv: 1300, construction: 50, role: 'Machines de combat' },
  labo:       { rayon: 3.2, nom: 'Laboratoire',            ere: 2, cout: { minerai: 150, solarite: 50 },             pv: 700,  construction: 40, role: '6 recherches' },
};

/** Recherches du Laboratoire (ère 2). */
export interface ResearchRule { nom: string; effet: string; cout: Cost; temps: number; /** Ère minimale (2 par défaut, comme le laboratoire). */ ere?: number }
export const RESEARCH: Record<string, ResearchRule> = {
  armure:  { nom: 'Armure',            effet: '-15 % de dégâts subis par les unités', cout: { minerai: 150, solarite: 60 }, temps: 40 },
  degats:  { nom: 'Armement',          effet: '+15 % de dégâts',                      cout: { minerai: 150, solarite: 80 }, temps: 40 },
  recolte: { nom: 'Outils de forage',  effet: '+20 % de vitesse de récolte',          cout: { minerai: 120, solarite: 40 }, temps: 35 },
  murs:    { nom: 'Murs renforcés',    effet: '+50 % de PV pour murs et portes',      cout: { minerai: 150, solarite: 30 }, temps: 30 },
  portee:  { nom: 'Optiques',          effet: '+2 de portée pour les tourelles',      cout: { minerai: 120, solarite: 60 }, temps: 35 },
  moteurs: { nom: 'Moteurs',           effet: '+15 % de vitesse pour les véhicules',  cout: { minerai: 120, solarite: 60 }, temps: 35 },
  propulseurs: { nom: 'Propulseurs',     effet: '+25 % de vitesse et +2 places pour les navettes', cout: { minerai: 150, energie: 75, solarite: 25 }, temps: 25 },
  reseau:  { nom: 'Réseau énergétique', effet: '-20 % d\'énergie pour les bâtiments',  cout: { minerai: 125, energie: 100, solarite: 25 }, temps: 25 },
  nano:    { nom: 'Nano-blindage',     effet: '-15 % de dégâts subis (en plus de l\'Armure)', cout: { minerai: 250, solarite: 150 }, temps: 45, ere: 3 },
  surcharge: { nom: 'Surcharge',      effet: '+25 % de dégâts pour tourelles et défenses', cout: { minerai: 200, energie: 150, solarite: 100 }, temps: 40, ere: 3 },
  barriere: { nom: 'Barrière ionique', effet: 'Murs et portes arrêtent les appareils ennemis ; à activer, consomme de l\'énergie', cout: { minerai: 200, energie: 150, solarite: 100 }, temps: 40, ere: 3 },
  reparation: { nom: 'Réparation auto',  effet: '+3 PV/s pour les unités hors combat', cout: { minerai: 150, energie: 150, solarite: 75 }, temps: 35 },
};
/** Tourelles : portée, dégâts, cadence (section 6). */
export const TURRETS = {
  /** Le Centre se défend seul, comme le forum d'Age of Empires. */
  centre:     { portee: 8, degats: 10, cadence: 1,   air: false },
  tourelle:   { portee: 9, degats: 15, cadence: 0.8, air: false },
  tourelleAA: { portee: 9, degats: 25, cadence: 1,   air: true },
  /** Sentinelle neutre : garde les gros gisements (option « Centre disputé »). */
  sentinelle: { portee: 9, degats: 22, cadence: 1.2, air: false },
  /** Ère 3 : vise le sol et l'air. */
  defense:    { portee: 14, degats: 45, cadence: 2.5, air: false, both: true },
};
/** Barrière ionique : énergie consommée par seconde pour 10 poteaux ou portes (au moins 1), marge d'arrêt autour d'un poteau. */
export const ION = { parDix: 1, marge: 0.5 };
export const SHIELD = { rayon: 10, max: 1500, recharge: 20, energieParSeconde: 2 };
/** Recycleur d'humidité : eau récoltée par seconde par son ouvrier (source infinie mais lente). */
/** Navette : nombre d'unités transportées. */
export const NAVETTE = { places: 8 };
export const RECYCLEUR = { parSeconde: 0.5 };
