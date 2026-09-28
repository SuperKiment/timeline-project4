# PLAN: Timeline de couple v1 (souvenirs + journal intime)
spec: /home/kiment/Projects/GitHub/timeline-project4/SPEC.md   date: 2026-09-21
status legend: todo | doing | done | failed-review

## Conventions (binding for every task)

- Layout: server-only code in `src/lib/server/**`; shared pure code in `src/lib/{dates,timeline,journal,media}/**`; Svelte components in `src/lib/components/**`; CLI scripts in `scripts/*.ts` run with `tsx`.
- Modules imported by `scripts/*` (config, db, auth/password, seed, backup) use RELATIVE imports only and never import `$env/*` or `$app/*`; config comes from `process.env` via `src/lib/server/config.ts`.
- Every service function takes `db: Db` as its first argument (type exported by `src/lib/server/db/index.ts`); routes pass `getDb()`. Tests use `createTestDb()` (in-memory, migrated) from `src/lib/server/db/test-db.ts`.
- Unit/server tests are colocated as `src/**/*.test.ts` (Vitest, node env). E2E specs live in `e2e/*.spec.ts` (Playwright projects `desktop` = Desktop Chrome, `mobile` = Pixel 7 viewport 412px chromium). Binary fixtures in `tests/fixtures/`.
- IDs are integer autoincrement. Days are ISO strings `YYYY-MM-DD`. Timestamps are integer ms epoch.
- Fuzzy date storage: `*_sort` TEXT key `YYYY-00-00` (year) / `YYYY-MM-00` (month) / `YYYY-MM-DD` (day) + `*_precision` TEXT. Lexicographic order satisfies EC-3; ties broken by `created_at`, then `id`. Period validity (EC-2): refuse when `lastDay(end) < firstDay(start)`.
- Soft delete: `deleted_at` column on entries (incl. recurrent series), occurrence_notes, journal_entries, media. Children of a deleted parent are NOT stamped; they are hidden by parent visibility and restored with it (EC-5). Purge = hard delete rows (FK `ON DELETE CASCADE`) + unlink files.
- Session: random 32-byte token in cookie `session` (httpOnly, SameSite=Lax, Path=/, Secure iff `url.protocol === 'https:'`), DB stores SHA-256 of token, 30-day sliding expiry. Passwords: `@node-rs/argon2` (ARM64 prebuilt).
- Login rate limit: in-memory, key `lower(username)|ip`, 5 failures within 15 min → all attempts refused until the window clears; success clears the key.
- Markdown: rendered server-side only (`marked` + `sanitize-html` allowlist), passed to pages as HTML strings.
- HEIC decode: `heic-convert` → JPEG buffer → `sharp`. Upload parsing: `busboy` streaming to `DATA_DIR/tmp` then atomic rename. MIME sniffing: `file-type`. Adapter-node `BODY_SIZE_LIMIT=Infinity`; 500 MB limit enforced in our code.
- Default `TZ=Europe/Paris`. Max 2 user accounts (non-goal: >2 users).
- No `svelte.config.js`: kit 2.70 config (adapter-node, kit options) lives inline in `vite.config.ts` via the `sveltekit()` plugin — edit it there.
- System npm 9.2 has an arborist bug on lockfile-less installs; use `npx -y npm@11 install` if needed. Never `npm audit fix --force`.
- UI text in French; dark mode via `prefers-color-scheme` CSS variables in `src/app.css`; touch targets ≥ 44px.

## Tasks

### T1: Scaffold SvelteKit TS project, tooling and git  [done]  (lite: no)
deps: -
files: package.json, package-lock.json, tsconfig.json, svelte.config.js, vite.config.ts, playwright.config.ts, eslint.config.js, .prettierrc, .prettierignore, .gitignore, .npmrc, src/app.html, src/app.d.ts, src/app.css, src/routes/+layout.svelte, src/routes/+page.svelte, src/lib/smoke.test.ts
do: `git init`; scaffold SvelteKit minimal TS (`npx sv create` or by hand) with `@sveltejs/adapter-node`, TS `strict: true`, ESLint (flat config, svelte + ts) + Prettier, Vitest (in vite.config.ts `test.include: ['src/**/*.test.ts']`, env node), Playwright (projects `desktop`/`mobile`, webServer placeholder `npm run build && node build` on port 4173). Install deps now so later tasks never touch package.json deps: drizzle-orm, better-sqlite3, @node-rs/argon2, sharp, heic-convert, file-type, busboy, marked, sanitize-html, tar, tsx (runtime deps); drizzle-kit, @types/better-sqlite3, @types/busboy, @types/sanitize-html (dev). Scripts: dev, build, preview, start (`node build`), check, lint, format, test (`vitest run`), test:e2e (`playwright test`), db:generate (`drizzle-kit generate`), db:migrate (`tsx scripts/migrate.ts`), user:create (`tsx scripts/user-create.ts`), seed (`tsx scripts/seed.ts`), backup (`tsx scripts/backup.ts`). `.gitignore`: node_modules, build, .svelte-kit, data/, backups/, .e2e-data/, .env, test-results/, playwright-report/. `app.html` `lang="fr"`, `<link rel="manifest" href="/manifest.webmanifest">`, `<meta name="theme-color">`, viewport meta. `app.d.ts`: `App.Locals { user: { id: number; username: string; displayName: string } | null; sessionId: string | null }`. `app.css`: CSS variables light/dark via `prefers-color-scheme`, base font, `button, a.btn, input, select { min-height: 44px }`. Keep `kit.csrf.checkOrigin` default (true).
exit: `npm install && npm run build && npm run check && npm run lint && npm test` all pass (smoke test asserts 1+1); `git status` shows a repo; `grep -q '^data/' .gitignore` (AC-1 groundwork, NFR-5/6).

### T2: Env configuration module  [done]  (lite: yes)
deps: T1
files: src/lib/server/config.ts, src/lib/server/config.test.ts, .env.example
do: Export `getConfig()` reading process.env: `HOST` (default `0.0.0.0`), `PORT` (3000), `ORIGIN` (optional), `DATA_DIR` (default `./data`, resolved absolute), `TZ` (default `Europe/Paris`), `BACKUP_DIR` (default `./backups`), `SESSION_DAYS` (30). Derived paths: `dbPath = DATA_DIR/timeline.sqlite`, `mediaDir = DATA_DIR/media`, `tmpDir = DATA_DIR/tmp`. `.env.example` documents all plus `BODY_SIZE_LIMIT=Infinity` and `PROTOCOL_HEADER`/`HOST_HEADER` for reverse proxy.
exit: `npx vitest run src/lib/server/config.test.ts` passes (defaults + overrides, FR-29).

