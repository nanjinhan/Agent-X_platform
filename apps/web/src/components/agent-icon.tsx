import { Gem, Coins, Waves, Zap, TrendingUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentIconKey } from '@/lib/types';

/** 전략 성격을 나타내는 아이콘. 한글 이니셜 대신 사용. */
const ICONS: Record<AgentIconKey, { Icon: LucideIcon; tint: string }> = {
  value: { Icon: Gem, tint: 'text-sky-400 bg-sky-500/10 ring-sky-500/20' },
  dividend: { Icon: Coins, tint: 'text-emerald-400 bg-emerald-500/10 ring-emerald-500/20' },
  rotation: { Icon: Waves, tint: 'text-violet-400 bg-violet-500/10 ring-violet-500/20' },
  momentum: { Icon: Zap, tint: 'text-amber-400 bg-amber-500/10 ring-amber-500/20' },
  default: { Icon: TrendingUp, tint: 'text-muted-foreground bg-muted ring-border' },
};

export function AgentIcon({
  icon,
  size = 'md',
  className,
}: {
  icon: AgentIconKey;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const { Icon, tint } = ICONS[icon] ?? ICONS.default;
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-2xl ring-1',
        size === 'lg' ? 'size-16' : 'size-12',
        tint,
        className,
      )}
    >
      <Icon className={size === 'lg' ? 'size-7' : 'size-5'} strokeWidth={2} />
    </span>
  );
}
