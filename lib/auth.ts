import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

function sign(value: string): string {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET ?? '').update(value).digest('hex')
}

export function createSessionCookie(): string {
  const issuedAt = Date.now().toString()
  return `${issuedAt}.${sign(issuedAt)}`
}

export function isValidSession(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false
  const [issuedAt, signature] = cookieValue.split('.')
  if (!issuedAt || !signature) return false
  return sign(issuedAt) === signature
}
