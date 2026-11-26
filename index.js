/**
 * dsh-step-editor: step-level context truncation and branching.
 *
 * Read side: the `stepEditor` session projection folds the log into per-step
 * coordinates, byte/image counts and shadow status. Write side: the `truncate`
 * user command appends one surface-replacing tombstone from a chosen step to
 * the end of the session. Both share `step-index.js`, so the panel (client)
 * and the slash command cannot drift apart.
 *
 * @module @local/dsh-step-editor
 */

import z from '@deepseek-ai/schemastery'
import {
  appendTruncation,
  formatBytes,
  parseTruncateArgs,
  planTruncation,
  renderDryRun,
  stepEditorDefinition,
  viewStepEditorState,
} from './step-index.js'

export const name = 'dsh-step-editor'

export const inject = ['sessionProjections']

/** Runtime configuration; the DSH settings page renders this schema. */
export const Config = z.object({
  /** What the model sees where the removed range used to be. */
  tombstone: z.union(['visible', 'silent']).default('visible'),
})

const USAGE = '用法：/truncate --dry | /truncate <轮次> <步骤> [--silent]'

/** @param {string} code */
function errorText(code) {
  switch (code) {
    case 'STEP_NOT_FOUND':
      return 'STEP_NOT_FOUND：找不到该步骤，请用 /truncate --dry 查看。'
    case 'STEP_SHADOWED':
      return 'STEP_SHADOWED：该步骤已不在当前上下文（已被截断或压缩），无需再删。'
    case 'RANGE_INVALID':
      return 'RANGE_INVALID：该步骤没有可移除的消息范围。'
    case 'SYSTEM_NODE':
      return 'SYSTEM_NODE：不能移除系统提示词节点。'
    default:
      return `${code}：无法执行截断。`
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{tombstone?: 'visible'|'silent'}} config
 */
export function apply(ctx, config) {
  const ready = ctx.sessionProjections.register(stepEditorDefinition)
  ready.catch((error) => {
    ctx.logger.warn('dsh-step-editor: projection registration failed: %o', error)
  })

  ctx.inject(['commands'], (commandCtx) => {
    commandCtx.commands.register({
      definitionId: 'dsh-step-editor',
      name: 'truncate',
      description: 'Truncate model context from a step to the end of the session',
      input: { hint: '[--dry] [<turn> <step>] [--silent]' },
      handler: async ({ agent, rawInput }) => {
        const handle = await ready
        const parsed = parseTruncateArgs(rawInput)
        if (parsed.kind === 'usage') return { kind: 'error', text: USAGE }
        if (parsed.kind === 'error') return { kind: 'error', text: parsed.text }

        const state = handle.stateOf(agent.session)
        const nodes = agent.session.surface.nodes
        const firstNodeType = agent.session.snapshotEvents()
          .find(event => event.seq === nodes[0])?.type
        if (parsed.kind === 'dry') {
          if (parsed.turn === undefined) {
            return { kind: 'success', text: renderDryRun(viewStepEditorState(state)) }
          }
          const plan = planTruncation(state, nodes, parsed.turn, parsed.step, firstNodeType)
          if (!plan.ok) return { kind: 'error', text: errorText(plan.code) }
          return {
            kind: 'success',
            text: `将从第 ${parsed.turn} 轮第 ${parsed.step} 步起移除 ${plan.shadowed.length} 条消息`
              + `（${formatBytes(plan.entry.bytes)} / ${plan.entry.images} 图）；未写入任何内容。`,
          }
        }

        if (agent.status !== 'idle') {
          return { kind: 'error', text: 'NOT_IDLE：当前轮次仍在运行，请先停止再截断。' }
        }
        const plan = planTruncation(state, nodes, parsed.turn, parsed.step, firstNodeType)
        if (!plan.ok) return { kind: 'error', text: errorText(plan.code) }
        const mode = parsed.silent ? 'silent' : (config?.tombstone === 'silent' ? 'silent' : 'visible')
        try {
          appendTruncation(agent.session, plan, { turn: parsed.turn, step: parsed.step, mode })
        } catch (error) {
          ctx.logger.warn('dsh-step-editor: truncate append failed: %o', error)
          const message = error instanceof Error ? error.message : String(error)
          return { kind: 'error', text: `APPEND_FAILED：写入替换事件失败（${message}）。` }
        }
        return {
          kind: 'success',
          text: `已移除第 ${parsed.turn} 轮第 ${parsed.step} 步起的 ${plan.shadowed.length} 条消息`
            + `（${formatBytes(plan.entry.bytes)}），模式 ${mode}。下一轮请求将不再包含它们。`,
        }
      },
    })
  })
}
