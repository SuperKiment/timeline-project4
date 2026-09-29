# Déploiement sur Raspberry Pi

Ce guide installe l'application sur un Raspberry Pi (64 bits, Raspberry Pi OS ou Debian) avec un service systemd, des sauvegardes cron et du HTTPS sur le réseau local (nécessaire pour installer l'application en PWA sur les téléphones).

Les exemples supposent : utilisateur système `timeline`, code dans `/opt/timeline`, données dans `/var/lib/timeline`, sauvegardes dans `/var/backups/timeline`. Adaptez-les à votre installation.

## 1. Installer Node.js 22 (ARM64)

```sh
sudo apt update && sudo apt install -y curl ca-certificates git
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # v22.x
uname -m         # aarch64 attendu
```

Les modules natifs (`better-sqlite3`, `sharp`, `@node-rs/argon2`) fournissent des binaires précompilés pour ARM64 : aucune compilation n'est normalement nécessaire.

## 2. Récupérer le code et construire

```sh
sudo useradd --system --create-home --shell /usr/sbin/nologin timeline
sudo mkdir -p /opt/timeline /var/lib/timeline /var/backups/timeline
sudo chown timeline:timeline /opt/timeline /var/lib/timeline /var/backups/timeline
sudo chmod 750 /var/lib/timeline /var/backups/timeline   # base et photos privées illisibles par les autres comptes locaux
sudo -u timeline git clone <url-du-depot> /opt/timeline
cd /opt/timeline
sudo -u timeline npm ci
sudo -u timeline npm run build
sudo -u timeline npm prune --omit=dev
```

Notes :

- `tsx` est dans les `dependencies` (et non `devDependencies`) : `npm prune --omit=dev` le conserve, ce qui permet de lancer `npm run db:migrate`, `user:create`, `seed` et `backup` en production.
- Si `npm ci` ou `npm install` échoue avec le npm 9.2 fourni avec certaines versions (bug arborist), utilisez `npx -y npm@11 ci`.
- Ne lancez jamais `npm audit fix --force`.
- Pour mettre à jour plus tard : `git pull`, `npm ci`, `npm run build`, `npm prune --omit=dev`, puis `sudo systemctl restart timeline`. Les migrations sont appliquées avec `npm run db:migrate` (voir plus bas) ; faites une sauvegarde avant.

## 3. Configuration

Créez `/opt/timeline/.env` (lu par systemd via `EnvironmentFile`). Le nom d'hôte est celui choisi à l'étape HTTPS (section 7) ; en attendant, utilisez l'URL réellement tapée dans le navigateur.

```sh
HOST=127.0.0.1
PORT=3000
ORIGIN=https://timeline.local
DATA_DIR=/var/lib/timeline
TZ=Europe/Paris
BACKUP_DIR=/var/backups/timeline
BODY_SIZE_LIMIT=Infinity
PROTOCOL_HEADER=x-forwarded-proto
HOST_HEADER=x-forwarded-host
```

```sh
sudo chown timeline:timeline /opt/timeline/.env && sudo chmod 600 /opt/timeline/.env
```

Points d'attention :

- `HOST=127.0.0.1` : derrière Caddy, Node ne doit écouter que sur la boucle locale, sinon on pourrait contourner le HTTPS. Sans reverse proxy (HTTP direct sur le LAN), utilisez `HOST=0.0.0.0` et retirez `PROTOCOL_HEADER`/`HOST_HEADER`.
- `PROTOCOL_HEADER` et `HOST_HEADER` (ou à défaut `ORIGIN`) sont indispensables derrière Caddy : sans eux, SvelteKit croit être en `http://`, le cookie de session n'a pas l'attribut `Secure` et le contrôle CSRF (en-tête `Origin`) peut refuser les formulaires.
- Ne définissez pas `ADDRESS_HEADER` sauf si Caddy est le seul point d'entrée vers Node : sinon un client pourrait falsifier `X-Forwarded-For`. Si vous le faites, ajoutez `ADDRESS_HEADER=x-forwarded-for` et `XFF_DEPTH=1`.
- `BODY_SIZE_LIMIT=Infinity` désactive la limite d'adapter-node ; l'application applique ses propres limites : 500 Mo par fichier et par requête, 50 Mo par photo, 20 fichiers.
- `npm start` et les commandes `npm run ...` lisent `.env` automatiquement depuis `/opt/timeline` (les variables déjà définies dans l'environnement l'emportent).

## 4. Base de données et comptes

Depuis `/opt/timeline` (le `.env` de la section 3 est lu automatiquement), en tant que `timeline` pour que les fichiers lui appartiennent :

