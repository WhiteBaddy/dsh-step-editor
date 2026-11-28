import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('declares rc.1–rc.5 compatibility and the bundle/client manifest', () => {
  assert.equal(pkg.engines.dsh, '>=0.2.2-rc.1 <0.3.0')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.dsh.client.immediately, true)
  assert.equal(pkg.exports['./client'], './client.js')
  assert.ok(pkg.license)
  assert.ok(pkg.repository?.url)
  assert.ok(pkg.files.includes('client.js'))
})
