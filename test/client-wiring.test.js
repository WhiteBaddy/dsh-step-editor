import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * Loads client.js in Node with a stubbed module loader and Cordis context.
 * The factory is not rendered (no DOM); this verifies the module format,
 * locale registration and slot registration only.
 */
async function loadClient() {
  let definition
  globalThis.window = {
    __ModuleLoader__: {
      load(candidate) { definition = candidate },
    },
  }
  await import('../client.js')
  assert.ok(definition, 'client module registered a loader definition')
  assert.equal(definition.id, 'dsh-step-editor')

  const React = {
    createElement: () => null,
    Fragment: Symbol('Fragment'),
    useState: () => [undefined, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
  }
  const ReactDOM = { createPortal: () => null }
  const factory = definition.factory
  const api = factory(name => (name === 'react' ? React : name === 'react-dom' ? ReactDOM : undefined))
  return api
}

test('client module registers the header action and dictionaries', async () => {
  const api = await loadClient()
  const captured = { locale: undefined, slot: undefined }
  const ctx = {
    effect(callback) { return callback() },
    locale: {
      register(namespace, dictionaries) {
        captured.locale = { namespace, dictionaries }
        return () => {}
      },
      bind: () => key => key,
    },
    slots: {
      inject(key, callback) { return callback() },
      register(options, component) {
        captured.slot = { options, component }
        return () => {}
      },
    },
    sessions: {},
    uiWorkspace: {},
  }
  assert.deepEqual(api.inject, ['slots', 'sessions', 'uiWorkspace', 'locale'])
  api.apply(ctx)
  assert.equal(captured.locale.namespace, 'dsh-step-editor')
  assert.equal(typeof captured.locale.dictionaries.zh['action.label'], 'string')
  assert.equal(typeof captured.locale.dictionaries.en['action.label'], 'string')
  assert.equal(captured.slot.options.name, 'conversation.session.header.actions')
  assert.equal(captured.slot.options.id, 'dsh-step-editor')
  assert.equal(captured.slot.options.locale, 'dsh-step-editor')
  assert.equal(typeof captured.slot.component, 'function')
})
