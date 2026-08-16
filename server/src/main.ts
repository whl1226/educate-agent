import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { CsrfGuard } from './common/guards/csrf.guard';
import { ReplayGuard } from './common/guards/replay.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RbacGuard } from './common/guards/rbac.guard';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  const config = app.get(ConfigService);
  const isProd = config.get('NODE_ENV') === 'production';

  // ===== 安全响应头（隐藏服务端/框架版本信息） =====
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://code.iconify.design'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://fonts.googleapis.com'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      hsts: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  app.disable('x-powered-by');

  app.use(cookieParser());
  // 仅当部署在反向代理之后且显式配置 TRUST_PROXY=true 时才信任 X-Forwarded-For，
  // 否则攻击者可伪造该头绕过基于 IP 的限流/登录失败计数
  if (config.get<boolean>('TRUST_PROXY') === true) {
    app.set('trust proxy', 1);
  }

  // ===== CORS（同源为主，开发环境放行本地前端；未配置时禁止跨域反射） =====
  const rawOrigins: string = config.get<string>('CORS_ORIGIN') || '';
  const origins: string[] = rawOrigins
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length ? origins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-Timestamp',
      'X-Signature',
      'X-Nonce',
      'Idempotency-Key',
    ],
  });

  // ===== 全局前缀 =====
  app.setGlobalPrefix('api/v1');

  // ===== 全局管道（入参校验：白名单过滤） =====
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ===== 全局守卫（顺序：CSRF → 防重放 → 限流 → JWT → RBAC） =====
  app.useGlobalGuards(
    app.get(CsrfGuard),
    app.get(ReplayGuard),
    app.get(RateLimitGuard),
    app.get(JwtAuthGuard),
    app.get(RbacGuard),
  );

  // ===== 全局过滤器与拦截器 =====
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ===== 静态资源 =====
  const isServerCwd = process.cwd().endsWith('server');
  const publicRoot = isServerCwd ? join(process.cwd(), '..', 'public') : join(process.cwd(), 'public');
  app.useStaticAssets(publicRoot);
  // 上传目录：一律按附件下载，禁止浏览器以内联方式渲染（防存储型 XSS：恶意 HTML/SVG 无法在应用同源执行）
  const uploadDir = join(process.cwd(), 'uploads');
  app.useStaticAssets(uploadDir, {
    prefix: '/uploads',
    setHeaders: (res) => {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    },
  });

  const port = config.get<number>('PORT') || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[xiangya] API 已启动: http://localhost:${port}/api/v1/system/health`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[xiangya] 启动失败:', err.message);
  process.exit(1);
});