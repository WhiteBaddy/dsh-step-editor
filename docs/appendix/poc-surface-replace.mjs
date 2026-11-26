// Stage 0 PoC：验证「后缀截断」的核心假设
//
// 假设：
//   1. Session 可以追加一个带 surfaceOp.replace 的空 system/message；
//   2. 该事件不派生任何 wire 消息；
//   3. deriveMessages() 在被遮蔽范围之后不再包含被删的工具结果（图片）。
//
// 运行：node poc-surface-replace.mjs
// 依赖：安装版 DSH（默认 ~/.dsh，可用 DSH_HOME 覆盖），版本 0.2.2-rc.5 实测。

import { homedir } from 'node:os'
import { join } from 'node:path'

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const sessionModule = join(dshHome, 'node_modules/@deepseek-ai/dsh-session/lib/index.js')
const { Session } = await import(sessionModule)

const session = Session.create('session-poc')
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

// 第二步：读取图片，这一条 tool/result 就是"超限元凶"
session.append('step/start', { turn, step: 2 })
session.append('assistant/message', {
  turn, step: 2,
  message: {
    id: 'a2', role: 'assistant',
    content: [{ type: 'text', text: '读取图片' }],
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

const describe = (messages) => messages
  .map((message) => `${message.role}/${message.content?.[0]?.type ?? 'empty'}`)
  .join(' | ')

console.log('before :', describe(session.deriveMessages()))
console.log('nodes  :', session.surface.nodes.join(','))

// 后缀截断：从第二步的第一条消息一直到表末
const nodes = session.surface.nodes
const startSeq = nodes[2]
const endSeq = nodes.at(-1)
console.log('cut    :', startSeq, '..', endSeq)

session.append('system/message', {
  turn, step: 2,
  message: { id: 'tomb', role: 'system', content: [], source: { kind: 'system-prompt' } },
}, {
  surfaceOp: { op: 'replace', startSeq, endSeq },
  sourceEventSeqs: nodes.slice(2),
})

console.log('after  :', describe(session.deriveMessages()))
console.log('nodes  :', session.surface.nodes.join(','))
console.log('replaceGen:', session.surface.replaceGeneration)
