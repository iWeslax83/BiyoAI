import { describe, it, expect, beforeEach } from 'vitest'
import { hashPassword, verifyPassword, createSessionCookie, isValidSession } from '../../lib/auth'

describe('auth', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-secret'
  })

  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('gizli-sifre')
    expect(await verifyPassword('gizli-sifre', hash)).toBe(true)
    expect(await verifyPassword('yanlis', hash)).toBe(false)
  })

  it('creates a session cookie that validates against itself', () => {
    const cookie = createSessionCookie()
    expect(isValidSession(cookie)).toBe(true)
  })

  it('rejects a tampered or missing session value', () => {
    expect(isValidSession('garbage')).toBe(false)
    expect(isValidSession(undefined)).toBe(false)
  })
})
