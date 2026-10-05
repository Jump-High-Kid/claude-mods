import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit, Where } from '../types'

// 제목·리셋 시각 = /usage 화면(2.1.289 바이너리 실측)에서 따오고, 막대·'used'·시간대는 뺀 한 줄 요약.
// 70% 경고 임계 = 기본 경고 알림.
const TITLES: Record<string, string> = { five_hour: 'Current session', seven_day: 'Current week' }
const WARN_AT = 70

const limits = atom({ plugin: 'usage-status', key: 'limits' } as const, [] as Limit[])
// 컨텍스트 창 사용률(%) — 첫 응답 전·압축 직후엔 null
const context = atom({ plugin: 'usage-status', key: 'context' } as const, null as number | null)
// 레포 이름·모델·effort — effort 는 첫 요청(turn.step) 전엔 모름
const where = atom({ plugin: 'usage-status', key: 'where' } as const, {} as Where)

// 70% 이상 warning, 한도 도달 error — 테마 키. 그 아래는 기본색
function toneOf(pct: number): string | undefined {
  if (pct >= 100) return 'error'
  if (pct >= WARN_AT) return 'warning'
  return undefined
}

// 'claude-opus-5-5[1m]' → 'Opus 5.5 (1M)', 모르는 형식은 그대로
function modelName(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)(?:-\d{8})?(\[1m\])?$/.exec(id)
  if (!m) return id
  const [, family = '', major, minor, long] = m
  return `${family[0]?.toUpperCase()}${family.slice(1)} ${major}.${minor}${long ? ' (1M)' : ''}`
}

// 리셋 시각: 24시간 이내 '3pm'·'3:30pm', 넘으면 'Oct 9 at 3pm'(해가 다르면 연도)
function formatReset(iso: string, now: Date): string {
  const at = new Date(iso)
  const minute = at.getMinutes() === 0 ? undefined : '2-digit'
  const text =
    (at.getTime() - now.getTime()) / 3_600_000 > 24
      ? at.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute,
          hour12: true,
          year: at.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        })
      : at.toLocaleTimeString('en-US', { hour: 'numeric', minute, hour12: true })
  return text.replace(/[  ]([AP]M)/i, (_, ampm: string) => ampm.toLowerCase())
}

export const register: Register = on => {
  // 리로드·재개 직후에도 다음 측정까지 비어 있지 않게 한 번 채운다
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const usage = await $.session.usage()
    await update($, limits, () => [...usage.rateLimits])
    await update($, context, () => usage.context.percent ?? null)
    const root = (await $.session.repo())?.root ?? (await $.session.root())
    const model = await $.session.model()
    await update($, where, w => ({ ...w, repo: root.split('/').pop(), model }))
    return result
  })

  // 메인 루프가 실제로 보내는 모델·effort (서브에이전트 요청은 제외)
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const effort = e.effort === undefined ? undefined : String(e.effort)
      await update($, where, w => (w.model === e.model && w.effort === effort ? w : { ...w, model: e.model, effort }))
    }
    return yield* next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => [...e.rateLimits])
    }
    if (e.changed.includes('context')) {
      await update($, context, () => e.context.percent ?? null)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const items: { title: string; pct: number; resetsAt?: string }[] = (await read($, limits))
      .filter(l => TITLES[l.kind])
      .map(l => ({ title: TITLES[l.kind] ?? '', pct: Math.floor(l.percentUsed), resetsAt: l.resetsAt }))
    const ctx = await read($, context)
    if (ctx !== null) items.push({ title: 'Context', pct: Math.floor(ctx) })
    const { repo, model, effort } = await read($, where)
    if (e.props.hasSurvey || (items.length === 0 && !repo)) {
      return next(e)
    }

    const now = new Date(await $.clock.now())
    const { Box, Text } = $.ui.resolve(e)

    // 'Current session 56% · 1:50pm   Current week 69% · 9am   Context 11%   my-repo Opus 5.5 (1M) · high' 한 줄
    return (
      <Box key="line" flexDirection="row" gap={3}>
        {items.map(({ title, pct, resetsAt }) => {
          const tone = toneOf(pct)
          return (
            <Box key={title} flexDirection="row" gap={1}>
              <Text bold>{title}</Text>
              <Text {...(tone ? { color: tone } : {})}>{`${pct}%`}</Text>
              {resetsAt ? <Text dimColor>{`· ${formatReset(resetsAt, now)}`}</Text> : null}
            </Box>
          )
        })}
        {repo ? (
          <Box key="where" flexDirection="row" gap={1}>
            <Text bold>{repo}</Text>
            {model ? <Text>{modelName(model)}</Text> : null}
            {effort ? <Text dimColor>{`· ${effort}`}</Text> : null}
          </Box>
        ) : null}
      </Box>
    )
  })
}
