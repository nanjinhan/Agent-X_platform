/**
 * 한국식 만 나이 계산 (REG-020: 만 19세 미만 가입 제한).
 * 생일이 지났으면 (올해 - 출생연도), 아니면 -1.
 */
export function koreanAge(birthDate: Date, today: Date): number {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth();
  const dayDiff = today.getUTCDate() - birthDate.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

export const MIN_SIGNUP_AGE = 19;

export function isEligibleAge(birthDate: Date, today: Date): boolean {
  return koreanAge(birthDate, today) >= MIN_SIGNUP_AGE;
}
