import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCodes } from '../../common/exceptions/error-codes';
import { BizException } from '../../common/exceptions/biz.exception';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  text: string;
  model: string;
  refs?: Array<{ title: string; ref: string }>;
}

export interface LLMProvider {
  readonly name: string;
  chat(messages: ChatMessage[]): Promise<ChatResult>;
}

/** 演示模式规则引擎：无 Key 可跑，关键词匹配 + 规则话术，绝不外呼 */
export class DemoProvider implements LLMProvider {
  readonly name = 'demo';
  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    const last = messages[messages.length - 1]?.content ?? '';
    const isSocratic = last.includes('__SOCRATIC__');
    const isQa = last.includes('__QA__');
    const text = isSocratic
      ? this.socraticReply(last)
      : isQa
        ? this.qaReply(last)
        : '（演示模式）已收到请求，请接入 OpenAI 兼容服务获得完整生成能力。';
    return { text, model: 'demo-rule-v1' };
  }

  private socraticReply(raw: string): string {
    // 苏格拉底辅导规则：禁止直接给答案，只给三步引导
    const q = raw.replace('__SOCRATIC__', '').trim();
    if (/^\d+(\s*[+\-*/×÷xX]\s*\d+)+/.test(q)) {
      return `我们一起解这道题，不直接给答案哦。\n\n第一步：先看未知数——把方程里未知的部分圈出来，它表示什么？\n第二步：方程两边同时做什么运算，能让含未知数的一边只剩它自己？\n第三步：算完记得带回原式验算一遍。\n\n按这三步试一下，卡住了告诉我你做到哪一步。`;
    }
    return `这个问题我们可以分三步想：\n\n1. 题目里已知了什么条件？把它们一条条列出来。\n2. 问题在问什么？和已知条件之间有什么关系？\n3. 试着用自己的话把关系说出来，再动手做。\n\n你先说说你从题目里读到了哪些信息？`;
  }

  private qaReply(raw: string): string {
    const q = raw.replace('__QA__', '').trim();
    if (q.includes('草船借箭') || q.includes('诸葛亮')) {
      return `《草船借箭》讲的是周瑜妒忌诸葛亮，以"造箭"为名刁难他。诸葛亮利用大雾天气，用草船向曹军"借"来十万支箭，如期交箭，周瑜自叹不如。\n\n知识点：课文刻画了诸葛亮的足智多谋、神机妙算，也写出了周瑜的妒贤忌能。`;
    }
    return `关于「${q.slice(0, 30)}」，建议先看课文原文对应章节，再结合课后习题理解。如需具体某课内容，可以直接告诉我课文名。`;
  }
}

/** OpenAI 兼容提供商（DeepSeek/通义等），超时与错误降级 */
export class OpenAICompatProvider implements LLMProvider {
  readonly name = 'openai-compatible';
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async chat(messages: ChatMessage[]): Promise<ChatResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.6,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new BizException(ErrorCodes.AI_PROVIDER_UNAVAILABLE);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (!text) throw new BizException(ErrorCodes.AI_PROVIDER_UNAVAILABLE);
      return { text, model: this.model };
    } finally {
      clearTimeout(timer);
    }
  }
}

@Injectable()
export class AIService {
  private readonly provider: LLMProvider;

  constructor(private readonly config: ConfigService) {
    const mode = this.config.get<string>('LLM_PROVIDER', 'demo');
    if (mode === 'openai-compat') {
      this.provider = new OpenAICompatProvider(
        this.config.get<string>('LLM_BASE_URL') || 'https://api.deepseek.com/v1',
        this.config.get<string>('LLM_API_KEY') || '',
        this.config.get<string>('LLM_MODEL') || 'deepseek-chat',
        Number(this.config.get('LLM_TIMEOUT_MS')) || 60_000,
      );
    } else {
      this.provider = new DemoProvider();
    }
  }

  get providerName(): string {
    return this.provider.name;
  }

  get isDemo(): boolean {
    return this.provider.name === 'demo';
  }

  async chat(system: string, user: string): Promise<ChatResult> {
    return this.provider.chat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]);
  }
}