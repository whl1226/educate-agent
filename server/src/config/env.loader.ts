import { config as dotenvConfig } from 'dotenv';
import { join } from 'path';

/**
 * 独立脚本（seed 等）加载 .env。
 * 主应用由 ConfigModule 负责，此模块仅用于脱离 Nest 容器的脚本。
 */
export function loadEnv(): void {
  dotenvConfig({ path: join(process.cwd(), '.env') });
  const dbPath = process.env.DB_PATH || './data/xiangya.db';
  if (!dbPath.includes(':') && !dbPath.startsWith('/')) {
    process.env.DB_ABS = join(process.cwd(), dbPath);
  }
}