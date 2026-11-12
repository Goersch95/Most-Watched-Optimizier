import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

// In-memory - fine for a single-instance internal tool, resets on restart/deploy.
const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Zu viele Versuche. Bitte in ein paar Minuten erneut versuchen.' }, { status: 429 });
  }

  const expectedUsername = process.env.TEAM_USERNAME;
  const passwordHash = process.env.TEAM_PASSWORD_HASH;
  const sessionSecret = process.env.SESSION_SECRET;
  // Optionales zweites Konto mit reinen Viewer-Rechten, beschränkt auf den
  // Search-Console-Checker (siehe middleware.ts) - komplett optional, ohne
  // diese beiden Variablen verhält sich der Login exakt wie zuvor.
  const viewerUsername = process.env.VIEWER_GSC_USERNAME;
  const viewerPasswordHash = process.env.VIEWER_GSC_PASSWORD_HASH;

  if (!expectedUsername || !passwordHash || !sessionSecret) {
    return NextResponse.json({ error: 'Login ist serverseitig nicht konfiguriert.' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const username = body?.username;
  const password = body?.password;

  if (typeof username !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Ungültige Eingabe.' }, { status: 400 });
  }

  const isViewerAttempt = Boolean(viewerUsername && viewerPasswordHash && username === viewerUsername);

  // Immer gegen irgendeinen gültigen Hash vergleichen (nie einen leeren/
  // fehlenden String), auch bei unbekanntem Username - sonst würde die
  // Antwortzeit verraten, ob der Username existiert.
  const hashToCheck = isViewerAttempt ? viewerPasswordHash! : passwordHash;
  const passwordMatches = await bcrypt.compare(password, hashToCheck);
  const usernameMatches = username === expectedUsername || isViewerAttempt;

  if (!usernameMatches || !passwordMatches) {
    return NextResponse.json({ error: 'Benutzername oder Passwort falsch.' }, { status: 401 });
  }

  const role = isViewerAttempt ? 'viewer_gsc' : 'admin';
  const token = await createSessionToken(username, role, sessionSecret);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
