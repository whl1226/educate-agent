import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { LoginAttempt, PasswordResetToken, Session, User } from '../../db/entities/auth.entities';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, LoginAttempt, PasswordResetToken]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') || '15m' },
      }),
    }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, CaptchaService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}