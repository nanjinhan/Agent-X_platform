'use client';

import { useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/** 시그널 무결성 검증 — 클릭 시 해시체인 상세 펼침 (SYS-027). */
export function VerifyBox() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-6 mb-5 rounded-xl bg-secondary/70 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2.5">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <LockKeyhole className="size-4 text-primary" /> 해시 <span className="mono text-primary">a3f9…c821</span>
        </span>
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} className="h-8 rounded-full font-semibold text-primary">
          무결성 검증
        </Button>
      </div>
      <div className={cn('mono mt-3 space-y-1.5 border-t border-dashed pt-3 text-[11px] text-muted-foreground', !open && 'hidden')}>
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
        <div className="flex items-center justify-between gap-3 text-[var(--good)]">
          <span>chain 검증</span>
          <span className="flex items-center gap-1 font-bold">
            <ShieldCheck className="size-3.5" /> VALID (87건 연결)
          </span>
        </div>
      </div>
    </div>
  );
}
