'use client';

import { useState } from 'react';

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded border border-slate-700 px-2 py-1 text-xs font-mono text-slate-200 hover:bg-slate-800 transition-colors"
      title="ID kopieren"
    >
      {copied ? 'Kopiert ✓' : value}
    </button>
  );
}
