# Audit De Completion Putsch

Sprint: M1 `module-completion`.

But: transformer Putsch de module de demonstration en jeu pilote complet, tout en reliant chaque manque a une brique reutilisable de Ludovive.

## Couverture Actuelle

| Domaine | Etat | Preuve actuelle | Brique reusable |
| --- | --- | --- | --- |
| Roles principaux | Partiel mais solide | Paquito, James, Giani, Vladimir, Raul, Miltos sont dans `putsch-lite.json` | `role-sheet` |
| Ressources | Solide | Escudos, actions cuivre, CF, CM, drogue, bulletins | `resource-model` |
| Cartes/composants | En place | CF/CM, drogue, actions, bulletins declares | `component-pool` |
| Setup | En cours | Distribution automatique ajoutee depuis ressources de depart | `setup-distribution` |
| Phases/tours | Solide | `market`, `intrigue`, `coup`, `resolution`, `first-council` + `turnPhase` | `turn-phase` |
| Actions joueur | Partiel | echanges, coup, defense, vote, detournement | `action-events` |
| Echanges | Solide pour MVP | transferts immediats, proximite/fallback, audit | `exchange` |
| Coup d'Etat | Partiel avance | engagements caches et effets de cours existent, mais pouvoir final et cas limites restent incomplets | `sealed-contest` |
| Conseil | Partiel | saisie/record et resolution guidee existent | `collective-phase` |
| Election | Partiel | vote/tally existe, cloture et college a finaliser | `vote-engine` |
| Mine de cuivre | Partiel | cours et compteurs existent, ventes horaires non strictes | `market-economy` |
| Score | Partiel solide | calcul estime declaratif par ressource, actions cuivre au cours courant, multiplicateur Paquito | `score-engine` |
| Sons | Manquant | aucun schema son/module audio | `event-soundboard` |
| Dashboard specialise | Partiel | dashboard general + phase plan + scores, pas encore panneau mine/personnages dedie | `dashboard-panels` |

## Personnages

| Personnage | Etat | Manques |
| --- | --- | --- |
| Paquito Borrachon | Present | score specifique, ventes/rachats mine, panneau directeur |
| James Stones | Present | objectif/score KGB detaille |
| Giani Forlano | Present | objectif/score CIA detaille |
| Vladimir Doukorof | Present | scoring drogue detaille |
| Raul Belgrano | Present | statut pouvoir FUN et multiplicateur final |
| Miltos Agripnakis | Present | statut opposition GAG et multiplicateur final |
| Roles additionnels | Minimal | regles d'ajout pour 7+ joueurs a formaliser |

## Manques Prioritaires

1. Setup exact: distribution automatique et verifiable des cartes depuis les ressources.
2. Mine de cuivre: ventes Paquito, limites horaires, cours courant, stock restant.
3. Score: calcul final et estimation MJ.
4. Coup d'Etat: pouvoir FUN/GAG et passage automatique vers conseil.
5. Election: cloture, egalites, college des conseillers.
6. Conseil: invites, detournements, consequences et compte rendu propre.
7. Dashboard specialise: mine, personnages, score, pouvoir, urgences.
8. Sons: evenements sonores declaratifs.
9. UX joueur: inventaire visuel, actions de phase, gestes fallback.

## Stories Pretes

- M2: En tant que meneur, je peux distribuer les cartes Putsch depuis les ressources initiales.
- M3: En tant que Paquito, je peux vendre des actions cuivre au cours courant avec limites de phase.
- M4: En tant que meneur, je vois le score estime de chaque personnage avec detail du calcul.
- M5: En tant que joueur, je peux engager CF/CM/influence dans un coup d'Etat cache et minute.
- M6: En tant que meneur, je peux cloturer une election et appliquer le college.
- M7: En tant que meneur, je dispose d'un panneau Mine de cuivre.
- M8: En tant que module, je peux associer des sons aux evenements.
- M9: En tant que joueur, je vois mes cartes et je pousse des ressources sans chercher dans une liste brute.
