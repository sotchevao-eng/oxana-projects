import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveListenOptions } from './listen.js'

test('production listen uses PORT and binds all interfaces by default', () => {
  const options = resolveListenOptions({ PORT: '8080' } as NodeJS.ProcessEnv)
  assert.equal(options.port, 8080)
  assert.equal(options.hostname, '0.0.0.0')
})

test('invalid PORT falls back to 8787', () => {
  const options = resolveListenOptions({ PORT: 'not-a-port' } as NodeJS.ProcessEnv)
  assert.equal(options.port, 8787)
})

test('HOST can override the bind address', () => {
  const options = resolveListenOptions({
    PORT: '3000',
    HOST: '127.0.0.1',
  } as NodeJS.ProcessEnv)
  assert.equal(options.hostname, '127.0.0.1')
})
