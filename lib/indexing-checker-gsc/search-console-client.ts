import { JWT } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];
const INSPECT_URL = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

let cachedClient: JWT | null = null;

function getClient(): JWT | null {
  if (cachedClient) return cachedClient;

  const email = process.env.GSC_SERVICE_ACCOUNT_EMAIL;
  // Coolify/`.env`-Werte können \n nicht als echten Zeilenumbruch speichern -
  // der Private Key wird deshalb mit literalen "\n" hinterlegt und hier
  // zurückkonvertiert (gleiches Muster wie bei den meisten Google-Service-
  // Account-Integrationen).
  const rawKey = process.env.GSC_SERVICE_ACCOUNT_PRIVATE_KEY;
  const key = rawKey?.replace(/\\n/g, '\n');

  if (!email || !key) return null;

  cachedClient = new JWT({ email, key, scopes: SCOPES });
  return cachedClient;
}

/**
 * Auffindbarkeits-Check über die offizielle Search Console URL Inspection
 * API (https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect) -
 * liefert Googles tatsächlichen, exakten Indexierungsstatus statt einer
 * SERP-Annäherung wie beim parallel laufenden Serper-basierten Checker
 * (lib/indexing-checker/serper-search.ts). Setzt eine verifizierte
 * Search-Console-Property und einen als Nutzer freigeschalteten
 * Service-Account voraus (GSC_SERVICE_ACCOUNT_EMAIL/_PRIVATE_KEY, GSC_SITE_URL).
 *
 * Noch nicht live gegen die echte API verifiziert (Response-Form laut
 * offizieller Google-Doku implementiert, siehe README) - läuft parallel zum
 * bewährten Serper-Checker, damit sich beide Ergebnisse vergleichen lassen,
 * bevor man sich auf einen davon festlegt.
 */
export async function isUrlIndexedByGoogleSearchConsole(_assetId: string, url: string): Promise<boolean> {
  const client = getClient();
  const siteUrl = process.env.GSC_SITE_URL;
  if (!client || !siteUrl) return false;

  try {
    const res = await client.request<{
      inspectionResult?: {
        indexStatusResult?: { verdict?: string };
      };
    }>({
      url: INSPECT_URL,
      method: 'POST',
      data: { inspectionUrl: url, siteUrl },
    });

    const verdict = res.data?.inspectionResult?.indexStatusResult?.verdict;
    return verdict === 'PASS';
  } catch {
    return false;
  }
}
