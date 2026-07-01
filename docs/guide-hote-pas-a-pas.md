# Guide hote pas a pas

Ce guide sert a lancer une session Ludovive en table reelle, avec un ordinateur hote et des telephones joueurs sur le meme reseau Wi-Fi.

Le but de l'hote n'est pas de "jouer a la place de l'app". Son role est de garder le rythme, connecter les participants, assigner les roles, surveiller les phases et valider les resolutions que le module ne peut pas encore automatiser.

## Avant La Partie

### 1. Preparer le reseau

Utiliser de preference un Wi-Fi stable:

- reseau domestique 5 GHz;
- partage de connexion du PC ou d'un telephone;
- routeur dedie si la salle est mauvaise.

Tous les telephones doivent etre sur le meme reseau que l'ordinateur hote.

### 2. Lancer le serveur

Depuis la racine du repo:

```powershell
.\scripts\start-ludovive-lan.ps1
```

Le script affiche des adresses du type:

```text
Dashboard: http://192.168.x.x:3333/
Joueurs:   http://192.168.x.x:3333/play
```

Si le script n'est pas utilise, le mode dev fonctionne aussi:

```powershell
cd apps/server
npm run dev
```

Puis ouvrir:

```text
http://127.0.0.1:3333/
```

### 3. Verifier que le serveur repond

Ouvrir le dashboard dans le navigateur de l'ordinateur hote.

Verifier:

- la page dashboard charge;
- le panneau `Acces Wi-Fi` affiche une adresse LAN;
- `GET /health` repond si besoin de diagnostic;
- les telephones peuvent ouvrir l'adresse `/play`.

## Creer La Session

### 4. Choisir le module

Depuis le dashboard, choisir ou creer une session avec un module:

- `putsch-lite` pour Banana Republic;
- `long-live-the-king-lite` pour Long Live the King;
- `origins-ww1-lite` pour Origins of WWI Live;
- `wolfpack-lite` pour le prototype equipage de sous-marin.

Pour un test rapide, commencer par Putsch ou Origins.

### 5. Noter le code de session

La session cree un code court, par exemple:

```text
PA948H
```

Ce code est donne aux joueurs s'ils ouvrent eux-memes `/play`.

### 6. Faire rejoindre les telephones

Chaque joueur ouvre:

```text
http://adresse-du-pc:3333/play
```

Puis il entre:

- le code de session;
- son nom de joueur ou de personnage;
- le role si l'hote le laisse choisir.

Si le role doit rester secret, l'hote assigne les roles depuis le dashboard.

## Assigner Les Roles

### 7. Distinguer role de jeu et role de session

Ludovive separe deux choses:

- role de jeu: general, marchand, roi, France, Royaume-Uni, pilote, machiniste;
- role de session: hote technique, autorite de jeu, secretaire, meneur capable de corriger ou injecter des elements.

Dans certains jeux, la meme personne peut avoir les deux.

Exemples:

- dans Putsch, le directeur des mines peut etre joueur et autorite de jeu;
- dans Wolfpack, l'hote peut etre simplement le capitaine sans pouvoir special;
- dans Origins, l'hote est plutot secretaire de conference;
- dans Long Live the King, le roi ou le chambellan dirige les audiences.

### 8. Assigner les participants

Dans le dashboard:

1. verifier la liste des participants;
2. assigner ou corriger les roles;
3. assigner si necessaire le role de session `game-authority`;
4. verifier que chaque joueur voit seulement ses propres informations sur son telephone.

## Mise En Place

### 9. Executer la mise en place du module

Si le module declare une mise en place, utiliser le controle de setup/distribution.

Ce que Ludovive peut faire:

- donner des ressources initiales;
- attribuer des objets ou permissions numeriques;
- preparer des cartes ou inventaires si le module en utilise encore;
- afficher les consignes de mise en place;
- initialiser les compteurs globaux.

Ce que l'hote doit encore verifier a la table:

- les joueurs sont les bons;
- les roles secrets sont bien caches;
- les ressources physiques eventuelles correspondent a l'app;
- le plateau physique, s'il existe, est pret.

## Piloter La Partie

### 10. Demarrer les phases

Le dashboard affiche:

- la phase courante;
- la duree;
- les actions disponibles;
- les resolutions en attente;
- la prochaine phase.

L'hote avance les phases quand le temps est ecoule ou quand la table est prete.

### 11. Regler les timers

Pour une phase avec duree variable, l'hote peut regler un timer.

Exemples:

- negociation diplomatique: 10 minutes;
- engagements caches pendant un coup d'Etat: 45 a 120 secondes;
- audience ou conseil: duree libre puis enregistrement;
- programmation secrete: 2 a 3 minutes.

Les telephones recoivent le timer dans leur vue joueur.

### 12. Surveiller les actions disponibles

Cote joueur, l'app doit afficher seulement:

- ses ressources;
- ses actions possibles dans la phase;
- ses messages;
- ses resolutions ou votes en cours.

Cote hote, le dashboard affiche:

- tous les participants;
- toutes les ressources visibles au dashboard;
- les actions de phase;
- les messages;
- l'audit;
- les resolutions a traiter.

## Transactions Et Gestes

### 13. Faire une transaction

Pour le MVP navigateur, les gestes reels sont encore simules par l'interface:

- selection du receveur;
- choix des ressources;
- confirmation de contact ou proximite.

Regle de table:

> Un echange entre joueurs doit se faire telephones proches ou au contact.

L'idee n'est pas de permettre des transactions a distance depuis une autre piece. Le telephone sert de prop physique.

### 14. Gestes prevus

Les gestes normalises prevus pour Android:

