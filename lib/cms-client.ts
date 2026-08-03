import type { AssetRow, ContentType, EnrichedRow } from './types';

const CMS_API_BASE_URL = process.env.CMS_API_BASE_URL;
const CMS_API_KEY = process.env.CMS_API_KEY;
const BATCH_SIZE = 10;

export function isCmsConfigured(): boolean {
  return Boolean(CMS_API_BASE_URL);
}

/**
 * Rohes Produkt-JSON von der Scheduling-API. Wird sowohl vom Most-Watched-
 * Abgleich (Titel/Contenttype) als auch vom Indexierungs-Checker (Publish-
 * Datum) genutzt, damit es nur einen Fetch-Codepfad gegen diese API gibt.
 */
export async function fetchCmsProduct(assetId: string): Promise<Record<string, unknown> | null> {
  if (!CMS_API_BASE_URL) return null;

  try {
    const res = await fetch(`${CMS_API_BASE_URL}/products/${encodeURIComponent(assetId)}`, {
      headers: CMS_API_KEY ? { Authorization: `Bearer ${CMS_API_KEY}` } : undefined,
      cache: 'no-store',
    });

    if (!res.ok) return null;

    return await res.json();
  } catch {
    return null;
  }
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
 * "video_channel") auf die App-Kategorien. Vergleich case-insensitiv und
 * Unterstriche werden wie Leerzeichen behandelt, da die API beide
 * Schreibweisen verwenden kann.
 */
const CONTENT_TYPE_MAP: Record<string, ContentType> = {
  clip: 'clip',
  film: 'show',
  episode: 'show',
  'live program': 'liveProgram',
  'video channel': 'tvChannel',
};

function mapContentType(rawContentType: unknown): ContentType | null {
  if (typeof rawContentType !== 'string') return null;
  const normalized = rawContentType.trim().toLowerCase().replace(/_/g, ' ');
  return CONTENT_TYPE_MAP[normalized] ?? null;
}

type CmsMetadata = {
  title: string;
  contentType: ContentType;
};

async function fetchMetadata(assetId: string): Promise<CmsMetadata | null> {
  const data = await fetchCmsProduct(assetId);
  if (!data) return null;

  return {
    title: typeof data.title_long === 'string' ? data.title_long : assetId,
    contentType: mapContentType(data.content_type) ?? guessTypeFromId(assetId),
  };
}

async function enrichBatch(rows: AssetRow[]): Promise<EnrichedRow[]> {
  return Promise.all(
    rows.map(async (row) => {
      const meta = await fetchMetadata(row.assetId);
      return {
        ...row,
        title: meta?.title ?? row.assetId,
        contentType: meta?.contentType ?? guessTypeFromId(row.assetId),
      };
    })
  );
}

export async function enrichRows(rows: AssetRow[]): Promise<EnrichedRow[]> {
  const results: EnrichedRow[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    results.push(...(await enrichBatch(batch)));
  }

  return results;
}
