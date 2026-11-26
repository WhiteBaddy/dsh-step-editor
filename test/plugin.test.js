import test from 'node:test'
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { apply } from '../index.js'
import { applyStepEditorState, initStepEditorState } from '../step-index.js'

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const { Session } = await import(pathToFileURL(
  join(dshHome, 'node_modules/@deepseek-ai/dsh-session/lib/index.js'),
).href)

function foldSession(session) {
  let state = initStepEditorState()
  for (const event of session.snapshotEvents()) state = applyStepEditorState(state, event)
  return state
}

/** Minimal Cordis stand-in that captures the registrations. */
function activate(config) {
  const captured = {}
  const ctx = {
    logger: { warn: () => {} },
    sessionProjections: {
      register: async (definition) => {
        captured.projection = definition
        return { stateOf: (session) => foldSession(session) }
      },
    },
    inject: (_services, callback) => {
      callback({ commands: { register: (definition) => { captured.command = definition } } })
    },
  }
  apply(ctx, config)
  return captured
}

function buildSession(id) {
  const session = Session.create(id)
  const turn = 1
  session.append('turn/start', { turn })
  session.append('step/start', { turn, step: 1 })
  session.append('user/message', {
    id: 'u1', role: 'user', content: [{ type: 'text', text: '读图' }], source: { kind: 'user' },
  }, { surfaceOp: 'append' })
  session.append('assistant/message', {
    turn, step: 1,
    message: {
      id: 'a1', role: 'assistant',
      content: [{ type: 'tool-call', id: 'c1', name: 'read', arguments: {} }],
      source: { kind: 'model', provider: 'p', model: 'm' },
    },
    stream: [],
  }, { surfaceOp: 'append' })
  session.append('tool/result', {
    turn, step: 1,
    message: {
      id: 'tr1', role: 'tool', toolCallId: 'c1',
      content: [{ type: 'image', attachment: { kind: 'inline', mimeType: 'image/png', data: 'AAAA' } }],
      source: { kind: 'tool', callId: 'c1' },
    },
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn, step: 1 })
  return session
}

test('registers the stepEditor projection and the truncate command', async () => {
  const captured = activate({ tombstone: 'visible' })
  assert.equal(captured.projection.key, 'stepEditor')
  assert.equal(captured.command.name, 'truncate')
  await Promise.resolve()
})

test('command rejects while the agent is running', async () => {
  const captured = activate({ tombstone: 'visible' })
  const session = buildSession('session-running')
  const result = await captured.command.handler({
    agent: { status: 'running', session },
    rawInput: '1 1',
  })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /NOT_IDLE/)
  assert.equal(session.deriveMessages().length, 3)
})

test('dry run reports the range without writing', async () => {
  const captured = activate({ tombstone: 'visible' })
  const session = buildSession('session-dry-run')
  const before = session.snapshotEvents().length
  const result = await captured.command.handler({
    agent: { status: 'idle', session },
    rawInput: '--dry 1 1',
  })
  assert.equal(result.kind, 'success')
  assert.match(result.text, /第 1 轮第 1 步/)
  assert.equal(session.snapshotEvents().length, before)
})

test('executes a visible truncation and a silent truncation', async () => {
  const visible = activate({ tombstone: 'visible' })
  const sessionA = buildSession('session-run-visible')
  const result = await visible.command.handler({ agent: { status: 'idle', session: sessionA }, rawInput: '1 1' })
  assert.equal(result.kind, 'success')
  assert.match(result.text, /已移除第 1 轮第 1 步/)
  const messagesA = sessionA.deriveMessages()
  assert.equal(messagesA[messagesA.length - 1].role, 'user')

  const silent = activate({ tombstone: 'silent' })
  const sessionB = buildSession('session-run-silent')
  await silent.command.handler({ agent: { status: 'idle', session: sessionB }, rawInput: '1 1' })
  const messagesB = sessionB.deriveMessages()
  assert.equal(messagesB.length, 0)
})

test('command usage and unknown step errors', async () => {
  const captured = activate({ tombstone: 'visible' })
  const session = buildSession('session-usage')
  const usage = await captured.command.handler({ agent: { status: 'idle', session }, rawInput: '' })
  assert.equal(usage.kind, 'error')
  assert.match(usage.text, /用法/)
  const missing = await captured.command.handler({ agent: { status: 'idle', session }, rawInput: '9 9' })
  assert.equal(missing.kind, 'error')
  assert.match(missing.text, /STEP_NOT_FOUND/)
})
