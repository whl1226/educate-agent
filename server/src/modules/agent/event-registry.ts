export interface TelemetryEventField {
  type: 'string' | 'number' | 'boolean'
  comment: string
}

export interface TelemetryEventDef {
  name: string
  owner: string
  comment: string
  fields: Record<string, TelemetryEventField>
}

const registry = new Map<string, TelemetryEventDef>()

/** Kimi 命名规范：snake_case，时长/计数/大小带 _ms/_count/_bytes 后缀 */
export function isValidEventName(name: string): boolean {
  return /^[a-z][a-z0-9_]*_(ms|count|bytes)$/.test(name)
}

export function defineTelemetryEvent(def: TelemetryEventDef): void {
  if (registry.has(def.name))
    throw new Error(`telemetry event already registered: ${def.name}`)
  if (!isValidEventName(def.name))
    throw new Error(`invalid telemetry event name: ${def.name}（须 snake_case 且带 _ms/_count/_bytes 后缀）`)
  registry.set(def.name, def)
}

export function isRegistered(name: string): boolean {
  return registry.has(name)
}

export function getTelemetryEvents(): TelemetryEventDef[] {
  return [...registry.values()]
}

defineTelemetryEvent({
  name: 'agent_turn_ended_ms', owner: 'agent', comment: 'Agent run 结束耗时（毫秒）',
  fields: { duration_ms: { type: 'number', comment: '墙钟耗时' } },
})
defineTelemetryEvent({
  name: 'agent_tool_call_count', owner: 'agent', comment: '工具调用次数',
  fields: { total: { type: 'number', comment: '总次数' }, errors: { type: 'number', comment: '失败次数' } },
})
defineTelemetryEvent({
  name: 'agent_ttft_ms', owner: 'agent', comment: '首 token 时延（毫秒）',
  fields: { duration_ms: { type: 'number', comment: 'thinking 到首个 delta' } },
})
