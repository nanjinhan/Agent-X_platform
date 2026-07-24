import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { MotionProvider } from '@/components/motion';
import { TopBar } from '@/components/top-bar';

export const metadata: Metadata = {
  title: 'SIGNALS — 검증된 투자 시그널',
  description: '조작 불가능한 트랙레코드로 검증된 투자 시그널 마켓플레이스',
};

/**
 * 다크가 기본 디자인이므로 서버에서 html에 dark를 박는다.
 * (JS 타이밍에 의존하지 않아 첫 페인트부터 확정. 라이트 선택 시 ThemeProvider가 제거)
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="dark" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <MotionProvider>
            <TopBar />
            <main className="mx-auto max-w-5xl px-5 pb-24 pt-9">{children}</main>
            {/* SIG-017: 숨길 수 없는 면책 고지 */}
            <footer className="border-t px-5 py-7 text-center text-xs leading-relaxed text-muted-foreground">
              본 화면은 디자인 시안(목 데이터)입니다 · 본 서비스가 제공하는 정보는 투자 참고자료이며 투자 권유가 아닙니다
              <br />
              투자 판단과 그 결과에 대한 책임은 투자자 본인에게 있습니다 · 과거 성과는 미래 수익을 보장하지 않습니다
            </footer>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
