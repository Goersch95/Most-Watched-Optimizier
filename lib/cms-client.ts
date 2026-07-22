import type { AssetRow, ContentType, EnrichedRow } from './types';

const CMS_API_BASE_URL = process.env.CMS_API_BASE_URL;
const CMS_API_KEY = process.env.CMS_API_KEY;
const BATCH_SIZE = 10;

export function isCmsConfigured(): boolean {
  return Boolean(CMS_API_BASE_URL && CMS_API_KEY);
}

/**
 * Placeholder until the CMS API confirms the real content-type field.
 * Based on the sample export, IDs starting with "AA" look like shows
 * and "PN" like clips - needs verification against the API.
 */
function guessTypeFromId(assetId: string): ContentType {
  if (assetId.startsWith('PN')) return 'clip';
  if (assetId.startsWith('AA')) return 'show';
  return 'unknown';
}

type CmsMetadata = {
  title: string;
  contentType: ContentType;
};

async function fetchMetadata(assetId: string): Promise<CmsMetadata | null> {
  if (!CMS_API_BASE_URL || !CMS_API_KEY) return null;

  try {
    const res = await fetch(`${CMS_API_BASE_URL}/assets/${encodeURIComponent(assetId)}`, {
      headers: { Authorization: `Bearer ${CMS_API_KEY}` },
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const data = await res.json();
    const contentType: ContentType =
      data.contentType === 'clip' || data.contentType === 'show'
        ? data.contentType
        : guessTypeFromId(assetId);

    return {
      title: typeof data.title === 'string' ? data.title : assetId,
      contentType,
    };
  } catch {
    return null;
  }
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
