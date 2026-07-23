'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from './theme-provider';

const NAV = [
  { href: '/rankings', label: '랭킹' },
  { href: '/transparency', label: '투명성 리포트' },
];

export function TopBar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b bg-[color-mix(in_srgb,var(--card)_88%,transparent)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-5">
        <Link href="/rankings" className="flex items-center gap-2.5 font-bold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-[var(--accent)] font-mono text-[13px] font-bold text-[var(--accent-foreground)] shadow-inner">
            S
          </span>
          <span className="text-[17px]">SIGNALS</span>
          <span className="hidden text-[11px] font-medium tracking-wide text-[var(--muted-foreground)] sm:inline">
            검증된 투자 시그널
          </span>
        </Link>

        <nav className="ml-2 flex gap-1">
          {NAV.map((n) => {
            const active = pathname === n.href || (n.href === '/rankings' && pathname.startsWith('/agents'));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-[13.5px] font-semibold transition-colors',
                  active
                    ? 'bg-[var(--muted)] text-[var(--foreground)]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]',
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <span className="hidden rounded-full border px-2.5 py-1 text-[11px] font-medium text-[var(--muted-foreground)] md:inline">
          구독자 뷰 · 훈이
        </span>
        <button
          onClick={toggle}
          aria-label="테마 전환"
          className="grid size-9 place-items-center rounded-lg border text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
        >
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>
    </header>
  );
}
