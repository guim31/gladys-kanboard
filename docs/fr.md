# Vikunja

Les tâches de votre [Vikunja](https://vikunja.io) dans Gladys : ce qui reste à
faire aujourd'hui, ce qui est en retard, la prochaine tâche de chaque projet.
Une scène réagit quand une tâche arrive à échéance ou qu'un rappel sonne, une
autre ajoute « acheter du pain » depuis un bouton, un appui sur le tableau de
bord coche une tâche, et Gladys peut lire les tâches du jour chaque matin.

> **Vos retours sont les bienvenus.** Cette intégration a été testée contre un
> vrai serveur Vikunja (image Docker `vikunja/vikunja` v2.7.0, octobre 2026),
> pas encore au quotidien. Si quelque chose ne marche pas comme décrit,
> dites-le sur le [forum Gladys](https://community.gladysassistant.com) ou dans
> les [issues](https://github.com/guim31/gladys-vikunja/issues).

## Ce qu'il vous faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un **Vikunja auto-hébergé** (0.22 ou plus récent), joignable depuis Gladys
  (l'image Docker écoute sur le port 3456).
- Un **jeton d'API** d'un utilisateur de Vikunja. Dans Vikunja : **Settings** →
  **API Tokens** → **Create a token**, donnez-lui un nom (`Gladys`), une date
  d'expiration et ces permissions :
  - **Projects** : `read_all` ;
  - **Tasks** : `read_all`, `read_one`, `update` (pour marquer des tâches
    faites) et `create` (pour créer des tâches).

  Copiez le jeton, qui commence par `tk_` : Vikunja ne l'affiche qu'une fois.
  Sans `update` ou `create`, les compteurs, le widget et les déclencheurs
  marchent ; seule l'action correspondante est refusée.

L'intégration voit les projets et les tâches que voit cet utilisateur (les
siens et ceux partagés avec lui), et agit **en son nom**.

## Installation

1. Dans Gladys, **Intégrations** → installez **Vikunja**.
2. Dans l'écran **Configuration**, renseignez :
   - **Adresse** : l'adresse de Vikunja, par exemple
     `http://192.168.1.20:3456`, ou `https://taches.example.org` derrière un
     proxy inverse (un préfixe comme `/vikunja` est conservé) ;
   - **Jeton d'API** : le jeton `tk_…`.
3. Options :
   - **Projets suivis** : noms ou numéros séparés par des virgules
     (`Maison, 3`). Vide : tous les projets. Les projets archivés ne sont
     jamais suivis ;
   - **Accepter les certificats auto-signés** : pour une adresse en `https://`
     au certificat auto-signé, sur votre propre serveur seulement ;
   - **Intervalle de rafraîchissement** : 1 à 10 minutes (5 par défaut). Les
     échéances, les rappels et minuit sont toujours suivis à l'heure, quel que
     soit l'intervalle ;
   - **Langue des noms de fonctionnalités** : les noms donnés aux
     fonctionnalités à l'ajout d'un appareil (français par défaut), et les
     textes envoyés aux scènes.
4. Enregistrez, puis **Tester la connexion** : l'intégration lit Vikunja et
   donne sa version, le nombre de tâches ouvertes et de projets suivis.
5. Dans l'onglet **Découverte**, ajoutez les appareils voulus.

## Appareils

**Vikunja** (tous les projets suivis ensemble) et **Vikunja _projet_** pour
chaque projet suivi. Chacun a quatre fonctionnalités :

| Fonctionnalité               | Ce qu'elle indique                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `Tâches ouvertes`            | les tâches pas faites, avec ou sans échéance                                                |
| `Tâches à faire aujourd'hui` | les tâches ouvertes dues avant minuit, retards compris : ce qui reste à faire d'ici ce soir |
| `Tâches en retard`           | les tâches ouvertes dont l'échéance est passée                                              |
| `Prochaine tâche`            | le titre de la tâche ouverte à l'échéance la plus proche encore à venir ; `Aucune` sinon    |

« Aujourd'hui » est le jour dans le fuseau horaire de Gladys. Un sous-projet
est un projet à part entière : ses tâches ne comptent pas dans son parent.

## Tableau de bord

Le widget **Tâches du jour** montre deux tuiles (à faire aujourd'hui, en
retard), la liste des tâches du jour, en retard d'abord, avec leur heure (en
orange si la priorité est haute) et leur projet, et un bouton pour chacune des
quatre plus urgentes : un appui marque la tâche faite. Choisissez un appareil
de projet dans les réglages du widget pour ne voir que ses tâches ; laissez
vide pour tous les projets suivis. Quand il ne reste rien, le widget le dit et
donne la prochaine tâche.

Les compteurs peuvent aussi aller sur le tableau de bord comme toute
fonctionnalité d'appareil.

## Scènes

### Déclencheurs

- **Tâche Vikunja arrivée à échéance** : une tâche ouverte a atteint son heure
  d'échéance.
- **Rappel de tâche Vikunja** : un rappel d'une tâche ouverte a sonné (date
  fixe, ou relative à l'échéance : Vikunja la calcule).
- **Tâche Vikunja en retard** : à minuit, une tâche due ce jour-là n'est
  toujours pas faite. Une fois par tâche et par échéance.

Filtres, pour les trois : le projet (un appareil de projet : l'appareil
**Vikunja** ne filtre rien, laissez le champ vide pour tous les projets), le
titre de la tâche. Informations transmises aux actions : la tâche, son numéro, son projet,
sa priorité (0 à 5), son échéance ; et l'heure du rappel pour un rappel.

Une tâche faite avant son échéance ne déclenche rien. Une échéance déplacée à
la main avant la lecture précédente non plus : seuls comptent les moments qui passent
pendant que l'intégration tourne. Un redémarrage ne déclenche rien deux fois ;
un moment passé pendant que l'intégration était arrêtée déclenche à son
redémarrage, s'il date de moins d'une heure.

### Actions

- **Marquer une tâche Vikunja comme faite** : indiquez le **titre** exact
  (majuscules et accents ignorés) ou le **numéro** de la tâche (`#12`, le
  numéro dans l'adresse de la tâche dans Vikunja). Toute tâche ouverte que voit
  le jeton, projet suivi ou non. Une tâche répétée passe à sa prochaine
  échéance, comme dans Vikunja. Résultats : la tâche, son numéro, son projet,
  la prochaine échéance d'une tâche répétée.
- **Créer une tâche Vikunja** : un titre, et le projet par nom ou numéro
  (vide : le premier projet de la liste dans Vikunja, en général Inbox).
  Résultats : la tâche, son numéro, son projet.
- **Lire les tâches Vikunja du jour** : les tâches du jour en une phrase
  (`4 tâche(s) à faire aujourd'hui : …. 2 en retard.`), pour tous les projets
  suivis ou l'un d'eux. Résultats : la phrase, le nombre de tâches à faire
  aujourd'hui, de tâches en retard. Envoyez la phrase dans un message, ou
  faites-la dire par Gladys.

Les champs acceptent les variables de scène : `{{triggerEvent.data.task_id}}`
marque faite la tâche qui a déclenché la scène.

### Idées de scènes

- À 7 h 30, **Lire les tâches Vikunja du jour**, puis envoyer la phrase sur
  Telegram.
- **Rappel de tâche Vikunja** sur le projet `Courses` : faire clignoter la
  lumière de l'entrée.
- Un bouton près de la porte lance **Créer une tâche Vikunja** avec
  `Acheter du pain` dans `Courses`.
- Un tag NFC sur les poubelles lance **Marquer une tâche Vikunja comme faite**
  avec `Sortir les poubelles`.

## Dépannage

- **« Vikunja ne répond pas »** : vérifiez l'adresse et le port depuis la
  machine de Gladys (`http://<adresse>:3456` ouvre Vikunja dans un navigateur).
- **« Jeton d'API refusé ou sans une permission »** : le jeton a expiré, a été
  supprimé ou mal copié, ou il lui manque une permission de la liste
  ci-dessus. Vikunja répond de la même façon dans tous les cas : créez un
  nouveau jeton avec toutes les permissions indiquées.
- **« Aucune API Vikunja à cette adresse »** : l'adresse répond, mais pas avec
  l'API de Vikunja : vérifiez le port, ou le préfixe derrière un proxy inverse.
- **« L'adresse redirige »** : saisissez l'adresse en `https://`.
- **Un projet manque** : les projets archivés ne sont pas suivis ; un nom saisi
  dans **Projets suivis** qui ne correspond à aucun projet est ignoré, et
  **Tester la connexion** le signale.
- **« Plusieurs tâches ouvertes portent ce titre »** : indiquez plutôt le
  numéro (`#12`).
- Journaux : `LOG_LEVEL=debug` sur le conteneur montre chaque lecture.

## Limites

- Vikunja est lu toutes les 1 à 10 minutes (et à chaque échéance, chaque
  rappel et à minuit) : une tâche faite dans Vikunja apparaît dans Gladys dans
  ce délai. Les webhooks de Vikunja ne sont pas utilisés.
- Deux requêtes par lecture (projets, tâches ouvertes), plus une par page
  supplémentaire de 50 tâches. Jusqu'à 20 pages de tâches ouvertes sont lues.
- L'intégration marque des tâches faites et crée des tâches ; elle ne les
  modifie, ne les supprime, ne les déplace ni ne les assigne.
- Testée avec Vikunja v2.7.0. Les versions 0.22 à 0.24 devraient marcher (la
  liste des tâches y est `/tasks/all`, utilisée quand `/tasks` n'existe pas),
  mais elles n'ont pas été testées.
- Gladys ne garde aucune donnée de Vikunja hormis `/data/vikunja-state.json`
  (l'heure de la dernière lecture, pour qu'aucun événement ne parte deux fois).
- Sans lien avec Vikunja.
