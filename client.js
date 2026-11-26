/**
 * Client half of dsh-step-editor.
 *
 * Registers one session-header action that opens a step panel. The panel reads
 * the Host `stepEditor` projection, invokes the `truncate` command through the
 * session command bridge, and forks through `ctx.sessions.fork`. No shipped
 * Client package is imported and no DOM is written outside React.
 */
const CSS = `
.dse-action{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer}
.dse-action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dse-action:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dse-action-label{white-space:nowrap}
.dse-backdrop{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);background:color-mix(in srgb,var(--dsw-alias-label-primary) 35%,transparent);padding:16px}
.dse-panel{display:flex;flex-direction:column;width:min(760px,96vw);max-height:84vh;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 24px 64px rgba(0,0,0,.28);overflow:hidden;font:inherit}
.dse-head{display:flex;align-items:flex-start;gap:12px;padding:16px 16px 12px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dse-title{font-size:14px;font-weight:600;line-height:22px}
.dse-sub{margin-top:4px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;max-width:620px}
.dse-close{margin-left:auto;flex:none;width:28px;height:28px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:18px;line-height:1;cursor:pointer}
.dse-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dse-banner{margin:12px 16px 0;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-turn-trigger-bg);color:var(--dsw-alias-state-warn-primary);font-size:12px;line-height:18px}
.dse-error{margin:12px 16px 0;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-turn-trigger-bg);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.dse-list{overflow:auto;padding:8px 8px 12px}
.dse-row{display:grid;grid-template-columns:minmax(0,1fr) 120px 64px 148px;align-items:center;gap:12px;padding:8px 10px;border-radius:8px}
.dse-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dse-row-off{opacity:.55}
.dse-meta{min-width:0}
.dse-coord{font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary)}
.dse-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dse-size{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dse-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.dse-actions{display:flex;gap:6px;justify-content:flex-end}
.dse-btn{height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1;cursor:pointer;white-space:nowrap}
.dse-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dse-btn:disabled{opacity:.45;cursor:default}
.dse-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.dse-btn-primary{border-color:var(--dsw-alias-button-info-fill);background:var(--dsw-alias-button-info-fill);color:var(--dsw-alias-label-on-color)}
.dse-btn-danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}
.dse-empty{padding:40px 16px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dse-confirm{padding:20px 20px 16px}
.dse-confirm-title{font-size:14px;font-weight:600;line-height:22px}
.dse-confirm-body{margin-top:10px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.dse-confirm-warn{margin-top:10px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-warn-primary)}
.dse-confirm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
`

