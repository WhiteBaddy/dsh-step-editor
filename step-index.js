/**
 * Pure step-index fold and truncation planning for dsh-step-editor.
 *
 * No Cordis, no Session import: everything here is a plain function over
 * session events so it can be unit-tested without a running Harness and reused
 * by both the projection (read model) and the `truncate` command (write path).
 *
 * @module dsh-step-editor/step-index
 */

import { z as zod } from 'zod'

/** Projection key; also the client read-model key. */
export const STEP_EDITOR_KEY = 'stepEditor'

/** Bump when state fields or fold semantics change. */
export const STEP_EDITOR_STATE_VERSION = 1

const oneStep = zod.object({
  turn: zod.number().int().nonnegative(),
  step: zod.number().int().nonnegative(),
  /** Seq of the owning `turn/start`; branch boundary for the first step. */
  turnStartSeq: zod.number().int().nonnegative(),
  /** First non-system surface message seq; truncation start anchor. */
  firstSeq: zod.number().int().nonnegative().nullable(),
  /** Seq of `step/end`; branch boundary. */
  endSeq: zod.number().int().nonnegative().nullable(),
  messages: zod.number().int().nonnegative(),
  bytes: zod.number().int().nonnegative(),
  images: zod.number().int().nonnegative(),
  label: zod.string(),
  open: zod.boolean(),
}).strict()

/** Host state, plain JSON so the projection cache can checkpoint it. */
export const stepEditorStateSchema = zod.object({
  steps: zod.array(oneStep),
  /** Message seqs shadowed by any surface replacement. */
  shadowed: zod.array(zod.number().int().nonnegative()),
  turn: zod.number().int().nonnegative().nullable(),
  step: zod.number().int().nonnegative().nullable(),
  turnStartSeq: zod.number().int().nonnegative().nullable(),
}).strict()

const viewStep = oneStep.omit({ open: true }).extend({
  status: zod.enum(['closed', 'open', 'shadowed']),
  cumulativeBytes: zod.number().int().nonnegative(),
})

/** Client wire value: the whole step list at the current watermark. */
export const stepEditorViewSchema = zod.object({
  steps: zod.array(viewStep),
}).strict()

const MESSAGE_TYPES = new Set([
  'system/message',
  'developer/message',
  'user/message',
  'assistant/message',
  'tool/result',
])

const LABEL_MAX = 80

/** @param {unknown} value */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @param {any} event */
function isSurfaceMessage(event) {
  return MESSAGE_TYPES.has(event.type)
}

/** @param {any} event */
function isReplacement(event) {
  return isRecord(event.surfaceOp) && event.surfaceOp.op === 'replace'
}

/** @param {any} event */
function contentOf(event) {
  if (event.type === 'user/message') return event.data?.content
  return event.data?.message?.content
}

/** @param {any} event */
function coordinatesOf(event) {
  const data = event.data ?? {}
  if (typeof data.turn === 'number' && typeof data.step === 'number') {
    return { turn: data.turn, step: data.step }
  }
  return undefined
}

/** @param {string} text */
function clip(text) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= LABEL_MAX ? flat : `${flat.slice(0, LABEL_MAX - 1)}…`
}

/** @param {any} event @param {readonly any[] | undefined} content */
function labelOf(event, content) {
  if (!Array.isArray(content)) return ''
  if (event.type === 'user/message' || event.type === 'assistant/message') {
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
        return clip(block.text)
      }
    }
    for (const block of content) {
      if (block?.type === 'tool-call' && typeof block.name === 'string') return clip(`tool: ${block.name}`)
    }
  }
  if (event.type === 'tool/result') return 'tool result'
  if (event.type === 'system/message' || event.type === 'developer/message') return 'context'
  return ''
}

/** @param {readonly any[] | undefined} content */
function measure(content) {
  if (!Array.isArray(content)) return { bytes: 0, images: 0 }
  let images = 0
  for (const block of content) {
    if (block?.type === 'image') images += 1
  }
  return { bytes: JSON.stringify(content).length, images }
}

/** @param {{steps: any[]}} state @param {number} turn @param {number} step */
function findIndex(state, turn, step) {
  return state.steps.findIndex(entry => entry.turn === turn && entry.step === step)
}

/** @param {any} state @returns {any} */
export function initStepEditorState() {
  return { steps: [], shadowed: [], turn: null, step: null, turnStartSeq: null }
}

/** @param {any} state @param {any} event @returns {any} */
function applyShadowed(state, event) {
  const seqs = Array.isArray(event.sourceEventSeqs) ? event.sourceEventSeqs : []
  if (seqs.length === 0) return state
  const merged = new Set(state.shadowed)
  for (const seq of seqs) {
    if (typeof seq === 'number') merged.add(seq)
  }
  if (merged.size === state.shadowed.length) return state
  return { ...state, shadowed: [...merged] }
}

