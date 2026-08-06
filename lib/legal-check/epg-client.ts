import type { EpgEntry } from './types';

const EPG_URL = 'https://pms-epg-service.liiift.io/api/epg/v1/epgs/stvat/public';

/**
 * Einzelner Bulk-Abruf statt einer Anfrage pro Produkt. Response-Form
 * verifiziert (nicht mehr geraten): { channel: {...}, schedule: [...] } -
 * die eigentlichen Produkte liegen unter "schedule". Deckt vermutlich nur
 * ein rollierendes Zeitfenster ab (Sende-/VOD-Planung), nicht den ganzen
 * historischen Katalog seit 2017 - ein hoher "notInApi"-Wert im Ergebnis ist
 * dadurch normal, nicht zwingend ein Fehler.
 */
export async function fetchEpgEntries(): Promise<Map<string, EpgEntry>> {
  const res = await fetch(EPG_URL, { cache: 'no-store' });

  if (!res.ok) {
    throw new Error(`EPG-API antwortete mit Status ${res.status}`);
  }

  const data = await res.json();

  const list: unknown[] = Array.isArray((data as Record<string, unknown>)?.schedule)
    ? ((data as Record<string, unknown>).schedule as unknown[])
    : Array.isArray(data)
      ? data
      : [];

  const map = new Map<string, EpgEntry>();

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    const vin = typeof obj.vin === 'string' ? obj.vin : null;
    // Platzhalter-Einträge (id/assetId/vin literal "placeholder") sind keine
    // echten Produkte und würden das Matching verfälschen.
    if (!vin || vin.toLowerCase() === 'placeholder') continue;

    const vodRights = obj.vod_rights as Record<string, unknown> | undefined;
    const geoblocking = Array.isArray(obj.geoblocking)
      ? obj.geoblocking.filter((g): g is string => typeof g === 'string')
      : [];
    const assetId =
      typeof obj.assetId === 'string' && obj.assetId.toLowerCase() !== 'placeholder' ? obj.assetId : null;

    map.set(vin.toUpperCase(), {
      vin,
      assetId,
      vodRightsStart: typeof vodRights?.start === 'string' ? vodRights.start : null,
      vodRightsEnd: typeof vodRights?.end === 'string' ? vodRights.end : null,
      geoblocking,
      startTime: typeof obj.start_time === 'string' ? obj.start_time : null,
    });
  }

  return map;
}