- toucher les telephones: contact explicite;
- pousser une ressource vers le bord de l'ecran: donner;
- verser le telephone vers l'autre: transferer ou soudoyer;
- frapper: attaque, coup, duel;
- parer: defense;
- retourner face cachee: ordre secret;
- couvrir de la paume: secret ou action discrete;
- deposer comme un bulletin: vote.

Tant que les vrais capteurs Android ne sont pas branches, les boutons et confirmations du navigateur servent de fallback de playtest.

## Resolutions

### 15. Comprendre une resolution en attente

Une resolution est un evenement que le systeme doit suivre mais que le module ne resout pas forcement tout seul.

Exemples:

- un coup d'Etat avec engagements caches;
- une petition a voter;
- une audience a enregistrer;
- une attaque diplomatique;
- un conseil de ministres;
- une verification de fin de partie.

Le dashboard indique:

- qui l'a declenchee;
- quelle mecanique est utilisee;
- quelles donnees ont ete saisies;
- quels effets automatiques ou recommandes existent;
- quoi valider ou corriger.

### 16. Valider ou corriger

L'hote peut:

- accepter un resultat;
- rejeter ou differer;
- appliquer un delta de ressource;
- modifier un statut;
- envoyer un message;
- garder une note dans l'audit.

Pour un test, toujours annoncer oralement ce qui vient d'etre valide.

## Messages

### 17. Envoyer une information

Le dashboard peut envoyer:

- un message public a tous les participants;
- un message prive a un joueur;
- une note dashboard seulement.

Usage typique:

- annoncer une nouvelle phase;
- confirmer un resultat;
- avertir un joueur;
- transmettre une information secrete;
- remplacer provisoirement un effet sonore.

## Reconnexion Et Incidents

### 18. Si un telephone se deconnecte

1. Ne pas recreer la session.
2. Demander au joueur de rouvrir `/play`.
3. Reutiliser le meme code de session.
4. Reconnecter ou rebinder le device si necessaire.
5. Verifier que le joueur retrouve son role et ses actions.

Le serveur conserve l'audit et l'etat de session.

### 19. Si une action a ete mal saisie

Utiliser le dashboard:

- corriger la ressource;
- ajouter une note;
- envoyer une confirmation aux joueurs;
- laisser l'audit garder la trace.

Ne pas essayer de "faire disparaitre" l'erreur pendant un test: elle sert a comprendre l'ergonomie.

## Notes Par Jeu

### Putsch Au Panador

L'hote peut aussi etre joueur.

Points a surveiller:

- cours de l'action des mines de cuivre;
- ventes d'actions par le directeur des mines;
- transactions entre joueurs;
- coup d'Etat et compte a rebours d'engagement;
- conseil des ministres;
- votes de promotion/elimination;
- detournements de fonds;
- score final en pesos.

Pour un test, commencer simple:

1. marche et transactions;
2. un coup d'Etat;
3. resolution;
4. conseil;
5. verification du dashboard.

### Long Live The King

L'audience peut se tenir oralement en live ou etre conduite directement via l'app.

Points a surveiller:

- roi ou chambellan comme autorite;
- tours qui convergent vers l'audience;
- petitions;
- votes;
- faveurs;
- effets differes;
- tresor et ressources.

### Origins Of WWI Live

Le module est adapte pour profiter du format live:

- les anciennes cartes d'ordre deviennent trois choix secrets de zones;
- les actions speciales deviennent permissions numeriques;
- l'ordre de resolution est gere ou enregistre par l'app;
- la diplomatie reste orale et physique;
- le plateau peut rester physique pendant le MVP;
- les objectifs nationaux et la mise en place sont stockes comme donnees du module.

Points a surveiller:

- phase de diplomatie libre;
- programmation secrete;
- revelation et resolution;
- attaques diplomatiques;
- comptage des droits de traite;
- clauses d'exclusivite des objectifs nationaux.

### Wolfpack

Le prototype sert a tester la coordination de postes.

Points a surveiller:

- capitaine comme hote;
- ordres de phase;
- repartition des postes;
- ressources de station;
- bruit, profondeur, avaries;
- coordination orale rapide.

## Check-List De Test Grandeur Nature

Avant les joueurs:

- serveur lance;
- dashboard ouvert;
- module choisi;
- session creee;
- adresse Wi-Fi testee sur un telephone;
- scenario de test note sur papier.

Pendant l'accueil:

- chaque telephone rejoint;
- chaque joueur a un role;
- les roles secrets ne fuitent pas;
- la vue joueur est filtree;
- l'hote voit tous les participants.

Pendant la partie:

- phases avancees proprement;
- timers visibles;
- une transaction testee;
- une resolution testee;
- un message public envoye;
- un message prive envoye;
- une correction testee si besoin.

Apres la partie:

- noter les moments ou l'hote a cherche quoi faire;
- noter les actions trop lentes;
- noter les textes incompris par les joueurs;
- noter les gestures qui auraient ete naturelles;
- exporter ou relire l'audit si utile.

## Ce Qui Est Normal Dans Le MVP

Normal:

- certains resultats sont encore valides par l'hote;
- les vrais gestes Android ne sont pas encore obligatoires;
- certains jeux gardent un plateau ou des elements physiques;
- l'app assiste le meneur plus qu'elle ne remplace completement les regles.

Anormal:

- un joueur voit des donnees secretes d'un autre joueur;
- une transaction joueur-joueur passe sans contact/proximite/fallback;
- l'hote ne voit pas une resolution en attente;
- une correction ne laisse aucune trace dans l'audit;
- les joueurs doivent fouiller longtemps pour trouver l'action de phase.
