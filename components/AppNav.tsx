'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const TABS = [
  { href: '/', label: 'Most Watched Optimizer' },
  { href: '/indexing-checker', label: 'Google-Indexierungs-Checker (Serper)' },
  { href: '/indexing-checker-gsc', label: 'Google-Indexierungs-Checker (Search Console)' },
  { href: '/legal-check', label: 'Legal Heavy Check' },
];

export function AppNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<'admin' | 'viewer_gsc'>('admin');

  useEffect(() => {
    fetch('/api/session')
      .then((res) => res.json())
      .then((data) => setRole(data.role === 'viewer_gsc' ? 'viewer_gsc' : 'admin'))
      .catch(() => {});
  }, []);

  const visibleTabs = role === 'viewer_gsc' ? TABS.filter((t) => t.href === '/indexing-checker-gsc') : TABS;

  return (
    <nav className="mb-6 flex gap-2 border-b border-slate-800">
      {visibleTabs.map((tab) => (
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
