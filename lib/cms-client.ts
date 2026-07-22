import type { AssetRow, ContentType, EnrichedRow } from './types';

const CMS_API_BASE_URL = process.env.CMS_API_BASE_URL;
const CMS_API_KEY = process.env.CMS_API_KEY;
const BATCH_SIZE = 10;

export function isCmsConfigured(): boolean {
  return Boolean(CMS_API_BASE_URL);
}

/**
 * Fallback solange die CMS-API nicht erreichbar/konfiguriert ist oder
 * `content_type` einen unbekannten Wert liefert. Basierend auf dem
 * Sample-Export: IDs mit "AA" sehen aus wie Sendungen, "PN" wie Clips.
 */
function guessTypeFromId(assetId: string): ContentType {
  if (assetId.startsWith('PN')) return 'clip';
  if (assetId.startsWith('AA')) return 'show';
  return 'unknown';
}

/**
 * Mapping der `content_type`-Werte aus der Scheduling-API
 * (https://graphql-proxy-staging.redbull.com/api/scheduling/v1/stv/products/{id},
 * z. B. "clip", "film", "episode", "live_program"/"live program",
 * "video_channel") auf die App-Kategorien. "live program" und
 * "video channel" werden komplett aus den Ranglisten ausgeschlossen, nicht
 * als "unknown" geführt. Vergleich case-insensitiv und Unterstriche werden
 * wie Leerzeichen behandelt, da die API beide Schreibweisen verwenden kann.
 */
const CONTENT_TYPE_MAP: Record<string, ContentType | 'excluded'> = {
  clip: 'clip',
  film: 'show',
  episode: 'show',
  'live program': 'excluded',
  'video channel': 'excluded',
};

function mapContentType(rawContentType: unknown): ContentType | 'excluded' | null {
  if (typeof rawContentType !== 'string') return null;
  const normalized = rawContentType.trim().toLowerCase().replace(/_/g, ' ');
  return CONTENT_TYPE_MAP[normalized] ?? null;
}

type CmsMetadata =
  | { excluded: true }
  | { excluded: false; title: string; contentType: ContentType };

async function fetchMetadata(assetId: string): Promise<CmsMetadata | null> {
  if (!CMS_API_BASE_URL) return null;

  try {
    const res = await fetch(`${CMS_API_BASE_URL}/products/${encodeURIComponent(assetId)}`, {
      headers: CMS_API_KEY ? { Authorization: `Bearer ${CMS_API_KEY}` } : undefined,
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const data = await res.json();
    const mapped = mapContentType(data.content_type);

    if (mapped === 'excluded') {
      return { excluded: true };
    }

    return {
      excluded: false,
      title: typeof data.title_long === 'string' ? data.title_long : assetId,
      contentType: mapped ?? guessTypeFromId(assetId),
    };
  } catch {
    return null;
  }
}

async function enrichBatch(rows: AssetRow[]): Promise<EnrichedRow[]> {
  const results = await Promise.all(
    rows.map(async (row) => {
      const meta = await fetchMetadata(row.assetId);
      if (meta?.excluded) return null;

      return {
        ...row,
        title: meta?.excluded === false ? meta.title : row.assetId,
        contentType: meta?.excluded === false ? meta.contentType : guessTypeFromId(row.assetId),
      };
    })
  );

  return results.filter((row): row is EnrichedRow => row !== null);
}

export async function enrichRows(rows: AssetRow[]): Promise<EnrichedRow[]> {
  const results: EnrichedRow[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    results.push(...(await enrichBatch(batch)));
  }

  return results;
}
