# Notre timeline

Application web (SvelteKit, mobile-first, installable en PWA) pour deux personnes : une frise chronologique partagée (histoire, événements, souvenirs), un journal quotidien, des photos et des vidéos. Les données restent sur votre machine (SQLite + fichiers).

## Prérequis

- Node.js 22 (`engine-strict` est activé dans `.npmrc`)
- npm
- Optionnel : `ffmpeg` (miniatures des vidéos ; sans lui, les vidéos sont acceptées mais sans vignette)

## Démarrage en développement

```sh
npm install
cp .env.example .env
npm run db:migrate
npm run user:create -- --username alice --display-name Alice
npm run user:create -- --username bob --display-name Bob
npm run seed
npm run dev -- --host
```

Le serveur de développement écoute sur le port 5173 : <http://localhost:5173>.

> Si `npm install` échoue sur une installation sans lockfile (bug arborist de npm 9.2), utilisez `npx -y npm@11 install`.

### Variables d'environnement

Le fichier `.env.example` documente toutes les variables. Les valeurs par défaut conviennent au développement :

| Variable                         | Défaut         | Rôle                                                                   |
| -------------------------------- | -------------- | ---------------------------------------------------------------------- |
| `HOST`                           | `0.0.0.0`      | Adresse d'écoute                                                       |
| `PORT`                           | `3000`         | Port d'écoute (production)                                             |
| `ORIGIN`                         | (vide)         | URL publique, requise derrière un reverse proxy (contrôle CSRF)        |
| `DATA_DIR`                       | `./data`       | Base SQLite (`timeline.sqlite`), médias (`media/`) et envois (`tmp/`)  |
| `TZ`                             | `Europe/Paris` | Fuseau utilisé pour « aujourd'hui »                                    |
| `BACKUP_DIR`                     | `./backups`    | Destination de `npm run backup`                                        |
| `SESSION_DAYS`                   | `30`           | Durée glissante de la session, en jours                                |
| `BODY_SIZE_LIMIT`                | `Infinity`     | Limite d'adapter-node désactivée : les limites d'envoi sont dans l'app |
| `PROTOCOL_HEADER`, `HOST_HEADER` | (vides)        | En-têtes de confiance derrière un reverse proxy                        |

Important : ni `node build` ni les scripts `tsx` ne lisent le fichier `.env` d'eux-mêmes. Pour que `npm run db:migrate`, `user:create`, `seed` et `backup` utilisent votre configuration, chargez-la dans le shell :

```sh
set -a; . ./.env; set +a
```

(ou préfixez la commande : `DATA_DIR=/chemin npm run db:migrate`). Le contenu de `.env` doit rester au format `CLE=valeur`, sans espaces autour du `=`.

## Comptes

L'application accepte au maximum 2 comptes. Les identifiants sont enregistrés en minuscules.

```sh
npm run user:create -- --username alice --display-name Alice
```

Le mot de passe est lu, par ordre de priorité, depuis :

1. `--password <mot de passe>` : déconseillé, visible dans l'historique du shell et dans `ps` ;
2. la variable d'environnement `USER_PASSWORD` ;
3. l'entrée standard si elle est redirigée (`printf '%s' "$MDP" | npm run user:create -- ...`) ;
4. sinon (par défaut) une invite interactive masquée, avec confirmation.

La création d'un troisième compte est refusée. La connexion est limitée à 5 échecs en 15 minutes par couple identifiant et adresse IP.

## Données de départ (seed)

```sh
npm run seed
```

Ajoute les repères historiques (entrées de type « histoire »). La commande est idempotente : la relancer ne crée pas de doublons.

## Accès depuis le téléphone sur le réseau local (AC-14)

Le serveur doit écouter sur toutes les interfaces (`HOST=0.0.0.0`, valeur par défaut en production ; en développement, `npm run dev -- --host`).

Vérification manuelle :

1. Sur la machine qui héberge l'application, trouvez son adresse IP locale : `hostname -I` (par exemple `192.168.1.42`).
2. Lancez le serveur : `npm run dev -- --host` (port 5173), ou en production `npm run build && HOST=0.0.0.0 PORT=3000 npm start` (port 3000).
3. Le téléphone doit être sur le même Wi-Fi que la machine. Ouvrez `http://192.168.1.42:5173` (développement) ou `http://192.168.1.42:3000` (production).
4. La page de connexion doit s'afficher. Si ce n'est pas le cas, vérifiez le pare-feu de la machine (`sudo ufw allow 5173/tcp` ou `3000/tcp`) et que le Wi-Fi n'isole pas les clients entre eux.
5. En production sur une IP en `http://`, si la connexion échoue avec une erreur « Cross-site POST form submissions are forbidden », définissez `ORIGIN` sur l'URL exacte utilisée (`ORIGIN=http://192.168.1.42:3000`).

En `http://` sur le LAN, le cookie de session n'a pas l'attribut `Secure` et l'installation PWA n'est généralement pas proposée. De plus, le mot de passe et le cookie de session circulent en clair sur le Wi-Fi : configurez le HTTPS en suivant la section [HTTPS sur le LAN de docs/DEPLOY-RPI.md](docs/DEPLOY-RPI.md#7-https-sur-le-lan).

## Tests

```sh
npm test                      # tests unitaires et serveur (Vitest)
npm run check                 # svelte-check / TypeScript
npm run lint                  # Prettier + ESLint
npx playwright install        # une seule fois : télécharge les navigateurs
npm run test:e2e              # tests de bout en bout (Playwright)
```

`npm run test:e2e` construit l'application, prépare une base jetable dans `.e2e-data/` (deux comptes de test, seed) puis lance le serveur sur le port 4173. Les projets `desktop` (Chrome) et `mobile` (Pixel 7) sont exécutés. Vos données de `data/` ne sont pas touchées.

## Sauvegarde et export

```sh
npm run backup
```

Crée une archive `tar.gz` (copie cohérente de la base + médias) dans `BACKUP_DIR`, ou dans `./backups` si la variable n'est pas définie. Le chemin de l'archive est affiché. Pour restaurer : arrêtez l'application, extrayez l'archive dans `DATA_DIR`.

Un export JSON des données est aussi disponible dans l'application, page Paramètres. Un exemple de sauvegarde quotidienne automatique avec rotation est donné dans [docs/DEPLOY-RPI.md](docs/DEPLOY-RPI.md).

## Ordre des dates floues (EC-3)

Une date peut être précise à l'année, au mois ou au jour. Pour trier, chaque date est convertie en clé texte `AAAA-00-00` (année), `AAAA-MM-00` (mois) ou `AAAA-MM-JJ` (jour), comparée dans l'ordre lexicographique. Une date moins précise passe donc avant les dates plus précises de la même période :

```
2018  →  mars 2018  →  12/03/2018
```

Deux entrées ayant la même clé sont départagées par leur date de création, puis par leur identifiant : l'ordre est toujours déterministe.

## Production

```sh
npm ci && npm run build
npm start        # node build
```

Déploiement sur Raspberry Pi (systemd, HTTPS sur LAN, sauvegardes) : voir [docs/DEPLOY-RPI.md](docs/DEPLOY-RPI.md).

## Limites d'envoi

500 Mo par fichier et par requête, 50 Mo par photo, 20 fichiers par envoi. Ces limites sont appliquées par l'application (`BODY_SIZE_LIMIT=Infinity` désactive celle d'adapter-node).
