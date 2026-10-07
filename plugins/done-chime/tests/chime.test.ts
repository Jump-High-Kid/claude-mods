import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// 엔진 대역: 재생 요청을 기록만 하고, 턴·알림은 빈 답
function engine(on: On): string[] {
  const played: string[] = []
  on('audio.play', (_$, e) => {
    if (e.clip.asset) played.push(e.clip.asset)
    return { value: undefined }
  })
  on('turn.complete', () => ({ text: '' }))
  on('classic.Notification', () => ({}))
  return played
}

const TURN = { answer: 'ok', turnId: 't1', reason: 'answer' } as const

test('30초 이상 걸린 메인 턴만 완료음', async ($, on) => {
  const played = engine(on)
  await $.turn.complete({ ...TURN, durationMs: 29_999, isAborted: false })
  await $.turn.complete({ ...TURN, durationMs: 45_000, isAborted: false, agentId: 'sub-1' })
  await $.turn.complete({ ...TURN, durationMs: 45_000, isAborted: true, reason: 'aborted' })
  expect(played).toEqual([])

  await $.turn.complete({ ...TURN, durationMs: 30_000, isAborted: false })
  expect(played).toEqual(['sounds/done.wav'])
})

test('승인 대기 알림만 승인음', async ($, on) => {
  const played = engine(on)
  await $.classic.Notification({ message: 'idle', notification_type: 'idle_prompt' })
  expect(played).toEqual([])

  await $.classic.Notification({ message: 'needs permission', notification_type: 'permission_prompt' })
  expect(played).toEqual(['sounds/ask.wav'])
})
