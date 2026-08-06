import type { EpgEntry } from './types';

const EPG_URL = 'https://pms-epg-service.liiift.io/api/epg/v1/epgs/stvat/public';

/**
 * Einzelner Bulk-Abruf statt einer Anfrage pro Produkt - die öffentliche EPG-
 * API liefert offenbar den gesamten Katalog in einer Antwort. Response-Form
 * ist nicht dokumentiert bekannt, daher defensiv gegen ein paar gängige
 * Wrapper-Varianten (flaches Array vs. { data: [...] } o. ä.).
 */
export async function fetchEpgEntries(): Promise<Map<string, EpgEntry>> {
  const res = await fetch(EPG_URL, { cache: 'no-store' });

  if (!res.ok) {
    throw new Error(`EPG-API antwortete mit Status ${res.status}`);
  }

  const data = await res.json();

  const list: unknown[] = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>)?.data)
      ? ((data as Record<string, unknown>).data as unknown[])
      : Array.isArray((data as Record<string, unknown>)?.items)
        ? ((data as Record<string, unknown>).items as unknown[])
        : Array.isArray((data as Record<string, unknown>)?.epgs)
          ? ((data as Record<string, unknown>).epgs as unknown[])
          : [];

  const map = new Map<string, EpgEntry>();

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    const vin = typeof obj.vin === 'string' ? obj.vin : null;
    if (!vin) continue;

    const vodRights = obj.vod_rights as Record<string, unknown> | undefined;
    const geoblocking = Array.isArray(obj.geoblocking)
      ? obj.geoblocking.filter((g): g is string => typeof g === 'string')
      : [];

    map.set(vin.toUpperCase(), {
      vin,
      vodRightsStart: typeof vodRights?.start === 'string' ? vodRights.start : null,
      vodRightsEnd: typeof vodRights?.end === 'string' ? vodRights.end : null,
      geoblocking,
    });
  }

  return map;
}