/** @param {any} state @param {any} event @param {number} turn @param {number} step @returns {any} */
function applyMessage(state, event, turn, step) {
  const index = findIndex(state, turn, step)
  if (index < 0) return state
  const content = contentOf(event)
  const { bytes, images } = measure(content)
  const previous = state.steps[index]
  const firstSeq = previous.firstSeq ?? (event.type === 'system/message' ? null : event.seq)
  const label = previous.label !== '' ? previous.label : labelOf(event, content)
  const steps = state.steps.slice()
  steps[index] = {
    ...previous,
    firstSeq,
    messages: previous.messages + 1,
    bytes: previous.bytes + bytes,
    images: previous.images + images,
    label,
  }
  return { ...state, steps }
}

/**
 * Pure transition. Unrelated events return the same state reference.
 * @param {any} state
 * @param {any} event
 * @returns {any}
 */
export function applyStepEditorState(state, event) {
  if (isSurfaceMessage(event) && isReplacement(event)) {
    return applyShadowed(state, event)
  }
  switch (event.type) {
    case 'turn/start':
      return { ...state, turn: event.data.turn, step: null, turnStartSeq: event.seq }
    case 'step/start': {
      if (findIndex(state, event.data.turn, event.data.step) >= 0) {
        return { ...state, turn: event.data.turn, step: event.data.step }
      }
      const entry = {
        turn: event.data.turn,
        step: event.data.step,
        turnStartSeq: state.turnStartSeq ?? event.seq,
        firstSeq: null,
        endSeq: null,
        messages: 0,
        bytes: 0,
        images: 0,
        label: '',
        open: true,
      }
      return { ...state, steps: [...state.steps, entry], turn: event.data.turn, step: event.data.step }
    }
    case 'step/end': {
      const index = findIndex(state, event.data.turn, event.data.step)
      if (index < 0) return state
      const steps = state.steps.slice()
      steps[index] = { ...steps[index], open: false, endSeq: event.seq }
      return { ...state, steps, step: null }
    }
    case 'turn/end':
      return { ...state, turn: null, step: null }
    case 'user/message': {
      if (state.turn === null || state.step === null) return state
      return applyMessage(state, event, state.turn, state.step)
    }
    case 'developer/message':
    case 'system/message':
    case 'assistant/message':
    case 'tool/result': {
      const coordinates = coordinatesOf(event)
      if (coordinates === undefined) return state
      return applyMessage(state, event, coordinates.turn, coordinates.step)
    }
    default:
      return state
  }
}

/**
 * Client wire value: status plus running cumulative bytes over non-shadowed steps.
 * @param {any} state
 * @returns {{steps: any[]}}
 */
export function viewStepEditorState(state) {
  const shadowed = new Set(state.shadowed)
  let cumulativeBytes = 0
  const steps = state.steps.map((entry) => {
    const isShadowed = entry.firstSeq !== null && shadowed.has(entry.firstSeq)
    if (!isShadowed) cumulativeBytes += entry.bytes
    return {
      turn: entry.turn,
      step: entry.step,
      turnStartSeq: entry.turnStartSeq,
      firstSeq: entry.firstSeq,
      endSeq: entry.endSeq,
      messages: entry.messages,
      bytes: entry.bytes,
      images: entry.images,
      label: entry.label,
      status: isShadowed ? 'shadowed' : entry.open ? 'open' : 'closed',
      cumulativeBytes,
    }
  })
  return { steps }
}

/** Projection definition registered on `ctx.sessionProjections`. */
export const stepEditorDefinition = {
  key: STEP_EDITOR_KEY,
  stateVersion: STEP_EDITOR_STATE_VERSION,
  stateSchema: stepEditorStateSchema,
  init: () => initStepEditorState(),
  apply: applyStepEditorState,
  wire: {
    viewSchema: stepEditorViewSchema,
    view: viewStepEditorState,
  },
}

/**
 * Plan a suffix truncation anchored at one step.
 * @param {any} state projection state
 * @param {readonly number[]} surfaceNodes current `session.surface.nodes`
 * @param {number} turn
 * @param {number} step
 * @param {string} [firstNodeType] event type of the first surface node, for the node-0 guard
 * @returns {{ok: true, startSeq: number, endSeq: number, shadowed: number[], entry: any} | {ok: false, code: string}}
 */