```sh
sudo -u timeline bash -c 'cd /opt/timeline && npm run db:migrate'
sudo -u timeline bash -c 'cd /opt/timeline && npm run user:create -- --username alice --display-name Alice'
sudo -u timeline bash -c 'cd /opt/timeline && npm run user:create -- --username bob --display-name Bob'
sudo -u timeline bash -c 'cd /opt/timeline && npm run seed'
```

`user:create` demande le mot de passe par une invite masquée. Autres sources possibles : variable `USER_PASSWORD`, entrée standard redirigée, ou `--password` (déconseillé : visible dans l'historique du shell et dans `ps`). Deux comptes maximum.

## 5. Service systemd

`/etc/systemd/system/timeline.service` :

```ini
[Unit]
Description=Notre timeline
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=timeline
Group=timeline
WorkingDirectory=/opt/timeline
EnvironmentFile=/opt/timeline/.env
ExecStart=/usr/bin/node build
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Les variables (`HOST`, `PORT`, `ORIGIN`, `DATA_DIR`, `TZ`, `BODY_SIZE_LIMIT`, `PROTOCOL_HEADER`, `HOST_HEADER`) viennent du fichier `.env`. Dans ce fichier, ne mettez pas de guillemets autour des valeurs ni de commentaires en fin de ligne (systemd les interpréterait différemment du shell).

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now timeline
sudo systemctl status timeline
journalctl -u timeline -f
curl -I http://127.0.0.1:3000/login
```

## 6. ffmpeg (optionnel)

```sh
sudo apt install -y ffmpeg
sudo systemctl restart timeline
```

Sans ffmpeg, les vidéos sont acceptées mais n'ont pas de vignette. Avec lui, une image est extraite de la vidéo à l'envoi.

## 7. HTTPS sur le LAN

Les navigateurs mobiles n'autorisent l'installation PWA (service worker) que sur une origine sécurisée. `http://192.168.x.x` ne l'est pas. Comparaison des options :

| Critère                  | Caddy + CA interne (`tls internal`)                    | mkcert                                         | Tailscale `serve`                             |
| ------------------------ | ------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------- |
| Compte externe           | Aucun                                                  | Aucun                                          | Compte Tailscale requis                       |
| Certificat               | Émis par une CA locale, renouvelé automatiquement      | Généré à la main, à renouveler (validité ~2 ans) | Valide (Let's Encrypt), automatique           |
| Installation sur téléphone | Installer le certificat racine de Caddy une fois     | Installer la CA mkcert une fois                | Installer l'app Tailscale sur chaque appareil |
| Fonctionne hors Internet | Oui                                                    | Oui                                            | Non (connexion au coordinateur requise)       |
| Accès hors du domicile   | Non                                                    | Non                                            | Oui (via le tailnet)                          |
| Complexité               | Faible                                                 | Moyenne (certificats à brancher dans Caddy)    | Faible                                        |

Recommandation : **Caddy avec `tls internal`**, entièrement local et sans compte externe. Tailscale est documenté en alternative (section 7.3). mkcert donne le même résultat que Caddy mais demande de gérer soi-même les certificats ; il n'est pas détaillé ici.

### 7.1 Caddy avec `tls internal`

Choisissez un nom résolu par tous vos appareils. Le plus simple est le nom mDNS du Pi, `<nom-du-pi>.local` (voir `hostname`, modifiable avec `sudo raspi-config` ; `avahi-daemon` doit tourner). Sinon, ajoutez un enregistrement DNS dans votre box. Ci-dessous : `timeline.local` (à remplacer partout, y compris dans `ORIGIN`).

Installation de Caddy (paquet Debian/Raspberry Pi OS récent, sinon dépôt officiel Caddy) :

```sh
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile` :

```caddyfile
timeline.local {
	tls internal
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

Caddy envoie déjà `X-Forwarded-Proto` et `X-Forwarded-Host` à Node, ce qui correspond à `PROTOCOL_HEADER`/`HOST_HEADER` de la section 3. Les envois volumineux ne sont pas limités par Caddy par défaut.

```sh
sudo systemctl reload caddy
sudo systemctl status caddy
```

Ouvrez le port 443 si un pare-feu est actif : `sudo ufw allow 443/tcp`. Le port 3000 n'a pas besoin d'être ouvert (Node écoute sur `127.0.0.1`).

Vérifiez ensuite que `ORIGIN=https://timeline.local` dans `/opt/timeline/.env`, puis `sudo systemctl restart timeline`.

### 7.2 Installer le certificat racine sur les téléphones

Le certificat racine de Caddy se trouve, pour le service Debian, dans :

```
/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt
```

Copiez-le sur le téléphone (AirDrop, e-mail, câble, ou un serveur temporaire dans un dossier dédié : `mkdir -p /tmp/ca && sudo cp /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt /tmp/ca/ && python3 -m http.server -d /tmp/ca 8000`, puis ouvrez `http://<ip-du-pi>:8000/root.crt` sur le téléphone ; arrêtez ensuite le serveur (Ctrl-C) et supprimez le dossier : `rm -rf /tmp/ca`). Ne partagez jamais la clé privée (`root.key`).

**iOS / iPadOS :**

1. Ouvrez `root.crt` dans Safari ou depuis Fichiers : « Profil téléchargé ».
2. Réglages > Général > VPN et gestion de l'appareil (ou « Profils ») > profil Caddy Local Authority > Installer.
3. Réglages > Général > Informations > Réglages des certificats de confiance > activez la confiance totale pour ce certificat racine (étape indispensable).
4. Ouvrez `https://timeline.local` dans Safari, puis Partager > Sur l'écran d'accueil.

**Android :**

1. Réglages > Sécurité (ou « Sécurité et confidentialité ») > Plus de paramètres de sécurité > Chiffrement et identifiants > Installer un certificat > Certificat CA. Les intitulés varient selon le constructeur.
2. Acceptez l'avertissement et sélectionnez `root.crt`.
3. Ouvrez `https://timeline.local` dans Chrome, puis menu > Installer l'application.

Sur ordinateur, ajoutez aussi `root.crt` aux autorités de certification de confiance du système ou du navigateur. Firefox utilise son propre magasin (Paramètres > Vie privée et sécurité > Certificats > Afficher les certificats > Autorités > Importer).

Si l'installation d'une CA n'est pas possible sur un appareil, l'application reste utilisable, mais sans installation PWA.

### 7.3 Alternative : Tailscale `serve`

Aucune modification de Caddy. Node peut alors écouter en clair sur la boucle locale, et Tailscale fournit le HTTPS avec un certificat valide.

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
sudo tailscale serve --bg 3000
tailscale serve status
```

Activez les certificats HTTPS et MagicDNS dans la console d'administration Tailscale. L'application est alors disponible sur `https://<nom-du-pi>.<tailnet>.ts.net`, uniquement pour les appareils de votre tailnet (installez l'app Tailscale sur chaque téléphone). Dans `/opt/timeline/.env`, définissez `ORIGIN=https://<nom-du-pi>.<tailnet>.ts.net` et gardez `PROTOCOL_HEADER`/`HOST_HEADER`, puis `sudo systemctl restart timeline`. N'utilisez pas `tailscale funnel` : il exposerait l'application sur Internet.

## 8. Sauvegardes (cron)

`npm run backup` écrit une archive `tar.gz` (copie cohérente de la base, sûre même application lancée, et médias) dans `BACKUP_DIR`. Sans cette variable, l'archive est écrite dans `./backups` du dossier courant : définissez-la toujours pour les tâches automatiques.

Créez `/etc/cron.d/timeline-backup` (tous les jours à 03:30, rétention de 30 jours) :

```cron
30 3 * * * timeline cd /opt/timeline && npm run backup >> /var/log/timeline-backup.log 2>&1 && find /var/backups/timeline -name '*.tar.gz' -mtime +30 -delete
```

Préparez le journal : `sudo touch /var/log/timeline-backup.log && sudo chown timeline /var/log/timeline-backup.log`.

Testez à la main, puis contrôlez l'archive :

```sh
sudo -u timeline bash -c 'cd /opt/timeline && npm run backup'
ls -lh /var/backups/timeline
```

Une sauvegarde sur la même carte SD ne protège pas d'une panne de carte : copiez régulièrement `/var/backups/timeline` vers un autre support (disque USB, autre machine avec `rsync`).

Restauration : `sudo systemctl stop timeline`, extraire l'archive dans `DATA_DIR` (`sudo -u timeline tar -xzf <archive> -C /var/lib/timeline`, après avoir vérifié son contenu avec `tar -tzf`), puis `sudo systemctl start timeline`.

## 9. Vérification finale

1. `systemctl is-active timeline caddy` : `active` deux fois.
2. Depuis un téléphone sur le même Wi-Fi : `https://timeline.local` affiche la page de connexion sans avertissement de certificat.
3. Après connexion, envoyez une photo puis une vidéo ; consultez la vignette de la vidéo (si ffmpeg est installé).
4. Vérifiez dans les outils de développement du navigateur que le cookie `session` porte les attributs `Secure` et `HttpOnly`.
5. Sans Caddy (test direct en HTTP, AC-14) : voir la section « Accès depuis le téléphone » du [README](../README.md).
