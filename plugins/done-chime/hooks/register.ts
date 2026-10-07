import type { Register } from 'claude-code'

// 짧은 답변마다 울리면 피로 → 이 시간 이상 걸린 턴만 알림
const MIN_TURN_MS = 30_000

// 소리 = 직접 합성한 WAV(맥 시스템음과 구별되는 다음(多音) 모티프)
// done = 마림바 2음 상승, ask = 짧은 사인 3연타
export const register: Register = (on) => {
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // 서브에이전트 턴·Esc 중단(사람이 이미 화면 앞)은 제외
    if (!e.agentId && !e.isAborted && e.durationMs >= MIN_TURN_MS) {
      // 재생 완료를 기다리지 않음 — 턴 종료를 늦추지 않도록
      $.audio.play({ asset: 'sounds/done.wav' }).catch(() => {})
    }
    return result
  })

  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt') {
      $.audio.play({ asset: 'sounds/ask.wav' }).catch(() => {})
    }
    return next(e)
  }).catch(($, e, next) => next(e)) // 실패해도 알림 흐름은 막지 않음
}
