'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Most Watched Optimizer' },
  { href: '/indexing-checker', label: 'Google-Indexierungs-Checker' },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-2 border-b border-slate-800">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            pathname === tab.href
              ? 'border-red-600 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
