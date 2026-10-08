import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Where } from '../types'

// 제목·리셋 시각 = /usage 화면(2.1.289 바이너리 실측)에서 따오고, 막대·'used'·시간대는 뺀 한 줄 요약.
const TITLES: Record<string, string> = { five_hour: 'Current session', seven_day: 'Current week' }
const YELLOW_AT = 40
const ORANGE_AT = 80
const ORANGE = '#ff8700' // 테마에 주황 키가 없어 고정색(xterm 208)
const GAP = 3 // 묶음 사이 칸
const MIN_REPO = 4 // 이보다 짧게 줄여야 하면 줄이지 않고 다음 줄로 넘김

const limits = atom({ plugin: 'usage-status', key: 'limits' } as const, [] as Limit[])
// 컨텍스트 창 사용률(%) — 첫 응답 전·압축 직후엔 null
const context = atom({ plugin: 'usage-status', key: 'context' } as const, null as number | null)
// 레포 이름·모델·effort — effort 는 첫 요청(turn.step) 전엔 모름
const where = atom({ plugin: 'usage-status', key: 'where' } as const, {} as Where)

// 3단계: 40% 미만 기본색, 40% 이상 노랑(테마 warning), 80% 이상 주황
function toneOf(pct: number): string | undefined {
  if (pct >= ORANGE_AT) return ORANGE
  if (pct >= YELLOW_AT) return 'warning'
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

// 좁은 화면에서 레포 묶음이 혼자 다음 줄로 밀릴 상황이면, 앞 줄에 붙도록 레포 이름을 '…'로 줄인다.
// before = 앞 묶음들 너비, rest = 레포 뒤 모델·effort 너비. flexWrap 과 같은 순서로 줄을 채워 본다.
// ponytail: 너비 = 글자 수(한글 폴더명은 2칸이라 오차) — 한글 폴더 쓰면 전각 너비 계산 추가
function fitRepo(repo: string, before: number[], rest: number, columns: number): string {
  let line = 0
  for (const w of before) line = line === 0 || line + GAP + w > columns ? w : line + GAP + w
  const room = columns - (line === 0 ? 0 : line + GAP) - rest
  if (repo.length <= room || room < MIN_REPO) return repo
  return `${repo.slice(0, room - 1)}…`
}

// 레포 루트 폴더명 (git 밖이면 세션 루트)
async function repoName($: EngineInterface): Promise<string | undefined> {
  const root = (await $.session.repo())?.root ?? (await $.session.root())
  return root.split('/').pop()
}

export const register: Register = on => {
  // 리로드·재개 직후에도 다음 측정까지 비어 있지 않게 한 번 채운다
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const usage = await $.session.usage()
    await update($, limits, () => [...usage.rateLimits])
    await update($, context, () => usage.context.percent ?? null)
    const repo = await repoName($)
    const model = await $.session.model()
    await update($, where, w => ({ ...w, repo, model }))
    return result
  })

  // 메인 루프가 실제로 보내는 모델·effort (서브에이전트 요청은 제외)
  // /clear 는 상태를 비우지만 session.start 가 다시 오지 않음 → 레포가 비었으면 여기서 다시 채운다
  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      const effort = e.effort === undefined ? undefined : String(e.effort)
      const repo = (await read($, where)).repo ?? (await repoName($))
      await update($, where, w =>
        w.model === e.model && w.effort === effort && w.repo === repo ? w : { ...w, repo, model: e.model, effort },
      )
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
    const resets = items.map(({ resetsAt }) => (resetsAt ? `· ${formatReset(resetsAt, now)}` : ''))
    const widths = items.map(({ title, pct }, i) => `${title} ${pct}%`.length + (resets[i] ? 1 + resets[i]!.length : 0))
    const tail = [model ? modelName(model) : '', effort ? `· ${effort}` : ''].filter(Boolean)
    const shownRepo = repo ? fitRepo(repo, widths, tail.reduce((n, t) => n + 1 + t.length, 0), e.props.bodyColumns) : ''

    // 'Current session 56% · 1:50pm   Current week 69% · 9am   Context 11%   my-repo Opus 5.5 (1M) · high' 한 줄
    // 좁은 화면(모바일)에선 그룹을 누르지 않고(flexShrink 0) 그룹 단위로 다음 줄로 넘긴다(flexWrap)
    return (
      <Box key="line" flexDirection="row" flexWrap="wrap" columnGap={3}>
        {items.map(({ title, pct }, i) => {
          const tone = toneOf(pct)
          return (
            <Box key={title} flexDirection="row" flexShrink={0} gap={1}>
              <Text bold>{title}</Text>
              <Text {...(tone ? { color: tone } : {})}>{`${pct}%`}</Text>
              {resets[i] ? <Text dimColor>{resets[i]}</Text> : null}
            </Box>
          )
        })}
        {repo ? (
          <Box key="where" flexDirection="row" flexShrink={0} gap={1}>
            <Text bold>{shownRepo}</Text>
            {model ? <Text>{modelName(model)}</Text> : null}
            {effort ? <Text dimColor>{`· ${effort}`}</Text> : null}
          </Box>
        ) : null}
      </Box>
    )
  })
}
