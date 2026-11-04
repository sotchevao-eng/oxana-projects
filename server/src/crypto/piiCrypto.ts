/**
 * AES-256-GCM helpers for PII at rest.
 * Blob format: v1:<iv_b64>:<ciphertext_b64>:<tag_b64>
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const VERSION = 'v1'
const IV_LENGTH = 12
const KEY_LENGTH = 32

function loadKey(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY?.trim()
  if (!raw) {
    throw new Error('PII_ENCRYPTION_KEY is not configured')
  }

  let key: Buffer
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex')
  } else {
    key = Buffer.from(raw, 'base64')
  }

  if (key.length !== KEY_LENGTH) {
    throw new Error('PII_ENCRYPTION_KEY must decode to 32 bytes')
  }
  return key
}

export function encryptPii(plaintext: string | null | undefined): string | null {
  const value = String(plaintext ?? '').trim()
  if (!value) {
    return null
  }

  const key = loadKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return [
    VERSION,
    iv.toString('base64'),
    encrypted.toString('base64'),
    tag.toString('base64'),
  ].join(':')
}

export function decryptPii(blob: string | null | undefined): string | null {
  const raw = String(blob ?? '').trim()
  if (!raw) {
    return null
  }

  const parts = raw.split(':')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unsupported PII ciphertext format')
  }

  const [, ivB64, dataB64, tagB64] = parts
  const key = loadKey()
  const iv = Buffer.from(ivB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')

  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return decrypted.toString('utf8')
}
