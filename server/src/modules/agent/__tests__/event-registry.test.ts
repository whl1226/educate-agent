import { describe, expect, it } from 'vitest'
import {
  defineTelemetryEvent,
  getTelemetryEvents,
  isRegistered,
  isValidEventName,
} from '../event-registry'

describe('telemetry event registry', () => {
  it('重复注册报错（编译期强校验的运行时兜底）', () => {
    expect(() =>
      defineTelemetryEvent({ name: 'agent_ttft_ms', owner: 'test', comment: 'x', fields: {} }),
    ).toThrow(/already registered/)
  })

  it('内置核心事件已注册且可查询', () => {
    expect(isRegistered('agent_turn_ended_ms')).toBe(true)
    expect(getTelemetryEvents().length).toBeGreaterThanOrEqual(3)
  })

  it('命名规范校验：snake_case + 单位后缀', () => {
    expect(isValidEventName('agent_tool_ms')).toBe(true)
    expect(isValidEventName('agentToolMs')).toBe(false)
    expect(isValidEventName('agent_tool')).toBe(false)
  })
})
