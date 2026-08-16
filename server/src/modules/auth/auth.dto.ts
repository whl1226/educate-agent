import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(2, 64)
  @Matches(/^[\w\u4e00-\u9fa5.-]+$/, { message: '用户名格式不正确' })
  username: string;

  @IsString()
  @Length(6, 128)
  password: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  captchaId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 8)
  captchaAnswer?: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(6, 128)
  oldPassword: string;

  @IsString()
  @Length(8, 128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: '新密码需包含大小写字母和数字',
  })
  newPassword: string;
}

export class ResetRequestDto {
  @IsString()
  @Length(2, 64)
  username: string;

  @IsString()
  @Length(1, 64)
  captchaId: string;

  @IsString()
  @Length(1, 8)
  captchaAnswer: string;
}

export class ResetDto {
  @IsString()
  @Length(16, 128)
  token: string;

  @IsString()
  @Length(8, 128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: '新密码需包含大小写字母和数字',
  })
  newPassword: string;
}

export class RevokeSessionDto {
  @IsString()
  @MaxLength(64)
  sessionId: string;
}

export class ForceLogoutDto {
  @IsString()
  @MaxLength(64)
  userId: string;
}