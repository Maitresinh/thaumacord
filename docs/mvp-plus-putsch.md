# Programme MVP+ Putsch

Objectif: transformer la demo Putsch actuelle en table jouable de bout en bout, avec une interface propre pour les joueurs et le meneur, sans encore viser l'application finale complete.

Le MVP+ doit prouver quatre choses:

- plusieurs participants peuvent rejoindre une session et jouer chacun depuis leur vue;
- les echanges, votes, coups d'Etat, conseils et actions du meneur sont structures par l'app;
- le meneur/hote garde une vue complete, peut introduire des elements, corriger et arbitrer;
- l'interface est assez claire pour jouer sans lire du JSON ni chercher les boutons.

## Definition Du MVP+

Le MVP+ Putsch est termine quand une partie test de 60 a 90 minutes peut etre jouee avec 5 a 6 participants, un hote/meneur joueur, et un minimum d'interventions hors app.

Ce qui doit etre automatise:

- installation rapide d'une session Putsch de test;
- attribution ou choix des roles;
- distribution initiale des ressources, bulletins et cartes abstraites;
- actions joueur selon la phase courante;
- achat, vente et echange de ressources;
- declaration d'un coup d'Etat;
- compte a rebours des engagements caches;
- resolution automatique du rapport de force;
- effet sur le cours des actions de cuivre;
- vote/election jouable de bout en bout;
- conseil des ministres/audience comme resolution de phase;
- detournement de fonds, decisions et traces d'arbitrage;
- tableau de bord meneur complet;
- journal lisible des evenements.

Ce qui peut rester manuel:

- roleplay, discussions et negociations;
- interpretation sociale des alliances;
- verification finale des cas ambigus;
- gestes physiques avances;
- Mandragore IA.

## Sprint MVP+ 1: Surface Joueur Propre

But: chaque joueur doit voir uniquement ce qui le concerne et les actions jouables maintenant.

Stories:

- Vue joueur Putsch centree sur role, argent, ressources, actions, messages et alertes.
- Actions disponibles filtrees par phase et par role.
- Formulaires propres pour acheter, vendre, donner, echanger et proposer une transaction.
- Historique personnel lisible: ce que j'ai fait, recu, perdu ou gagne.
- Etats vides et erreurs comprehensibles sur mobile.

Acceptance:

- aucun JSON brut n'apparait sur la page joueur;
- un joueur peut comprendre son prochain geste en moins de 10 secondes;
- les actions impossibles n'apparaissent pas ou sont expliquees;
- les changements importants declenchent une alerte visible.

## Sprint MVP+ 2: Economie Et Cartes Putsch

But: modeliser suffisamment les objets de jeu pour ne plus tricher avec de simples compteurs vagues.

Stories:

- Modele des cartes: CF, CM, drogue, actions mines de cuivre, bulletins de vote.
- Inventaire joueur lisible, avec cartes empilables.
- Achat/vente des actions de cuivre au cours courant.
- Limites meneur: maximum vendu par joueur et par heure, maximum mis en vente par heure.
- Prix dynamique des actions selon le temps et les coups d'Etat.
- Echanges directs joueur a joueur, avec audit.

Acceptance:

- le meneur peut savoir qui possede quoi;
- le systeme calcule la valeur de score visible pour le meneur;
- les actions cuivre respectent le cours courant;
- chaque transaction est historisee.

## Sprint MVP+ 3: Coup D'Etat Complet

But: le putsch n'est plus seulement declare puis arbitre; il devient un module de regles jouable.

Stories:

- Declaration d'un coup par un joueur autorise.
- Compte a rebours parametre par le meneur.
- Engagement cache des CF/CM par l'attaquant.
- Notification des joueurs concernes.
- Engagement defensif cache par le pouvoir.
- Resolution automatique des forces engagees.
- Effets automatiques: changement de pouvoir, cours des actions, conseil declenche si necessaire.
- Resume public et resume prive au meneur.

Acceptance:

- pendant le compte a rebours, les joueurs voient le temps restant;
- les engagements restent caches jusqu'a resolution;
- une victoire ou un echec applique les effets sans bouton d'arbitrage final;
- le meneur peut corriger apres coup, avec trace.

## Sprint MVP+ 4: Vote Et Election

But: rendre les elections et le college des conseillers jouables de bout en bout.

Stories:

- Ouverture d'une election par horloge ou par action meneur.
- Bulletin secret avec deux choix: promotion et elimination.
- Controle qu'un joueur ne vote qu'une fois.
- Depouillement automatique.
- Gestion des egalites selon la regle Putsch.
- Mise a jour du college des conseillers.
- Message public des resultats.

Acceptance:

- une election peut etre lancee, votee, cloturee et appliquee sans intervention hors app;
- le meneur voit les details;
- les joueurs voient seulement le resultat public;
- le systeme conserve la preuve de chaque bulletin sans exposer les secrets aux joueurs.

## Sprint MVP+ 5: Conseil Des Ministres / Resolution De Phase

But: faire du conseil un moment de jeu structure, pas seulement une note saisie par le meneur.

Stories:

- Ouverture automatique ou manuelle d'un conseil.
- Invitation des conseillers concernes.
- Saisie ou choix des detournements de fonds.
- Decisions guidees: redistribution, sanctions, achats, annonces.
- Validation par l'hote/meneur.
- Application automatique des gains/pertes.
- Compte rendu public et journal prive.

Acceptance:

- le conseil peut se tenir en live autour de la table ou via l'app;
- l'app guide les actions sans remplacer la discussion;
- les consequences financieres sont appliquees;
- le meneur joueur peut participer tout en gardant ses pouvoirs d'hote.

## Sprint MVP+ 6: Interface Aux Petits Oignons

But: rendre l'experience agreable, lisible et suffisamment belle pour une demo publique.

Stories:

- Layout mobile joueur dense et clair.
- Dashboard meneur organise par priorites: urgences, phase, joueurs, economie, resolutions, journal.
- Boutons d'action avec icones, confirmations et retours immediats.
- Indicateurs de phase et de temps visibles.
- Differenciation visuelle des actions joueur, actions hote et actions de regle.
- Mode demo: donnees prechargees, session resettable, participants simulables.
- Microcopy en francais de table, courte et non technique.

Acceptance:

- la page joueur tient sur telephone;
- la page meneur permet de conduire la partie sans scroller partout;
- les actions dangereuses demandent confirmation;
- une personne externe comprend la demo en 3 minutes.

## Sprint MVP+ 7: Playtest Et Durcissement

But: passer d'une demo qui marche a un outil robuste pour une vraie table.

Stories:

- Scenario de playtest complet Putsch 60-90 minutes.
- Donnees de test pour 6 roles.
- Tests automatises des regles critiques.
- Reconnexion et reprise apres redemarrage serveur.
- Export du journal de partie.
- Liste des limites connues et arbitrages manuels restants.

Acceptance:

- un test grandeur nature peut etre lance sans preparation technique longue;
- les bugs bloquants ont des tickets;
- les points manuels restants sont explicites;
- une prochaine iteration peut choisir entre polish, Android natif ou nouveau jeu.

## Ordre De Priorite

1. Surface joueur propre.
2. Economie/cartes Putsch.
3. Coup d'Etat complet.
4. Vote/election.
5. Conseil guide.
6. Interface polished.
7. Playtest.

Les gestes physiques, la cartographie et Mandragore restent hors MVP+. Ils doivent rester branchables dans l'architecture, mais ne doivent pas retarder Putsch jouable.
