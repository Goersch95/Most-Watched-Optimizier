import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';

// /api/indexing-checker/poll und /api/indexing-checker-gsc/poll werden von
// externen Schedulern (Coolify Scheduled Tasks) aufgerufen, nicht über den
// Browser - die Endpoints prüfen stattdessen ihr eigenes Secret
// (INDEXING_POLL_SECRET bzw. INDEXING_GSC_POLL_SECRET).
const PUBLIC_PATHS = ['/login', '/api/login', '/api/indexing-checker/poll', '/api/indexing-checker-gsc/poll'];

/**
 * Für die Rolle "viewer_gsc" (siehe lib/session.ts) erlaubte Pfade - rein
 * lesender Zugriff auf den Search-Console-Checker, sonst nichts. Exakte
 * Pfade statt eines Präfix-Matches, damit schreibende Routen wie
 * `/api/indexing-checker-gsc/upload` oder `/recheck-now` NICHT versehentlich
 * mit erfasst werden, nur weil sie denselben Präfix teilen.
 */
const VIEWER_GSC_ALLOWED_EXACT_PATHS = [
  '/indexing-checker-gsc',
  '/api/indexing-checker-gsc/results',
  '/api/logout',
  '/api/session',
];

export function isViewerGscAllowedPath(pathname: string): boolean {
  if (VIEWER_GSC_ALLOWED_EXACT_PATHS.includes(pathname)) return true;
  // Archiv-Ansicht ist reines Lesen (GET), eigene Prüfung unten stellt sicher,
  // dass darunter liegende schreibende Routen wie .../archive/[id]/recheck
  // trotz gleichen Präfixes nicht mit erfasst werden.
  return /^\/api\/indexing-checker-gsc\/archive\/[^/]+$/.test(pathname);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const sessionSecret = process.env.SESSION_SECRET;

  // No session secret configured -> login system disabled (e.g. local dev).
  if (!sessionSecret) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token, sessionSecret) : null;

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Nicht angemeldet.' }, { status: 401 });
    }

    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (session.role === 'viewer_gsc' && !isViewerGscAllowedPath(pathname)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Kein Zugriff - dieses Konto hat nur Leserechte für den Search-Console-Checker.' }, { status: 403 });
    }

    return NextResponse.redirect(new URL('/indexing-checker-gsc', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
