# ADR-0001: 백엔드 프레임워크로 NestJS 채택

- 상태: 승인 (2026-07-21)
- 관련 요구사항: SYS-005 (스택 선정), SYS-002/003 (모듈 경계)

## 맥락

SRS SYS-005는 백엔드를 "TypeScript(NestJS) 또는 Python(FastAPI), 팀 역량에 따라"로 열어뒀다.
성과 계산 배치는 어느 쪽이든 Python으로 분리된다 (SYS-006).

## 결정

Core API, signal-service, notification-service를 **NestJS(TypeScript)**로 구현한다.

## 근거

1. **팀 언어 경계 = 팀 구성 경계.** 권장 팀(22.3)은 백엔드 2 + 데이터 1 + 프론트 1~2.
   배치가 Python으로 분리되면 Python 사용자는 데이터 담당 1명뿐이다. Core API까지 TS면
   프론트 인력이 API 작업을 지원할 수 있다.
2. **모듈 경계 강제.** SYS-002/003(공개 인터페이스만, 타 모듈 테이블 SQL 금지, 순환 금지)을
   NestJS 모듈 시스템 + DI + ESLint boundary 룰로 컴파일 타임에 강제할 수 있다.
3. **타입 공유.** `@signals/contracts`로 API·프론트 3종이 DTO를 공유 —
   disclaimer 필수(SYS-026) 같은 규제 요구를 타입으로 강제.
4. 큐는 BullMQ로 Redis 재사용 (SYS-005 권장 조합).

## 대안 및 기각 사유

- **FastAPI**: 백엔드 채용이 Python 중심이면 재고 가능. 그 경우에도 모듈 경계·서비스 분리·
  테이블 소유권 구조는 그대로 유효하며 core-api 구현 언어만 바뀐다.

## 결과

- 백엔드 채용 요건에 TypeScript/NestJS 명시
- ESLint `boundaries` 플러그인 설정을 P1 초기(스캐폴드 직후)에 도입할 것
