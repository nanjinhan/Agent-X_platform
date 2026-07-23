import { Injectable } from '@nestjs/common';
import { UserRepository } from '../infra/user.repository';
import type { UserRow } from '../domain/user.types';

/**
 * identity 모듈의 **공개 인터페이스** (SYS-003).
 * 다른 모듈(provider, subscription 등)은 이 서비스로만 사용자 정보에 접근한다.
 * 테이블 직접 접근 금지.
 */
@Injectable()
export class IdentityService {
  constructor(private readonly users: UserRepository) {}

  getUserById(id: string): Promise<UserRow | null> {
    return this.users.findById(id);
  }
}
