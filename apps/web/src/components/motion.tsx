'use client';

import { motion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

/** OS의 '동작 줄이기' 설정 존중 (reduced-motion). 레이아웃에서 1회 감싼다. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

const EASE = [0.21, 0.65, 0.32, 1] as const;

/**
 * 스크롤 리빌 — 뷰포트 진입 시 페이드+슬라이드 업.
 * 서버 컴포넌트의 children도 감쌀 수 있다 (RSC 경계 OK).
 */
export function Reveal({
  children,
  delay = 0,
  y = 26,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-70px' }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** 히어로 텍스트용 — 로드 즉시 등장 (스크롤 대기 없음). */
export function HeroReveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.65, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
