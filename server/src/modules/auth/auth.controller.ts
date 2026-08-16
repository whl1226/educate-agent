import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { ChangePasswordDto, ForceLogoutDto, LoginDto, ResetDto, ResetRequestDto, RevokeSessionDto } from './auth.dto';
import { Public, RateLimit, ReplayProtected, Roles } from '../../common/decorators/security.decorators';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { deviceOf } from '../../common/utils/device.util';
import { randomToken } from '../../common/utils/crypto.util';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { BizException } from '../../common/exceptions/biz.exception';

const REFRESH_COOKIE = 'xiangya_refresh';
const CSRF_COOKIE = 'XSRF-TOKEN';
// 注意：不能在此处缓存 NODE_ENV——模块求值早于 ConfigModule 加载 .env，
// 否则生产环境（NODE_ENV 仅在 .env 中配置）cookie 将缺失 Secure 标志。
// 必须在请求处理时再读取。
const isProd = (): boolean => process.env.NODE_ENV === 'production';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly captcha: CaptchaService,
  ) {}

  @Public()
  @RateLimit({ limit: 20, windowSec: 60, keyPrefix: 'captcha' })
  @Get('captcha')
  async captchaImage() {
    return this.captcha.generate();
  }

  /** 预登录 CSRF 凭证：下发 XSRF-TOKEN Cookie（双提交模式） */
  @Public()
  @Get('csrf')
  @HttpCode(200)
  async csrfToken(@Res({ passthrough: true }) res: Response) {
    const token = randomToken(16);
    this.setCsrfCookie(res, token);
    return { csrfToken: token };
  }

  @Public()
  @RateLimit({ limit: 10, windowSec: 900, keyPrefix: 'login' })
  @ReplayProtected()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const device = deviceOf(req);
    const result = await this.auth.login(
      dto.username,
      dto.password,
      dto.captchaId,
      dto.captchaAnswer,
      device,
    );
    this.setRefreshCookie(res, result.refreshToken);
    const csrf = randomToken(16);
    this.setCsrfCookie(res, csrf);
    return {
      user: result.user,
      permissions: result.permissions,
      isNewDevice: result.isNewDevice,
      accessToken: result.accessToken,
    };
  }

  @Public()
  @RateLimit({ limit: 30, windowSec: 900, keyPrefix: 'refresh' })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const old = (req.cookies as Record<string, string>)?.[REFRESH_COOKIE];
    const result = await this.auth.refresh(old);
    this.setRefreshCookie(res, result.refreshToken);
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: JwtUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.id, user.jti, deviceOf(req));
    this.clearAuthCookies(res);
    return { ok: true };
  }

  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@CurrentUser() user: JwtUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.id, user.jti);
    this.clearAuthCookies(res);
    return { ok: true };
  }

  @Get('sessions')
  async sessions(@CurrentUser() user: JwtUser) {
    return this.auth.listSessions(user.id, user.jti);
  }

  @Post('sessions/revoke')
  @HttpCode(200)
  async revokeSession(
    @CurrentUser() user: JwtUser,
    @Body() dto: RevokeSessionDto,
    @Req() req: Request,
  ) {
    await this.auth.revokeSessionById(user.id, Number(dto.sessionId), deviceOf(req));
    return { ok: true };
  }

  @Roles('admin')
  @Post('force-logout')
  @HttpCode(200)
  async forceLogout(
    @CurrentUser() admin: JwtUser,
    @Body() dto: ForceLogoutDto,
    @Req() req: Request,
  ) {
    await this.auth.forceLogout(admin.id, Number(dto.userId), deviceOf(req));
    return { ok: true };
  }

  @RateLimit({ limit: 10, windowSec: 900, keyPrefix: 'pwd-change', byUser: true })
  @Post('password/change')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: JwtUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(user.id, dto.oldPassword, dto.newPassword, deviceOf(req));
    this.clearAuthCookies(res);
    return { ok: true };
  }

  @Public()
  @RateLimit({ limit: 3, windowSec: 900, keyPrefix: 'reset-request' })
  @ReplayProtected()
  @Post('password/reset-request')
  @HttpCode(200)
  async resetRequest(@Body() dto: ResetRequestDto, @Req() req: Request) {
    const ok = await this.captcha.verify(dto.captchaId, dto.captchaAnswer);
    if (!ok) throw new BizException(ErrorCodes.CAPTCHA_ERROR);
    const demoToken = await this.auth.requestReset(dto.username, deviceOf(req));
    return { message: '重置链接已发送（请查收）', demoToken };
  }

  @Public()
  @RateLimit({ limit: 5, windowSec: 900, keyPrefix: 'reset' })
  @ReplayProtected()
  @Post('password/reset')
  @HttpCode(200)
  async reset(@Body() dto: ResetDto, @Req() req: Request) {
    await this.auth.resetPassword(dto.token, dto.newPassword, deviceOf(req));
    return { ok: true };
  }

  @Get('me')
  async me(@CurrentUser() user: JwtUser) {
    return this.auth.me(user);
  }

  // ================= Cookie 管理 =================

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: isProd(),
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 3600_000,
    });
  }

  private setCsrfCookie(res: Response, token: string) {
    res.cookie(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: isProd(),
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600_000,
    });
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
  }
}