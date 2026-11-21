# Code du jeu : Age of Ares

## Lancer le jeu sur le Mac
Dans ce dossier, depuis le Terminal :
- `npm install` (une seule fois)
- `npm run dev` puis ouvrir l'adresse affichée (sur le téléphone : l'adresse « Network », même Wi-Fi)
- `sh build.sh` fabrique la version à mettre en ligne dans `dist/`

## Organisation
- `src/data/rules.ts` : LE fichier de règles (coûts, PV, dégâts, ères)
- `src/mapgen/` : génération de la carte à partir d'une graine
- `src/sim/` : simulation à pas fixe de 100 ms (démarre au jalon 2)
- `src/render/` : scène 3D, terrain, modèles
- `src/input/` : caméra tactile, souris, clavier
- `src/ui/` : barre de ressources, mini-carte, boutons
- `public/assets/` : modèles (.gltf rangés en .json, géométrie incluse), textures, police

## État
- Jalon 1 « Socle » : fait le 13/11/2026 (terrain, lumière, caméra, mini-carte, mise en ligne).
- Jalon 2 « Unités libres » : fait le 13/11/2026 (simulation à ticks, sélection, ordres, 4 formations, évitement). Test automatique : `npx tsx tests/j2.ts`.
- À améliorer : précision des formations à l'arrivée (60 à 90 % des unités à leur place exacte), personnages animés pas encore instanciés.
- Jalon 3 « Cartes » : fait le 14/11/2026 (générateur à graine : plateaux, falaises, rampes, gisements placés par règles, vérification automatique). Test : `npx tsx tests/j3.ts` (100 graines, toutes jouables).
- À améliorer : rendu des falaises (encore peu lisibles vues de dessus), seulement 20 % des graines valides du premier coup (les autres sont régénérées automatiquement).
- Jalon 4 « Économie ère 1 » : fait le 14/11/2026 (récolte en allers-retours, dépôts, construction, habitats, centrales, production d'ouvriers, ralliement, murs et portes). Test : `npx tsx tests/j4.ts` (25 ouvriers atteints vers 5 min sur 3 cartes).
- Écarts avec le cahier des charges : le Centre loge 10 unités (et non 5) pour que le départ à 4 ouvriers + 1 éclaireur tienne ; la porte ne bloque encore personne (fermeture à l'ennemi au jalon 5).
- Jalon 5 « Combat ère 1 » : fait le 14/11/2026 (caserne, fantassin, éclaireur, tourelle, riposte, postures, attaque-déplacement, bonus de hauteur, porte fermée à l'ennemi, victoire et écran de fin). Test : `npx tsx tests/j5.ts`.
- Non testé : tourelle, murs et portes en situation réelle ; réparation des bâtiments absente.
- Jalon 6 « IA » : fait le 14/11/2026 (`src/sim/ai.ts`, trois niveaux, menu de départ). Test : `npx tsx tests/j6.ts` (IA contre IA ; hiérarchie des niveaux respectée dans 10 parties sur 12, Difficile ne domine pas encore nettement Normal).
- Jalon 7 « Ère 2 » : fait le 14/11/2026 (passage d'ère, solarite et raffinerie, recycleur, usine et blindé, hangar et drone volant, anti-aérien, bouclier, laboratoire et 6 recherches, IA en ère 2). Test : `npx tsx tests/j7.ts`.
- Écarts : le Centre tire sur les ennemis proches (ajout, comme le forum d'AoE) ; la solarite ne se dépose qu'à la Raffinerie.
- Jalon 8, première partie (14/11/2026) : son (`src/audio/audio.ts`), musiques Suno, 15 répliques du Consortium Arès, bruitages, bouton muet. Les répliques découpées sont dans `03_Assets/voix/` ; celles de la Compagnie Boréale sont découpées mais pas encore utilisées, et 5 de leurs coupes sont à vérifier à l'oreille.
- Jalon 8, deuxième partie (14/11/2026) : falaises habillées de rochers et ombrées, blindé remplacé par un mech animé (Quaternius, CC0), ère affichée sur téléphone. Essai de renforcement du niveau Difficile abandonné (il devenait trop passif) : il bat Facile mais pas nettement Normal.
- Reste du jalon 8 : falaises plus lisibles, vrai modèle de blindé, personnages instanciés, installation sur l'écran d'accueil (demande un hébergement hors Claude), équilibrage.
- Retours du 14/11/2026 : écran d'accueil, tailles de carte (petite, moyenne, grande), bouton Détruire, rotation forcée de l'écran, ouvrier sans arme.
- Vide intersidéral, première version (14/11/2026) : terrain « Archipel » (vide autour de la carte et autour d'îles riches en ressources), Quai orbital (à bâtir au bord du vide), Navette de transport (8 places, embarquer / débarquer), pioche dans la main de l'ouvrier qui travaille. Test : `npx tsx tests/j9.ts`.
- Pas encore fait pour le vide : Barge minière, terrain « Îles » (chaque joueur sur la sienne), IA qui utilise les navettes et les îles.
- Cartes façon Age of Empires (14/11/2026) : 7 terrains (Terre ferme, Côtière, Continentale, Mont de solarite, Rivières avec 3 gués, Grandes îles, Petites îles), bords du vide arrondis ; « Archipel » supprimé. Aperçus : `npx tsx tests/maps.ts [petite|moyenne|grande]` (images dans tests/out). L'IA construit un quai et transporte son armée en navette (`npx tsx tests/j10.ts`).
- Ère 2 : les bâtiments prennent un style industriel (Kenney City Kit Industrial). Blindé et nouvelle Artillerie : véhicules 8×8 à roues qui tournent et tourelle qui vise pour Arès, chars à coussin d'air pour Boréale. Le mech n'est plus utilisé.
- Test des niveaux d'IA (j6) : 9 parties sur 12 conformes (10 avant l'ajout de l'artillerie).
- Coup de pioche (14/11/2026) : animation faite dans le code (le modèle n'en a pas) — pioche levée au-dessus de la tête, pause, frappe vers le sol, buste qui accompagne, deux mains sur le manche (cinématique inverse). Même geste pour construire. Réglages : `swingAngle` dans src/render/units.ts.
- Étapes 1 à 3 de la Bible (14/11/2026) :
  - Habillage : logo, fond du menu, icône d'onglet, icônes de ressources et de boutons (public/assets/ui, découpées depuis illustrationsaoa.zip), bannières Victoire/Défaite, couleurs de faction (Arès rouge-ambre, Boréale bleu glacier).
  - Contrôles : coûts en pastilles colorées, boutons grisés si trop cher, compteur et barre de production, vues C1/C2 (F1/F2), mini-carte agrandissable et appui long dessus pour envoyer la sélection, alerte d'attaque (onde, flèche, bouton, Espace), Repli, posture Passive.
  - Rythme : pause tactique (P), vitesses ×1/×1,5/×2, sauvegarde automatique par rejeu des ordres (src/sim/replay.ts, test `npx tsx tests/j11.ts`), mode IA contre IA, escarmouche de l'IA vers 3 à 4,5 min (test j6 : 11/12).
  - Icônes encore manquantes : Habitat (provisoire), Station d'eau, Quai, Recycleur, Mur, Porte, Éclaireur, Artillerie (prompt fourni à Jean-Baptiste).

- Étapes 4, 5, 7, 8 et 9 de la Bible (14/11/2026) :
  - Îles : ordre « Transporter ici » (toucher un point d'une autre île avec des unités au sol : la navette la plus proche vient les chercher et les dépose), places dans la navette (1 par fantassin, 2 par éclaireur, 3 par véhicule ; 8 places, +2 avec Propulseurs, +2 avec la doctrine Aéronavale), pastilles des places au-dessus de la navette.
  - Unités : Ingénieur (répare 18 PV/s, capture un bâtiment ennemi sous 30 % de vie, sauf Centre et murs), Anti-blindage (×1,6 contre véhicules et bâtiments), Intercepteur (ère 2, hangar, ×1,5 contre navettes, drones, éclaireurs). Les ouvriers réparent aussi (7 PV/s). Contres : blindé ×1,3 contre l'infanterie, fantassin ×1,4 contre anti-blindage et ingénieur. Recherches Réseau énergétique (−20 % d'énergie des bâtiments) et Réparation automatique (+3 PV/s hors combat).
  - Doctrines choisies au menu : Industrielle (récolte +15 %, bâtiments −10 % de minerai), Aéronavale (navettes +2 places et plus rapides), Frappe (tir +15 %, +1 PV/s hors combat). L'IA Difficile prend Industrielle (Aéronavale sur les îles) ; Facile et Normal jouent sans doctrine, sinon Difficile ne battait plus Normal.
  - Brouillard de guerre (option du menu) : jamais vu = noir, exploré = assombri et désaturé, vu = normal ; unités ennemies cachées hors de vue, bâtiments ennemis visibles une fois découverts ; mini-carte voilée. L'IA ne le subit pas. Vue stratégique : anneaux agrandis quand on dézoome. Code : src/render/fog.ts.
  - Mode Blitz (option du menu) : 10 minutes, compte à rebours et scores en haut à gauche, victoire aux points.
  - Tests : j12 (réparation, capture, places, transport, doctrines, Blitz) ; j6 12/12 ; j9, j10, j11 (rejeu, la doctrine est sauvegardée) OK.
  - Corrigé : les raccourcis clavier étaient réenregistrés à chaque image (P pouvait ne rien faire).

- Retours du 14/11/2026 au soir :
  - Statistiques de fin façon Age of Empires (src/ui/stats.ts) : onglets Score, Militaire, Économie, Technologie, Société, Unités (produites et perdues par type), Chronologie (8 courbes, repères ère 2 et premier combat, lecture des valeurs au doigt, moments clés). Étoile et cadre doré sur le meilleur camp. Les chiffres sont calculés dans la simulation (relevé toutes les 30 s) : ils survivent à une reprise de partie. Le score se décompose en militaire, économie, technologie et société (c'est aussi lui qui départage en Blitz).
  - Caméra : elle ne descend plus sous le niveau du sol au-dessus du vide.
  - Fichier unique : les icônes des boutons s'affichent (les images insérées en HTML n'étaient pas converties).
  - Gisements d'eau : aiguilles de glace bleues translucides sur une dalle givrée, avec reflet (src/render/ice.ts, tout en code).
  - Panneau d'ordres : il s'arrête avant les boutons rapides et la mini-carte (au-dessus d'eux si l'écran est étroit) et se replie avec le bouton ▾.

- Fin du plan de la Bible (14/11/2026, hors étape 6 reportée à une autre version) :
  - Compteur d'ouvriers « ⛏ N » au-dessus de chaque gisement exploité (src/render/labels.ts).
  - Vue stratégique : au-delà de ~70 m de recul, chaque unité devient une pastille aux couleurs du camp (pioche, fantassin, char, avion), de taille constante à l'écran.
  - Option « Événements : Tempêtes » : première tempête à 4 min puis toutes les 5 min, 45 s ; alerte 15 s avant, tourelles et anti-aérien coupés (pas le Centre), unités −20 % de vitesse, vue −40 % ; ciel et brume teintés. Test j12.
  - Écran de fin en IA contre IA : « Arès / Boréale l'emporte ».
- Suite prévue : camp Boréal avec ses bâtiments, Barge minière, ère 3 « Orbitale », parties à 4, multijoueur, héros ; étape 6 (vétérance, relais neutres, capsules, sentinelles) dans une autre version.

- 15/11/2026 — Camp Boréal et ère 3 « Orbitale » :
  - Boréale a ses propres bâtiments-clés dès l'ère 1 : Centre, Caserne, Centrale, Laboratoire, Quai et Bouclier (Small Hearth Studios, « Low Poly Sci-fi RTS pack »). Les autres gardent l'habillage commun.
  - Ère 3 : passage au Centre (800 eau, 600 minerai, 300 solarite, 120 s) avec 2 types de bâtiments de l'ère 2 ; un satellite tourne au-dessus des grands bâtiments.
  - Nouveautés de l'ère 3 : Défense orbitale (vise sol et air, portée 14), Cuirassé du vide (hangar, volant, 900 PV ; Imperial pour Arès, Executioner pour Boréale, Quaternius CC0), recherches Nano-blindage et Surcharge, Ascenseur orbital (merveille : achevé et tenu 5 min = victoire, compte à rebours affiché pour les deux camps ; ne peut pas être capturé).
  - IA : Normal vise l'ère 3 vers 18 min, Difficile vers 13 min (elle met alors de côté), Défense orbitale, Cuirassés, Ascenseur pour Difficile ; toute IA attaque en priorité un Ascenseur ennemi. En pratique les parties IA contre IA se terminent souvent avant l'ère 3.
  - Tests : j13 (ère 3), tous les autres OK, j6 12/12.

- 15/11/2026 (soir) — Vétérance, centre disputé, parties à 4 :
  - Vétérance : 2, 5 puis 10 éliminations donnent 1, 2, 3 étoiles (+10 % PV et dégâts, +5 % de cadence par étoile), étoiles dorées au-dessus des unités, compteur dans le panneau, ligne « Promotions » dans les statistiques.
  - Option de menu « Centre : Calme / Disputé ». Disputé : relais à capturer (zone de 7 m, 15 s, seule une équipe présente ; rapporte 1,5 minerai et 0,5 solarite par seconde ; un relais tenu doit d'abord être neutralisé), une capsule de ravitaillement toutes les 3 min près du centre (+150 eau, +150 minerai, +50 solarite au premier qui la touche), sentinelles neutres sur les grosses poches de solarite (+100 solarite pour qui la détruit). L'IA Normal et Difficile va tenir un relais et ramasser les capsules ; elle évite les gisements gardés.
  - Parties à 4 (menu « Joueurs ») : 1 contre 1, 4 joueurs chacun pour soi, 2 contre 2 (toi + IA alliée). Cartes à symétrie par quart de tour (Terre ferme, Continentale, Mont de solarite ; carte moyenne ou grande). Nouveaux camps : Ligue Australe (vert) et Syndicat Solaris (violet). Équipes : vision partagée avec l'allié, victoire de l'équipe ; un camp sans Centre est éliminé.
  - Code : la simulation gère N camps, des équipes et un camp neutre (Sim.foe, sides, setTeams, addNeutral). Tests j12 (vétérance, centre disputé), j14 (parties à 4), maps4.ts (cartes à 4 : 12/12 valides) ; tous les autres OK, j6 12/12.

- 15/11/2026 (soir, suite) : menu de départ en trois onglets (Partie, Carte avec aperçu, Règles ; côte à côte sur grand écran), résumé de la partie au-dessus de JOUER. Les 7 terrains sont jouables à 4 : Côtière (baies et îlots au milieu des bords), Rivières (deux rivières en croix, 4 gués), Grandes îles (une île par joueur), Petites îles (îles neutres entre les joueurs). Le quai tolère un sol moins régulier et l'IA choisit un rivage où il est vraiment constructible. Tests : maps4 12/12 pour les 7 terrains, j14 (dont Grandes îles à 4), j6 12/12, tous OK.

`_to_delete/` contient d'anciens fichiers de travail : tu peux supprimer ce dossier.

- 16/11/2026 — Nouveaux bâtiments, nouvelles unités, ère 3 visible :
  - Salle d'armes (ère 1, 150 minerai) : combattants au corps à corps, le soldat « Toon » avec ses armes. Lame (couteau, rapide, bonus contre l'infanterie), Marteleur (marteau, lent, ×2,5 contre les bâtiments), Sabreur (épée sci-fi, ère 2, bonus contre les véhicules), Lame d'Aether (ère 3, élite). Pas de traçante au corps à corps : étincelles et choc métallique au contact (son synthétisé), petite secousse pour les coups lourds.
  - Atelier mécanique (ère 2, 220 minerai, 120 énergie) : Robot araignée, Araignée à canon, Mecha à épée, Striker cogneur (aux poings), Striker laser (vise aussi l'air) ; ère 3 : Striker lance-missiles (portée 12,5) et Striker d'assaut. Les machines comptent comme des véhicules pour les bonus (anti-blindage, Sabreur) et profitent de la recherche Moteurs.
  - Le Striker est animé (repos, marche, coup de poing) ; ses armes sont fixées aux avant-bras et aux épaules et suivent l'animation.
  - Ère 3 « Orbitale » : tous les bâtiments changent d'aspect (alliage bleuté, tour blanche aux modules lumineux aux couleurs du camp, esplanade sombre bordée d'un anneau lumineux, pylônes d'énergie, halo qui tourne au sommet), en plus des satellites.
  - IA Difficile : Salle d'armes à l'ère 1, Atelier mécanique à l'ère 2, et les unités qui vont avec.
  - Icônes des nouveaux boutons rendues à partir des modèles.
  - Crédits des nouveaux modèles : Medium Mech Striker (Dominik, gratuit, usage commercial autorisé) ; Robot araignée (Quaternius, Sci-Fi Essentials, CC0) ; Mecha à épée (Mech Pack, Pillow Case — licence à vérifier avant publication) ; armes SC-FI Melee Pack (Qubzy, CC-BY : crédit obligatoire) ; lame Aether Shard (SC-FI Melee Pack) ; tours de l'ère 3 (Asset Arena, Sci-Fi Buildings) ; bâtiments industriels (Kenney City Kit Industrial, CC0).
  - Tests : j16 (production, corps à corps, bonus, IA) ; tous les autres OK, j6 12/12.

- 16/11/2026 (nuit) — Retours sur les nouvelles unités :
  - Unités plus offensives : en posture agressive, une unité au repos repère un ennemi jusqu'à ~15 m (unité ou bâtiment, pas les sentinelles neutres) et va l'abattre ; quand une unité est touchée, les alliés inoccupés à moins de 13 m viennent l'aider.
  - Corps à corps : geste propre à chaque arme, calculé en cinématique inverse sur les bras. Marteau levé au-dessus de la tête et abattu à deux mains, épée armée sur l'épaule puis taille en diagonale, couteau ramené contre soi puis estoc ; l'impact du geste tombe au moment du coup.
  - Striker : il marche maintenant dans le bon sens ; ses armes sont fixées sur les avant-bras (canons, lasers, mitrailleuses) et sur les épaules (lance-missiles), mesurées sur le modèle, et suivent les bras.
  - Robot araignée : pattes animées en code (marche par paires diagonales, corps qui ondule), légère respiration à l'arrêt.
  - Icônes : toutes les unités ont une icône rendue à partir de leur modèle 3D.
  - Tests : j16 complété (agressivité, entraide) ; tous OK, j6 12/12.

- 16/11/2026 (nuit, suite) — Effets d'armes et tourelles :
  - Mecha à épée retiré (pas d'animation).
  - Chaque arme à distance a son effet et son son (src/render/effects.ts, méthode weapon ; tableaux UNIT_WEAPON et TOWER_WEAPON dans main.ts) :
    fusil (rafale de 2 balles traçantes), mitrailleuse (rafale de 4, deux canons), canon (éclair, fumée, obus incandescent, impact), roquette (missile courbe avec flamme et traînée de fumée), artillerie (obus en cloche), laser (rayon à cœur blanc et halo cyan, deux bras pour le Striker laser), plasma vert (drone), plasma bleu (intercepteur), plasma orange (tourelle), salve de 4 missiles (Striker lance-missiles), assaut (obus + laser + roquette), Cuirassé (plasma violet lourd + missile), flak (tourelle anti-aérienne : traçantes et éclatements noirs en l'air), rayon lourd (Défense orbitale), rayon rouge (sentinelle). Sons synthétisés pour laser, plasma, départ de missile, mortier, flak et rayon ; explosion sonore à l'arrivée des obus et missiles. Les impacts n'éparpillent plus de gros débris.
  - Tourelles surélevées de 1,7 m (fût plus haut) : leur tête domine les murs et tire par-dessus.
- 16/11/2026 : portes agrandies : 5 m de passage (rayon 2,6 au lieu de 1,6) et 4,6 m de haut, pour que les mechs passent dessous ; test j15 complété (un Striker traverse la porte, l'ennemi non).
- 16/11/2026 : Barrière ionique (recherche du Laboratoire, ère 3 : 200 minerai, 150 énergie, 100 solarite). Bouton « Barrière ionique » sur la sélection d'un mur ou d'une porte : active ou coupe la barrière pour tous tes murs. Active, elle dresse un voile lumineux aux couleurs du camp au-dessus des murs et portes ; les appareils ennemis ne peuvent plus y entrer (ils peuvent en sortir), les tiens passent. Coût : 1 énergie/s pour 10 poteaux ou portes (au moins 1) ; coupure automatique sans énergie. Le bouton Armée sélectionne aussi les nouvelles unités. Test j16 complété.
- 16/11/2026 — Factions :
  - Nouveau choix « Faction » dans le menu (Arès : blindés lourds ; Boréale : vitesse et aviation ; Australe : infanterie et 8×8 ; Solaris : défense anti-aérienne). Les adversaires prennent les autres factions. Le choix est gardé dans la sauvegarde et la reprise. L'aspect des bâtiments suit la faction.
  - Unités communes nouvelles : Tireur d'élite (caserne, longue portée, fort contre l'infanterie) et Lance-SAM (usine, ère 2, ×2 contre l'air, faible au sol).
  - Arès : Chasseur de chars (usine), Exosquelette « Finn » (caserne, ère 2), Bombardier « Zenith » (hangar, ère 3, ×2,2 contre les bâtiments).
  - Boréale : Blindé léger AVC (usine, très rapide), Chasseur lourd « Challenger » (hangar), Soucoupe « Pancake » (hangar, ère 3).
  - Australe : Lance-grenades (caserne, ère 1), Blindé 8×8 (usine), Croiseur « Executioner » (hangar, ère 3).
  - Solaris : Canon anti-aérien (usine), Chasseur « Spitfire » (hangar), Vaisseau amiral « Imperial » (hangar, ère 3).
  - Chaque bâtiment ne propose que les unités de ta faction ; tirs propres (précision, grenades en cloche, tapis de bombes) et icônes rendues à partir des modèles.
  - L'IA produit les unités de sa faction (environ une sur trois à la caserne, à l'usine en appui des blindés, au hangar ses vaisseaux lourds et ses chasseurs contre l'aviation adverse, le Lance-SAM face à beaucoup d'appareils).
  - Tests : j17 (choix, restriction, IA), j16 ajusté ; j6 10/12, j11, j12, j15 OK. À surveiller pour l'équilibrage : l'Exosquelette d'Arès paraît fort en début d'ère 2.
- 16/11/2026 — Confort de jeu :
  - Groupes de contrôle 1 à 5 (au-dessus des boutons rapides) : appui long ou clic droit sur un chiffre pour enregistrer la sélection, toucher pour la resélectionner, deux fois de suite pour centrer la caméra. Clavier : 1 à 5, Maj + chiffre pour enregistrer. Le chiffre affiche le nombre d'unités du groupe.
  - Production par lots : bouton ×1 / ×5 dans le panneau d'un bâtiment ; lance autant d'unités que la file (5 places) et les réserves le permettent.
  - Fiche d'unité : appui long ou clic droit sur un bouton de production, ou ⓘ à côté d'une sélection d'un seul type : vie, dégâts et dégâts par seconde, portée, vitesse, population, temps, coût, faction, points forts (▲) et faibles (▼).
  - L'alerte d'attaque avec flèche au bord de l'écran existait déjà (Espace pour y aller).
  - Règles du menu complétées.
- 16/11/2026 — Allègement pour le mobile (sans changement visible) :
  - Modèles 3D : normales et coordonnées de texture compressées (KHR_mesh_quantization, lu nativement par Three.js) et fichiers minifiés : 32 Mo → 24 Mo, moins de mémoire graphique. Captures avant/après identiques (unités, vaisseaux, base à l'ère 3). Outil : @gltf-transform (script opt2.mjs, hors projet) ; originaux gardés côté Claude.
  - Version en un seul fichier : les modèles sont inclus en texte et non plus en base64 de base64 : AgeOfAres.html passe de 61 Mo à 41,5 Mo (chargement plus rapide sur téléphone). Nouveau script mksingle.py à la racine du code.
- 16/11/2026 — Équilibrage :
  - Deux outils de test : tests/bal.ts (duels à coût égal entre toutes les unités de combat, 31 × 30 combats) et tests/balfac.ts (IA Difficile contre IA Difficile pour chaque paire de factions, 3 cartes, les deux côtés : 36 parties).
  - Correction : les bonus des unités d'origine (Fantassin, Blindé, Anti-blindage, Intercepteur, Drone, Éclaireur, Cuirassé) étaient écrits en dur dans le code et ignoraient les règles ; tous les bonus sont maintenant lus dans rules.ts. L'Exosquelette compte comme de l'infanterie.
  - Ajustements : Exosquelette 330 PV (420) et 12 dégâts (15) ; Spitfire 150 PV, 10 dégâts ; Anti-blindage ×3 contre les véhicules (×1,6), portée 8, 90 PV ; Sabreur ×2,2 contre les véhicules, 190 PV ; Striker d'assaut 900 PV, 54 dégâts toutes les 1,8 s, ×1,6 véhicules / ×1,2 infanterie, coût réduit ; Intercepteur 12 dégâts ; Canon anti-aérien ×1,9 contre l'air (×2,2) ; Tireur d'élite 70 PV ; AVC 300 PV ; Lance-grenades 70 PV, 16 dégâts, coût 60 eau / 55 minerai / 10 énergie.
  - Factions (IA contre IA) : avant, Australe gagnait 15 parties sur 18 (Lance-grenades dès l'ère 1) ; après : Arès 10/18, Boréale 9/18, Solaris 9/18, Australe 8/18.
  - Aide du menu (« Comment jouer ») : tableau de toutes les unités avec bâtiment, ère, faction, points forts, points faibles et unités qui les contrent. La fiche d'unité indique aussi « contré par ».
  - Limites : les duels ne mesurent pas le rôle contre les bâtiments (Artillerie, Marteleur, Zenith paraissent faibles en duel, c'est voulu) ; les parties IA se terminent souvent avant l'ère 3, les vaisseaux lourds sont donc moins éprouvés.
- 16/11/2026 — Tutoriel, défis et rediffusion :
  - Menu, onglet Partie, ligne « Défis » (carte fixe, petite, terre ferme, 1 contre 1, avec ta faction) :
    - Tutoriel : 10 objectifs guidés dans une carte en haut à gauche (sélectionner, récolter, Inactifs, produire, Habitat, Caserne, Fantassins, fiche d'unité, groupe 1, envoyer l'armée), contre une IA facile.
    - Défense de la base : tenir 5 minutes ; une vague par minute à partir de 30 s, de plus en plus forte (fantassins, anti-blindages, blindés, drones, artillerie) ; ère 2, 3 tourelles, une caserne et une petite armée au départ.
    - Raid éclair : une force de frappe (3 blindés, 6 fantassins, 3 anti-blindages, 2 Strikers laser) doit détruire le Centre ennemi (tourelles, troupes, IA normale) en 4 minutes ; défaite si le temps s'écoule ou si l'armée tombe.
    - Course à l'Orbitale : atteindre l'ère 3 en moins de 12 minutes (IA facile en face).
    - Écran de fin avec « Rejouer le défi » et « Menu ». Les défis ne remplacent pas la sauvegarde de la partie en cours.
  - Rediffusion : à la fin d'une partie, « Revoir la partie » (aussi dans le menu : « Revoir la dernière partie ») la rejoue entièrement, sans brouillard, avec une barre en haut (temps, vitesse ×1 / ×2 / ×4 / ×8, pause, quitter). Le joueur ne peut plus donner d'ordres ; la partie revue est identique à l'originale (vérifié par empreinte au tick près).
  - Tests : j18 (défis : vagues, victoire et défaite de chacun, calibrés avec l'IA : la Défense tombe vers 4 min sans rien faire et tient avec une IA Difficile ; le Raid est gagné en ~1 min par une attaque directe ; la Course est atteinte en 8,5 min par l'IA Difficile).
- 16/11/2026 — Vérification d'ensemble :
  - Tous les tests passent : j2 à j18 (formations, cartes, économie, IA et hiérarchie des niveaux, îles et navettes, Blitz, murs et portes, nouvelles unités, factions, défis), maps et maps4 (7 terrains, 12/12 cartes valides à 2 et à 4).
  - Fichier unique testé comme sur téléphone (écran 880×400, tactile) : chargement, partie à 4 IA Difficile en spectateur jusqu'à la victoire (16 min de jeu), apparition de chacune des 35 unités, tutoriel au doigt, groupe par appui long, fiche par appui long, mode pivoté, reprise d'une partie sauvegardée (état identique au tick près), rediffusion (identique) : aucune erreur dans la console.
  - Corrigé : sur un appareil chargé, l'appui long sur un bouton d'unité lançait la production au lieu d'ouvrir la fiche (le minuteur arrivait après le relâchement) ; la durée réelle de l'appui est maintenant prise en compte au relâchement (fiche d'unité, groupes 1 à 5, vues C1/C2).
  - Allégé : 3 modèles inutilisés retirés (Rover, Mech Quaternius, panneaux solaires) : fichier unique à 40,6 Mo.
  - Références : les 87 modèles appelés par le code existent tous.
- 16/11/2026 — Multijoueur en ligne (gratuit, sans compte, sans serveur de jeu) :
  - Adresse du jeu : https://jblang92-debug.github.io/Age-of-Ares/ (GitHub Pages, dépôt jblang92-debug/Age-of-Ares, branche main ; à activer une fois dans Settings → Pages). C'est cette adresse qu'il faut utiliser pour jouer en ligne : tout le monde a ainsi la même version.
  - Menu → « 🌐 EN LIGNE » : pseudo, « Créer un salon » (code de 5 lettres) ou code + « Rejoindre ». « Inviter (lien) » partage un lien qui ouvre directement le salon.
  - Salon (jusqu'à 4 places) : chaque joueur choisit sa faction et son équipe (A à D ; même lettre = alliés, toutes différentes = chacun pour soi) et se déclare prêt ; l'hôte règle taille, terrain, ressources, brouillard, et met chaque place libre en IA (facile, normale, difficile) ou la ferme. Il faut 2 ou 4 participants ; à 4, terrains Terre ferme, Continentale, Rivières ou Grandes îles.
  - Technique : connexion directe entre appareils (WebRTC, bibliothèque PeerJS ; le service public gratuit de PeerJS ne sert qu'à se trouver). Simulation identique chez tous (« lockstep ») : seuls les ordres circulent ; l'hôte fixe le tick d'application de chaque ordre (~0,3 s de délai) et attend un joueur qui a plus de 4 s de retard. Contrôle de synchronisation toutes les 10 s.
  - Déconnexion : un joueur silencieux 12 s est remplacé par l'IA ; il revient en rouvrant le jeu (la partie se rejoue jusqu'au moment présent puis il reprend son camp). Si c'est la liaison avec l'hôte qui coupe, l'invité choisit « Se reconnecter » ou « Continuer contre l'IA ». Si l'hôte ferme ou recharge le jeu, la partie en ligne s'arrête.
  - En partie en ligne : pas de pause ni d'accélération, pas de sauvegarde de reprise.
  - Testé à deux navigateurs (serveur PeerJS local) : salon, choix faction/équipe, 1 contre 1 et 2 contre 2 avec IA, ordres des deux côtés, états identiques au tick près, départ d'un joueur (IA qui reprend), retour du joueur (rattrapage puis IA rendue au joueur), toujours identiques.
  - Limites : sur certains réseaux 4G/5G la connexion directe peut échouer ; on ajoutera alors un relais gratuit (compte Metered). La version artifact Claude ne permet pas le jeu en ligne (restrictions de sécurité) : utiliser l'adresse GitHub Pages.
- 16/11/2026 — Correctif en ligne : chez l'hôte, la boucle de « rattrapage » prévue pour les invités en retard tournait en permanence (l'hôte se croyait toujours en retard de 3 ticks) : le jeu passait en avance rapide et saturait le téléphone. L'hôte avance maintenant au rythme normal (10 ticks/s) ; un invité ne rattrape que s'il a plus de 0,8 s de retard, doucement (2 ticks de plus par image), ou vite seulement après une reconnexion (plus de 5 s de retard).
- 16/11/2026 — Animations de tir et banc d'essai :
  - Fantassin : son modèle n'avait pas d'animation « tirer à l'arrêt », et il n'était pas marqué comme tireur : dès qu'il s'immobilisait, il repassait au repos (arme baissée) tout en continuant à tirer, et en suivant une cible qui bouge il courait bras baissés. Nouvelle animation composée (bras de « tir en courant » + jambes du repos) et nouvel état « tir en marchant » : le fantassin garde l'arme levée tant qu'il a une cible, à l'arrêt comme en mouvement. Même état « tir en marchant » (Run_Shoot) pour l'Anti-blindage, le Tireur d'élite et le Lance-grenades.
  - Banc d'essai : menu → Partie → Défis → « Atelier » : les 35 unités une par une face à une cible fixe et invulnérable, sans brouillard ni IA. Boutons Repos, Marche (va-et-vient), Tir/Frappe, Marche + tir, Récolte (ouvrier), Mort (puis réapparition) ; vitesse ×¼, ×½, ×1 ; « Défilé auto » qui enchaîne toutes les unités et leurs gestes ; ligne verte : état et animation jouée. Les véhicules et vaisseaux n'ont pas d'animation de squelette (roues, tourelles, pattes ou vol calculés par le jeu) : c'est indiqué.
- 16/11/2026 — Corrections relevées dans l'Atelier :
  - Tirs : chaque tir part maintenant du bout de l'arme (pistolet, lance-roquettes, fusil, lance-grenades, canon, tube, lance-missiles, armes de bras des Strikers, canons des araignées), à la hauteur réelle ; vaisseaux : depuis l'avant du modèle. Les armes doubles tirent à tour de rôle.
  - Striker d'assaut : le canon part du bras droit, le laser du bras gauche, les roquettes du lanceur dorsal.
  - Strikers : pose de tir figée (l'animation de repos tournait et emportait les bras) : les lasers restent dans l'axe.
  - Blindé léger, Blindé 8×8, Canon anti-aérien, Chasseur de chars, Lance-SAM et Artillerie (Arès) : modèles retournés (ils étaient chargés à l'envers), canons et tourelles pointent vers la cible.
  - Artillerie : canon relevé pour le tir en cloche.
  - Anti-blindage, Tireur d'élite, Lance-grenades : arme tenue à deux mains (main gauche sous le canon), pose de visée stable (plus de tremblement), petit recul à chaque tir.
  - Robots araignées : carrosserie gris acier au lieu de blanc.
  - Exosquelette : marche lente au lieu de la course.
  - Ouvrier : la pioche monte au-dessus de l'épaule droite, devant, sans traverser la tête. Marteleur : arc devant le corps, bras hors du buste. Lame : vraie fente au couteau (armé à la hanche, estoc vers l'avant, le corps accompagne).
  - Atelier : vue de côté par défaut (bouton « Vue de côté » et « ↻ Tourner »), caméra qui suit l'unité, mannequin à découvert pour le corps à corps.
- 21/11/2026 — Audit complet, puis corrections (lots 1 et 2) :
  - Cartes d'îles : l'IA Facile construit maintenant une Centrale (l'énergie paie les navettes) et attaque ; l'IA qui a épuisé son île va exploiter une île voisine (navette, ouvriers, dépôts sur place) ; quand l'adversaire visé est éliminé, elle recalcule son trajet et va rechercher par navette les soldats restés sur une autre île. Les 28 parties IA contre IA de l'audit (7 terrains, duel, 4 joueurs, 2 contre 2) se terminent toutes ; avant, 4 parties d'îles sur 12 restaient bloquées.
  - Ouvriers : ils rapportent leur récolte au dépôt de leur île en priorité.
  - IA en ère 2 : Raffinerie avant l'Atelier mécanique, et Recycleurs d'humidité quand l'eau manque (l'IA ne reste plus bloquée en ère 2 faute d'eau et de solarite).
  - Saccades : le calcul des chemins est limité à la zone utile et étalé sur plusieurs tours ; un bâtiment détruit ou un gisement épuisé ne force plus tous les groupes à recalculer. Calcul des chemins 12 fois plus rapide ; plus de pics au-delà de 40 ms par tour sur grande carte (jusqu'à 1,4 s avant).
  - En ligne, anti-triche : chaque ordre reçu n'agit que sur ce qui appartient au joueur qui l'envoie (unités, bâtiments, constructions, canon ionique).
  - En ligne, l'hôte qui recharge sa page reprend la partie : le journal est sauvegardé toutes les 5 s ; il rejoue la partie puis attend 60 s le retour des joueurs. Les invités se reconnectent seuls (nouvel essai toutes les 10 s pendant 3 min). Si l'hôte quitte volontairement (menu ☰), les invités continuent aussitôt contre l'IA.
  - Menu de partie ☰ (ou Échap) : Reprendre, Abandonner (deux appuis pour confirmer), Quitter vers le menu (la partie reste sauvegardée et se reprend avec « Reprendre »). Le jeu se met en pause pendant le menu (hors ligne).
  - Bouton JOUER toujours visible en bas du menu (plus besoin de faire défiler).
  - Téléphone tenu droit : la barre du haut passe sur deux lignes au lieu de sortir de l'écran. Boutons de groupes 1 à 5 et vues C1/C2 plus grands au doigt (38 px).
  - Sur ordinateur, les consignes disent « clique / clic droit / glisser » au lieu de « touche / appui long » (aide, panneau, tutoriel, messages).
  - La bulle d'aide du début disparaît d'elle-même au bout de 20 s.
  - Poids du jeu : modèles 3D compressés (format .glb avec compression meshopt, grandes textures en WebP) : 23 Mo → 9 Mo ; images du menu allégées. Jeu en ligne : 36 Mo → 21 Mo ; fichier unique : 40 Mo → 28 Mo. Chargement jusqu'au menu : 26,6 Mo téléchargés → 11,5 Mo.
  - Affichage : terrain découpé en morceaux de 48 m et rochers par carreaux de 40 m : seul ce qui est à l'écran est dessiné. Triangles affichés au début d'une partie : petite carte 421 000 → 147 000, grande carte 1 055 000 → 169 000.
  - Tests : 20 fichiers de tests verts (dont j19 anti-triche et j20 colonie sur une île voisine), test en ligne à deux navigateurs (rechargement de l'hôte : reprise et états identiques ; départ volontaire de l'hôte).
- 21/11/2026 — Corrections (lots 3 à 6) :
  - Factions : trois nouvelles unités d'ère 1 à la Caserne — Garde (Arès, fusil à pompe, résistant, courte portée), Commando (Boréale, pistolet-mitrailleur, cadence élevée), Vigile (Solaris, fusil d'assaut, longue portée) ; icônes, modèles et couleurs propres. L'IA les produit. Équilibre des 4 factions : 10/8/8/10 victoires.
  - IA : elle part à l'attaque quand sa population est au plafond (les blindés comptent double, l'armée ne pouvait plus atteindre son seuil) et construit jusqu'à 4 Recycleurs quand l'eau seule bloque l'ère 3. Les 28 parties de l'audit se terminent toutes.
  - Menu de partie ☰ : « Sauvegarder… » (3 emplacements) et « Réglages ». Menu principal : « Reprendre » propose la partie en cours ou un emplacement ; les 5 dernières rediffusions sont gardées.
  - Réglages : volume de la musique, des effets et des voix ; langue Français / English.
  - Version anglaise : tout le texte du jeu (menus, aide, panneau, messages, tutoriel, fin de partie, campagne, succès, salon en ligne). Les voix restent en français.
  - En ligne : discussion (bouton 💬) avec les alliés ou tout le monde ; relais TURN prêt pour jouer en 4G (il faut une clé Metered gratuite dans src/net/turn.ts).
  - Campagne « Opération Arès » : 5 missions qui se débloquent l'une après l'autre (Atterrissage, Tête de pont, Raid éclair, Course à l'orbite, Assaut final), bouton « Mission suivante » en fin de partie.
  - Succès : 17 (premières victoires, chaque faction, îles, 4 joueurs, 2 contre 2, victoire en moins de 12 min, ère orbitale, campagne, défis…), avec une notification à l'obtention.
  - Tests : 20 fichiers de tests verts, audit IA 28/28, campagne et succès vérifiés dans le navigateur sans erreur.
- 21/11/2026 — Atelier trié par faction : boutons de filtre Toutes / Communes / Arès / Boréale / Australe / Solaris (avec le nombre d'unités), liste déroulante groupée par faction, ◀ ▶ et le défilé auto restent dans la faction choisie. Les nouvelles unités (Garde, Commando, Vigile) sont marquées ★.
- 21/11/2026 — Garde d'assaut (Arès) : en visant, le fusil à pompe est remis à l'horizontale et pointé droit devant, crosse dans la main droite, main gauche sous le canon (il était penché vers le haut et flottait devant les mains) ; léger relèvement du canon au recul. Nouveau tir « fusil à pompe » : un seul coup, grosse flamme en éventail au ras du canon, gerbe de 8 plombs qui s'écartent avec la distance, bouffée de fumée, douille rouge éjectée sur le côté ; son grave suivi du « clac-clac » du rechargement.

- 21/11/2026 — Version « Age of Ares Complet » : les âges (dépôt Age-of-Ares-Complet, séparé de la première version) :
  - Cinq âges dans la même partie : Antiquité, Moyen Âge, Âge moderne (ancienne ère 1), Âge industriel (ancienne ère 2), Âge galactique (ancienne ère 3). Passage au Centre, 2 types de bâtiments de l'âge en cours exigés. Règle : src/data/rules.ts (GAME.eres, AGE, `ereMax` des unités et bâtiments antiques, décalage automatique des anciennes ères de +2).
  - Option du menu « Époque » (onglet Règles) : Antiquité (par défaut, tous les âges) ou Âge moderne (l'ancien départ). Gardée dans les sauvegardes (champ `age` ; absent = âge moderne).
  - Antiquité et Moyen Âge : Caserne (Milicien, Guerrier à la hache anti-cavalerie, Champion), Archerie (Archer, Arbalétrier), Écurie (Cavalier éclaireur, Chevalier : cheval Quaternius animé + cavalier KayKit assis qui frappe du haut du corps), Atelier de siège (Bélier, Catapulte). Les unités et bâtiments antiques ne se produisent plus à partir de l'âge moderne. L'éclaireur de départ devient un cavalier.
  - Aspect : bâtiments en bois (Quaternius Ultimate Fantasy RTS) à l'Antiquité, bourg coloré aux couleurs du camp (KayKit Medieval Hexagon) au Moyen Âge ; villageois (KayKit) et barque viking aux âges anciens (ils changent de tenue à l'âge moderne). Noms d'époque : Centre-ville, Maison, Puits, Entrepôt, Moulin, Port, Tour de guet, Villageois.
  - Monde : prairies, plages et mer (le vide devient de l'eau) jusqu'à l'âge industriel, désert et vide intersidéral à l'âge galactique ; chaque joueur voit le monde de son âge (les règles sont identiques, rien ne change en ligne). Code : World.setAge, terrainMesh (uGreen), makeWater.
  - Effets : flèches (archers, tours de guet et Centre-ville aux âges anciens), pierres de catapulte, coups de bélier ; sons d'épées, de flèches, de catapulte (StarNinjas, Kenney RPG Audio, CC0).
  - IA : traverse les âges anciens (archerie, écurie, siège), met de côté pour passer d'âge, première attaque retardée de 5 min quand la partie part de l'Antiquité.
  - Tests : j21 (IA contre IA depuis l'Antiquité : passages d'âge, unités anciennes, règles) ; tous les autres tests repassés et adaptés à la nouvelle numérotation.
  - À faire : murs et portes d'époque, gisements d'eau et de minerai d'époque, âge de la poudre, bateaux de guerre, mini-carte aux couleurs de l'époque, équilibrage fin.

## 21/11/2026 — Ressources façon Age of Empires, villageois, murailles, cheval

- Ressources : **Nourriture** (buissons de baies, fermes), **Bois** (forêts), **Pierre**, **Or** (filons), **Solarite** (âge industriel). L'énergie et la centrale solaire sont retirées : l'or se récolte. Clés internes inchangées (eau = nourriture, energie = or) pour garder les sauvegardes et le jeu en ligne.
- Dépôts : Centre (tout), Moulin (nourriture), Camp de bûcherons / Scierie (bois), Camp de mineurs (pierre et or), Raffinerie (solarite). Ferme (dès l'Antiquité) : nourriture infinie, un ouvrier.
- Coûts : jusqu'à l'âge moderne on bâtit en bois ; murs, portes et tours en pierre. Unités anciennes en nourriture, bois et or.
- Un ouvrier chargé d'une autre ressource va d'abord la déposer avant d'aller au nouveau gisement.
- Villageois : vrai paysan Quaternius (Modular Character Outfits + Universal Base Characters + Universal Animation Library 1 et 2) ; gestes selon la tâche (cueillette, bûcheronnage avec hache, pioche, marteau au chantier, démarche chargée).
- Gisements d'époque : baies et rochers gris aux âges anciens, glace et minerai à l'ère spatiale ; arbres et filons d'or toujours.
- Murs : palissade de pieux (Antiquité), muraille de pierre crénelée (Moyen Âge), portes à battants. Mini-carte verte et mer bleue jusqu'à l'âge galactique.
- Cheval : les jambes sont repliées en cinématique inverse (les animations d'origine n'animaient que les sabots, d'où l'étirement).
- Rythme : bâtiments ×1,5 PV, Centre plus solide (3 600 PV ×1,5) et ses flèches plus fortes, première attaque de l'IA vers 16–24 min depuis l'Antiquité, âges plus chers et plus longs. Parties IA contre IA : 25 à 40 min.
