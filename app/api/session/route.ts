import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';

/**
 * Liefert die Rolle der aktuellen Session an Client-Komponenten (z. B.
 * AppNav, die Search-Console-Checker-Seite) - damit lassen sich für
 * "viewer_gsc" fremde Tabs sowie schreibende Buttons ausblenden, statt dass
 * ein Klick erst serverseitig mit 403 abgewiesen wird. Reine UX-Komfort-
 * Schicht - die eigentliche Durchsetzung passiert in middleware.ts.
 */
export async function GET(req: NextRequest) {
  const sessionSecret = process.env.SESSION_SECRET;
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionSecret && token ? await verifySessionToken(token, sessionSecret) : null;

  return NextResponse.json({
    username: session?.username ?? null,
    role: session?.role ?? 'admin',
  });
}
