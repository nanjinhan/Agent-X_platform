/**
 * 금칙어 목록 (AGT-018 예시 목록 기반, REG-004 손실보전 금지 표현 포함).
 * 에이전트 심사 자동 체크(T5)와 시그널·콘텐츠 모더레이션(T20)이 공유한다.
 * 사전 차단 방식: 포함 시 저장 자체 거부 (ADM-007).
 */
export const PROHIBITED_TERMS: readonly string[] = [
  '보장',
  '확실',
  '무조건',
  '100%',
  '원금보장',
  '손실보전',
  '필승',
  '절대',
  '반드시',
  '수익보장',
  '대박',
  '폭등확정',
  '급등확실',
  '시크릿',
  '내부정보',
  '작전',
  '세력',
  '확정수익',
  '무손실',
];

/** 텍스트에 금칙어가 있으면 첫 번째 금칙어를 반환, 없으면 null. */
export function findProhibitedTerm(text: string): string | null {
  const normalized = text.replace(/\s+/g, '');
  for (const term of PROHIBITED_TERMS) {
    if (normalized.includes(term)) return term;
  }
  return null;
}
