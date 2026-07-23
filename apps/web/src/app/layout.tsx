import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { TopBar } from '@/components/top-bar';

export const metadata: Metadata = {
  title: 'SIGNALS — 검증된 투자 시그널',
  description: '조작 불가능한 트랙레코드로 검증된 투자 시그널 마켓플레이스',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {/* SIG-017: 숨길 수 없는 면책 고지 */}
          <div className="border-b bg-[var(--accent-soft)] px-5 py-1.5 text-center text-[11.5px] text-[var(--accent)]">
            본 화면은 투자 참고정보 서비스입니다 · 시안(목 데이터) · 투자 권유가 아니며 과거 성과는 미래 수익을 보장하지 않습니다
          </div>
          <TopBar />
          <main className="mx-auto max-w-6xl px-5 pb-24 pt-7">{children}</main>
        </ThemeProvider>
      </body>
    </html>
  );
}
