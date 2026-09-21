# SPEC: Timeline de couple (souvenirs + journal intime)
date: 2026-09-21   status: final

## Goal
Application web privée pour un couple : une timeline du passé au présent regroupant souvenirs, événements importants, phases de vie, événements récurrents et repères historiques, plus un journal intime quotidien où chacun écrit son paragraphe. Utilisable depuis navigateur desktop et téléphone (PWA), hébergée localement (Raspberry Pi). Succès : les deux partenaires ajoutent et relisent leurs souvenirs et journal au quotidien, depuis leur téléphone, sans perte de données.

## Context
- Greenfield : dépôt vide (`/home/kiment/Projects/GitHub/timeline-project4`), pas de git initialisé.
- Dev : Linux x86_64, Node 22. Cible d'exécution : **Raspberry Pi (ARM64, Raspberry Pi OS 64-bit)** sur le LAN.
- Stack imposée : **SvelteKit (TypeScript) + SQLite** (Drizzle ORM, driver `better-sqlite3`), `adapter-node`. Toute dépendance native doit avoir un build ARM64 (better-sqlite3, sharp : OK).
- Médias stockés sur disque local (dossier configurable via env, ex. `DATA_DIR`), jamais dans la BDD.
- UI en français uniquement ; mode sombre suivant `prefers-color-scheme`.

## Users & Scenarios
Acteurs : 2 utilisateurs authentifiés (le couple). Pas d'inscription publique.
1. **Ajouter un souvenir** : depuis le téléphone, créer une entrée (type, titre, date floue, description, lieu, tags, photos/vidéos) → apparaît à sa place sur la timeline.
2. **Parcourir la timeline** : ouvrir l'app → timeline positionnée sur aujourd'hui, scroll vers le passé ; phases en bandes, repères Histoire en piste séparée ; filtrer par type, rechercher.
3. **Écrire le journal** : ouvrir le journal du jour → écrire son paragraphe + humeur + médias ; voir le paragraphe du partenaire à côté ; naviguer vers d'autres jours (rattrapage).
4. **Ce jour-là** : voir ce qui s'est passé à la date du jour les années précédentes (souvenirs + journal + occurrences récurrentes).
5. **Récurrent** : créer « Anniversaire de rencontre » annuel → une occurrence par an sur la timeline, chacune pouvant recevoir sa note/photos.

## Functional Requirements

