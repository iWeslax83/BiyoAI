import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { requireEnv } from './env'

// Matches the 7-day cookie maxAge set in app/api/auth/login/route.ts, so a
// copied/leaked session cookie can't stay valid forever even if the cookie
// itself is never cleared.
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

function getSessionSecret(): string {
  return requireEnv('SESSION_SECRET', { minLength: 32 })
}

function sign(value: string): string {
  return crypto.createHmac('sha256', getSessionSecret()).update(value).digest('hex')
}

export function createSessionCookie(): string {
  const issuedAt = Date.now().toString()
  return `${issuedAt}.${sign(issuedAt)}`
}

export function isValidSession(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false
  const [issuedAt, signature] = cookieValue.split('.')
  if (!issuedAt || !signature) return false

  const expected = sign(issuedAt)
  const expectedBuf = Buffer.from(expected, 'hex')
  const actualBuf = Buffer.from(signature, 'hex')
  if (expectedBuf.length !== actualBuf.length) return false
  if (!crypto.timingSafeEqual(expectedBuf, actualBuf)) return false

  const issuedAtMs = Number(issuedAt)
  if (!Number.isFinite(issuedAtMs)) return false
  if (Date.now() - issuedAtMs > SESSION_MAX_AGE_MS) return false

  return true
}
