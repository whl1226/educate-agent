import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CsrfGuard } from './csrf.guard';
import { ReplayGuard } from './replay.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RbacGuard } from './rbac.guard';

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [CsrfGuard, ReplayGuard, RateLimitGuard, JwtAuthGuard, RbacGuard],
  exports: [CsrfGuard, ReplayGuard, RateLimitGuard, JwtAuthGuard, RbacGuard],
})
export class GuardsModule {}