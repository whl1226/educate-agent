import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Public } from '../../common/decorators/security.decorators';
import { SystemConfig } from '../../db/entities/system.entities';

@Controller('system')
export class SystemController {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(SystemConfig)
    private readonly configs: Repository<SystemConfig>,
  ) {}

  /** 健康检查：不泄露版本/依赖/路径信息 */
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', time: new Date().toISOString() };
  }

  /** 前端白名单配置（CSP 相关、功能开关），不含任何密钥 */
  @Get('configs')
  async publicConfigs() {
    const rows = await this.configs.find();
    const map: Record<string, string> = {};
    for (const row of rows) {
      if (['llm_provider', 'demo_mode', 'captcha_required_after_failures'].includes(row.key)) {
        map[row.key] = row.value;
      }
    }
    return {
      appName: '乡芽 · 乡镇教育智能体',
      llmProvider: this.config.get('LLM_PROVIDER', 'demo'),
      demoMode: this.config.get('LLM_PROVIDER', 'demo') === 'demo',
      passwordMinLength: Number(this.config.get('PASSWORD_MIN_LENGTH', 10)),
      ...map,
    };
  }
}