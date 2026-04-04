// AES-256-GCM encrypt/decrypt helpers for storing PII (Aadhaar, PAN, bank details) at rest

import crypto from 'crypto'

const ALGORITHM  = 'aes-256-gcm'
const IV_LENGTH  = 12   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16   // 128-bit auth tag

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) throw new Error('ENCRYPTION_KEY env var is not set')
  // TODO: validate that the key is exactly 32 bytes (64 hex chars) and decode it
  return Buffer.from(raw, 'hex')
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Output format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encrypt(text: string): string {
  const key = getKey()
  // TODO: generate a random IV, create cipher, encrypt text, extract auth tag
  // TODO: return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
  void key
  throw new Error('encrypt: not implemented')
}

/**
 * Decrypts a ciphertext produced by encrypt().
 * Expects format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function decrypt(cipher: string): string {
  const key = getKey()
  // TODO: split cipher into [iv, authTag, ciphertext]
  // TODO: create decipher, set auth tag, decrypt and return utf8 string
  void key
  void cipher
  throw new Error('decrypt: not implemented')
}

/**
 * Returns a stable, one-way SHA-256 hash of text for duplicate lookups.
 * Never store the hash alongside the plaintext — use a separate column.
 */
export function hashForLookup(text: string): string {
  // TODO: normalise text (trim, lowercase) before hashing to ensure consistency
  return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex')
}
