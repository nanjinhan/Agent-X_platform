import { BadgeCheck, Award, Building2, Shield, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BadgeKind } from '@/lib/types';

const MAP: Record<BadgeKind, { label: string; icon: React.ElementType; cls: string }> = {
  VERIFIED: {
    label: '검증완료',
    icon: BadgeCheck,
    cls: 'bg-primary/10 text-primary',
  },
  EXPERT: {
    label: '인증전문가',
    icon: Award,
    cls: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  PLATFORM: {
    label: '플랫폼 운영',
    icon: Building2,
    cls: 'bg-secondary text-secondary-foreground',
  },
  LOW_DD: {
    label: '저낙폭',
    icon: Shield,
    cls: 'bg-[color-mix(in_srgb,var(--good)_12%,transparent)] text-[var(--good)]',
  },
  POOR: {
    label: '성과부진',
    icon: TrendingDown,
    cls: 'bg-[color-mix(in_srgb,var(--up)_12%,transparent)] text-[var(--up)]',
  },
};

export function AgentBadge({ kind, className }: { kind: BadgeKind; className?: string }) {
  const b = MAP[kind];
  const Icon = b.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        b.cls,
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2.5} />
      {b.label}
    </span>
  );
}

/** @deprecated 이전 이름 호환 */
export { AgentBadge as Badge };
