# Most Watched Optimizer

CSV-Upload aus dem Traffic-Dashboard → Abgleich mit der CMS-API → Ranglisten für die Rails
"Meistgesehene Sendungen" und "Meistgesehene Clips", inkl. Copy-Button für Asset-IDs und
Direktlink zum jeweiligen Rail-Editor im CMS.

## Aktueller Stand

Das Grundgerüst steht: Upload, CSV-Parsing, Ranglisten-UI, Copy-Buttons, CMS-Rail-Links,
Basic-Auth. Der CMS-Abgleich (`lib/cms-client.ts`) ist als Platzhalter implementiert:

- Ohne `CMS_API_BASE_URL` / `CMS_API_KEY` läuft eine Heuristik anhand des ID-Präfixes
  (`AA…` → Sendung, `PN…` → Clip), rein zur Vorschau. Die UI zeigt dazu einen Hinweis-Banner.
- Sobald die echte CMS-API-Doku vorliegt, muss nur `fetchMetadata()` in
  `lib/cms-client.ts` an den echten Endpoint/Response angepasst werden - der Rest des
  Tools bleibt unverändert.

## Lokale Entwicklung

```bash
npm install
cp .env.example .env.local   # optional: CMS- und Auth-Variablen setzen
npm run dev
```

## Deployment auf Coolify

1. Neue Ressource in Coolify anlegen, Typ "Application", Quelle = dieses Git-Repo/Branch.
2. Build Pack: **Dockerfile** (liegt im Repo-Root, kein weiteres Setup nötig).
3. Port: **3000**.
4. Environment-Variablen in Coolify setzen (siehe `.env.example`):
   - `CMS_API_BASE_URL`, `CMS_API_KEY` (sobald verfügbar)
   - `AUTH_USER`, `AUTH_PASSWORD` (Basic-Auth-Schutz - empfohlen, da CMS-Links enthalten sind)
5. Domain/Subdomain in Coolify zuweisen, Deploy anstoßen.

## Offene Punkte

- Echte CMS-API anbinden (`lib/cms-client.ts`).
- Verifizieren, ob Sendung/Clip zuverlässig über ein CMS-Feld (`contentType` o. ä.)
  kommt, oder ob die ID-Präfix-Heuristik als Fallback bleibt.
- Falls gewünscht: Login über bestehende SSO-Lösung statt Basic-Auth.
