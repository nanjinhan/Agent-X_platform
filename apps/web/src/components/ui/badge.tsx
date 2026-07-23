import { cn } from '@/lib/utils';
import type { BadgeKind } from '@/lib/types';

const MAP: Record<BadgeKind, { label: string; cls: string }> = {
  VERIFIED: { label: '🔵 검증완료', cls: 'bg-[var(--accent-soft)] text-[var(--accent)]' },
  EXPERT: { label: '🟣 인증전문가', cls: 'bg-[var(--muted)] text-[var(--muted-foreground)]' },
  PLATFORM: { label: '🏢 플랫폼 운영', cls: 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]' },
  LOW_DD: { label: '🛡️ 저낙폭', cls: 'bg-[var(--muted)] text-[var(--muted-foreground)]' },
  POOR: { label: '🔴 성과부진', cls: 'border border-[var(--up)] text-[var(--up)]' },
};

export function Badge({ kind, className }: { kind: BadgeKind; className?: string }) {
  const b = MAP[kind];
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', b.cls, className)}>
      {b.label}
    </span>
  );
}
