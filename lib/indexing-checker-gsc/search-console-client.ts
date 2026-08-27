import { JWT } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];
const INSPECT_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

/**
 * Coolify/`.env`-Werte können \n nicht als echten Zeilenumbruch speichern -
 * der Private Key wird deshalb mit literalen "\n" hinterlegt und hier
 * zurückkonvertiert (gleiches Muster wie bei den meisten Google-Service-
 * Account-Integrationen). Manche Umgebungsvariablen-UIs escapen einen
 * literalen Backslash beim Speichern nochmal ("\n" -> "\\n" im
 * gespeicherten Wert) - das führte zu einem
 * "error:1E08010C:DECODER routines::unsupported" beim Einlesen, weil das
 * Ergebnis kein gültiges PEM mehr war. Erst doppelt escapte, dann einfach
 * escapte Sequenzen auflösen deckt beide Fälle ab; optionale umschließende
 * Anführungszeichen (falls aus einem JSON-Editor kopiert) werden ebenfalls
 * entfernt.
 */
export function normalizePrivateKey(raw: string): string {
  let key = raw.trim();

  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }

  key = key.replace(/\\\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
  return key.trim();
}

let cachedClient: JWT | null = null;

function getClient(): JWT | null {
  if (cachedClient) return cachedClient;

  const email = process.env.GSC_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GSC_SERVICE_ACCOUNT_PRIVATE_KEY;
  const key = rawKey ? normalizePrivateKey(rawKey) : undefined;

  if (!email || !key) return null;

  cachedClient = new JWT({ email, key, scopes: SCOPES });
  return cachedClient;
}

export type IndexingCheckResult = {
  indexed: boolean;
  /**
   * Der von Google in jeder Inspection-Antwort mitgelieferte Direktlink zur
   * URL-Inspection-Ansicht in der echten Search-Console-Oberfläche
   * (`inspectionResult.inspectionResultLink`) - enthält eine von Google
   * intern vergebene opake ID, die sich nicht selbst konstruieren lässt.
   * Live verifiziert (echte API-Antwort enthielt genau dieses Feld). Damit
   * lässt sich der "Indexierung beantragen"-Schritt zwar nicht automatisch
   * auslösen (siehe README - offiziell nur für JobPosting/BroadcastEvent
   * über die separate Indexing API vorgesehen), aber immerhin der manuelle
   * Klick direkt aus dem Tool heraus vorbereiten, ohne die URL erst in der
   * Search Console suchen zu müssen.
   */
  inspectionLink: string | null;
};

/**
 * Auffindbarkeits-Check über die offizielle Search Console URL Inspection
 * API (https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect) -
 * liefert Googles tatsächlichen, exakten Indexierungsstatus statt einer
 * SERP-Annäherung wie beim parallel laufenden Serper-basierten Checker
 * (lib/indexing-checker/serper-search.ts). Setzt eine verifizierte
 * Search-Console-Property und einen als Nutzer freigeschalteten
 * Service-Account voraus (GSC_SERVICE_ACCOUNT_EMAIL/_PRIVATE_KEY, GSC_SITE_URL).
 *
 * Live gegen die echte API verifiziert (siehe README) - läuft parallel zum
 * bewährten Serper-Checker, damit sich beide Ergebnisse vergleichen lassen.
 */
export async function isUrlIndexedByGoogleSearchConsole(_assetId: string, url: string): Promise<IndexingCheckResult> {
  const client = getClient();
  const siteUrl = process.env.GSC_SITE_URL;
  if (!client || !siteUrl) return { indexed: false, inspectionLink: null };

  try {
    const res = await client.request<{
      inspectionResult?: {
        indexStatusResult?: { verdict?: string };
        inspectionResultLink?: string;
      };
    }>({
      url: INSPECT_URL,
      method: 'POST',
      data: { inspectionUrl: url, siteUrl },
    });

    const verdict = res.data?.inspectionResult?.indexStatusResult?.verdict;
    const inspectionLink = res.data?.inspectionResult?.inspectionResultLink ?? null;
    return { indexed: verdict === 'PASS', inspectionLink };
  } catch {
    return { indexed: false, inspectionLink: null };
  }
}
