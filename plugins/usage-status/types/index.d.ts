// session.measure 의 rateLimits 한 칸 (SessionRateLimit 과 같은 모양)
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
// 레포 이름·모델 ID·effort (session.start·turn.step 에서 채움)
export type Where = { repo?: string; model?: string; effort?: string }

declare module 'claude-code' {
  interface PluginState {
    // context = 컨텍스트 창 사용률(%), 첫 응답 전·압축 직후 null
    'usage-status': { limits: Limit[]; context: number | null; where: Where }
  }
}
