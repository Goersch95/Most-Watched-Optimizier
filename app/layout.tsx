import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Most Watched Optimizer',
  description: 'Traffic-CSV Sync Tool für Rail-Platzierungen',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="bg-slate-950 text-slate-100 min-h-screen">{children}</body>
    </html>
  );
}
