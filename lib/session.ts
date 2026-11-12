export const SESSION_COOKIE_NAME = 'mwo_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type SessionRole = 'admin' | 'viewer_gsc';

export type SessionPayload = {
  username: string;
  role: SessionRole;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function getKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function toBase64Url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let str = '';
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): Uint8Array {
  const padded = b64url.padEnd(b64url.length + ((4 - (b64url.length % 4)) % 4), '=');
  const str = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr;
}

export async function createSessionToken(username: string, role: SessionRole, secret: string): Promise<string> {
  const payload = JSON.stringify({ u: username, r: role, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
  const payloadB64 = toBase64Url(encoder.encode(payload).buffer as ArrayBuffer);
  const key = await getKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  return `${payloadB64}.${toBase64Url(signature)}`;
}

/**
 * Gibt bei einem gültigen Token die darin enthaltenen Nutzerdaten zurück,
 * sonst `null`. Token von vor Einführung der Rolle haben kein `r`-Feld -
 * werden defensiv als "admin" behandelt (Abwärtskompatibilität für zum
 * Deploy-Zeitpunkt noch gültige Sessions), nicht als ungültig verworfen.
 */
export async function verifySessionToken(token: string, secret: string): Promise<SessionPayload | null> {
  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return null;

  const key = await getKey(secret);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(sigB64),
    encoder.encode(payloadB64)
  );
  if (!valid) return null;

  try {
    const payload = JSON.parse(decoder.decode(fromBase64Url(payloadB64)));
    if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (typeof payload.u !== 'string') return null;

    const role: SessionRole = payload.r === 'viewer_gsc' ? 'viewer_gsc' : 'admin';
    return { username: payload.u, role };
  } catch {
    return null;
  }
}
