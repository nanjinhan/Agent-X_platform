import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { SignalRow, SignalResult } from '@/lib/types';
import { dirStr } from '@/lib/format';

const RESULT: Record<SignalResult, { label: string; cls: string }> = {
  TAKE_PROFIT: { label: '목표가', cls: 'bg-[color-mix(in_srgb,var(--up)_14%,transparent)] text-[var(--up)]' },
  STOP_LOSS: { label: '손절', cls: 'bg-[color-mix(in_srgb,var(--down)_14%,transparent)] text-[var(--down)]' },
  OPEN: { label: '미결제', cls: 'bg-[var(--muted)] text-[var(--muted-foreground)]' },
  VOID: { label: '무효(거래정지)', cls: 'border border-dashed text-[var(--muted-foreground)]' },
  TIME_LIMIT: { label: '기간만료', cls: 'bg-[var(--muted)] text-[var(--muted-foreground)]' },
};

export function SignalTable({ rows }: { rows: SignalRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
            {['#', '종목', '방향', '진입가', '청산가', '수익률', '보유', '결과'].map((h, i) => (
              <th key={h} className={cn('border-b px-2.5 py-2 font-semibold', i <= 1 ? 'text-left' : 'text-right')}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const r = RESULT[s.result];
            const open = s.result === 'OPEN';
            return (
              <tr key={s.seq} className={cn('border-b', open && 'bg-[color-mix(in_srgb,var(--accent)_4%,transparent)]')}>
                <td className="mono px-2.5 py-3 text-[var(--muted-foreground)]">#{s.seq}</td>
                <td className="px-2.5 py-3">
                  <span className="flex flex-col">
                    {open ? (
                      <Link href={`/signals/${s.seq}`} className="font-semibold text-[var(--accent)] hover:underline">
                        {s.name} →
                      </Link>
                    ) : (
                      <span className="font-semibold">{s.name}</span>
                    )}
                    <span className="mono text-[11px] text-[var(--muted-foreground)]">{s.ticker}</span>
                  </span>
                </td>
                <td className="px-2.5 py-3 text-right">{s.action}</td>
                <td className="mono px-2.5 py-3 text-right">{s.entry}</td>
                <td className="mono px-2.5 py-3 text-right">{s.exit}</td>
                <td className={cn('mono px-2.5 py-3 text-right font-semibold', dirStr(s.returnPct))}>{s.returnPct}</td>
                <td className="mono px-2.5 py-3 text-right text-[var(--muted-foreground)]">{s.holding}</td>
                <td className="px-2.5 py-3 text-right">
                  <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold', r.cls)}>{r.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