### Auth & comptes
FR-1: Deux comptes (nom d'affichage, identifiant, mot de passe hashé argon2/bcrypt), créés via script CLI (`npm run user:create`) ; pas de page d'inscription.
FR-2: Login par formulaire, session cookie httpOnly, `SameSite=Lax`, `Secure` quand servi en HTTPS ; logout ; toutes les pages et API hors login exigent une session valide.
FR-3: Limitation basique des tentatives de login (ex. 5 échecs / 15 min par identifiant+IP).

### Timeline — modèle
FR-4: Types d'entrée : `souvenir` (ponctuel), `important` (ponctuel, mis en avant visuellement), `phase` (période début→fin, fin optionnelle = en cours), `recurrent` (série), `histoire` (repère mondial, ponctuel OU période).
FR-5: Dates floues : chaque date a une précision `day` | `month` | `year` (ex. « juin 2019 », « 2018 »), stockée de façon triable ; affichage adapté à la précision. Pour une phase/histoire période : début et fin chacun avec leur précision.
FR-6: Champs communs : titre (requis), description (markdown léger), lieu (texte libre), tags libres (multi), médias (0..n), auteur créateur, date de création, dernier modificateur + date de modification (affichés).
FR-7: Récurrent : série définie par date d'origine, fréquence `yearly` | `monthly`, date de fin optionnelle. Occurrences calculées (non stockées) de l'origine jusqu'à aujourd'hui (ou fin). Chaque occurrence peut recevoir une note et des médias propres (stockés à la demande, rattachés à série + date d'occurrence). Monthly au 29/30/31 → dernier jour du mois quand le jour n'existe pas ; yearly au 29/02 → 28/02 les années non bissextiles.
FR-8: Seed Histoire : ~15–20 repères pré-remplis (ex. COVID-19 pandémie, confinements France 2020, guerre en Ukraine 2022→, JO Paris 2024…), éditables/supprimables comme toute entrée ; seed idempotent.

### Timeline — UI
FR-9: Vue **verticale** (défaut mobile < 1024px) : ordre chronologique passé→présent, ouverture positionnée sur aujourd'hui, séparateurs année/mois, phases en bandes colorées latérales couvrant leur durée, Histoire dans une colonne/piste grisée distincte, `important` visuellement accentué, saut rapide par année.
FR-10: Vue **horizontale** (défaut desktop ≥ 1024px) : frise zoomable année↔mois (molette + boutons), phases en bandes, piste Histoire séparée, même données/filtres. Bascule manuelle vertical/horizontal disponible sur les deux formats (préférence mémorisée localement).
FR-11: Filtres par type (afficher/masquer chacun des 5 types).
FR-12: Recherche plein texte sur titres, descriptions, lieux, tags des entrées et textes du journal (SQLite FTS5), résultats cliquables vers l'entrée/le jour.
FR-13: Page détail d'une entrée : tous champs, galerie médias (photos + lecteur vidéo), entrées de journal des dates concernées (lien timeline↔journal), édition, suppression.
FR-14: CRUD complet des entrées depuis l'UI, formulaires utilisables au doigt sur mobile.

### Journal intime
FR-15: Une entrée de journal par (utilisateur, jour) : texte libre (markdown léger), humeur (choix parmi une liste d'emojis prédéfinie), médias 0..n.
FR-16: Page d'un jour : les deux entrées côte à côte (empilées sur mobile) ; chacun lit celle de l'autre ; seul l'auteur crée/modifie/supprime la sienne.
FR-17: Date par défaut = aujourd'hui (fuseau du serveur, configurable) ; navigation jour précédent/suivant + sélecteur de date ; écriture autorisée pour tout jour passé ou aujourd'hui, refusée pour un jour futur.
FR-18: « Promouvoir en souvenir » depuis un jour de journal : pré-remplit un formulaire de souvenir à cette date. La timeline indique les jours ayant des entrées de journal (dans le détail/la vue jour).
FR-19: Vue calendrier/liste du journal montrant quels jours ont des entrées et de qui.

### Ce jour-là
FR-20: Page « Ce jour-là » (accessible depuis l'accueil) : pour la date du jour (JJ/MM), liste par année précédente les souvenirs/importants à précision `day`, occurrences récurrentes tombant ce jour, et entrées de journal. Message vide explicite si rien.

### Médias
FR-21: Upload photos (JPEG, PNG, WebP, HEIC/HEIF → converti en JPEG) et vidéos (MP4, MOV, WebM), plusieurs par entrée, taille max 500 Mo par fichier, barre de progression, upload multiple depuis la galerie du téléphone.
FR-22: Miniatures photos générées (sharp) ; orientation EXIF respectée. Poster vidéo via `ffmpeg` si présent sur le système, sinon icône générique (l'absence d'ffmpeg ne casse rien). Vidéos servies telles quelles avec support HTTP Range (lecture/seek mobile).
FR-23: Médias servis uniquement aux utilisateurs authentifiés ; noms de fichiers générés côté serveur (pas de nom client dans le chemin).

### Corbeille
FR-24: Suppression (entrée timeline, série récurrente, entrée de journal, média) = soft delete vers corbeille, confirmation préalable ; restaurable pendant 30 jours ; purge définitive (BDD + fichiers) des éléments > 30 jours au démarrage du serveur et quotidiennement. Page Corbeille listant et permettant restaurer / supprimer définitivement.
FR-25: Droits : entrées timeline (tous types) modifiables/supprimables par les deux ; journal modifiable/supprimable uniquement par son auteur.

### Sauvegarde & export
FR-26: `npm run backup` : archive datée (`.tar.gz`) contenant un snapshot SQLite cohérent (API backup / `VACUUM INTO`) + dossier médias, dans un dossier configurable.
FR-27: Export JSON de tout le contenu (entrées, séries, occurrences, journal, métadonnées médias) téléchargeable depuis l'UI (page Paramètres).

### PWA & déploiement
FR-28: Manifest PWA (nom, icônes, `display: standalone`, couleurs thème) + service worker minimal (installabilité, cache des assets statiques) ; pas de mode hors-ligne des données.
FR-29: Serveur configurable via env : `HOST` (défaut `0.0.0.0`), `PORT`, `ORIGIN`, `DATA_DIR`, `TZ`, compatible derrière reverse proxy.
FR-30: `docs/DEPLOY-RPI.md` : installation sur Raspberry Pi (Node 22 ARM64, build, service systemd, ffmpeg optionnel, backups via cron) **et solution HTTPS sur LAN** pour permettre l'installation PWA : comparer et recommander (ex. Caddy reverse proxy + CA locale / mkcert avec installation de la CA sur iOS/Android, ou Tailscale `serve` avec certificat valide), étapes pas à pas pour la solution recommandée.
FR-31: `README.md` : démarrage dev, création des comptes, seed, tests, accès depuis le téléphone sur le LAN.

## Non-Functional Requirements
- NFR-1 Mobile-first : toutes les pages utilisables à 375px de large, cibles tactiles ≥ 44px.
- NFR-2 Performance sur Pi : timeline de 2 000 entrées + 10 ans de récurrences mensuelles affichée en < 2 s ; pas de chargement de médias pleine taille dans la timeline (miniatures, lazy-loading).
- NFR-3 Intégrité : SQLite en mode WAL, clés étrangères actives, migrations Drizzle versionnées.
- NFR-4 Sécurité : requêtes paramétrées (ORM), échappement/sanitization du markdown rendu (pas de XSS), protection CSRF (vérification d'origine SvelteKit active), validation des types MIME réels des uploads, pas de path traversal sur le service de fichiers.
- NFR-5 Qualité : TypeScript strict, `npm run check` et lint propres.
- NFR-6 Tests : Vitest (unitaires + API/serveur) et Playwright (e2e, projets desktop et viewport mobile), lancés par `npm test` / `npm run test:e2e`.
- NFR-7 UI en français, mode sombre auto.

## Edge Cases & Error Handling
EC-1: Phase sans date de fin → affichée « en cours » jusqu'à aujourd'hui.
EC-2: Phase/période avec fin < début → refus à la validation avec message.
EC-3: Dates floues mêlées : « 2018 » (année) trié avant « mars 2018 » (mois) avant « 12/03/2018 » ; ordre déterministe documenté.
EC-4: Récurrent mensuel créé le 31 → occurrence au dernier jour des mois courts ; annuel au 29/02 → 28/02 hors années bissextiles.
EC-5: Série récurrente supprimée → ses notes/médias d'occurrence suivent en corbeille ; restauration restaure l'ensemble.
EC-6: Série récurrente dont on modifie la date d'origine/fréquence → notes d'occurrence dont la date n'existe plus restent conservées et affichées comme « orphelines » dans le détail de la série (pas de perte silencieuse).
EC-7: Journal pour jour futur → refus (400) + message ; les deux partenaires écrivent simultanément → pas de conflit (entrées distinctes par auteur).
EC-8: Tentative de modifier le journal de l'autre (API directe) → 403.
EC-9: Upload > 500 Mo, type non supporté ou MIME réel différent de l'extension → refus avec message ; upload interrompu → aucun fichier partiel ni ligne orpheline.
EC-10: HEIC non décodable → message d'erreur clair, pas de crash.
EC-11: ffmpeg absent → pas de poster, icône vidéo, aucun échec d'upload.
EC-12: Disque plein à l'écriture → erreur 507/500 explicite, BDD non corrompue.
EC-13: Session expirée pendant la saisie d'un formulaire → redirection login sans perte silencieuse (brouillon conservé localement pour le journal).
EC-14: Timeline vide (premier lancement, hors seed Histoire) → état vide avec appel à l'action « Ajouter un souvenir ».
EC-15: Recherche sans résultat / caractères spéciaux FTS (guillemets, `*`, `-`) → pas d'erreur SQL, message vide.
EC-16: Élément en corbeille → invisible dans timeline, recherche, Ce jour-là, journal ; ses médias non servis.
EC-17: Seed Histoire relancé → pas de doublons.
EC-18: Fuseau horaire : « aujourd'hui » et Ce jour-là calculés dans `TZ` configuré, pas en UTC.

## Non-Goals
- Inscription publique, plus de 2 utilisateurs, partage externe.
- Mode hors-ligne des données (seulement installabilité PWA).
- Transcodage vidéo.
- Carte / géolocalisation.
- i18n (français uniquement).
- Hébergement cloud / exposition Internet (LAN uniquement ; Tailscale éventuel documenté seulement).
- Notifications push, rappels.
- Récurrences hebdo/custom (RRULE).

## Acceptance Criteria
AC-1: `npm install && npm run build` réussit ; `npm run check`, lint, `npm test` et `npm run test:e2e` passent.
AC-2: `npm run user:create` crée un compte ; login OK avec bon mdp, échec avec mauvais ; toute route protégée sans session → redirection `/login` (pages) ou 401 (API). 6e échec de login rapproché → refusé temporairement.
AC-3: Création via UI d'une entrée de chacun des 5 types, avec dates de précision jour/mois/année → visibles dans l'ordre correct en vue verticale et horizontale (test e2e).
AC-4: Tests unitaires couvrant génération des occurrences (yearly/monthly, 31 du mois, 29/02, date de fin) et tri des dates floues (EC-3, EC-4).
AC-5: Occurrence récurrente annotée (note + photo) → visible sur l'occurrence concernée uniquement.
AC-6: Journal : A écrit, B voit le texte de A ; B ne peut pas modifier celui de A (UI masquée + API 403) ; jour futur refusé.
AC-7: Upload photo JPEG + HEIC + vidéo MP4 depuis viewport mobile (e2e) → miniatures affichées, vidéo lisible avec seek (réponse 206 sur requête Range) ; fichier > 500 Mo et faux MIME refusés (test serveur).
AC-8: Suppression → élément en corbeille, absent de la timeline/recherche ; restauration le rétablit ; purge d'un élément daté de > 30 jours supprime ligne + fichiers (test serveur avec horloge simulée).
AC-9: Recherche d'un mot présent dans un journal et dans une description → deux résultats ; entrée `"*-` → aucun crash.
AC-10: « Ce jour-là » avec données seedées à la même JJ/MM d'années passées → affichées groupées par année.
AC-11: Seed lancé deux fois → même nombre d'entrées Histoire.
AC-12: `npm run backup` produit une archive contenant `*.sqlite` ouvrable et le dossier médias ; export JSON téléchargeable depuis Paramètres et parsable.
AC-13: Lighthouse/inspection : manifest valide + service worker enregistré (sur HTTPS/localhost) ; page utilisable à 375px sans scroll horizontal.
AC-14: Serveur lancé avec `HOST=0.0.0.0` accessible depuis un autre appareil du LAN (vérification manuelle documentée).
AC-15: `docs/DEPLOY-RPI.md` et `README.md` présents, couvrant FR-30/FR-31.
AC-16: Markdown contenant `<script>` / `<img onerror>` rendu sans exécution (test).

## Priorities
must: FR-1 → FR-31 (tout en v1)   should: —   later: mode hors-ligne, carte, récurrences custom, notifications

## Open Questions
(aucune)
