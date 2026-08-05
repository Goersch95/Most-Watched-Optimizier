# Most Watched Optimizer

CSV-Upload (oder Text-Einfügen) aus dem Traffic-Dashboard → Abgleich mit der CMS-API →
Ranglisten für die Rails "Meistgesehene Sendungen" und "Meistgesehene Clips", inkl.
Copy-Button für Asset-IDs und Direktlink zum jeweiligen Rail-Editor im CMS.

## Aktueller Stand

Das Grundgerüst steht: Upload, CSV-Parsing, Ranglisten-UI, Copy-Buttons, CMS-Rail-Links,
Login. Der CMS-Abgleich (`lib/cms-client.ts`) spricht den echten Scheduling-API-Endpoint an:

- `CMS_API_BASE_URL` muss auf die Basis-URL ohne `/products/{id}` zeigen, z. B.
  `https://graphql-proxy-staging.redbull.com/api/scheduling/v1/stv` - die ID wird pro
  Asset angehängt.
- Der Contenttype wird aus dem Feld `content_type` der Antwort gelesen (case-insensitiv,
  `_` wird wie Leerzeichen behandelt): `clip` → Meistgesehene Clips, `film`/`episode` →
  Meistgesehene Sendungen, `live_program` → Meistgesehene Live Programme, `video_channel`
  → Meistgesehene TV Kanäle (eigene Tabellen unten auf der Seite, nur sichtbar wenn
  Einträge vorhanden sind). Der Titel kommt aus `title_long`.
- `CMS_API_KEY` ist optional - die Staging-API ist ohne Bearer-Token erreichbar. Ist er
  gesetzt, wird er als `Authorization: Bearer …`-Header mitgeschickt, sonst läuft der
  Request ohne Auth-Header.
- Ohne `CMS_API_BASE_URL`, oder wenn ein einzelner Request fehlschlägt bzw.
  `content_type` einen unbekannten Wert liefert, greift eine Heuristik anhand des
  ID-Präfixes (`AA…` → Sendung, `PN…` → Clip) als Fallback. Die UI zeigt dazu einen
  Hinweis-Banner, solange die API nicht konfiguriert ist.
- Pro Upload (CSV oder eingefügter Text) werden nur die ersten 200 gültigen Einträge
  berücksichtigt (`lib/constants.ts`, `MAX_ROWS_PER_UPLOAD`).
- Für User ohne Export-Rechte im Dashboard gibt es zusätzlich zum CSV-Upload ein
  "Text einfügen"-Feld: aus dem Dashboard direkt kopierter Text (Zeilen abwechselnd
  Asset-ID / Views) wird genauso ausgewertet (`lib/csv-parser.ts`, `parsePastedRows`).

## Google-Indexierungs-Checker

Zweite Rubrik (eigene Seite `/indexing-checker`, per Tab-Nav oben erreichbar), misst wie
lange es dauert bis ein neu veröffentlichtes "SEN in 90 Sekunden"-Video von ServusTV On
über Google auffindbar ist.

- **Excel-Upload**: `.xlsx` mit einer Spalte "ID" (passend zum Dashboard-Export
  "AssetListExport", ID steht dort z. B. in Spalte D) - die Spalte wird über die
  Kopfzeile gesucht, nicht fix als Spalte A angenommen. Ohne erkennbare "ID"-Spalte
  fällt der Parser auf Spalte A zurück (`lib/indexing-checker/xlsx-parser.ts`).
- **T1 (Publish)**: für jede ID wird `play_start` aus derselben Scheduling-API geholt,
  die auch der Most-Watched-Abgleich nutzt (`lib/cms-client.ts` → `fetchCmsProduct`,
  bestätigtes Feld - entspricht "Current Sunrise" im Dashboard-Export). Die URL wird
  direkt aus der ID gebaut: `https://www.servustv.com/de/page/<ID>`.
- **Live-Check**: eigener HTTP-Request auf die URL (kein Google-Call, kostet nichts),
  bestätigt dass die Seite wirklich online ist, bevor Google-Polling startet.
- **T2 (Indexiert)**: Polling gegen Googles offizielle **Custom Search JSON API**
  (Programmable Search Engine) - keine Search-Console-Abfrage (kein Zugriff auf die
  ServusTV-On-Property) und kein Scraping (Blocking-Risiko würde die Messung entwerten).
  Intervall dünnt sich aus: erste 2h alle 30 Min, dann stündlich, dann alle 3h, danach täglich.
  **Hartes Limit von 100 Anfragen/Tag** wird im Code selbst durchgesetzt
  (`lib/indexing-checker/pipeline.ts`, `DAILY_SERP_QUOTA`) - damit bleibt es immer im
  Google-Gratiskontingent, auch bei einem Bug oder vielen offenen IDs gleichzeitig.
- **Persistenz**: SQLite-Datei (`better-sqlite3`), Pfad über `INDEXING_DB_PATH`
  konfigurierbar. **Muss auf ein Coolify Persistent-Storage-Volume zeigen**, sonst gehen
  alle Daten bei jedem Redeploy verloren.
