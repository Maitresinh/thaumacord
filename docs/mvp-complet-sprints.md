# Programme Des Sprints MVP Complet

Objectif: arriver a un MVP complet de Ludovive avec Putsch comme jeu pilote, sans enfermer l'architecture dans Putsch. Chaque sprint doit produire un module reutilisable pour Long Live the King, Wolfpack, les simulations economiques, et les futurs imports IA.

## Definition Du MVP Complet

Le MVP complet est atteint quand une table peut jouer Putsch pendant 60 a 90 minutes avec:

- installation rapide d'une session;
- roles/personnages distribues;
- ressources, cartes, votes et actions visibles selon les droits;
- phases et tours controles par le meneur ou par le module;
- transactions joueur-joueur et directeur-joueurs;
- coups d'Etat avec engagements caches et resolution;
- conseil/election jouables;
- dashboard meneur clair;
- journal d'evenements exploitable;
- sons d'evenements simples;
- architecture de module utilisable par au moins un autre jeu.

## Principe D'Architecture

Chaque sprint livre deux choses:

- une avancee Putsch jouable;
- une brique generique nommee, documentee et testee.

Putsch ne doit donc jamais devenir un cas special dans le moteur. Les noms Putsch peuvent exister dans `modules/examples/putsch-lite.json` et dans une UI specialisee, mais les mecanismes doivent rester declaratifs: `economy`, `exchange`, `score`, `event-sound`, `phase-trigger`, `council`, `vote`, `contest`, `setup-distribution`, `dashboard-panel`.

## Sprint M1: Audit Putsch Et Contrat De Completion

But: savoir exactement ce qui manque pour dire "Putsch complet".

Brique generique: `module-completion`.

Livrables:

- matrice regles source -> module -> tests;
- liste des personnages, ressources, cartes, phases, actions et conditions de victoire;
- checklist "automatise / assiste / manuel";
- etiquettes de dette volontaire dans le module.

Putsch:

- verifier les 6 roles principaux: Paquito, James, Giani, Vladimir, Raul, Miltos;
- verifier cartes CF, CM, drogue, actions cuivre, bulletins;
- documenter les ecarts: score final, ventes horaires cuivre, conseil, election, distribution initiale.

Acceptance:

- aucune regle importante n'est seulement "dans nos tetes";
- chaque manque a une story reliee a une brique generique;
- le module Putsch declare explicitement ses limites.

## Sprint M2: Setup Et Distribution Initiale

But: demarrer une partie sans bricolage.

Brique generique: `setup-distribution`.

Livrables:

- distribution automatique des ressources et cartes selon role;
- support des role sheets privees;
- attribution role choisie ou imposee;
- reset demo reproductible.

Putsch:

- distribuer argent, CF, CM, drogue, bulletins, actions cuivre;
- Paquito commence avec la reserve d'actions des mines;
- les joueurs ne voient que leur role officiel/secret et leur materiel.

Reusable:

- Long Live the King: cartes de statut/intrigue;
- Wolfpack: stations et ressources d'equipage;
- simulations economiques: dotations initiales.

Acceptance:

- une session Putsch neuve est jouable sans correction manuelle initiale;
- les inventaires dashboard et joueur concordent;
- tests sur chaque role Putsch.

## Sprint M3: Economie Et Transactions

But: faire fonctionner le marche et la mine de cuivre.

Brique generique: `market-economy`.

Livrables:

- actions d'achat/vente au prix courant;
- limites par phase, tour, joueur ou vendeur;
- transactions joueur-joueur avec proximite/fallback;
- transactions autorite-joueur;
- historique financier audite.

Putsch:

- cours courant de l'action cuivre;
- actions vendues par Paquito/directeur;
- limite de 5 actions par joueur et par heure;
- limite de mise en vente par le directeur;
- echanges libres entre joueurs sans obligation de respecter le cours;
- rachat/vente par Paquito selon la regle.

Reusable:

- jeu du mouton;
- creation monetaire;
- bank run;
- marches de ressources dans d'autres jeux.

Acceptance:

- le dashboard montre prix, stock, limites, derniers achats;
- un joueur ne peut pas acheter plus que permis;
- Paquito peut vendre/acheter comme joueur-directeur;
- les tests couvrent achat valide, limite depassee, transaction libre.

## Sprint M4: Score Et Conditions De Victoire

But: donner au meneur une lecture claire de l'etat competitif.

Brique generique: `score-engine`.

Livrables:

- score calcule depuis ressources, cartes, statuts et role;
- score public/prive selon module;
- score estime et score final;
- explication du calcul.

Putsch:

- escudos = points;
- valeur des actions cuivre au cours courant;
- actions restantes de Paquito a demi-valeur si regle confirmee;
- multiplicateurs FUN/GAG selon pouvoir final;
- valeur des CF/CM selon regle;
- drogue et autres ressources selon feuille de role.

Reusable:

- Long Live: faveurs/statuts/objectifs secrets;
- simulations economiques: richesse, confiance, liquidite;
- jeux a roles caches: score visible au MJ seulement.

Acceptance:

- le dashboard affiche un classement MJ;
- chaque ligne de score est explicable;
- les joueurs ne voient pas les scores caches sauf si le module le permet.

## Sprint M5: Coup D'Etat Et Engagements Caches

But: rendre le putsch jouable de bout en bout.

Brique generique: `sealed-contest`.

Livrables:

- declaration de contest;
- compte a rebours parametre par le meneur/module;
- engagements caches multi-ressources;
- reponses des defenseurs;
- resolution automatique;
- effets automatiques et resume.

