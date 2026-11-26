import test from 'node:test'
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  STEP_EDITOR_KEY,
  applyStepEditorState,
  appendTruncation,
  initStepEditorState,
  parseTruncateArgs,
  planTruncation,
  renderDryRun,
  stepEditorStateSchema,
  viewStepEditorState,
} from '../step-index.js'

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const sessionModule = pathToFileURL(
  join(dshHome, 'node_modules/@deepseek-ai/dsh-session/lib/index.js'),
).href
const { Session } = await import(sessionModule)

/** Build the two-step read-image session used by most cases. */
function buildSession(id) {
  const session = Session.create(id)
  const turn = 1
  session.append('turn/start', { turn })
  session.append('step/start', { turn, step: 1 })
  session.append('user/message', {
    id: 'u1', role: 'user',
    content: [{ type: 'text', text: '请读这几张图' }],
    source: { kind: 'user' },
  }, { surfaceOp: 'append' })
  session.append('assistant/message', {
    turn, step: 1,
    message: {
      id: 'a1', role: 'assistant',
      content: [{ type: 'text', text: '好的' }],
      source: { kind: 'model', provider: 'p', model: 'm' },
    },
    stream: [],
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn, step: 1 })
  session.append('step/start', { turn, step: 2 })
  session.append('assistant/message', {
    turn, step: 2,
    message: {
      id: 'a2', role: 'assistant',
      content: [{ type: 'tool-call', id: 'c1', name: 'read', arguments: {} }],
      source: { kind: 'model', provider: 'p', model: 'm' },
    },
    stream: [],
  }, { surfaceOp: 'append' })
  session.append('tool/result', {
    turn, step: 2,
    message: {
      id: 'tr1', role: 'tool', toolCallId: 'c1',
      content: [{ type: 'image', attachment: { kind: 'inline', mimeType: 'image/png', data: 'AAAA' } }],
      source: { kind: 'tool', callId: 'c1' },
    },
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn, step: 2 })
  return session
}

function fold(sessionOrEvents) {
  const events = Array.isArray(sessionOrEvents) ? sessionOrEvents : sessionOrEvents.snapshotEvents()
  let state = initStepEditorState()
  for (const event of events) state = applyStepEditorState(state, event)
  return state
}

test('folds turn/step coordinates, bytes, images and labels', () => {
  const session = buildSession('session-fold')
  const state = fold(session)
  assert.equal(stepEditorStateSchema.safeParse(state).success, true)
  assert.equal(state.steps.length, 2)
  assert.deepEqual(
    state.steps.map(step => [step.turn, step.step, step.firstSeq, step.endSeq, step.images]),
    [[1, 1, 2, 4, 0], [1, 2, 6, 8, 1]],
  )
  assert.equal(state.steps[0].label, '请读这几张图')
  assert.equal(state.steps[1].label, 'tool: read')
  assert.ok(state.steps[1].bytes > 0)
  const view = viewStepEditorState(state)
  stepEditorViewSchemaCheck(view)
  assert.deepEqual(view.steps.map(step => step.status), ['closed', 'closed'])
  assert.equal(view.steps[1].cumulativeBytes, view.steps[0].bytes + view.steps[1].bytes)
})

test('irrelevant events keep the same state reference', () => {
  const state = fold(buildSession('session-ref'))
  const same = applyStepEditorState(state, { type: 'request/header', seq: 99, time: 0, data: {} })
  assert.equal(same, state)
  const sameTurn = applyStepEditorState(state, { type: 'turn/start', seq: 100, time: 0, data: { turn: 2 } })
  assert.notEqual(sameTurn, state)
})

test('replacement shadowing marks the step and drops it from cumulative bytes', () => {
  const session = buildSession('session-shadow')
  const state = fold(session)
  const nodes = session.surface.nodes
  const plan = planTruncation(state, nodes, 1, 2)
  assert.equal(plan.ok, true)
  appendTruncation(session, plan, { turn: 1, step: 2, mode: 'visible', now: 1 })
  const after = fold(session)
  assert.deepEqual([...after.shadowed].sort((a, b) => a - b), [6, 7])
  const view = viewStepEditorState(after)
  assert.equal(view.steps[1].status, 'shadowed')
  assert.equal(view.steps[1].cumulativeBytes, view.steps[0].bytes)
})

