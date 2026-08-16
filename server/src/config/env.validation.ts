import * as Joi from 'joi';

/** 已知的开发/演示默认密钥：生产环境必须拒绝，防止用公开密钥伪造 JWT 或签名 */
const KNOWN_WEAK_SECRETS = [
  'dev-only-secret-do-not-use-in-prod-0123456789abcdef-xyz',
  'dev-only-signing-secret-0123456789abcdef-xyz',
  'change-me',
];

const secretWhen = (name: string) =>
  Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .min(32)
      .invalid(...KNOWN_WEAK_SECRETS)
      .required()
      .messages({ 'any.invalid': `${name} 禁止使用公开的默认密钥，请生成随机密钥` }),
    otherwise: Joi.string().min(24).required(),
  });

export const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  APP_URL: Joi.string().uri().required(),
  // 是否部署在反向代理之后（信任 X-Forwarded-For 计算客户端 IP）。
  // 默认 false：直接暴露时禁止伪造 IP 绕过限流
  TRUST_PROXY: Joi.boolean().default(false),
  // 生产环境必须显式配置 CORS 白名单（未配置时服务端将禁止跨域）
  CORS_ORIGIN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().default(''),
  }),
  UPLOAD_PUBLIC_URL: Joi.string().default(''),

  DB_PATH: Joi.string().required(),
  // 生产环境禁止自动同步表结构，避免意外 schema 变更
  DB_SYNCHRONIZE: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.boolean().valid(false).default(false),
    otherwise: Joi.boolean().default(true),
  }),
  DB_LOGGING: Joi.boolean().default(false),

  REDIS_ENABLED: Joi.boolean().default(false),
  REDIS_HOST: Joi.string().default('127.0.0.1'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().default(0),

  JWT_SECRET: secretWhen('JWT_SECRET'),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: Joi.number().default(7),
  SIGNING_SECRET: secretWhen('SIGNING_SECRET'),

  MAX_LOGIN_FAILURES: Joi.number().default(10),
  LOGIN_LOCK_MINUTES: Joi.number().default(30),
  CAPTCHA_REQUIRED_AFTER_FAILURES: Joi.number().default(3),
  PASSWORD_MIN_LENGTH: Joi.number().default(10),
  SINGLE_DEVICE_MODE: Joi.boolean().default(false),

  LLM_PROVIDER: Joi.string().valid('demo', 'openai-compat').default('demo'),
  LLM_BASE_URL: Joi.string().allow('').default(''),
  LLM_API_KEY: Joi.string().allow('').default(''),
  LLM_MODEL: Joi.string().default('deepseek-chat'),
  LLM_TIMEOUT_MS: Joi.number().default(60000),

  OCR_PROVIDER: Joi.string().valid('demo', 'openai-compat').default('demo'),
  OCR_API_KEY: Joi.string().allow('').default(''),

  SEED_ADMIN_USERNAME: Joi.string().default('admin'),
  // 生产环境必须显式配置管理员密码；仅开发/演示环境允许默认值
  SEED_ADMIN_PASSWORD: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(8).required(),
    otherwise: Joi.string().min(8).default('Admin@2026Xy'),
  }),
});

export interface EnvConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  APP_URL: string;
  TRUST_PROXY: boolean;
  CORS_ORIGIN: string;
  UPLOAD_PUBLIC_URL: string;
  DB_PATH: string;
  DB_SYNCHRONIZE: boolean;
  DB_LOGGING: boolean;
  REDIS_ENABLED: boolean;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD: string;
  REDIS_DB: number;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  REFRESH_TOKEN_EXPIRES_DAYS: number;
  SIGNING_SECRET: string;
  MAX_LOGIN_FAILURES: number;
  LOGIN_LOCK_MINUTES: number;
  CAPTCHA_REQUIRED_AFTER_FAILURES: number;
  PASSWORD_MIN_LENGTH: number;
  SINGLE_DEVICE_MODE: boolean;
  LLM_PROVIDER: 'demo' | 'openai-compat';
  LLM_BASE_URL: string;
  LLM_API_KEY: string;
  LLM_MODEL: string;
  LLM_TIMEOUT_MS: number;
  OCR_PROVIDER: 'demo' | 'openai-compat';
  OCR_API_KEY: string;
  SEED_ADMIN_USERNAME: string;
  SEED_ADMIN_PASSWORD: string;
}
