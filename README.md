# Most Watched Optimizer

CSV-Upload aus dem Traffic-Dashboard → Abgleich mit der CMS-API → Ranglisten für die Rails
"Meistgesehene Sendungen" und "Meistgesehene Clips", inkl. Copy-Button für Asset-IDs und
Direktlink zum jeweiligen Rail-Editor im CMS.

## Aktueller Stand

Das Grundgerüst steht: Upload, CSV-Parsing, Ranglisten-UI, Copy-Buttons, CMS-Rail-Links,
Login. Der CMS-Abgleich (`lib/cms-client.ts`) spricht den echten Scheduling-API-Endpoint an:

- `CMS_API_BASE_URL` muss auf die Basis-URL ohne `/products/{id}` zeigen, z. B.
  `https://graphql-proxy-staging.redbull.com/api/scheduling/v1/stv` - die ID wird pro
  Asset angehängt.
- Der Contenttype wird aus dem Feld `content_type` der Antwort gelesen (case-insensitiv):
  `clip` → Meistgesehene Clips, `film`/`episode` → Meistgesehene Sendungen, `live program`
  wird komplett aus allen Ranglisten ausgeschlossen (taucht auch nicht unter "Nicht
  zuordenbar" auf). Der Titel kommt aus `title_long`.
- `CMS_API_KEY` ist optional - die Staging-API ist ohne Bearer-Token erreichbar. Ist er
  gesetzt, wird er als `Authorization: Bearer …`-Header mitgeschickt, sonst läuft der
  Request ohne Auth-Header.
- Ohne `CMS_API_BASE_URL`, oder wenn ein einzelner Request fehlschlägt bzw.
  `content_type` einen unbekannten Wert liefert, greift eine Heuristik anhand des
  ID-Präfixes (`AA…` → Sendung, `PN…` → Clip) als Fallback. Die UI zeigt dazu einen
  Hinweis-Banner, solange die API nicht konfiguriert ist.
- Pro hochgeladener CSV werden nur die ersten 200 gültigen Einträge berücksichtigt
  (`lib/constants.ts`, `MAX_CSV_ROWS`).

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
5. Coolifys eigenes "HTTP Basic Authentication" **deaktiviert lassen** - das Tool hat jetzt
   seinen eigenen Login, zwei übereinanderliegende Logins wären nur verwirrend.
6. Domain/Subdomain in Coolify zuweisen, Deploy anstoßen.

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