test('visible truncation removes the range from derived history', () => {
  const session = buildSession('session-visible')
  const state = fold(session)
  const plan = planTruncation(state, session.surface.nodes, 1, 2)
  const event = appendTruncation(session, plan, { turn: 1, step: 2, mode: 'visible', now: 2 })
  assert.equal(event.type, 'user/message')
  const messages = session.deriveMessages()
  assert.deepEqual(messages.map(message => message.role), ['user', 'assistant', 'user'])
  assert.match(messages[2].content[0].text, /已移除第 1 轮第 2 步/)
  assert.equal(session.surface.nodes.length, 3)
})

test('silent truncation leaves no extra wire message', () => {
  const session = buildSession('session-silent')
  const state = fold(session)
  const plan = planTruncation(state, session.surface.nodes, 1, 2)
  const event = appendTruncation(session, plan, { turn: 1, step: 2, mode: 'silent', now: 3 })
  assert.equal(event.type, 'system/message')
  const messages = session.deriveMessages()
  assert.deepEqual(messages.map(message => message.role), ['user', 'assistant'])
  assert.equal(session.surface.nodes.length, 3)
})

test('errors: missing step and already shadowed', () => {
  const session = buildSession('session-errors')
  const state = fold(session)
  assert.deepEqual(planTruncation(state, session.surface.nodes, 9, 9), { ok: false, code: 'STEP_NOT_FOUND' })
  const plan = planTruncation(state, session.surface.nodes, 1, 2)
  appendTruncation(session, plan, { turn: 1, step: 2, mode: 'visible', now: 4 })
  const after = fold(session)
  assert.deepEqual(planTruncation(after, session.surface.nodes, 1, 2), { ok: false, code: 'STEP_SHADOWED' })
})

test('parses command input', () => {
  assert.deepEqual(parseTruncateArgs(''), { kind: 'usage' })
  assert.deepEqual(parseTruncateArgs('--dry'), { kind: 'dry' })
  assert.deepEqual(parseTruncateArgs('--dry 3 4'), { kind: 'dry', turn: 3, step: 4 })
  assert.deepEqual(parseTruncateArgs('3 4'), { kind: 'run', turn: 3, step: 4, silent: false })
  assert.deepEqual(parseTruncateArgs('3 4 --silent'), { kind: 'run', turn: 3, step: 4, silent: true })
  assert.equal(parseTruncateArgs('3').kind, 'usage')
  assert.equal(parseTruncateArgs('x').kind, 'error')
})

test('dry-run rendering includes the step coordinates', () => {
  const view = viewStepEditorState(fold(buildSession('session-dry')))
  const text = renderDryRun(view)
  assert.match(text, /第 1 轮 · 第 1 步/)
  assert.match(text, /第 1 轮 · 第 2 步/)
})

test('1000-step fold stays under the performance budget', () => {
  const events = []
  let seq = 0
  const push = (type, data, surfaceOp) => {
    events.push({ type, seq: seq++, time: 0, data, ...(surfaceOp ? { surfaceOp } : {}) })
  }
  for (let index = 0; index < 1000; index += 1) {
    const turn = Math.floor(index / 20) + 1
    const step = (index % 20) + 1
    if (step === 1) push('turn/start', { turn })
    push('step/start', { turn, step })
    push('user/message', { id: `u${index}`, role: 'user', content: [{ type: 'text', text: 'prompt' }], source: { kind: 'user' } }, 'append')
    push('assistant/message', {
      turn, step,
      message: { id: `a${index}`, role: 'assistant', content: [{ type: 'text', text: 'reply' }], source: { kind: 'model', provider: 'p', model: 'm' } },
      stream: [],
    }, 'append')
    push('step/end', { turn, step })
    if (step === 20) push('turn/end', { turn, reason: { kind: 'complete' } })
  }
  const started = performance.now()
  const state = fold(events)
  const elapsed = performance.now() - started
  assert.equal(state.steps.length, 1000)
  assert.ok(elapsed < 100, `fold took ${elapsed.toFixed(1)} ms`)
})

function stepEditorViewSchemaCheck(view) {
  assert.equal(Array.isArray(view.steps), true)
  assert.equal(typeof view.steps[0].cumulativeBytes, 'number')
}

// Keep the projection key import honest.
test('projection key is stepEditor', () => {
  assert.equal(STEP_EDITOR_KEY, 'stepEditor')
})