### T3: Drizzle schema, DB client, migrations incl. FTS5  [done]  (lite: no)
deps: T2
files: src/lib/server/db/schema.ts, src/lib/server/db/index.ts, src/lib/server/db/migrate.ts, src/lib/server/db/test-db.ts, src/lib/server/db/db.test.ts, drizzle.config.ts, drizzle/** (generated SQL + meta), scripts/migrate.ts
do: Tables: `users`(id, username unique, display_name, password_hash, created_at); `sessions`(id=token sha256 hex PK, user_id FK cascade, expires_at); `entries`(id, type enum souvenir|important|phase|recurrent|histoire, title not null, description, location, tags TEXT JSON array default '[]', start_sort, start_precision, end_sort null, end_precision null, recurrence_freq yearly|monthly null, seed_key unique null, created_by FK users set null, created_at, updated_by, updated_at, deleted_at null, index on start_sort); `occurrence_notes`(id, series_id FK entries cascade, occurrence_date, note, created_by, created_at, updated_by, updated_at, unique(series_id, occurrence_date)); `journal_entries`(id, user_id FK cascade, day, text, mood, created_at, updated_at, deleted_at, partial unique index (user_id, day) WHERE deleted_at IS NULL); `media`(id, entry_id/occurrence_note_id/journal_entry_id FKs cascade with CHECK exactly one non-null, kind photo|video, mime, stored_name, thumb_name null, poster_name null, size, width null, height null, original_name, created_by, created_at, deleted_at). Generate migration 0000, then a custom migration (`drizzle-kit generate --custom`) creating FTS5 external-content tables `entries_fts(title, description, location, tags)` and `journal_fts(text)` with insert/update/delete sync triggers. `index.ts`: `createDb(path)` sets `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`; `getDb()` lazy singleton on `config.dbPath` (mkdir DATA_DIR); export `type Db`. `migrate.ts`: `runMigrations(db)` using drizzle migrator on `./drizzle`. `test-db.ts`: `createTestDb()` in-memory + migrated.
exit: `npm run db:migrate` creates `data/timeline.sqlite`; `npx vitest run src/lib/server/db` passes asserting WAL (file DB), `PRAGMA foreign_keys=1`, FTS row appears after entry insert and disappears after delete, media CHECK rejects two owners (NFR-3).

### T4: Fuzzy date library  [done]  (lite: no)
deps: T1
files: src/lib/dates/fuzzy.ts, src/lib/dates/fuzzy.test.ts
do: Type `Precision = 'day'|'month'|'year'`, `FuzzyDate { year; month?; day?; precision }`. Functions: `toSortKey`, `fromSortKey`, `isValidFuzzy`, `firstDay(fd)`/`lastDay(fd)` (ISO day), `compareSortKeys`, `formatFr(fd)` ("12 mars 2018" / "mars 2018" / "2018", French month names), `isPeriodValid(start, end)` per Conventions, `containsDay(start, end|null, isoDay, today)`. Pure, no Node APIs.
exit: `npx vitest run src/lib/dates/fuzzy.test.ts` passes incl. EC-3 ordering "2018" < "mars 2018" < "12/03/2018", leap-year lastDay(Feb 2024)=2024-02-29, invalid dates rejected (AC-4, FR-5, EC-2).

### T5: Recurrence occurrence generator  [done]  (lite: no)
deps: T1
files: src/lib/dates/recurrence.ts, src/lib/dates/recurrence.test.ts
do: `occurrences(originIso, freq: 'yearly'|'monthly', endIso: string|null, untilIso): string[]` inclusive of origin, stops at min(end, until). Monthly: day clamped to last day of month (31 → 30/28/29), always computed from origin day (not cumulative clamping). Yearly 29/02 → 28/02 in non-leap years. Also `occurrenceOn(originIso, freq, isoDay, endIso|null): boolean` for Ce jour-là. Pure functions.
exit: `npx vitest run src/lib/dates/recurrence.test.ts` passes: monthly from 2024-01-31 gives 2024-02-29, 2024-03-31, 2024-04-30; yearly 2020-02-29 gives 2021-02-28, 2024-02-29; end date respected; 10 years monthly = 121 items (AC-4, EC-4, FR-7).

### T6: Timezone-aware "today" helpers  [done]  (lite: yes)
deps: T1
files: src/lib/server/time.ts, src/lib/server/time.test.ts
do: `todayIn(tz: string, now = new Date()): string` via `Intl.DateTimeFormat('en-CA', { timeZone })`; `isFutureDay(isoDay, tz, now)`; `monthDay(isoDay)` → `MM-DD`. `now` injectable for tests.
exit: `npx vitest run src/lib/server/time.test.ts` passes: `2026-01-01T23:30:00Z` → `2026-01-02` in Europe/Paris and `2026-01-01` in UTC (EC-18).

### T7: Safe markdown renderer  [done]  (lite: yes)
deps: T1
files: src/lib/server/markdown.ts, src/lib/server/markdown.test.ts
do: `renderMarkdown(src: string): string` using `marked` (no raw HTML passthrough trust) then `sanitize-html` allowlist: p, br, strong, em, ul, ol, li, blockquote, code, pre, a[href, rel, target] (http/https/mailto only), h3-h6; force `rel="noopener noreferrer"`.
exit: `npx vitest run src/lib/server/markdown.test.ts` passes: `<script>alert(1)</script>` and `<img src=x onerror=alert(1)>` and `[x](javascript:alert(1))` produce no script/onerror/javascript: in output; `**a**` → `<strong>` (AC-16, NFR-4).

### T8: Auth core (password, sessions, rate limit)  [done]  (lite: no)
deps: T3
files: src/lib/server/auth/password.ts, src/lib/server/auth/session.ts, src/lib/server/auth/rate-limit.ts, src/lib/server/auth/users.ts, src/lib/server/auth/auth.test.ts
do: `hashPassword/verifyPassword` (@node-rs/argon2). `users.ts`: `createUser(db, {username, displayName, password})` refusing when 2 users exist or username taken; `findUserByUsername`. `session.ts`: `createSession(db, userId, now)` → raw token; `validateSession(db, token, now)` → user|null, extends expiry when < half remaining; `invalidateSession`. `rate-limit.ts`: class `LoginRateLimiter` (injectable clock) per Conventions with `isBlocked(key)`, `recordFailure(key)`, `reset(key)`; export singleton.
exit: `npx vitest run src/lib/server/auth` passes: third user refused; wrong password fails; expired session null; 5 failures then 6th blocked, unblocked after 15 simulated minutes (FR-1, FR-3, AC-2).

### T9: Hooks guard, login/logout, user:create CLI, e2e infrastructure  [done]  (lite: no)
deps: T8
files: src/hooks.server.ts, src/lib/server/startup.ts, src/routes/login/+page.svelte, src/routes/login/+page.server.ts, src/routes/logout/+server.ts, scripts/user-create.ts, playwright.config.ts, e2e/prepare.sh, e2e/helpers.ts, e2e/auth.spec.ts
do: (NOTE from B4 security review: lowercase the username consistently for both lookup and rate-limit key; on unknown username run a dummy argon2 verify against a fixed hash so response timing does not reveal account existence.) `startup.ts`: `runStartup()` idempotent (runMigrations on getDb). `hooks.server.ts`: call runStartup once; read cookie → `locals.user/sessionId`; public paths: `/login` only; unauthenticated `/api/*` and `/media/*` → 401 JSON, other pages → 303 `/login?redirectTo=<path>`. Login form action: rate limiter keyed per Conventions (`getClientAddress()`), French error messages ("Identifiant ou mot de passe incorrect", "Trop de tentatives, réessayez dans 15 minutes"), sets cookie, redirects to safe relative `redirectTo`. Logout POST clears session. CLI: `--username --display-name --password` (prompt for password via readline if absent). Playwright webServer: `npm run build && sh e2e/prepare.sh && node build` with env DATA_DIR=.e2e-data, PORT=4173, ORIGIN=http://localhost:4173, TZ=Europe/Paris, BODY_SIZE_LIMIT=Infinity; `prepare.sh` rm -rf .e2e-data, db:migrate, creates users alice/bob (password `motdepasse-test`), runs `npm run seed` if scripts/seed.ts exists. `helpers.ts`: `login(page, user)`.
exit: `npm run test:e2e -- e2e/auth.spec.ts` passes: `/` redirects to `/login`; `GET /api/anything` → 401; bad password shows error; good login lands on `/`; 6th rapid failed login for user `intrus` shows rate-limit message; logout works. `npm run user:create -- --username x ...` against a fresh DATA_DIR exits 0 (AC-2, FR-1, FR-2, FR-3).

### T10: Timeline entries service + validation  [done]  (lite: no)
deps: T3, T4
files: src/lib/server/entries/validate.ts, src/lib/server/entries/service.ts, src/lib/server/entries/service.test.ts
do: `validateEntryInput(raw)` → typed input or French field errors: title required; start required; `phase`/`histoire` may have end; `souvenir`/`important` no end; `recurrent` requires day-precision start + freq, optional day-precision end; EC-2 via `isPeriodValid`; tags trimmed, deduped. Service: `createEntry(db, input, userId, now)`, `updateEntry` (sets updated_by/at), `getEntry(db, id)` (null if deleted), `softDeleteEntry(db, id, now)`, `listJournalDaysForEntry(db, entry, today)` returning days in [firstDay(start), lastDay(end|today)] (capped to 366 days) that have visible journal entries with author names.
exit: `npx vitest run src/lib/server/entries/service.test.ts` passes: all 5 types creatable; end<start rejected with message; deleted entry not returned; updated_by stored (FR-4, FR-5, FR-6, FR-13 journal link, FR-25, EC-2).

### T11: Recurrent occurrence notes service  [done]  (lite: no)
deps: T3, T5
files: src/lib/server/entries/occurrences.ts, src/lib/server/entries/occurrences.test.ts
do: `listSeriesOccurrences(db, seriesId, today)` → `{ occurrences: {date, note|null, noteId|null, mediaCount}[], orphans: note[] }` where orphans are notes whose date is not in current `occurrences(...)` (EC-6). `upsertOccurrenceNote(db, seriesId, date, note, userId, now)` rejects a date that is not a valid occurrence or is in the future. `ensureOccurrenceNote(db, seriesId, date, userId, now)` returns note id (creates empty note) — used by media upload. Tests insert the series row directly with drizzle.
exit: `npx vitest run src/lib/server/entries/occurrences.test.ts` passes: note attached only to its occurrence; changing series origin makes old note appear in `orphans`, not lost (FR-7, AC-5, EC-6).

### T12: Histoire seed (idempotent)  [done]  (lite: no)
deps: T3, T4
files: src/lib/server/seed/histoire.ts, src/lib/server/seed/histoire.test.ts, scripts/seed.ts
do: Data array of 18 French-described landmarks with stable `seed_key` (e.g. attentats-11-septembre-2001, crise-financiere-2008, attentats-paris-2015, brexit-2016, incendie-notre-dame-2019, covid-19-pandemie 2020-03-11→2023-05-05, confinement-1 2020-03-17→2020-05-11, confinement-2 2020-10-30→2020-12-15, confinement-3 2021-04-03→2021-05-03, guerre-ukraine 2022-02-24→(open), mort-elizabeth-ii 2022-09-08, coupe-du-monde-2018 2018-07-15, reouverture-notre-dame 2024-12-07, jo-paris-2024 2024-07-26→2024-08-11, paralympiques-2024, chatgpt 2022-11-30, gilets-jaunes 2018-11-17→2019 (year), election-presidentielle-2022 2022-04-24), type `histoire`, created_by null. `seedHistoire(db)` inserts with `ON CONFLICT(seed_key) DO NOTHING` (a user-deleted/purged seed may be re-added only if purged — acceptable). Script: migrate then seed, prints count.
exit: `npx vitest run src/lib/server/seed` passes: two runs → same count of histoire rows (≥15); `npm run seed` twice exits 0 (FR-8, AC-11, EC-17).

### T13: Timeline query and shared item types  [done]  (lite: no)
deps: T3, T4, T5
files: src/lib/timeline/types.ts, src/lib/server/timeline/query.ts, src/lib/server/timeline/query.test.ts
do: (NOTE from B3 fixes: `src/lib/timeline/types.ts` already exists exporting `ENTRY_TYPES` + `EntryType` (imported by db/schema.ts) — extend it, do not redefine.) `types.ts` (client-safe): `EntryType`, `TimelineItem = { kind: 'entry'|'occurrence'; id; type; title; startSort; startPrecision; endSort|null; endPrecision|null; ongoing: boolean; seriesId?; occurrenceDate?; hasNote?; thumbUrl|null; location|null }`. `getTimeline(db, { types: EntryType[], today })`: visible entries (deleted_at null) of selected types, recurrent series expanded into occurrence items up to today/end (series row itself not emitted), `ongoing` for open phases/histoire (EC-1), first visible photo thumb `/media/<id>/thumb`, sorted by sort key then created_at, id. Only needed columns selected.
exit: `npx vitest run src/lib/server/timeline` passes: ordering per EC-3; type filter works; deleted entries absent (EC-16); perf test with 2 000 entries + monthly series over 10 years returns in < 300 ms (NFR-2, FR-9/10/11 data).

### T14: Journal service  [done]  (lite: no)
deps: T3, T2, T6
files: src/lib/server/http-error.ts, src/lib/journal/moods.ts, src/lib/server/journal/service.ts, src/lib/server/journal/service.test.ts
do: `http-error.ts`: `class HttpError extends Error { constructor(public status: number, message: string) }`. `moods.ts`: `MOODS = ['😄','🙂','😐','😔','😢','😠','😴','🥰','🤒','🤩']` with French labels. Service: `getDay(db, day)` → both users' visible entries (with display names) + `isFuture`; `upsertOwnEntry(db, userId, day, {text, mood}, tz, now)` throws `HttpError(400)` for future day or invalid mood; `updateEntryById(db, id, userId, ...)` / `softDeleteJournal(db, id, userId, now)` throw `HttpError(403)` if not author; `listCalendar(db, fromDay, toDay)` → `{ day, authors: {userId, displayName}[] }[]`.
exit: `npx vitest run src/lib/server/journal` passes: A and B write same day → two rows (EC-7 no conflict); B editing A's → 403 (EC-8); future day → 400 (FR-17, EC-7); calendar lists authors (FR-15, FR-16, FR-19).

### T15: Full-text search service  [done]  (lite: no)
deps: T3
files: src/lib/server/search/service.ts, src/lib/server/search/service.test.ts
do: (SECURITY, from B3 review: FTS tables are external-content and still contain soft-deleted rows — every search query MUST join back to base tables with `deleted_at IS NULL` (entries, journal_entries; media not indexed). Journal is shared per FR-16 so both users may see both journals, but never return deleted rows.) `toFtsQuery(input)`: split on whitespace, strip `"` and FTS operators, drop empty tokens, each token → `"token"*`, joined with space; empty → null (return []). `search(db, q, limit=50)`: union of `entries_fts` hits joined to visible entries → `{kind:'entry', id, title, snippet, url:'/entries/<id>'}` and `journal_fts` hits joined to visible journal entries → `{kind:'journal', day, author, snippet, url:'/journal/<day>'}`, ranked by bm25. Use parameterized SQL (`sql` template).
exit: `npx vitest run src/lib/server/search` passes: word in one journal + one description → 2 results; input `"*-` and `a" OR -b*` → no throw, [] (AC-9, EC-15); soft-deleted entry not found (EC-16, AC-8).

### T16: "Ce jour-là" service  [done]  (lite: no)
deps: T3, T5, T6
files: src/lib/server/onthisday/service.ts, src/lib/server/onthisday/service.test.ts
do: `onThisDay(db, today)` → `{ year, items: ({kind:'entry', id, type, title} | {kind:'occurrence', seriesId, date, title, note} | {kind:'journal', day, author, excerpt})[] }[]` for years < current year, grouped by year desc: visible souvenir/important with day precision and same MM-DD; occurrences of visible recurrent series landing on that MM-DD (use `occurrenceOn`, respects 29/02→28/02); visible journal entries with same MM-DD. `today` param comes from `todayIn(tz)`.
exit: `npx vitest run src/lib/server/onthisday` passes: seeded data on same DD/MM across 3 past years grouped by year; month-precision souvenir excluded; deleted excluded; empty → [] (FR-20, AC-10, EC-16, EC-18).

### T17: Media validation, image processing, storage paths  [done]  (lite: no)
deps: T2
files: src/lib/server/media/validate.ts, src/lib/server/media/images.ts, src/lib/server/media/storage.ts, src/lib/server/media/images.test.ts, tests/fixtures/photo-exif-rotated.jpg, tests/fixtures/photo.heic, tests/fixtures/fake.jpg, tests/fixtures/README.md
do: `validate.ts`: allowed map ext→mime (jpg/jpeg, png, webp, heic/heif, mp4, mov→video/quicktime, webm); `sniffAndValidate(filePath, clientName)` uses `file-type` and rejects unsupported or ext/MIME mismatch with French messages; `MAX_BYTES = 500*1024*1024`. `storage.ts`: `newStoredName(ext)` (crypto random hex, no client name), `mediaPath(name)` with guard that resolved path stays inside `mediaDir` (NFR-4), `removeMediaFiles(row)` ignoring ENOENT. `images.ts`: `processPhoto(tmpPath, mime)` → HEIC via heic-convert → JPEG (clear `MediaError('HEIC illisible')` on failure, EC-10); `sharp().rotate()` for EXIF, write original (JPEG for HEIC) + 400px-wide WebP thumb; return width/height. Fixtures: JPEG with EXIF orientation 6 generated via sharp; HEIC produced with `heif-enc` (libheif-examples) from a JPEG if available, else a public-domain sample with source URL recorded in tests/fixtures/README.md; fake.jpg = text bytes.
exit: `npx vitest run src/lib/server/media/images.test.ts` passes: rotated JPEG thumb has swapped dimensions; HEIC → JPEG output; fake.jpg rejected; `mediaPath('../x')` throws (FR-21, FR-22, FR-23, EC-9, EC-10).

### T18: Video poster via optional ffmpeg  [done]  (lite: yes)
deps: T2
files: src/lib/server/media/video.ts, src/lib/server/media/video.test.ts, tests/fixtures/video.mp4
do: `hasFfmpeg()` cached (`spawn('ffmpeg', ['-version'])`, false on ENOENT). `makePoster(videoPath, outPath): Promise<boolean>` → extract frame at 1s (fallback 0s) as JPEG 400px wide; returns false (never throws) if ffmpeg missing/fails. Fixture: 2-second 320x240 MP4 generated with `ffmpeg -f lavfi -i testsrc=duration=2:size=320x240:rate=10 -pix_fmt yuv420p`.
exit: `npx vitest run src/lib/server/media/video.test.ts` passes: with ffmpeg poster file exists; with `PATH=''`-simulated absence (inject binary name `ffmpeg-absent`) returns false without throwing (FR-22, EC-11).

### T19: Upload service and media API  [done]  (lite: no)
deps: T11, T17, T18
files: src/lib/server/media/upload.ts, src/lib/server/media/upload.test.ts, src/routes/api/media/+server.ts, src/routes/api/media/[id]/+server.ts
do: (NOTE from B4 fixes: `ensureOccurrenceNote(db, seriesId, date, userId, now, today)` needs `today` (todayIn(tz)) and throws `HttpError` 404/400 — propagate its status.) `handleUpload(db, request, user, now)`: busboy stream from `request.body`; fields `ownerKind` (entry|occurrence|journal), `ownerId` (entry id / journal id) and for occurrence `seriesId`+`date` (→ `ensureOccurrenceNote`); journal owner must belong to user (403). Each file streamed to `tmpDir/<random>`; abort + delete tmp when > MAX_BYTES (413, "Fichier trop volumineux (max 500 Mo)"); after stream: sniff/validate (415 on mismatch), process photo (T17) or video (move + poster T18), insert media row in transaction; on any error delete tmp and produced files (no orphan rows, EC-9); `ENOSPC` → 507 "Espace disque insuffisant" (EC-12); request aborted → cleanup. Returns JSON `[{id, kind, thumbUrl, url}]`. `DELETE /api/media/[id]` soft-deletes (403 if journal media of another user). Tests call `handleUpload` with a constructed `Request` of multipart body; oversized test uses a stubbed `MAX_BYTES` (export setter for tests) to avoid 500 MB.
exit: `npx vitest run src/lib/server/media/upload.test.ts` passes: JPEG ok (row + files); fake MIME → 415 and no file/row left in DATA_DIR; oversize → 413 and tmp dir empty; aborted stream → no row; journal of other user → 403 (FR-21, AC-7 server part, EC-9, EC-12).

### T20: Authenticated media serving with HTTP Range  [done]  (lite: no)
deps: T3, T17
files: src/lib/server/media/serve.ts, src/lib/server/media/serve.test.ts, src/routes/media/[id]/[variant]/+server.ts
do: `variant` ∈ original|thumb|poster. `serveMedia(db, id, variant, rangeHeader)`: 404 if row missing, media deleted, or owner (entry / series of occurrence note / journal) deleted (EC-16); resolve via `mediaPath` only (no client path). Parse single `bytes=a-b` / `bytes=a-` / `bytes=-n`; 206 with Content-Range, Accept-Ranges, Content-Length, stream via `fs.createReadStream` → `ReadableStream`; 416 on unsatisfiable; 200 otherwise. `Cache-Control: private, max-age=31536000, immutable`. Auth enforced by hooks (T9).
exit: `npx vitest run src/lib/server/media/serve.test.ts` passes: `bytes=0-99` → 206, length 100; invalid range → 416; deleted media → 404; owner-deleted → 404 (FR-22, FR-23, AC-7 206, NFR-4).

### T21: Trash service and scheduled purge  [done]  (lite: no)
deps: T9, T17
files: src/lib/server/trash/service.ts, src/lib/server/trash/service.test.ts, src/lib/server/startup.ts
do: (NOTE from B4 security review: the scheduled purge must also `DELETE FROM sessions WHERE expires_at <= now`.) (NOTE from B3 review: journal_entries has a partial unique index (user_id, day) WHERE deleted_at IS NULL — restoring a soft-deleted journal entry when the author already wrote a new one for that day must be detected and refused with a 409 + French message, not a 500; test it.) `listTrash(db)` → top-level deleted items (entries incl. series, journal entries, media) with title/label, deletedAt, `expiresAt = deletedAt + 30d`. `restore(db, kind, id, userId)` clears deleted_at (journal: author only → 403). `purgeItem(db, kind, id, userId)`: collect all media rows under the item (direct + occurrence notes + journal), delete DB row in transaction (cascade), then `removeMediaFiles`. `purgeExpired(db, now)` purges items with deleted_at < now − 30 days. In `startup.ts` add: call `purgeExpired` at startup and `setInterval` every 24h (unref'd).
exit: `npx vitest run src/lib/server/trash` passes with injected clock: item deleted 31 days ago purged (row + files on disk gone), 29-day item kept; restoring a series restores its occurrence notes/media visibility (EC-5, AC-8, FR-24).

### T22: Backup command  [done]  (lite: no)
deps: T3
files: src/lib/server/backup.ts, src/lib/server/backup.test.ts, scripts/backup.ts
do: `createBackup({ dbPath, mediaDir, backupDir, now })`: `VACUUM INTO '<tmp>/timeline.sqlite'` (better-sqlite3), then `tar.c({ gzip: true })` of the snapshot + `media/` into `backupDir/timeline-YYYYMMDD-HHmmss.tar.gz`; remove temp; return archive path. Script uses getConfig, prints path, exit 1 with message on failure.
exit: `npx vitest run src/lib/server/backup.test.ts` passes: archive extracts to a `timeline.sqlite` openable with a readable `entries` table and the media file present; `npm run backup` exits 0 (FR-26, AC-12).

### T23: JSON export and Settings page  [done]  (lite: no)
deps: T3
files: src/lib/server/export.ts, src/lib/server/export.test.ts, src/routes/api/export/+server.ts, src/routes/parametres/+page.svelte, src/routes/parametres/+page.server.ts
do: `exportAll(db)` → `{ version: 1, exportedAt, users: [{id, username, displayName}], entries, occurrenceNotes, journal, media (metadata only, no files) }` excluding password hashes and sessions; includes soft-deleted flag fields. GET `/api/export` returns it with `Content-Disposition: attachment; filename="timeline-export-YYYY-MM-DD.json"`. Settings page: current user info, "Exporter en JSON" download link, logout button (POST /logout), note about `npm run backup`.
exit: `npx vitest run src/lib/server/export.test.ts` passes (JSON.parse round-trip, no `password_hash` substring); e2e covered in T40 (FR-27, AC-12).

### T24: App shell layout and navigation  [done]  (lite: no)
deps: T9
files: src/routes/+layout.svelte, src/routes/+layout.server.ts, src/lib/components/AppNav.svelte, src/lib/components/ConfirmButton.svelte, e2e/nav.spec.ts
do: Layout imports app.css; `+layout.server.ts` returns `locals.user`. AppNav (hidden on /login): bottom tab bar on < 1024px, top bar on ≥ 1024px: Timeline (/), Journal (/journal), Ce jour-là (/ce-jour-la), Recherche (/recherche), Corbeille (/corbeille), Paramètres (/parametres); active state; each target ≥ 44px. `ConfirmButton.svelte`: form-submit button that opens native `<dialog>` "Mettre à la corbeille ?" confirm before submitting (used for all deletes, FR-24).
exit: `npm run test:e2e -- e2e/nav.spec.ts` passes on both projects: after login, all 6 nav links visible and navigable; no nav on /login (NFR-1, NFR-7).

### T25: PWA manifest, icons, service worker  [done]  (lite: yes)
deps: T9
files: static/manifest.webmanifest, static/icons/icon-192.png, static/icons/icon-512.png, static/icons/icon-maskable-512.png, static/favicon.png, src/service-worker.ts, e2e/pwa.spec.ts
do: Manifest: name "Notre timeline", short_name "Timeline", lang fr, start_url "/", display standalone, theme/background colors matching app.css, 3 icons (generate PNGs with a one-off sharp command, commit outputs). Service worker (`$service-worker` build + files): cache static assets on install, cache-first only for those URLs, network for everything else; delete old caches on activate.
exit: `npm run test:e2e -- e2e/pwa.spec.ts` passes: `/manifest.webmanifest` 200 unauthenticated with display=standalone; on localhost `navigator.serviceWorker.ready` resolves on /login (FR-28, AC-13).

### T26: Fuzzy date input component and form helpers  [done]  (lite: no)
deps: T4
files: src/lib/dates/fuzzy-form.ts, src/lib/dates/fuzzy-form.test.ts, src/lib/components/FuzzyDateInput.svelte
do: `fuzzy-form.ts`: `parseFuzzyFormFields({precision, year, month, day})` → FuzzyDate|error (French), `fuzzyToFormFields`. Component (Svelte 5 runes, props `name`, `value`, `label`, `required`, `allowedPrecisions`): precision segmented control (Jour/Mois/Année), year number input, month `<select>` French months, day input; hidden inputs `<name>_precision/_year/_month/_day`; mobile-friendly (inputmode numeric, 44px).
exit: `npx vitest run src/lib/dates/fuzzy-form.test.ts` passes; `npm run check` clean (FR-5, FR-14).

### T27: Entry form and create/edit routes  [doing]  (lite: no)
deps: T10, T24, T26
files: src/lib/components/EntryForm.svelte, src/lib/components/TagInput.svelte, src/routes/entries/new/+page.svelte, src/routes/entries/new/+page.server.ts, src/routes/entries/[id]/edit/+page.svelte, src/routes/entries/[id]/edit/+page.server.ts, e2e/entries-form.spec.ts
do: (NOTE from B4 fixes: `validateEntryInput` takes `start`/`end` as `FuzzyFormFields` (src/lib/dates/fuzzy-form.ts) — pass the FuzzyDateInput fields straight through; parsing/messages come from `parseFuzzyFormFields`.) EntryForm: type select (Souvenir, Important, Phase, Récurrent, Histoire) toggling fields: start FuzzyDateInput (day-only for récurrent, labeled "Date d'origine"), end FuzzyDateInput for phase/histoire ("Fin (vide = en cours)") and récurrent end (day), frequency (Annuel/Mensuel) for récurrent, title, description textarea (markdown léger hint), location, TagInput (comma/enter chips, hidden `tags` JSON). `new` load reads `?type=&date=YYYY-MM-DD` to prefill (FR-18 promote). Actions call validateEntryInput/createEntry/updateEntry with `locals.user.id`, return `fail(400, {errors, values})` preserving input; success → redirect `/entries/<id>`. Edit page shows created/updated by+date (FR-6).
exit: `npm run test:e2e -- e2e/entries-form.spec.ts` passes (both projects): create a phase with end<start shows French error and keeps values (EC-2); create souvenir with month precision redirects to detail URL; `/entries/new?type=souvenir&date=2024-05-01` prefilled (FR-14, FR-18).

### T28: Media uploader and gallery components  [done]  (lite: no)
deps: T19, T20
files: src/lib/media/upload-client.ts, src/lib/components/MediaUploader.svelte, src/lib/components/MediaGallery.svelte
do: `upload-client.ts`: `uploadFiles(files, ownerFields, onProgress)` via XMLHttpRequest multipart to `/api/media` (one request per file, sequential), resolves JSON or rejects with server French message; 401 → `location.href = '/login?redirectTo=...'`. MediaUploader: `<input type=file multiple accept="image/*,video/mp4,video/quicktime,video/webm">`, per-file progress bars, error list, `onuploaded` callback (then `invalidateAll()`). MediaGallery: grid of thumbs (`loading="lazy"`, `/media/<id>/thumb`), photo opens full image in `<dialog>`, video → `<video controls preload="metadata" poster=...>` of `/media/<id>/original` (generic video icon when no poster), per-item ConfirmButton delete → `DELETE /api/media/<id>`.
exit: `npm run check` and `npm run lint` clean; behavior verified by T29 e2e (FR-21, FR-22, NFR-2).

### T29: Entry detail page with media and journal links  [todo]  (lite: no)
deps: T7, T14, T27, T28
files: src/routes/entries/[id]/+page.svelte, src/routes/entries/[id]/+page.server.ts, e2e/entry-detail.spec.ts, e2e/media.spec.ts
do: Load: getEntry (404 if missing/deleted), rendered markdown, formatted fuzzy dates (EC-1 "en cours"), tags, location, creator/modifier names + dates, visible media, `listJournalDaysForEntry` links to `/journal/<day>`. Actions: `delete` → softDeleteEntry → redirect `/` ; Edit link. Includes MediaGallery + MediaUploader (ownerKind entry). `important` styled accent.
exit: `npm run test:e2e -- e2e/entry-detail.spec.ts e2e/media.spec.ts` passes: markdown `<script>` not executed on page (AC-16); mobile project uploads photo-exif-rotated.jpg + photo.heic + video.mp4 via setInputFiles → 3 thumbs/poster shown, `request.get('/media/<id>/original', {headers:{Range:'bytes=0-99'}})` → 206; delete moves entry out of detail (FR-13, AC-7, FR-24).

### T30: Recurrent series occurrences UI  [todo]  (lite: no)
deps: T11, T29
files: src/lib/components/SeriesOccurrences.svelte, src/routes/entries/[id]/+page.svelte, src/routes/entries/[id]/+page.server.ts, src/routes/entries/[id]/occurrences/[date]/+page.svelte, src/routes/entries/[id]/occurrences/[date]/+page.server.ts, e2e/recurrent.spec.ts
do: (NOTE from B4 fixes: `upsertOccurrenceNote(db, seriesId, date, note, userId, now, today)` / `ensureOccurrenceNote(db, seriesId, date, userId, now, today)` take explicit `today` (todayIn(tz)); they throw `HttpError` 404 (series) / 400 (date) — map via `error(e.status, e.message)`. `orphans` items are `{ id, date, note }`.) On detail of a `recurrent` entry, load `listSeriesOccurrences` and render SeriesOccurrences: list (newest first) with date, note excerpt, media count, link to occurrence page; "Notes orphelines" section for orphans (EC-6). Occurrence page: 404 if date not a valid occurrence; note textarea (upsertOccurrenceNote action), MediaGallery + MediaUploader with ownerKind occurrence (seriesId+date).
exit: `npm run test:e2e -- e2e/recurrent.spec.ts` passes: create yearly series, annotate one occurrence with note + photo → shown on that occurrence only, other occurrence page empty (AC-5, FR-7).

### T31: Vertical timeline component  [done]  (lite: no)
deps: T13
files: src/lib/timeline/layout.ts, src/lib/timeline/layout.test.ts, src/lib/components/timeline/VerticalTimeline.svelte, src/lib/components/timeline/TimelineCard.svelte
do: (NOTE from B4: key `{#each}` by `item.key` — `id` is shared by all occurrences of a series.) `layout.ts`: `groupByYearMonth(items)` → year/month sections (precision-year items at year head, month items at month head); `assignPhaseLanes(phases)` → greedy non-overlapping lane index (max 3 lanes, extra share last). Component props `items`, `today`: chronological past→present, sticky year/month separators with `id="y-YYYY"`, phases as colored left bands spanning their sections (EC-1 extends to today), histoire items in a separate grey right column, `important` accented, TimelineCard with lazy thumb, year jump `<select>` scrolling to `#y-YYYY`, on mount scroll to today marker (`#today`). Use `content-visibility: auto` on sections for NFR-2.
exit: `npx vitest run src/lib/timeline/layout.test.ts` passes (grouping order, lane assignment); `npm run check` clean (FR-9).

### T32: Horizontal zoomable timeline component  [done]  (lite: no)
deps: T13
files: src/lib/timeline/scale.ts, src/lib/timeline/scale.test.ts, src/lib/components/timeline/HorizontalTimeline.svelte
do: (NOTE from B4: key `{#each}` by `item.key` — `id` is shared by all occurrences of a series.) `scale.ts`: `makeScale(minDay, maxDay, pxPerDay)` → `x(day)`, `ticks(zoom: 'year'|'month')`; zoom levels continuous between year (≈1 px/day) and month (≈8 px/day) with clamp. Component props `items`, `today`: horizontally scrollable frise; tracks top→bottom: phase bands (own greedy lane calc `phaseLanes()` in scale.ts, independent of T31), main track markers (items in sort order, fuzzy items placed at firstDay with width to lastDay), separate grey Histoire track; zoom via wheel (ctrl/plain wheel with preventDefault) and +/− buttons (44px); initial scroll to today; markers link to `/entries/<id>` or occurrence page; render only markers within viewport ± buffer.
exit: `npx vitest run src/lib/timeline/scale.test.ts` passes (x monotonic, tick labels in French); `npm run check` clean (FR-10).

### T33: Home timeline page (filters, view toggle, empty state)  [todo]  (lite: no)
deps: T24, T27, T31, T32
files: src/routes/+page.svelte, src/routes/+page.server.ts, src/lib/timeline/prefs.ts, src/lib/components/timeline/TypeFilters.svelte, src/lib/components/timeline/ViewToggle.svelte, e2e/timeline.spec.ts
do: Load `getTimeline(db, {types from ?types= (default all 5), today: todayIn(tz)})`. TypeFilters: 5 toggle chips updating URL `?types=` (goto, keepFocus). ViewToggle vertical/horizontal; `prefs.ts` stores choice in localStorage `timeline.view`; default by `matchMedia('(min-width: 1024px)')`. Empty state when no non-histoire items: "Votre timeline est vide" + CTA button "Ajouter un souvenir" → /entries/new (EC-14). "Ajouter" FAB always visible. Link "Ce jour-là" at top (FR-20 access from home).
exit: `npm run test:e2e -- e2e/timeline.spec.ts` passes on both projects: fresh data shows empty-state CTA; create via UI one entry of each of the 5 types with year/month/day precisions → DOM order matches expected in vertical AND horizontal (toggle) views; hiding `histoire` filter removes histoire items; toggle choice persists after reload (AC-3, FR-9, FR-10, FR-11, EC-14).

### T34: Journal day page and journal API  [doing]  (lite: no)
deps: T7, T14, T24, T28
files: src/lib/journal/draft.ts, src/routes/journal/+page.server.ts, src/routes/journal/[date]/+page.svelte, src/routes/journal/[date]/+page.server.ts, src/routes/api/journal/[date]/+server.ts, e2e/journal.spec.ts
do: (NOTE from B4 fixes: journal service `now` params are ms-epoch numbers; `getDay(db, day, tz, now)` / `upsertOwnEntry(db, userId, day, input, tz, now)`; invalid `day` → `HttpError(400)`.) `/journal` → redirect `/journal/<todayIn(tz)>`. Day page: prev/next day links (next hidden beyond today), `<input type=date>` jump, two columns (stack < 768px): own entry editable (textarea, mood radio chips from MOODS, save action, ConfirmButton delete, MediaUploader ownerKind journal after first save), partner's rendered read-only (markdown HTML, mood, MediaGallery without delete). Future day: read-only message "Impossible d'écrire pour un jour futur". `draft.ts`: autosave textarea to localStorage `journal-draft:<userId>:<day>` on input, restore if newer than server text, clear on successful save (EC-13). "Promouvoir en souvenir" link → `/entries/new?type=souvenir&date=<day>`. API: PUT `{text, mood}` → upsert own (400 future), DELETE → soft delete own; errors map HttpError status (403 on other's id via `?id=`).
exit: `npm run test:e2e -- e2e/journal.spec.ts` passes: alice writes, bob (second context) sees alice's text and has no edit control for it; bob `PUT/DELETE /api/journal/<day>?id=<aliceId>` → 403; PUT for tomorrow → 400; draft restored after reload without save (AC-6, FR-15..18, EC-7, EC-8, EC-13).

### T35: Journal calendar view  [doing]  (lite: no)
deps: T14, T24
files: src/routes/journal/calendrier/+page.svelte, src/routes/journal/calendrier/+page.server.ts, e2e/journal-calendar.spec.ts
do: Month grid (`?mois=YYYY-MM`, default current month in TZ) with prev/next month; each day cell links to `/journal/<day>` and shows author initials/colored dots per author from `listCalendar`; below 768px render as list of days having entries. Page has a "Journal du jour" link to /journal; the Journal nav tab stays pointed at /journal (T34 files untouched).
exit: `npm run test:e2e -- e2e/journal-calendar.spec.ts` passes: after alice writes today, today's cell shows alice's marker and not bob's (FR-19).

### T36: Search page  [todo]  (lite: no)
deps: T15, T27, T34
files: src/routes/recherche/+page.svelte, src/routes/recherche/+page.server.ts, e2e/search.spec.ts
do: GET form `?q=`; load runs `search(db, q)`; results list with kind badge (Entrée/Journal), title or day+author, snippet (text only, escaped), link to url. Empty message "Aucun résultat pour « q »".
exit: `npm run test:e2e -- e2e/search.spec.ts` passes: word written in a journal (via API) and an entry description (via form) → 2 clickable results; query `"*-` shows empty message, HTTP 200 (AC-9, FR-12, EC-15).

### T37: "Ce jour-là" page  [doing]  (lite: no)
deps: T16, T24
files: src/routes/ce-jour-la/+page.svelte, src/routes/ce-jour-la/+page.server.ts, e2e/ce-jour-la.spec.ts
do: Load `onThisDay(db, todayIn(tz))`; heading "Ce jour-là — <JJ mois>"; sections per year ("Il y a N ans — YYYY") with items linking to entry / occurrence page / journal day. Empty message "Rien ne s'est passé un <JJ mois> les années précédentes… pour l'instant."
exit: `npm run test:e2e -- e2e/ce-jour-la.spec.ts` passes: souvenir created via UI with today's DD/MM two years ago appears under that year; page 200 with empty message on fresh data is covered by unit T16 (FR-20, AC-10).

### T38: Trash page  [todo]  (lite: no)
deps: T21, T29, T33
files: src/routes/corbeille/+page.svelte, src/routes/corbeille/+page.server.ts, e2e/trash.spec.ts
do: List `listTrash` items (type label, title, deleted date, "suppression définitive le <date>"); actions `restore` and `purge` (ConfirmButton "Supprimer définitivement ?"); journal items of the other user shown without actions. Empty state "La corbeille est vide".
exit: `npm run test:e2e -- e2e/trash.spec.ts` passes: create entry, delete from detail → absent from timeline and search, listed in corbeille; restore → back on timeline; purge → gone from corbeille (AC-8 UI, FR-24, EC-16).

### T39: README and Raspberry Pi deployment guide  [done]  (lite: no)
deps: T9, T12, T22
files: README.md, docs/DEPLOY-RPI.md
do: README (French): prerequisites (Node 22), `npm install`, `.env` from `.env.example`, `npm run db:migrate`, `npm run user:create` ×2, `npm run seed`, `npm run dev -- --host`, access from phone via `http://<ip-lan>:5173` / prod port, tests (`npm test`, `npx playwright install`, `npm run test:e2e`), backup/export, EC-3 date ordering rule, AC-14 manual LAN check steps. DEPLOY-RPI: Node 22 ARM64 install (NodeSource), clone/build (`npm ci && npm run build && npm prune --omit=dev` keeping tsx), systemd unit with env (HOST, PORT, ORIGIN, DATA_DIR, TZ, BODY_SIZE_LIMIT=Infinity), optional `apt install ffmpeg`, cron `npm run backup` daily + retention, HTTPS on LAN: comparison table (Caddy + internal CA / mkcert with CA install on iOS & Android, vs Tailscale serve) and step-by-step for the recommended option — recommend Caddy `tls internal` reverse proxy with root CA installed on phones (fully local, no external account), Tailscale as documented alternative; PROTOCOL_HEADER/HOST_HEADER settings behind Caddy.
exit: `test -f README.md && test -f docs/DEPLOY-RPI.md`; `grep -c 'systemd\|Caddy\|Tailscale\|cron\|ffmpeg' docs/DEPLOY-RPI.md` ≥ 5; README mentions `user:create`, `seed`, `test:e2e` (FR-30, FR-31, AC-14, AC-15).

### T40: Responsive/export e2e and full acceptance run  [todo]  (lite: no)
deps: T23, T25, T30, T33, T34, T35, T36, T37, T38, T39
files: e2e/responsive.spec.ts, e2e/export.spec.ts
do: responsive.spec (mobile project, viewport 375x812): for /, /journal, /journal/calendrier, /ce-jour-la, /recherche, /corbeille, /parametres, /entries/new, an entry detail: assert `document.documentElement.scrollWidth <= 375` and all visible buttons/links have bounding height ≥ 44. export.spec: download from Paramètres → JSON.parse ok with `entries` array. Fix any lint/check/test failures found (touch only the failing files; record them in the task report).
exit: `npm install && npm run build && npm run check && npm run lint && npm test && npm run test:e2e` all pass (AC-1, AC-12, AC-13, NFR-1, NFR-5, NFR-6).

## Follow-ups (from reviews, non-blocking)

- F1 (B3 design W): `src/lib/server/db/schema.ts` CHECK constraints (entry type, start/end precision, media kind) hard-code literals — build from `ENTRY_TYPES`/`PRECISIONS`/`MEDIA_KINDS` via `sql.raw`, confirm `drizzle-kit generate` output is equivalent (no-op or harmless rebuild migration).
- F2 (B3 N): drop unused `export type { MediaKind }` re-export in `src/lib/server/media/validate.ts`; inline `resolveInitialFields` in FuzzyDateInput.
- F3 (B3 media): no explicit test for >50 MP HEIC rejection (no HEIC encoder available to build fixture) — add one via synthetic fixture or metadata stub.
- F4 (B3 bug W, do with T19): `src/lib/server/media/images.ts` `isDecodeError` maps libvips WRITE failures (ENOSPC comes back without `err.code`, message "No space left on device") to `MediaError('Image illisible.')` → T19 cannot return 507 (EC-12). Fix: decode source first (`clone().toBuffer()`/`metadata()`) inside the MediaError mapping, write files outside it; or detect `/No space left on device/`.
- F5 (B4 test W): `src/lib/server/timeline/query.test.ts` NFR-2 perf test uses a real wall-clock <300ms budget — widen margin or gate separately if it flakes on the Pi/CI.
- F6 (B4 design W): `src/lib/server/entries/occurrences.ts` `ensureOccurrenceNote` near-duplicates `upsertOccurrenceNote` — merge into one fn with optional `note` (omitted = leave note untouched); update T19/T30 callers accordingly.
- F7 (B4 bug N): `src/lib/server/entries/service.ts` journal-link 366-day cap keeps the oldest days of a long open phase — consider keeping the most recent 366 instead.
- F8 (B5 T31/T32, B6 T24): `src/lib/components/timeline/TimelineCard.svelte` + `HorizontalTimeline.svelte` + `src/lib/components/AppNav.svelte` (5 nav links) + `src/routes/journal/calendrier/+page.svelte` + `src/routes/ce-jour-la/+page.svelte` (B7) use `eslint-disable-next-line svelte/no-navigation-without-resolve` for `/entries/...` links because T29/T30 routes did not exist yet — switch to `resolve()` and drop the disable once they land (do with T29/T30).
- F9 (T39 finding): nothing loads `.env` — `node build`, `tsx scripts/*` and `vite dev` (config.ts reads `process.env`) all ignore it; DEPLOY-RPI documents `set -a; . ./.env` + systemd `EnvironmentFile` as workaround. Fix: `node --env-file-if-exists=.env` (Node ≥22.9; real env wins) in `start` and tsx scripts, and `loadEnv` → `process.env` in vite.config.ts for dev; then simplify README/DEPLOY-RPI.
- F10 (B5 bug W, do with T30/F6): `src/lib/server/media/upload.ts` `resolveOwner` for `ownerKind=occurrence` calls `ensureOccurrenceNote` (inserts or un-soft-deletes the note row) BEFORE files are processed → a later 413/415/507 leaves an empty note row / resurrects a deleted note. Fix: resolve occurrence ownership read-only first, create/restore the note inside the success path (same transaction as media rows).

## OPEN (decisions needing the user — plan is blocked on these)

(none — defaults chosen in Conventions: TZ Europe/Paris, argon2 via @node-rs/argon2, Caddy `tls internal` recommended for LAN HTTPS, mood emoji list in T14, 18 Histoire landmarks in T12; override any before starting if desired)