window.__ModuleLoader__.load({
  id: 'dsh-step-editor',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')
    const h = React.createElement
    const { useEffect, useRef, useState } = React

    const NS = 'dsh-step-editor'

    const zh = {
      'action.label': '步骤',
      'action.tooltip': '按步骤查看并截断上下文',
      'panel.title': '步骤 / 上下文',
      'panel.empty': '还没有可操作的步骤。',
      'panel.hint': '截断只改变模型可见的上下文；日志与聊天记录保留，且不可撤销。',
      'panel.close': '关闭',
      'panel.running': '当前轮仍在运行；停止后才能截断或分支。',
      'row.turn': '第 {turn} 轮',
      'row.step': '第 {step} 步',
      'row.shadowed': '已移除',
      'row.open': '运行中',
      'row.truncate': '截断',
      'row.branch': '分支',
      'confirm.truncateTitle': '确认截断',
      'confirm.truncateBody': '将从第 {turn} 轮第 {step} 步起移除 {messages} 条消息（{bytes}，{images} 张图片）。',
      'confirm.warn': '不可撤销。原消息仍保留在日志与聊天记录中，只是不再进入模型请求。',
      'confirm.cancel': '取消',
      'confirm.ok': '确认截断',
      'confirm.branchTitle': '从这一步之前分支',
      'confirm.branchBody': '将在第 {turn} 轮第 {step} 步之前创建一个新会话；父会话保持不变。',
      'confirm.branchOk': '创建分支',
      'error.noSession': '会话不可用。',
      'error.noBoundary': '该步骤没有可用的分支边界。',
      'error.notApplied': '截断没有生效，请查看对话里的命令记录。',
      'error.generic': '操作失败：{message}',
    }

    const en = {
      'action.label': 'Steps',
      'action.tooltip': 'Inspect and truncate context by step',
      'panel.title': 'Steps / context',
      'panel.empty': 'No steps to act on yet.',
      'panel.hint': 'Truncation changes only the model-visible context; the log and transcript keep the original messages, and it cannot be undone.',
      'panel.close': 'Close',
      'panel.running': 'The current turn is still running; stop it before truncating or branching.',
      'row.turn': 'Turn {turn}',
      'row.step': 'Step {step}',
      'row.shadowed': 'Removed',
      'row.open': 'Running',
      'row.truncate': 'Truncate',
      'row.branch': 'Branch',
      'confirm.truncateTitle': 'Confirm truncation',
      'confirm.truncateBody': 'Remove {messages} messages from turn {turn} step {step} onward ({bytes}, {images} images).',
      'confirm.warn': 'This cannot be undone. The original messages stay in the log and transcript; they only stop entering model requests.',
      'confirm.cancel': 'Cancel',
      'confirm.ok': 'Truncate',
      'confirm.branchTitle': 'Branch before this step',
      'confirm.branchBody': 'Create a new session before turn {turn} step {step}; the parent session is unchanged.',
      'confirm.branchOk': 'Create branch',
      'error.noSession': 'Session is unavailable.',
      'error.noBoundary': 'This step has no usable branch boundary.',
      'error.notApplied': 'Truncation did not take effect; check the command record in the conversation.',
      'error.generic': 'Operation failed: {message}',
    }

    function formatBytes(bytes) {
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    function statusLabel(status, t) {
      if (status === 'shadowed') return t('row.shadowed')
      if (status === 'open') return t('row.open')
      return ''
    }

    async function waitForShadowed(binding, entry) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const value = binding.session.projections.faceOf('stepEditor').getSnapshot()
        const current = value?.steps?.find(step => step.turn === entry.turn && step.step === entry.step)
        if (current?.status === 'shadowed') return true
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      return false
    }

    function StepIcon() {
      return h('svg', {
        width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': true,
        style: { display: 'block' },
      },
      h('path', {
        d: 'M2 12.5h3v-3h3v-3h3v-3',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round',
      }),
      h('path', {
        d: 'M9 2.5l4.5 4.5',
        stroke: 'var(--dsw-alias-state-error-primary)', strokeWidth: 1.2, strokeDasharray: '2 2', strokeLinecap: 'round',
      }))
    }

    function StepEditorAction(props) {
      const { sessionId, t, ctx } = props
      const [open, setOpen] = useState(false)
      const view = props.useProjection ? props.useProjection('stepEditor') : undefined
      const canFork = props.useAccess ? props.useAccess('session/fork') : false
      return h(React.Fragment, null,
        h('style', null, CSS),
        h('button', {
          type: 'button',
          className: 'dse-action',
          title: t('action.tooltip'),
          'aria-label': t('action.label'),
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          onClick: () => setOpen(true),
        }, h(StepIcon), h('span', { className: 'dse-action-label' }, t('action.label'))),
        open && createPortal(
          h(StepEditorPanel, {
            sessionId, view, t, ctx, canFork,
            onClose: () => setOpen(false),
          }),
          document.body,
        ),
      )
    }

    function StepEditorPanel({ sessionId, view, t, ctx, canFork, onClose }) {
      const steps = view?.steps ?? []
      const [selected, setSelected] = useState(null)
      const [mode, setMode] = useState('truncate')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(null)
      const listRef = useRef(null)
      const running = steps.some(step => step.status === 'open')

      useEffect(() => {
        const node = listRef.current
        if (node) node.scrollTop = node.scrollHeight
      }, [])

      useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onClose])

      function choose(index, nextMode) {
        setSelected(index)
        setMode(nextMode)
        setError(null)
      }

      async function truncate(entry) {
        const binding = ctx.sessions.binding(sessionId)
        if (!binding) { setError(t('error.noSession')); return }
        setBusy(true)
        setError(null)
        try {
          const result = await binding.session.command(`/truncate ${entry.turn} ${entry.step}`)
          if (result && result.ok === false) {
            setError(t('error.generic', { message: result.error?.message ?? '' }))
            return
          }
          if (!await waitForShadowed(binding, entry)) {
            setError(t('error.notApplied'))
            return
          }
          onClose()
        } catch (failure) {
          setError(t('error.generic', { message: failure?.message ?? String(failure) }))
        } finally {
          setBusy(false)
        }
      }

      async function branch(entry, index) {
        const boundary = index === 0 ? entry.firstSeq : steps[index - 1]?.endSeq
        if (boundary === null || boundary === undefined) {
          setError(t('error.noBoundary'))
          return
        }
        setBusy(true)
        setError(null)
        try {
          const childId = await ctx.sessions.fork({ sessionId, atSeq: boundary, increaseTitle: true })
          ctx.uiWorkspace.openSession(childId)
          onClose()
        } catch (failure) {
          setError(t('error.generic', { message: failure?.message ?? String(failure) }))
        } finally {
          setBusy(false)
        }
      }

      function renderConfirm() {
        const entry = steps[selected]
        if (!entry) return null
        if (mode === 'branch') {
          return h('div', { className: 'dse-confirm' },
            h('div', { className: 'dse-confirm-title' }, t('confirm.branchTitle')),
            h('div', { className: 'dse-confirm-body' }, t('confirm.branchBody', { turn: entry.turn, step: entry.step })),
            error && h('div', { className: 'dse-error' }, error),
            h('div', { className: 'dse-confirm-actions' },
              h('button', { type: 'button', className: 'dse-btn', disabled: busy, onClick: () => { setSelected(null); setError(null) } }, t('confirm.cancel')),
              h('button', { type: 'button', className: 'dse-btn dse-btn-primary', disabled: busy, onClick: () => branch(entry, selected) }, t('confirm.branchOk')),
            ),
          )
        }
        const removed = steps.slice(selected).filter(step => step.status !== 'shadowed')
        const messages = removed.reduce((total, step) => total + step.messages, 0)
        const bytes = removed.reduce((total, step) => total + step.bytes, 0)
        const images = removed.reduce((total, step) => total + step.images, 0)
        return h('div', { className: 'dse-confirm' },
          h('div', { className: 'dse-confirm-title' }, t('confirm.truncateTitle')),
          h('div', { className: 'dse-confirm-body' }, t('confirm.truncateBody', {
            turn: entry.turn, step: entry.step, messages, bytes: formatBytes(bytes), images,
          })),
          h('div', { className: 'dse-confirm-warn' }, t('confirm.warn')),
          error && h('div', { className: 'dse-error' }, error),
          h('div', { className: 'dse-confirm-actions' },
            h('button', { type: 'button', className: 'dse-btn', disabled: busy, onClick: () => { setSelected(null); setError(null) } }, t('confirm.cancel')),
            h('button', { type: 'button', className: 'dse-btn dse-btn-danger', disabled: busy, onClick: () => truncate(entry) }, t('confirm.ok')),
          ),
        )
      }

      function renderList() {
        if (steps.length === 0) return h('div', { className: 'dse-empty' }, t('panel.empty'))
        return h('div', { className: 'dse-list', ref: listRef },
          steps.map((entry, index) => h('div', {
            key: `${entry.turn}:${entry.step}`,
            className: `dse-row${entry.status === 'shadowed' ? ' dse-row-off' : ''}`,
          },
          h('div', { className: 'dse-meta' },
            h('div', { className: 'dse-coord' }, `${t('row.turn', { turn: entry.turn })} · ${t('row.step', { step: entry.step })}`),
            h('div', { className: 'dse-label' }, entry.label || '—')),
          h('div', { className: 'dse-size' }, `${formatBytes(entry.bytes)} · ${entry.images} 图`),
          h('div', { className: 'dse-status' }, statusLabel(entry.status, t)),
          h('div', { className: 'dse-actions' },
            h('button', {
              type: 'button',
              className: 'dse-btn',
              disabled: busy || running || entry.status !== 'closed' || entry.firstSeq === null,
              onClick: () => choose(index, 'truncate'),
            }, t('row.truncate')),
            h('button', {
              type: 'button',
              className: 'dse-btn',
              disabled: busy || running || !canFork || entry.status !== 'closed',
              onClick: () => choose(index, 'branch'),
            }, t('row.branch')),
          )),
        ))
      }

      return h('div', { className: 'dse-backdrop', onMouseDown: (event) => { if (event.target === event.currentTarget) onClose() } },
        h('div', { className: 'dse-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('panel.title') },
          h('div', { className: 'dse-head' },
            h('div', null,
              h('div', { className: 'dse-title' }, t('panel.title')),
              h('div', { className: 'dse-sub' }, t('panel.hint'))),
            h('button', { type: 'button', className: 'dse-close', autoFocus: true, onClick: onClose, 'aria-label': t('panel.close') }, '×')),
          running && h('div', { className: 'dse-banner' }, t('panel.running')),
          selected === null ? renderList() : renderConfirm(),
        ),
      )
    }

    return {
      inject: ['slots', 'sessions', 'uiWorkspace', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-step-editor: dictionaries')
        ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
          name: 'conversation.session.header.actions',
          id: 'dsh-step-editor',
          order: 35,
          locale: NS,
        }, props => h(StepEditorAction, { ...props, ctx })))
      },
    }
  },
})
