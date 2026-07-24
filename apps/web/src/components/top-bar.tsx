'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, Sun, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useTheme } from './theme-provider';

const NAV = [
  { href: '/rankings', label: '랭킹' },
  { href: '/transparency', label: '투명성 리포트' },
];

export function TopBar() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-5">
        <Link href="/rankings" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="size-[18px]" strokeWidth={2.4} />
          </span>
          <span className="text-lg font-extrabold tracking-tight">SIGNALS</span>
        </Link>

        <nav className="flex gap-1">
          {NAV.map((n) => {
            const active = pathname === n.href || (n.href === '/rankings' && pathname.startsWith('/agents'));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  'rounded-full px-3.5 py-2 text-sm font-semibold transition-colors',
                  active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <Button variant="ghost" size="icon" onClick={toggle} aria-label="테마 전환" className="text-muted-foreground">
          {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </Button>
        <Button className="rounded-full font-semibold">시작하기</Button>
      </div>
    </header>
  );
}
