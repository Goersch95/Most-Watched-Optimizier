'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Login fehlgeschlagen.');
        return;
      }

      router.push(searchParams.get('redirect') || '/');
      router.refresh();
    } catch {
      setError('Login fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded border border-slate-800 bg-slate-900/50 p-6">
        <h1 className="text-lg font-semibold mb-1">Most Watched Optimizer</h1>
        <p className="text-sm text-slate-400 mb-6">Zugang für Team Processing</p>

        <label className="block text-sm mb-1" htmlFor="username">
          Benutzername
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full mb-4 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          required
        />

        <label className="block text-sm mb-1" htmlFor="password">
          Passwort
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
          required
        />

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-red-600 hover:bg-red-500 disabled:opacity-50 px-4 py-2 text-sm font-medium transition-colors"
        >
          {loading ? 'Wird geprüft…' : 'Anmelden'}
        </button>
      </form>
    </main>
  );
}