- **Scheduler**: kein In-App-Cron (würde bei jedem Redeploy/Neustart verloren gehen).
  Stattdessen ruft ein **Coolify Scheduled Task** (Dashboard → "Scheduled Tasks") alle
  15-30 Minuten intern auf:
  ```bash
  curl -s -X POST http://localhost:3000/api/indexing-checker/poll \
    -H "Authorization: Bearer $INDEXING_POLL_SECRET"
  ```
  Der Endpoint ist bewusst von der normalen Session-Cookie-Prüfung ausgenommen
  (`middleware.ts`) und stattdessen über `INDEXING_POLL_SECRET` geschützt.
- **Setup Custom Search JSON API**: eigenes Google-Cloud-Projekt anlegen, API-Key
  erzeugen, unter [programmablesearchengine.google.com](https://programmablesearchengine.google.com/)
  eine Search Engine auf "gesamtes Web durchsuchen" stellen → liefert die `cx`-ID. Beides
  in `GOOGLE_CSE_API_KEY` / `GOOGLE_CSE_CX` eintragen. Kein Vertrag mit einem
  Drittanbieter (SerpApi/DataForSEO) nötig.
- **Zeitzone**: CMS-Timestamps kommen als UTC (`...T04:55:00Z`), das Sende-Raster ist
  aber in Wiener Lokalzeit gedacht. Slot-/Wochentag-Zuordnung und die Zeit-Anzeige in der
  UI konvertieren deshalb explizit nach `Europe/Vienna` (inkl. Sommer-/Winterzeit) über
  `Intl.DateTimeFormat` (`lib/indexing-checker/schedule.ts`).

## Login

Eigene Login-Seite (`/login`) statt Browser-Basic-Auth-Popup, geschützt durch ein
signiertes, httpOnly-Session-Cookie (7 Tage gültig). Ein einzelner Team-Account
("Team Processing"), Passwort liegt nur als bcrypt-Hash in den Env-Variablen.

- `TEAM_USERNAME`, `TEAM_PASSWORD_HASH`, `SESSION_SECRET` müssen alle drei gesetzt sein,
  sonst ist der Login deaktiviert (z. B. lokal in der Entwicklung).
- Hash für ein neues Passwort erzeugen:
  ```bash
  node -e "console.log(require('bcryptjs').hashSync('DEIN_PASSWORT', 10))"
  ```
- `SESSION_SECRET`: beliebiger langer Zufallsstring, z. B.
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Login-Versuche sind pro IP auf 5 Versuche / 10 Minuten begrenzt (In-Memory, gilt pro
  laufender Instanz).

## Lokale Entwicklung

```bash
npm install
cp .env.example .env.local   # CMS- und Login-Variablen setzen
npm run dev
```

## Deployment auf Coolify

1. Neue Ressource in Coolify anlegen, Typ "Application", Quelle = dieses Git-Repo/Branch.
2. Build Pack: **Dockerfile** (liegt im Repo-Root, kein weiteres Setup nötig).
3. Port: **3000**.
4. Environment-Variablen in Coolify setzen (siehe `.env.example`):
   - `CMS_API_BASE_URL` (erforderlich), `CMS_API_KEY` (optional, falls die API doch mal
     einen Token verlangt)
   - `TEAM_USERNAME`, `TEAM_PASSWORD_HASH`, `SESSION_SECRET` (Login, siehe oben)
   - `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX`, `INDEXING_POLL_SECRET`, `INDEXING_DB_PATH`
     (Indexierungs-Checker, siehe oben)
5. Coolifys eigenes "HTTP Basic Authentication" **deaktiviert lassen** - das Tool hat jetzt
   seinen eigenen Login, zwei übereinanderliegende Logins wären nur verwirrend.
6. Domain/Subdomain in Coolify zuweisen, Deploy anstoßen.
7. **Persistent Storage**: unter "Persistent Storage" ein Volume anlegen, das auf
   `/app/data` im Container zeigt (oder den Pfad aus `INDEXING_DB_PATH`, falls
   abweichend gesetzt) - sonst verliert der Indexierungs-Checker bei jedem Redeploy
   alle bisherigen Messungen.
8. **Scheduled Task**: unter "Scheduled Tasks" einen neuen Task anlegen, Intervall alle
   15-30 Minuten, Command:
   ```bash
   curl -s -X POST http://localhost:3000/api/indexing-checker/poll -H "Authorization: Bearer $INDEXING_POLL_SECRET"
   ```

## Security-Hardening (bereits umgesetzt)

- Security-Header (`next.config.mjs`): HSTS, CSP, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy.
- Session-Cookie: `httpOnly`, `secure`, `sameSite=lax`, signiert (HMAC-SHA256), mit Ablauf.
- Passwort nur als bcrypt-Hash gespeichert, nie im Klartext.
- Rate-Limiting auf `/api/login`.

## Offene Punkte

- Gegen die echte CMS-API testen, sobald ein gültiger `CMS_API_KEY` für
  `graphql-proxy-staging.redbull.com` vorliegt (aktuell nur gegen die Doku/Feldnamen
  implementiert, nicht live gegen die API verifiziert).
- "Nicht sicher"-Warnung im Browser: prüfen, ob in Coolify für die Domain ein gültiges
  Let's-Encrypt-Zertifikat ausgestellt wurde (Domains-Einstellung → Zertifikatsstatus),
  und ob "Force HTTPS" aktiv ist. Falls die Domain über Cloudflare läuft: DNS-Eintrag auf
  "DNS only" (graue Wolke) belassen, bis das Zertifikat erfolgreich ausgestellt ist.
