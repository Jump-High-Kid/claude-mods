import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const HOUR = 3_600_000
const NOW = Date.UTC(2026, 9, 4, 3, 0)

// 엔진 대역: 고정 시계 + session.measure 응답
function engine(on: On): void {
  mock.clock(on, { now: NOW })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
}

test('한 줄: 5h·7d·Context, 막대·used·Resets·시간대 없음, 사용량별 색', async ($, on) => {
  engine(on)
  await $.session.measure({
    context: { window: 1_000_000, tokens: 450_000, percent: 45 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 82.9, resetsAt: new Date(NOW + 2 * HOUR).toISOString() },
      { kind: 'seven_day', percentUsed: 39, resetsAt: new Date(NOW + 72 * HOUR).toISOString() },
      { kind: 'spend_limit', percentUsed: 50 },
    ],
    changed: ['context', 'rateLimits'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-status', surface, ...BAND })

    expect((await ui.find({ key: 'line' }))?.props.flexDirection).toBe('row')
    // 좁은 화면: 그룹 단위 줄바꿈 (그룹 안 글자 줄바꿈 X)
    expect((await ui.find({ key: 'line' }))?.props.flexWrap).toBe('wrap')
    expect((await ui.find({ key: 'Current session' }))?.props.flexShrink).toBe(0)
    // spend_limit 은 그리지 않음 → 제목 3개
    expect(await ui.findAll({ type: 'Text', text: /^(Current (session|week)|Context)$/ })).toHaveLength(3)

    expect((await ui.find({ type: 'Text', text: '82%' }))?.props.color).toBe('#ff8700')
    expect((await ui.find({ type: 'Text', text: '39%' }))?.props.color).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: '45%' }))?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Text', text: /^· \d{1,2}(:\d\d)?[ap]m$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^· [A-Z][a-z]{2} \d{1,2},? (\d{4},? )?(at )?\d{1,2}(:\d\d)?[ap]m$/ })).toBeDefined()

    expect(await ui.find({ type: 'Text', text: /[█▏▎▍▌▋▊▉]|used|Resets|\(/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('경계값 80% 주황·40% 노랑 · 컨텍스트 미측정이면 Context 생략', async ($, on) => {
  engine(on)
  await $.session.measure({
    context: { window: 1_000_000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 80 }, { kind: 'seven_day', percentUsed: 40 }],
    changed: ['rateLimits'],
  })
  const ui = await $.ui.mount({ plugin: 'usage-status', surface: 'terminal', ...BAND })
  expect((await ui.find({ type: 'Text', text: '80%' }))?.props.color).toBe('#ff8700')
  expect((await ui.find({ type: 'Text', text: '40%' }))?.props.color).toBe('warning')
  expect(await ui.find({ type: 'Text', text: 'Context' })).toBeUndefined()
})

test('레포·모델·effort: session.start 로 레포·모델, 메인 루프 turn.step 으로 effort', async ($, on) => {
  engine(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('session.repo', () => ({ value: { root: '/Users/x/Projects/Labylinx', remote: null, internal: false, name: null } }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })

  await $.session.start({ cwd: '/Users/x/Projects/Labylinx', surface: 'terminal', isInteractive: true })
  // 메인 루프 뒤에 온 서브에이전트 요청은 무시돼야 함
  for (const step of [
    { turnId: 't', index: 0, model: 'claude-opus-5-5[1m]', effort: 'xhigh' as const, messageCount: 1 },
    { turnId: 't', index: 1, model: 'claude-haiku-4-5-20251001', effort: 'low' as const, messageCount: 1, agentId: 'sub' },
  ]) {
    for await (const _ of $.turn.step(step)) {
      // 스트림 끝까지 읽기
    }
  }

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-status', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'Labylinx' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Opus 5.5 (1M)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '· xhigh' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Haiku|low/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('/clear 뒤처럼 session.start 없이 시작해도 첫 메인 turn.step 에서 레포를 채움', async ($, on) => {
  engine(on)
  on('session.repo', () => ({ value: { root: '/Users/x/Projects/ai-clinic-builder', remote: null, internal: false, name: null } }))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })

  for await (const _ of $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5[1m]', effort: 'high', messageCount: 1 })) {
    // 스트림 끝까지 읽기
  }

  const ui = await $.ui.mount({ plugin: 'usage-status', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: 'ai-clinic-builder' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Opus 5.5 (1M)' })).toBeDefined()
})

test('좁은 화면: 레포가 다음 줄로 밀릴 상황이면 이름을 줄여 앞 줄에 붙임', async ($, on) => {
  engine(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { window: 1_000_000 }, rateLimits: [{ kind: 'five_hour' as const, percentUsed: 82 }] },
  }))
  on('session.repo', () => ({ value: { root: '/x/very-long-folder-name', remote: null, internal: false, name: null } }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  await $.session.start({ cwd: '/x/very-long-folder-name', surface: 'terminal', isInteractive: true })

  // 'Current session 82%'(19) + 3 + 레포 + ' Opus 5.5 (1M)'(14) ≤ 45 → 레포 9칸
  const narrow = { ...BAND, props: { ...BAND.props, bodyColumns: 45 } }
  let ui = await $.ui.mount({ plugin: 'usage-status', surface: 'terminal', ...narrow })
  expect(await ui.find({ type: 'Text', text: 'very-lon…' })).toBeDefined()
  await ui.unmount()

  // 넓으면 그대로
  ui = await $.ui.mount({ plugin: 'usage-status', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: 'very-long-folder-name' })).toBeDefined()
  await ui.unmount()

  // 너무 좁아 4칸 미만으로 줄여야 하면 줄이지 않음(다음 줄로)
  const tiny = { ...BAND, props: { ...BAND.props, bodyColumns: 38 } }
  ui = await $.ui.mount({ plugin: 'usage-status', surface: 'terminal', ...tiny })
  expect(await ui.find({ type: 'Text', text: 'very-long-folder-name' })).toBeDefined()
})