export function planTruncation(state, surfaceNodes, turn, step, firstNodeType) {
  const index = findIndex(state, turn, step)
  if (index < 0) return { ok: false, code: 'STEP_NOT_FOUND' }
  const entry = state.steps[index]
  const shadowed = new Set(state.shadowed)
  if (entry.firstSeq === null || shadowed.has(entry.firstSeq)) {
    return { ok: false, code: entry.firstSeq === null ? 'RANGE_INVALID' : 'STEP_SHADOWED' }
  }
  const position = surfaceNodes.indexOf(entry.firstSeq)
  if (position < 0) return { ok: false, code: 'STEP_SHADOWED' }
  if (position === 0 && firstNodeType === 'system/message') return { ok: false, code: 'SYSTEM_NODE' }
  const endSeq = surfaceNodes[surfaceNodes.length - 1]
  if (endSeq === undefined || endSeq < entry.firstSeq) return { ok: false, code: 'RANGE_INVALID' }
  return {
    ok: true,
    startSeq: surfaceNodes[position],
    endSeq,
    shadowed: surfaceNodes.slice(position),
    entry,
  }
}

/**
 * Append the surface-replacing tombstone that performs the truncation.
 * @param {{append: Function}} session
 * @param {{startSeq: number, endSeq: number, shadowed: number[]}} plan
 * @param {{turn: number, step: number, mode: 'visible'|'silent', now?: number}} options
 * @returns {any} the committed event
 */
export function appendTruncation(session, plan, options) {
  const { turn, step, mode } = options
  const stamp = `${plan.startSeq}-${(options.now ?? Date.now()).toString(36)}`
  const surfaceOp = { op: 'replace', startSeq: plan.startSeq, endSeq: plan.endSeq }
  const sourceEventSeqs = [...plan.shadowed]
  if (mode === 'silent') {
    return session.append('system/message', {
      turn,
      step,
      message: {
        id: `step-editor-truncate-${stamp}`,
        role: 'system',
        content: [],
        source: { kind: 'system-prompt' },
      },
    }, { surfaceOp, sourceEventSeqs })
  }
  return session.append('user/message', {
    id: `step-editor-truncate-${stamp}`,
    role: 'user',
    content: [{
      type: 'text',
      text: `[已移除第 ${turn} 轮第 ${step} 步起的 ${plan.shadowed.length} 条消息]`,
    }],
    source: { kind: 'step-editor-truncate' },
  }, { surfaceOp, sourceEventSeqs })
}

/** @param {number} bytes */
export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Parse `/truncate` input.
 * @param {string} rawInput
 * @returns {{kind: 'usage'} | {kind: 'error', text: string} | {kind: 'dry', turn?: number, step?: number} | {kind: 'run', turn: number, step: number, silent: boolean}}
 */
export function parseTruncateArgs(rawInput) {
  const tokens = rawInput.trim().split(/\s+/).filter(Boolean)
  const numbers = []
  let dry = false
  let silent = false
  for (const token of tokens) {
    if (token === '--dry') { dry = true; continue }
    if (token === '--silent') { silent = true; continue }
    if (token === '--help' || token === '-h') return { kind: 'usage' }
    if (/^\d+$/.test(token)) { numbers.push(Number(token)); continue }
    return { kind: 'error', text: `无法识别的参数：${token}` }
  }
  if (numbers.length > 2) return { kind: 'error', text: '最多提供「轮次」和「步骤」两个数字参数。' }
  if (dry) {
    if (numbers.length === 2) return { kind: 'dry', turn: numbers[0], step: numbers[1] }
    if (numbers.length === 0) return { kind: 'dry' }
    return { kind: 'error', text: '--dry 不带参数时列出全部步骤；带参数时需同时给出轮次和步骤。' }
  }
  if (numbers.length !== 2) return { kind: 'usage' }
  return { kind: 'run', turn: numbers[0], step: numbers[1], silent }
}

/** @param {any} view @param {number} [limit] */
export function renderDryRun(view, limit = 12) {
  const steps = view.steps
  if (steps.length === 0) return '还没有可截断的步骤。'
  const start = Math.max(0, steps.length - limit)
  const lines = steps.slice(start).map((entry) => {
    const state = entry.status === 'shadowed' ? '已移除' : entry.status === 'open' ? '运行中' : '可截断'
    return `第 ${entry.turn} 轮 · 第 ${entry.step} 步  ${entry.label || '（无摘要）'}  ${formatBytes(entry.bytes)} · ${entry.images} 图  [${state}]`
  })
  if (start > 0) lines.unshift(`… 省略前 ${start} 步`)
  lines.push('执行：/truncate <轮次> <步骤>')
  return lines.join('\n')
}
