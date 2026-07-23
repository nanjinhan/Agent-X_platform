import {
  Body,
  Controller,
  Delete,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiErrorCode } from '@signals/contracts';
import { ENV, type Env } from '../../../common/env';
import { ApiError } from '../../../common/http/api-error';
import { ZodBody } from '../../../common/http/zod-body.pipe';
import { JwtAuthGuard, type AuthedUser } from '../../../common/http/jwt-auth.guard';
import { AuthService } from '../application/auth.service';
import { type TokenPair } from '../application/token.service';
import {
  LoginSchema,
  RegisterSchema,
  SocialSchema,
  type LoginDto,
  type RegisterDto,
  type SocialDto,
} from './dto';

const REFRESH_COOKIE = 'refresh_token';

/** 인증 API (SRS 17.2). Access Token은 본문, Refresh Token은 HttpOnly 쿠키 (SYS-025). */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private setRefreshCookie(res: Response, pair: TokenPair): { accessToken: string } {
    res.cookie(REFRESH_COOKIE, pair.refreshToken, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/v1/auth',
      maxAge: pair.refreshTtlSec * 1000,
    });
    return { accessToken: pair.accessToken };
  }

  @Post('register')
  async register(
    @Body(new ZodBody(RegisterSchema)) dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pair = await this.auth.register({
      email: dto.email,
      password: dto.password,
      verificationTicket: dto.verificationTicket,
      marketingConsent: dto.consents.marketing,
    });
    return this.setRefreshCookie(res, pair);
  }

  @Post('login')
  async login(
    @Body(new ZodBody(LoginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pair = await this.auth.login(dto.email, dto.password);
    return this.setRefreshCookie(res, pair);
  }

  @Post('social/:provider')
  async social(
    @Param('provider') provider: string,
    @Body(new ZodBody(SocialSchema)) dto: SocialDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pair = await this.auth.socialLogin(provider, dto.email);
    return this.setRefreshCookie(res, pair);
  }

  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new ApiError(ApiErrorCode.UNAUTHENTICATED, '리프레시 토큰이 없습니다');
    const pair = await this.auth.refresh(token);
    return this.setRefreshCookie(res, pair);
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (token) await this.auth.logout(token);
    res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
    return { ok: true };
  }

  @Delete('withdraw')
  @UseGuards(JwtAuthGuard)
  async withdraw(@Req() req: Request & { user: AuthedUser }, @Res({ passthrough: true }) res: Response) {
    await this.auth.withdraw(req.user.sub);
    res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
    return { ok: true };
  }
}