Putsch:

- attaque avec leaders et ressources engagees;
- defense par le pouvoir;
- comparaison CF/CM selon valeur;
- succes: cours cuivre divise;
- echec: cours cuivre augmente;
- declenchement du conseil.

Reusable:

- duels, encheres secretes, assauts, votes caches, combats sociaux.

Acceptance:

- chaque joueur concerne voit le timer;
- les engagements restent caches jusqu'a resolution;
- le dashboard voit le detail apres resolution;
- tests sur succes, echec, egalite, expiration.

## Sprint M6: Conseil, Vote Et Phase Collective

But: modeliser les phases ou la table joue ensemble puis l'app enregistre/applique.

Brique generique: `collective-phase`.

Livrables:

- ouverture manuelle ou automatique d'une phase collective;
- liste des participants attendus;
- votes secrets ou publics;
- depouillement;
- decision en live puis saisie;
- consequences automatiques.

Putsch:

- election du college;
- elimination/promotion;
- gestion des egalites;
- conseil apres coup ou a intervalle regulier;
- detournement de fonds;
- compte rendu public.

Reusable:

- audience du roi;
- conseil de guerre;
- assemblee d'actionnaires;
- reunion d'equipage.

Acceptance:

- une election peut etre lancee, votee, cloturee, appliquee;
- le conseil peut etre joue hors app puis saisi, ou guide dans l'app;
- les consequences sont auditables.

## Sprint M7: Dashboard Meneur Specialise

But: faire du dashboard un poste de conduite, pas une page de debug.

Brique generique: `dashboard-panels`.

Livrables:

- panneaux configurables par module;
- resume phase/tour/urgences;
- participants/personnages;
- economie;
- scores;
- resolutions;
- journal;
- actions meneur dangereuses avec confirmation.

Putsch:

- panneau Mine de cuivre: cours, stock, ventes, limites, historique;
- panneau Personnages: role officiel/secret, ressources, score estime;
- panneau Pouvoir: FUN/GAG, coup en cours, conseil du;
- panneau Transactions: joueur-joueur, Paquito-joueur;
- panneau Sons/evenements.

Reusable:

- Long Live: audience, petitions, statut du roi;
- Wolfpack: stations, avaries, contacts;
- simulations: indicateurs de marche.

Acceptance:

- le meneur peut repondre a "qui a quoi, que vaut quoi, que doit-on faire maintenant?";
- pas besoin d'ouvrir le JSON;
- le dashboard reste utilisable sur laptop.

## Sprint M8: Sons Et Evenements

But: marquer les moments forts et synchroniser la table.

Brique generique: `event-soundboard`.

Livrables:

- banque de sons declaree par module;
- mapping evenement -> son;
- diffusion a tous, a un joueur, ou dashboard seulement;
- bouton manuel du meneur;
- fallback silencieux si le navigateur bloque l'audio.

Putsch:

- ouverture marche;
- fin de phase;
- coup d'Etat declare;
- engagements restants 30s;
- coup reussi/echec;
- conseil ouvert;
- election ouverte/resultat;
- transaction importante.

Reusable:

- cloche d'audience;
- alarme sous-marin;
- crash de marche;
- bank run.

Acceptance:

- un evenement serveur peut demander un son;
- les clients autorises recoivent l'ordre audio;
- tests sans dependance aux fichiers audio reels;
- sons remplaçables par module.

## Sprint M9: UX Joueur Et Gestes Fallback

But: rendre l'interface joueur vraiment table-first.

Brique generique: `active-player-surface`.

Livrables:

- inventaire visuel;
- actions par phase;
- boutons de secours propres;
- interactions de proximite simulees;
- push de ressources au pouce;
- messages et alertes.

Putsch:

- pousser argent/cartes vers un joueur au contact;
- engager ressources pour un coup;
- voter par geste de depot;
- recevoir les annonces de phase.

Reusable:

- tout jeu avec echanges, votes, dons, attaques, parades.

Acceptance:

- le joueur n'a pas besoin de chercher une case;
- chaque interaction importante a une intention physique ou un fallback clair;
- les actions non disponibles ne polluent pas l'ecran.

## Sprint M10: Playtest, Export Et Durcissement

But: passer du prototype jouable a un MVP complet presentable.

Brique generique: `playtest-ops`.

Livrables:

- scenario Putsch 60-90 minutes;
- checklist meneur;
- export journal JSON/texte;
- reprise apres redemarrage;
- tests de non-regression;
- liste de limites connues.

Putsch:

- partie test avec 5 ou 6 joueurs;
- coups d'Etat, conseil, election, marche, score;
- collecte des irritants UX.

Reusable:

- procedure standard pour valider tout nouveau module importe.

Acceptance:

- la partie peut etre rejouee a partir d'un etat initial connu;
- les evenements critiques sont exportables;
- les bugs bloquants ont des tickets;
- le MVP complet est demonstrable.

## Ordre Recommande

1. M1 Audit Putsch.
2. M2 Setup/distribution.
3. M3 Economie et transactions.
4. M7 Dashboard specialise, en parallele leger avec M3/M4.
5. M4 Score.
6. M5 Coup d'Etat.
7. M6 Conseil/vote.
8. M8 Sons.
9. M9 UX joueur.
10. M10 Playtest.

## Hors MVP Complet

- Android natif complet;
- vrais gestes capteurs en production;
- cartographie hybride avancee;
- Mandragore IA;
- marketplace de modules.

Ces sujets restent branchables, mais ne doivent pas bloquer le MVP complet.
