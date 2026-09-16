import { getPool } from '../lib/db'
import { hashPassword } from '../lib/auth'

async function main() {
  const password = process.argv[2]
  if (!password) {
    console.error('Kullanım: npx tsx scripts/seed-teacher.ts <sifre>')
    process.exit(1)
  }
  const hash = await hashPassword(password)
  const pool = getPool()
  await pool.query('DELETE FROM teacher')
  await pool.query('INSERT INTO teacher (password_hash) VALUES ($1)', [hash])
  console.log('Öğretmen şifresi ayarlandı.')
  await pool.end()
}

main()
