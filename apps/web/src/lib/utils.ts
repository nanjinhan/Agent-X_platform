import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** cult-ui/shadcn 표준 className 병합 유틸 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
