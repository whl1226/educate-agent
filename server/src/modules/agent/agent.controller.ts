import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AgentService } from './agent.service';
import { AgentChatDto, AgentRunsQueryDto } from './agent.dto';
import { CurrentUser, JwtUser } from '../../common/decorators/current-user.decorator';
import { RateLimit, ReplayProtected, Roles } from '../../common/decorators/security.decorators';

@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  /** SSE 流式对话入口（思考/工具/文本逐步推送） */
  @Roles('student', 'teacher', 'parent', 'admin')
  @RateLimit({ limit: 10, windowSec: 60, keyPrefix: 'agent-chat', byUser: true })
  @ReplayProtected()
  @Post('chat')
  async chat(@CurrentUser() user: JwtUser, @Body() body: AgentChatDto, @Headers('x-preview') preview: string | undefined, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      for await (const ev of this.agent.stream(user, body, { preview: preview === '1' })) {
        send(ev.type, ev);
      }
    } catch (e) {
      send('error', { type: 'error', text: (e as Error).message });
    } finally {
      res.end();
    }
  }

  @Roles('student', 'teacher', 'parent', 'admin')
  @Get('runs')
  list(@CurrentUser() user: JwtUser, @Query() query: AgentRunsQueryDto) {
    return this.agent.listRuns(user, query.page ? Number(query.page) : 1, query.pageSize ? Number(query.pageSize) : 20);
  }

  @Roles('student', 'teacher', 'parent', 'admin')
  @Get('runs/:id')
  detail(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.agent.runDetail(user, id);
  }
}
