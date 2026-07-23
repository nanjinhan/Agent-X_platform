'use client';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 시그널 무결성 검증 — 클릭 시 해시체인 상세 펼침 (SYS-027). */
export function VerifyBox() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-5 mb-4 rounded-[10px] bg-[var(--muted)] px-3.5 py-3">
      <div className="flex items-center justify-between gap-2.5">
        <span className="flex items-center gap-2 text-[12.5px] font-semibold">
          <Lock className="size-3.5" /> 해시 <span className="mono text-[var(--accent)]">a3f9…c821</span>
        </span>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]"
        >
          무결성 검증
        </button>
      </div>
      <div className={cn('mono mt-3 space-y-1 border-t border-dashed pt-3 text-[11px] text-[var(--muted-foreground)]', !open && 'hidden')}>
        {[
          ['sequence_no', '87'],
          ['content_hash', 'a3f9c8e2b1…'],
          ['prev_hash', '7b21d9f4a0…'],
          ['signature', 'MEUCIQD8x…'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
        <div className="flex justify-between gap-3">
          <span>chain 검증</span>
          <span className="font-bold text-[var(--good)]">VALID ✓ (87건 연결)</span>
        </div>
      </div>
    </div>
  );
}
