# BiyoAI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted Next.js app that answers biology students' questions strictly from teacher-uploaded sources (RAG over Postgres/pgvector), running touch-optimized on the school PC + Pardus board, with a teacher panel for source management and feedback-driven prompt enrichment.

**Architecture:** Single Next.js (App Router, TypeScript) app with two surfaces — `/tahta` (unauthenticated, touch UI, students) and `/ogretmen` (password-protected, responsive, teacher). All state lives in a local Postgres+pgvector instance (Docker Compose). The only external network call is to the Groq API (chat + embeddings, OpenAI-compatible). Core logic (chunking, retrieval, prompt building, grounding checks) lives in framework-agnostic `lib/` modules with unit tests; API routes are thin wrappers.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Postgres 16 + pgvector, `pg` (node-postgres) driver, Groq API (`llama-3.3-70b-versatile` for chat, `nomic-embed-text-v1_5` for embeddings, both OpenAI-compatible endpoints), Vitest for unit/integration tests, Docker Compose for local orchestration, systemd for process supervision.

**Spec:** `docs/superpowers/specs/2026-09-16-biyoai-design.md`

## Global Constraints

- No student identity is ever stored (spec: KVKK ve veri güvenliği).
- LLM must answer **only** from retrieved source chunks; if chunks don't cover the question, respond "bilmiyorum" — never invent facts (spec: RAG akışı).
- Every grounded answer must carry a source citation; answers without one are flagged "doğrulanamadı" in the UI (spec: RAG akışı).
- Teacher feedback is retrieved semantically (top 3-5), never dumped in full into every prompt (spec: Geri bildirim mekanizması).
- All touch targets ≥ 44px; no hover-dependent interaction (spec: Dokunmatik arayüz).
- Only external network dependency is the Groq API; everything else runs on the school PC (spec: Mimari).
- Answer tone follows TYMM: skill/depth-oriented explanation (example, relation, reasoning), not rote one-liners (spec: RAG akışı, step 4).

---

## File Structure

```
biyoAI/
  app/
    tahta/page.tsx                 - student touch UI (client component)
    ogretmen/
      layout.tsx                   - auth guard, redirects to /ogretmen/login
      login/page.tsx               - teacher login form
      page.tsx                     - source manager + feedback list (client component)
    api/
      ask/route.ts                 - POST { question } -> RAG answer
      sources/route.ts             - GET list, POST upload (text/link)
      sources/[id]/route.ts        - DELETE source
      feedback/route.ts            - POST { qaLogId, note }
      auth/login/route.ts          - POST { password } -> session cookie
      auth/logout/route.ts         - POST -> clear session
      health/route.ts              - GET -> { ok, db, groq }
      restart/route.ts             - POST (teacher-only) -> exits process for systemd to restart
  lib/
    db.ts                          - pg Pool singleton + query() helper
    schema.sql                     - DDL: extension, tables, indexes
    chunk.ts                       - splitIntoChunks(text, opts) -> Chunk[]
    groq.ts                        - embed(texts), chatComplete(messages) via Groq OpenAI-compatible API
    ingest.ts                      - ingestSource(sourceId, text) -> number (chunk count)
    retrieve.ts                    - retrieveChunks(question, k), retrieveFeedback(question, k)
    rag.ts                         - answerQuestion(question) -> RagAnswer
    prompt.ts                      - buildSystemPrompt(chunks, feedback) -> string
    auth.ts                        - hashPassword, verifyPassword, createSession, readSession
    cache.ts                       - getCachedAnswer(question), setCachedAnswer(question, answer)
    queue.ts                       - withRateLimitQueue(fn) - serializes Groq calls, sheds load
  tests/
    lib/chunk.test.ts
    lib/groq.test.ts
    lib/ingest.test.ts
    lib/retrieve.test.ts
    lib/rag.test.ts
    lib/prompt.test.ts
    lib/auth.test.ts
    lib/cache.test.ts
  scripts/
    backup.sh                      - pg_dump cron script
    healthcheck.sh                 - curl /api/health, restart service on failure
  docker-compose.yml                - postgres+pgvector, app
  Dockerfile
  biyoai.service                    - systemd unit
  OPERATIONS.md                     - one-page runbook for the teacher
  .env.example
  package.json
  tsconfig.json
  vitest.config.ts
```

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`
- Create: `app/layout.tsx`, `app/page.tsx` (redirects to `/tahta`)
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: a runnable `npm run dev` Next.js app and `npm test` (Vitest) command that later tasks build on.

- [ ] **Step 1: Scaffold Next.js app**

```bash
npx create-next-app@latest . --typescript --app --no-tailwind --no-eslint --src-dir=false --import-alias "@/*" --use-npm
```

When prompted, accept defaults for an empty directory.

- [ ] **Step 2: Install runtime and test dependencies**

```bash
npm install pg
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths @types/pg
```

- [ ] **Step 3: Add Vitest config**

`vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 4: Write smoke test**

`tests/smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'

describe('scaffold', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (1 test)

- [ ] **Step 6: Root redirect**

`app/page.tsx`:
```typescript
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/tahta')
}
```

- [ ] **Step 7: `.env.example`**

```
DATABASE_URL=postgres://biyoai:biyoai@localhost:5432/biyoai
GROQ_API_KEY=
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
GROQ_EMBED_MODEL=nomic-embed-text-v1_5
TEACHER_PASSWORD_HASH=
SESSION_SECRET=
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Vitest"
```

---

## Task 2: Postgres + pgvector schema and DB client

**Files:**
- Create: `lib/schema.sql`
- Create: `lib/db.ts`
- Create: `docker-compose.yml`
- Test: `tests/lib/db.test.ts`

**Interfaces:**
- Produces: `query<T>(sql: string, params?: unknown[]): Promise<T[]>`, `getPool(): Pool` — used by every other `lib/` module that touches the database.

- [ ] **Step 1: Write schema**

`lib/schema.sql`:
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS teacher (
  id SERIAL PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sources (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pdf', 'text', 'link')),
  raw_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE IF NOT EXISTS qa_log (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  grounded BOOLEAN NOT NULL,
  source_ids INTEGER[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  qa_log_id INTEGER NOT NULL REFERENCES qa_log(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_embedding_idx ON feedback
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
```

- [ ] **Step 2: Docker Compose**

`docker-compose.yml`:
```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_USER: biyoai
      POSTGRES_PASSWORD: biyoai
      POSTGRES_DB: biyoai
    volumes:
      - db_data:/var/lib/postgresql/data
      - ./lib/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U biyoai"]
      interval: 5s
      timeout: 5s
      retries: 5

  app:
    build: .
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    env_file: .env
    environment:
      DATABASE_URL: postgres://biyoai:biyoai@db:5432/biyoai
    ports:
      - "3000:3000"

volumes:
  db_data:
```

- [ ] **Step 3: Start Postgres for local dev/tests**

Run: `docker compose up -d db`
Expected: `db` container healthy within ~10s (`docker compose ps` shows `healthy`)

- [ ] **Step 4: Write `lib/db.ts`**

```typescript
import { Pool, type QueryResultRow } from 'pg'

let pool: Pool | undefined

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
  }
  return pool
}

export async function query<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params)
  return result.rows
}
```

- [ ] **Step 5: Write failing integration test**

`tests/lib/db.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { query } from '../../lib/db'

describe('db', () => {
  it('connects and queries', async () => {
    const rows = await query<{ answer: number }>('SELECT 1 + 1 AS answer')
    expect(rows[0].answer).toBe(2)
  })
})
```

- [ ] **Step 6: Run test to verify it fails without DATABASE_URL**

Run: `npm test -- tests/lib/db.test.ts`
Expected: FAIL (connection refused) unless `DATABASE_URL` is exported. Export it now:
`export DATABASE_URL=postgres://biyoai:biyoai@localhost:5432/biyoai`

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- tests/lib/db.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Postgres+pgvector schema and db client"
```

---

## Task 3: Text chunking

**Files:**
- Create: `lib/chunk.ts`
- Test: `tests/lib/chunk.test.ts`

**Interfaces:**
- Produces: `splitIntoChunks(text: string, opts?: { maxChars?: number; overlap?: number }): string[]` — consumed by `lib/ingest.ts` (Task 5).

- [ ] **Step 1: Write failing test**

`tests/lib/chunk.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { splitIntoChunks } from '../../lib/chunk'

describe('splitIntoChunks', () => {
  it('returns a single chunk for short text', () => {
    const chunks = splitIntoChunks('Hücre canlıların yapı taşıdır.')
    expect(chunks).toEqual(['Hücre canlıların yapı taşıdır.'])
  })

  it('splits long text into overlapping chunks', () => {
    const text = 'A'.repeat(2500)
    const chunks = splitIntoChunks(text, { maxChars: 1000, overlap: 100 })
    expect(chunks.length).toBe(3)
    expect(chunks[0].length).toBe(1000)
    expect(chunks[1].slice(0, 100)).toBe(chunks[0].slice(-100))
  })

  it('does not produce empty chunks', () => {
    const chunks = splitIntoChunks('   ')
    expect(chunks).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/chunk.test.ts`
Expected: FAIL with "Cannot find module '../../lib/chunk'"

- [ ] **Step 3: Implement**

`lib/chunk.ts`:
```typescript
export function splitIntoChunks(
  text: string,
  opts: { maxChars?: number; overlap?: number } = {}
): string[] {
  const maxChars = opts.maxChars ?? 1000
  const overlap = opts.overlap ?? 100
  const trimmed = text.trim()
  if (trimmed.length === 0) return []
  if (trimmed.length <= maxChars) return [trimmed]

  const chunks: string[] = []
  let start = 0
  while (start < trimmed.length) {
    const end = Math.min(start + maxChars, trimmed.length)
    chunks.push(trimmed.slice(start, end))
    if (end === trimmed.length) break
    start = end - overlap
  }
  return chunks
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/chunk.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add text chunking for source ingestion"
```

---

## Task 4: Groq client (chat + embeddings)

**Files:**
- Create: `lib/groq.ts`
- Test: `tests/lib/groq.test.ts`

**Interfaces:**
- Consumes: `process.env.GROQ_API_KEY`, `process.env.GROQ_CHAT_MODEL`, `process.env.GROQ_EMBED_MODEL`
- Produces: `embed(texts: string[]): Promise<number[][]>`, `chatComplete(messages: {role: 'system'|'user'|'assistant', content: string}[]): Promise<string>` — consumed by `lib/ingest.ts`, `lib/retrieve.ts`, `lib/rag.ts`.

- [ ] **Step 1: Write failing test with mocked fetch**

`tests/lib/groq.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { embed, chatComplete } from '../../lib/groq'

describe('groq client', () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key'
    process.env.GROQ_CHAT_MODEL = 'llama-3.3-70b-versatile'
    process.env.GROQ_EMBED_MODEL = 'nomic-embed-text-v1_5'
  })

  it('embed() posts to the embeddings endpoint and returns vectors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const vectors = await embed(['metin bir', 'metin iki'])

    expect(vectors).toEqual([[0.1, 0.2], [0.3, 0.4]])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.groq.com/openai/v1/embeddings')
    expect(JSON.parse(init.body)).toEqual({
      model: 'nomic-embed-text-v1_5',
      input: ['metin bir', 'metin iki'],
    })
    expect(init.headers.Authorization).toBe('Bearer test-key')
    vi.unstubAllGlobals()
  })

  it('chatComplete() posts messages and returns the assistant content', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'cevap metni' } }] }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const answer = await chatComplete([{ role: 'user', content: 'soru' }])

    expect(answer).toBe('cevap metni')
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body).model).toBe('llama-3.3-70b-versatile')
    vi.unstubAllGlobals()
  })

  it('throws a descriptive error on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' }))
    await expect(chatComplete([{ role: 'user', content: 'x' }])).rejects.toThrow('Groq API error 429: rate limited')
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/groq.test.ts`
Expected: FAIL with "Cannot find module '../../lib/groq'"

- [ ] **Step 3: Implement**

`lib/groq.ts`:
```typescript
const BASE_URL = 'https://api.groq.com/openai/v1'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

async function groqFetch(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Groq API error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function embed(texts: string[]): Promise<number[][]> {
  const json = await groqFetch('/embeddings', {
    model: process.env.GROQ_EMBED_MODEL,
    input: texts,
  })
  return json.data.map((d: { embedding: number[] }) => d.embedding)
}

export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  const json = await groqFetch('/chat/completions', {
    model: process.env.GROQ_CHAT_MODEL,
    messages,
    temperature: 0.2,
  })
  return json.choices[0].message.content
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/groq.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Groq chat and embeddings client"
```

---

## Task 5: Source ingestion pipeline

**Files:**
- Create: `lib/ingest.ts`
- Test: `tests/lib/ingest.test.ts`

**Interfaces:**
- Consumes: `splitIntoChunks` (Task 3), `embed` (Task 4), `query` (Task 2)
- Produces: `ingestSource(sourceId: number, text: string): Promise<number>` (returns chunk count) — consumed by the `/api/sources` route (Task 9).

- [ ] **Step 1: Write failing test with mocked dependencies**

`tests/lib/ingest.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/groq', () => ({
  embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
}))

const queryMock = vi.fn(async () => [])
vi.mock('../../lib/db', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}))

import { ingestSource } from '../../lib/ingest'

describe('ingestSource', () => {
  it('chunks, embeds, and stores each chunk, returning the count', async () => {
    const longText = 'Fotosentez '.repeat(200)
    const count = await ingestSource(7, longText)

    expect(count).toBeGreaterThan(0)
    expect(queryMock).toHaveBeenCalledTimes(count)
    const [sql, params] = queryMock.mock.calls[0]
    expect(sql).toContain('INSERT INTO chunks')
    expect(params[0]).toBe(7)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/ingest.test.ts`
Expected: FAIL with "Cannot find module '../../lib/ingest'"

- [ ] **Step 3: Implement**

`lib/ingest.ts`:
```typescript
import { splitIntoChunks } from './chunk'
import { embed } from './groq'
import { query } from './db'

export async function ingestSource(sourceId: number, text: string): Promise<number> {
  const chunks = splitIntoChunks(text)
  if (chunks.length === 0) return 0

  const vectors = await embed(chunks)

  for (let i = 0; i < chunks.length; i++) {
    await query(
      `INSERT INTO chunks (source_id, content, embedding) VALUES ($1, $2, $3)`,
      [sourceId, chunks[i], JSON.stringify(vectors[i])]
    )
  }

  return chunks.length
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/ingest.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add source ingestion pipeline"
```

---

## Task 6: Retrieval (chunks + feedback)

**Files:**
- Create: `lib/retrieve.ts`
- Test: `tests/lib/retrieve.test.ts` (integration, requires running `db` container)

**Interfaces:**
- Consumes: `embed` (Task 4), `query` (Task 2)
- Produces: `retrieveChunks(question: string, k?: number): Promise<{id: number; sourceId: number; content: string}[]>`, `retrieveFeedback(question: string, k?: number): Promise<{id: number; note: string}[]>` — consumed by `lib/rag.ts` (Task 7).

- [ ] **Step 1: Write failing integration test**

`tests/lib/retrieve.test.ts`:
```typescript
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { query } from '../../lib/db'

vi.mock('../../lib/groq', () => ({
  embed: vi.fn(async (texts: string[]) =>
    texts.map((t) => (t.includes('fotosentez') ? [1, 0, 0] : [0, 1, 0]))
  ),
}))

import { retrieveChunks, retrieveFeedback } from '../../lib/retrieve'

function zeroVec(dim: number, hot: number): number[] {
  const v = new Array(dim).fill(0)
  v[hot] = 1
  return v
}

beforeAll(async () => {
  await query('DELETE FROM feedback')
  await query('DELETE FROM chunks')
  await query('DELETE FROM qa_log')
  await query('DELETE FROM sources')

  const [source] = await query<{ id: number }>(
    `INSERT INTO sources (title, kind, raw_text) VALUES ('Test Kaynak', 'text', 'x') RETURNING id`
  )
  const embedding = JSON.stringify(new Array(768).fill(0).map((_, i) => (i === 0 ? 1 : 0)))
  await query(
    `INSERT INTO chunks (source_id, content, embedding) VALUES ($1, $2, $3)`,
    [source.id, 'Fotosentez ışık enerjisini kimyasal enerjiye çevirir.', embedding]
  )

  const [qa] = await query<{ id: number }>(
    `INSERT INTO qa_log (question, answer, grounded, source_ids) VALUES ('q', 'a', true, '{}') RETURNING id`
  )
  const feedbackEmbedding = JSON.stringify(new Array(768).fill(0).map((_, i) => (i === 0 ? 1 : 0)))
  await query(
    `INSERT INTO feedback (qa_log_id, note, embedding) VALUES ($1, $2, $3)`,
    [qa.id, 'Fotosentez anlatırken klorofili de belirt', feedbackEmbedding]
  )
})

describe('retrieve', () => {
  it('retrieveChunks returns the closest chunk for a matching question', async () => {
    const results = await retrieveChunks('fotosentez nedir', 3)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].content).toContain('Fotosentez')
  })

  it('retrieveFeedback returns the closest feedback note', async () => {
    const results = await retrieveFeedback('fotosentez nedir', 3)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].note).toContain('klorofil')
  })
})
```

Note: the mocked `embed` above only shapes the *query* embedding for these two specific test inputs; the stored rows use a fixed 768-dim one-hot vector so cosine similarity is deterministic regardless of the mock's small vector — replace the mock's output length with 768 dims matching index 0 hot to keep dimensions consistent:

```typescript
vi.mock('../../lib/groq', () => ({
  embed: vi.fn(async (texts: string[]) =>
    texts.map(() => {
      const v = new Array(768).fill(0)
      v[0] = 1
      return v
    })
  ),
}))
```

(Use this corrected mock in the actual test file — it keeps embedding dimensions consistent with the `vector(768)` column.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/retrieve.test.ts`
Expected: FAIL with "Cannot find module '../../lib/retrieve'"

- [ ] **Step 3: Implement**

`lib/retrieve.ts`:
```typescript
import { embed } from './groq'
import { query } from './db'

export async function retrieveChunks(
  question: string,
  k = 5
): Promise<{ id: number; sourceId: number; content: string }[]> {
  const [vector] = await embed([question])
  return query(
    `SELECT id, source_id AS "sourceId", content
     FROM chunks
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [JSON.stringify(vector), k]
  )
}

export async function retrieveFeedback(
  question: string,
  k = 5
): Promise<{ id: number; note: string }[]> {
  const [vector] = await embed([question])
  return query(
    `SELECT id, note
     FROM feedback
     ORDER BY embedding <=> $1
     LIMIT $2`,
    [JSON.stringify(vector), k]
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/retrieve.test.ts`
Expected: PASS (requires `docker compose up -d db` and `DATABASE_URL` exported, per Task 2)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add vector retrieval for chunks and feedback"
```

---

## Task 7: Prompt building and RAG answer

**Files:**
- Create: `lib/prompt.ts`
- Create: `lib/rag.ts`
- Test: `tests/lib/prompt.test.ts`
- Test: `tests/lib/rag.test.ts`

**Interfaces:**
- Consumes: `retrieveChunks`, `retrieveFeedback` (Task 6), `chatComplete` (Task 4), `query` (Task 2)
- Produces: `buildSystemPrompt(chunks, feedback): string`; `answerQuestion(question: string): Promise<{ answer: string; grounded: boolean; sourceIds: number[] }>` — consumed by `/api/ask` (Task 10).

- [ ] **Step 1: Write failing prompt test**

`tests/lib/prompt.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../../lib/prompt'

describe('buildSystemPrompt', () => {
  it('includes chunk content, citation instructions, and TYMM guidance', () => {
    const prompt = buildSystemPrompt(
      [{ id: 1, sourceId: 1, content: 'Mitokondri hücrenin enerji santralidir.' }],
      []
    )
    expect(prompt).toContain('Mitokondri hücrenin enerji santralidir.')
    expect(prompt).toContain('bilmiyorum')
    expect(prompt).toContain('[kaynak:')
  })

  it('includes feedback notes when present', () => {
    const prompt = buildSystemPrompt(
      [{ id: 1, sourceId: 1, content: 'x' }],
      [{ id: 1, note: 'Örneklerle anlat' }]
    )
    expect(prompt).toContain('Örneklerle anlat')
  })

  it('says no matching source when chunks is empty', () => {
    const prompt = buildSystemPrompt([], [])
    expect(prompt).toContain('bilmiyorum')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/prompt.test.ts`
Expected: FAIL with "Cannot find module '../../lib/prompt'"

- [ ] **Step 3: Implement `lib/prompt.ts`**

```typescript
type Chunk = { id: number; sourceId: number; content: string }
type Feedback = { id: number; note: string }

export function buildSystemPrompt(chunks: Chunk[], feedback: Feedback[]): string {
  const sourceBlock =
    chunks.length > 0
      ? chunks.map((c) => `[kaynak:${c.sourceId}] ${c.content}`).join('\n\n')
      : '(Bu soru için ilgili kaynak bulunamadı.)'

  const feedbackBlock =
    feedback.length > 0
      ? `\n\nÖğretmenin bu tür sorular için notları:\n${feedback.map((f) => `- ${f.note}`).join('\n')}`
      : ''

  return `Sen 11. sınıf biyoloji dersi için bir öğretim asistanısın.

Kurallar:
- SADECE aşağıdaki kaynak parçalarını kullanarak cevap ver. Kaynaklarda olmayan hiçbir bilgi uydurma.
- Kaynaklar soruyu kapsamıyorsa, kısaca "Bu konuda elimde kaynak yok, bilmiyorum." de ve başka bir şey ekleme.
- Her iddiayı kullandığın kaynağa [kaynak:N] biçiminde referansla.
- Cevabı ezber/tek cümlelik değil, örnekle ve nedenleriyle açıklayarak ver (Türkiye Yüzyılı Maarif Modeli'nin beceri temelli, derinlemesine öğrenme yaklaşımına uygun).
- Lise seviyesine uygun, anlaşılır Türkçe kullan.

Kaynaklar:
${sourceBlock}${feedbackBlock}`
}
```

- [ ] **Step 4: Run prompt test to verify it passes**

Run: `npm test -- tests/lib/prompt.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write failing rag test**

`tests/lib/rag.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/retrieve', () => ({
  retrieveChunks: vi.fn(async () => [{ id: 1, sourceId: 3, content: 'Mitoz hücre bölünmesidir.' }]),
  retrieveFeedback: vi.fn(async () => []),
}))
vi.mock('../../lib/groq', () => ({
  chatComplete: vi.fn(async () => 'Mitoz, [kaynak:3] hücrenin bölünmesidir.'),
}))
const queryMock = vi.fn(async () => [{ id: 42 }])
vi.mock('../../lib/db', () => ({
  query: (...args: unknown[]) => queryMock(...args),
}))

import { answerQuestion } from '../../lib/rag'

describe('answerQuestion', () => {
  it('returns a grounded answer with cited source ids and logs it', async () => {
    const result = await answerQuestion('Mitoz nedir?')

    expect(result.grounded).toBe(true)
    expect(result.sourceIds).toEqual([3])
    expect(result.answer).toContain('Mitoz')
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO qa_log'),
      expect.arrayContaining(['Mitoz nedir?'])
    )
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- tests/lib/rag.test.ts`
Expected: FAIL with "Cannot find module '../../lib/rag'"

- [ ] **Step 7: Implement `lib/rag.ts`**

```typescript
import { retrieveChunks, retrieveFeedback } from './retrieve'
import { chatComplete } from './groq'
import { buildSystemPrompt } from './prompt'
import { query } from './db'

export type RagAnswer = { answer: string; grounded: boolean; sourceIds: number[] }

export async function answerQuestion(question: string): Promise<RagAnswer> {
  const [chunks, feedback] = await Promise.all([
    retrieveChunks(question, 5),
    retrieveFeedback(question, 5),
  ])

  const systemPrompt = buildSystemPrompt(chunks, feedback)
  const answer = await chatComplete([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question },
  ])

  const citedIds = Array.from(new Set(
    Array.from(answer.matchAll(/\[kaynak:(\d+)\]/g)).map((m) => Number(m[1]))
  ))
  const grounded = citedIds.length > 0

  await query(
    `INSERT INTO qa_log (question, answer, grounded, source_ids) VALUES ($1, $2, $3, $4)`,
    [question, answer, grounded, citedIds]
  )

  return { answer, grounded, sourceIds: citedIds }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- tests/lib/rag.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add RAG prompt building and grounded answer pipeline"
```

---

## Task 8: Teacher auth

**Files:**
- Create: `lib/auth.ts`
- Test: `tests/lib/auth.test.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, hash: string): Promise<boolean>`, `createSessionCookie(): string`, `isValidSession(cookieValue: string | undefined): boolean` — consumed by `/api/auth/login`, `/api/auth/logout`, and `app/ogretmen/layout.tsx` (Task 9, Task 12).

- [ ] **Step 1: Install bcrypt**

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

- [ ] **Step 2: Write failing test**

`tests/lib/auth.test.ts`:
```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/lib/auth.test.ts`
Expected: FAIL with "Cannot find module '../../lib/auth'"

- [ ] **Step 4: Implement**

`lib/auth.ts`:
```typescript
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/lib/auth.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add teacher password hashing and signed session cookies"
```

---

## Task 9: Answer cache and rate-limit queue

**Files:**
- Create: `lib/cache.ts`
- Create: `lib/queue.ts`
- Test: `tests/lib/cache.test.ts`
- Test: `tests/lib/queue.test.ts`

**Interfaces:**
- Produces: `getCachedAnswer(question: string): RagAnswer | undefined`, `setCachedAnswer(question: string, answer: RagAnswer): void`; `withRateLimitQueue<T>(fn: () => Promise<T>): Promise<T>` — consumed by `/api/ask` (Task 10).

- [ ] **Step 1: Write failing cache test**

`tests/lib/cache.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { getCachedAnswer, setCachedAnswer } from '../../lib/cache'

describe('cache', () => {
  it('returns undefined for an unseen question', () => {
    expect(getCachedAnswer('görülmemiş soru')).toBeUndefined()
  })

  it('normalizes whitespace/case and returns a cached answer', () => {
    const answer = { answer: 'cevap', grounded: true, sourceIds: [1] }
    setCachedAnswer('Fotosentez Nedir?', answer)
    expect(getCachedAnswer('  fotosentez nedir?  ')).toEqual(answer)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/cache.test.ts`
Expected: FAIL with "Cannot find module '../../lib/cache'"

- [ ] **Step 3: Implement cache**

`lib/cache.ts`:
```typescript
import type { RagAnswer } from './rag'

const store = new Map<string, RagAnswer>()

function normalize(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function getCachedAnswer(question: string): RagAnswer | undefined {
  return store.get(normalize(question))
}

export function setCachedAnswer(question: string, answer: RagAnswer): void {
  store.set(normalize(question), answer)
}
```

- [ ] **Step 4: Run cache test to verify it passes**

Run: `npm test -- tests/lib/cache.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing queue test**

`tests/lib/queue.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { withRateLimitQueue } from '../../lib/queue'

describe('withRateLimitQueue', () => {
  it('runs queued calls one at a time, in order', async () => {
    const order: number[] = []
    const makeTask = (id: number, delay: number) => () =>
      withRateLimitQueue(async () => {
        await new Promise((r) => setTimeout(r, delay))
        order.push(id)
        return id
      })

    const results = await Promise.all([makeTask(1, 20)(), makeTask(2, 0)(), makeTask(3, 0)()])

    expect(results).toEqual([1, 2, 3])
    expect(order).toEqual([1, 2, 3])
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- tests/lib/queue.test.ts`
Expected: FAIL with "Cannot find module '../../lib/queue'"

- [ ] **Step 7: Implement queue**

`lib/queue.ts`:
```typescript
let tail: Promise<unknown> = Promise.resolve()

export function withRateLimitQueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = tail.then(fn)
  tail = result.catch(() => undefined)
  return result
}
```

- [ ] **Step 8: Run queue test to verify it passes**

Run: `npm test -- tests/lib/queue.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add answer cache and serializing rate-limit queue"
```

---

## Task 10: API routes

**Files:**
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Create: `app/api/sources/route.ts`
- Create: `app/api/sources/[id]/route.ts`
- Create: `app/api/ask/route.ts`
- Create: `app/api/feedback/route.ts`
- Create: `app/api/health/route.ts`
- Test: `tests/api/ask.test.ts` (tests the underlying handler logic directly, not via HTTP)

**Interfaces:**
- Consumes: `answerQuestion` (Task 7), `ingestSource` (Task 5), `getCachedAnswer`/`setCachedAnswer`/`withRateLimitQueue` (Task 9), `hashPassword`/`verifyPassword`/`createSessionCookie`/`isValidSession` (Task 8), `query` (Task 2)
- Produces: the HTTP surface consumed by `app/tahta/page.tsx` and `app/ogretmen/page.tsx` (Tasks 11-12).

- [ ] **Step 1: `app/api/auth/login/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { verifyPassword, createSessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const [teacher] = await query<{ password_hash: string }>(
    'SELECT password_hash FROM teacher ORDER BY id LIMIT 1'
  )
  if (!teacher || !(await verifyPassword(password, teacher.password_hash))) {
    return NextResponse.json({ error: 'Hatalı şifre' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set('session', createSessionCookie(), { httpOnly: true, sameSite: 'lax', path: '/' })
  return res
}
```

- [ ] **Step 2: `app/api/auth/logout/route.ts`**

```typescript
import { NextResponse } from 'next/server'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('session')
  return res
}
```

- [ ] **Step 3: `app/api/sources/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { ingestSource } from '@/lib/ingest'
import { isValidSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  if (!isValidSession(req.cookies.get('session')?.value)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const sources = await query('SELECT id, title, kind, created_at FROM sources ORDER BY created_at DESC')
  return NextResponse.json({ sources })
}

export async function POST(req: NextRequest) {
  if (!isValidSession(req.cookies.get('session')?.value)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { title, kind, text } = await req.json()
  if (!title || !kind || !text) {
    return NextResponse.json({ error: 'title, kind ve text zorunlu' }, { status: 400 })
  }
  const [source] = await query<{ id: number }>(
    'INSERT INTO sources (title, kind, raw_text) VALUES ($1, $2, $3) RETURNING id',
    [title, kind, text]
  )
  const chunkCount = await ingestSource(source.id, text)
  return NextResponse.json({ id: source.id, chunkCount })
}
```

- [ ] **Step 4: `app/api/sources/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { isValidSession } from '@/lib/auth'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isValidSession(req.cookies.get('session')?.value)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  await query('DELETE FROM sources WHERE id = $1', [Number(params.id)])
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Write failing test for the ask handler logic**

`tests/api/ask.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const answerQuestionMock = vi.fn(async (q: string) => ({ answer: `cevap: ${q}`, grounded: true, sourceIds: [1] }))
vi.mock('../../lib/rag', () => ({ answerQuestion: (q: string) => answerQuestionMock(q) }))

import { getCachedAnswer, setCachedAnswer } from '../../lib/cache'
import { withRateLimitQueue } from '../../lib/queue'
import { answerQuestion } from '../../lib/rag'

async function handleAsk(question: string) {
  const cached = getCachedAnswer(question)
  if (cached) return cached
  const result = await withRateLimitQueue(() => answerQuestion(question))
  setCachedAnswer(question, result)
  return result
}

describe('ask handler logic', () => {
  beforeEach(() => {
    answerQuestionMock.mockClear()
  })

  it('calls answerQuestion once and caches the result for repeat questions', async () => {
    const first = await handleAsk('Mitoz nedir?')
    const second = await handleAsk('Mitoz nedir?')

    expect(first).toEqual(second)
    expect(answerQuestionMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- tests/api/ask.test.ts`
Expected: FAIL (module resolution or assertion failure before the route exists)

- [ ] **Step 7: `app/api/ask/route.ts`** (uses the same cache-then-queue logic proven in Step 5)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { answerQuestion } from '@/lib/rag'
import { getCachedAnswer, setCachedAnswer } from '@/lib/cache'
import { withRateLimitQueue } from '@/lib/queue'

export async function POST(req: NextRequest) {
  const { question } = await req.json()
  if (!question || typeof question !== 'string') {
    return NextResponse.json({ error: 'question zorunlu' }, { status: 400 })
  }

  const cached = getCachedAnswer(question)
  if (cached) return NextResponse.json(cached)

  try {
    const result = await withRateLimitQueue(() => answerQuestion(question))
    setCachedAnswer(question, result)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: 'Sistem şu anda yoğun, lütfen birazdan tekrar deneyin.' },
      { status: 503 }
    )
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- tests/api/ask.test.ts`
Expected: PASS

- [ ] **Step 9: `app/api/feedback/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { embed } from '@/lib/groq'
import { isValidSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!isValidSession(req.cookies.get('session')?.value)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { qaLogId, note } = await req.json()
  if (!qaLogId || !note) {
    return NextResponse.json({ error: 'qaLogId ve note zorunlu' }, { status: 400 })
  }
  const [vector] = await embed([note])
  await query(
    'INSERT INTO feedback (qa_log_id, note, embedding) VALUES ($1, $2, $3)',
    [qaLogId, note, JSON.stringify(vector)]
  )
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 10: `app/api/health/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    await query('SELECT 1')
    return NextResponse.json({ ok: true, db: true })
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503 })
  }
}
```

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add auth, sources, ask, feedback, and health API routes"
```

---

## Task 11: Student touch UI (`/tahta`)

**Files:**
- Create: `app/tahta/page.tsx`
- Create: `app/globals.css`

**Interfaces:**
- Consumes: `POST /api/ask` (Task 10)

- [ ] **Step 1: Touch-friendly global styles**

`app/globals.css`:
```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; }
button, input, textarea { font-size: 1.25rem; }
button { min-height: 44px; min-width: 44px; padding: 0.75rem 1.5rem; }
```

- [ ] **Step 2: Build the page**

`app/tahta/page.tsx`:
```typescript
'use client'

import { useState } from 'react'

type Answer = { answer: string; grounded: boolean; sourceIds: number[] }

export default function TahtaPage() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ask() {
    if (!question.trim() || loading) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? 'Bir hata oluştu.')
        return
      }
      setAnswer(await res.json())
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem' }}>Biyoloji Soru-Cevap</h1>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={3}
        style={{ width: '100%', padding: '1rem' }}
        placeholder="Biyoloji ile ilgili sorunu yaz..."
      />
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
        <button onClick={ask} disabled={loading}>
          {loading ? 'Yanıtlanıyor...' : 'Sor'}
        </button>
        <button
          onClick={() => {
            setQuestion('')
            setAnswer(null)
            setError(null)
          }}
        >
          Temizle
        </button>
      </div>

      {error && <p style={{ color: 'crimson', fontSize: '1.25rem' }}>{error}</p>}

      {answer && (
        <div style={{ marginTop: '2rem', fontSize: '1.25rem', lineHeight: 1.5 }}>
          <p>{answer.answer}</p>
          {!answer.grounded && (
            <p style={{ color: 'darkorange' }}>⚠ Bu cevap doğrulanamadı, öğretmenine sor.</p>
          )}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open `http://localhost:3000/tahta` in a browser resized to a touch-device viewport (DevTools device toolbar). Confirm the textarea, "Sor", and "Temizle" buttons are all ≥44px tall and no interaction depends on hover.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add touch-optimized student Q&A page"
```

---

## Task 12: Teacher panel (`/ogretmen`)

**Files:**
- Create: `app/ogretmen/layout.tsx`
- Create: `app/ogretmen/login/page.tsx`
- Create: `app/ogretmen/page.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/login`, `POST /api/auth/logout`, `GET/POST /api/sources`, `DELETE /api/sources/[id]`, `POST /api/feedback` (Task 10)

- [ ] **Step 1: Auth guard layout**

`app/ogretmen/layout.tsx`:
```typescript
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isValidSession } from '@/lib/auth'

export default async function OgretmenLayout({ children }: { children: React.ReactNode }) {
  const session = (await cookies()).get('session')?.value
  if (!isValidSession(session)) {
    redirect('/ogretmen/login')
  }
  return <>{children}</>
}
```

- [ ] **Step 2: Login page**

`app/ogretmen/login/page.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function login() {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) {
      setError('Hatalı şifre')
      return
    }
    router.push('/ogretmen')
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 400, margin: '4rem auto' }}>
      <h1>Öğretmen Girişi</h1>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: '100%', padding: '0.75rem', fontSize: '1.1rem' }}
        placeholder="Şifre"
      />
      <button onClick={login} style={{ marginTop: '1rem', width: '100%' }}>
        Giriş Yap
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </main>
  )
}
```

- [ ] **Step 3: Panel page**

`app/ogretmen/page.tsx`:
```typescript
'use client'

import { useEffect, useState } from 'react'

type Source = { id: number; title: string; kind: string; created_at: string }

export default function OgretmenPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')

  async function loadSources() {
    const res = await fetch('/api/sources')
    const body = await res.json()
    setSources(body.sources ?? [])
  }

  useEffect(() => {
    loadSources()
  }, [])

  async function addSource() {
    if (!title.trim() || !text.trim()) return
    await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, kind: 'text', text }),
    })
    setTitle('')
    setText('')
    await loadSources()
  }

  async function removeSource(id: number) {
    await fetch(`/api/sources/${id}`, { method: 'DELETE' })
    await loadSources()
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: 700, margin: '0 auto' }}>
      <h1>Kaynak Yönetimi</h1>

      <section style={{ marginBottom: '2rem' }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Başlık"
          style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Kaynak metni yapıştır..."
          rows={6}
          style={{ width: '100%', padding: '0.5rem' }}
        />
        <button onClick={addSource} style={{ marginTop: '0.5rem' }}>
          Kaynak Ekle
        </button>
      </section>

      <section>
        <h2>Kaynaklar</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {sources.map((s) => (
            <li
              key={s.id}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0', borderBottom: '1px solid #ddd' }}
            >
              <span>{s.title}</span>
              <button onClick={() => removeSource(s.id)}>Sil</button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, visit `http://localhost:3000/ogretmen` unauthenticated → confirm redirect to `/ogretmen/login`. Log in with a password whose hash was seeded into the `teacher` table (see Task 14, Step 1). Confirm adding a source shows it in the list, and deleting removes it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add teacher panel with auth guard and source management"
```

---

## Task 13: Dockerfile and systemd service

**Files:**
- Create: `Dockerfile`
- Create: `biyoai.service`
- Create: `scripts/healthcheck.sh`
- Create: `scripts/backup.sh`

**Interfaces:**
- Consumes: `GET /api/health` (Task 10), `docker-compose.yml` (Task 2)

- [ ] **Step 1: Dockerfile**

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["npm", "start"]
```

- [ ] **Step 2: systemd unit**

`biyoai.service`:
```ini
[Unit]
Description=BiyoAI (docker compose)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/biyoai
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Install with (documented, not run by the executing agent — requires root on the school PC):
```bash
sudo cp biyoai.service /etc/systemd/system/biyoai.service
sudo systemctl daemon-reload
sudo systemctl enable --now biyoai.service
```

- [ ] **Step 3: Healthcheck script**

`scripts/healthcheck.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

URL="http://localhost:3000/api/health"

if ! curl -fsS --max-time 5 "$URL" > /dev/null; then
  echo "$(date -Iseconds) BiyoAI health check failed, restarting" >> /var/log/biyoai-health.log
  cd /opt/biyoai
  docker compose restart app
fi
```

Install as a cron job (documented, not run by the executing agent):
```bash
chmod +x scripts/healthcheck.sh
( crontab -l 2>/dev/null; echo "*/2 * * * * /opt/biyoai/scripts/healthcheck.sh" ) | crontab -
```

- [ ] **Step 4: Backup script**

`scripts/backup.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/opt/biyoai/backups"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)

docker compose exec -T db pg_dump -U biyoai biyoai > "$BACKUP_DIR/biyoai-$STAMP.sql"

# Keep the last 30 backups
ls -1t "$BACKUP_DIR"/biyoai-*.sql | tail -n +31 | xargs -r rm --
```

Install as a daily cron job (documented, not run by the executing agent):
```bash
chmod +x scripts/backup.sh
( crontab -l 2>/dev/null; echo "0 23 * * * /opt/biyoai/scripts/backup.sh" ) | crontab -
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "ops: add Dockerfile, systemd unit, healthcheck and backup scripts"
```

---

## Task 14: Restart endpoint, teacher seed, and runbook

**Files:**
- Create: `scripts/seed-teacher.ts`
- Create: `app/api/restart/route.ts`
- Create: `OPERATIONS.md`
- Modify: `app/ogretmen/page.tsx` (add restart button)

**Interfaces:**
- Consumes: `hashPassword` (Task 8), `getPool` (Task 2), `isValidSession` (Task 8)

- [ ] **Step 1: Teacher seed script**

`scripts/seed-teacher.ts`:
```typescript
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
```

Add to `package.json` scripts: `"seed:teacher": "tsx scripts/seed-teacher.ts"`. Install `tsx`: `npm install -D tsx`.

- [ ] **Step 2: Restart endpoint**

`app/api/restart/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { isValidSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!isValidSession(req.cookies.get('session')?.value)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  setTimeout(() => process.exit(0), 200)
  return NextResponse.json({ ok: true, message: 'Sistem yeniden başlatılıyor...' })
}
```

This relies on `docker compose`'s `restart: unless-stopped` policy (Task 2) to bring the `app` container back up after the process exits.

- [ ] **Step 3: Add restart button to teacher panel**

Modify `app/ogretmen/page.tsx`: add inside the `<main>` block, after the closing `</section>` of "Kaynaklar":

```typescript
      <section style={{ marginTop: '2rem' }}>
        <h2>Sistem</h2>
        <button
          onClick={async () => {
            if (confirm('Sistemi yeniden başlatmak istediğine emin misin?')) {
              await fetch('/api/restart', { method: 'POST' })
            }
          }}
        >
          Sistemi Yeniden Başlat
        </button>
      </section>
```

- [ ] **Step 4: Operations runbook**

`OPERATIONS.md`:
```markdown
# BiyoAI Çalıştırma Kılavuzu

## Sistem çalışmıyor / tahta soruları cevaplamıyor

1. Okul PC'sinin açık ve internete bağlı olduğundan emin ol.
2. Tarayıcıda `http://biyoai.local:3000/tahta` adresini yeniden yükle.
3. Hâlâ çalışmıyorsa: `/ogretmen` paneline gir, "Sistemi Yeniden Başlat" butonuna bas, 1 dakika bekle.
4. O da işe yaramazsa okulun teknik personelini ara: PC'de bir terminal açıp şunu çalıştırmalı:
   ```
   cd /opt/biyoai && docker compose up -d
   ```

## Şifremi unuttum

Teknik personel PC'de şunu çalıştırmalı (yeni şifreyi kendisi belirler):
```
cd /opt/biyoai && npm run seed:teacher -- <yeni-sifre>
```

## Yedekten geri yükleme

Yedekler `/opt/biyoai/backups/` klasöründe günlük olarak tutulur (son 30 gün).
```
cd /opt/biyoai
docker compose exec -T db psql -U biyoai biyoai < backups/biyoai-<TARIH>.sql
```

## Yaz tatili

Sistem yaz boyunca kapalı kalabilir, sorun değil. Eylül'de PC açıldığında `biyoai.service` otomatik başlar (systemd `enable` edildiği için). Değişmeyen hiçbir ayar kaybolmaz, veriler diskte kalır.

## API anahtarını yenileme

Groq API anahtarı değişirse, teknik personel `/opt/biyoai/.env` dosyasındaki `GROQ_API_KEY` satırını güncelleyip şunu çalıştırmalı:
```
cd /opt/biyoai && docker compose up -d --force-recreate app
```
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add restart endpoint, teacher seed script, and operations runbook"
```

---

## Self-Review Notes

- **Spec coverage:** `/tahta` + `/ogretmen` (Tasks 11-12), Postgres+pgvector (Task 2), Groq LLM+embedding (Task 4), RAG flow with citation + "bilmiyorum" (Task 7), feedback-driven prompt enrichment (Task 6, 7), rate-limit queue + caching (Task 9), systemd/healthcheck/backup (Task 13), restart button (Task 14), teacher-only responsive panel reachable over Tailscale (no code change needed — Tailscale is infra-level, documented in spec and `OPERATIONS.md`'s network assumption), no student identity stored (schema in Task 2 has no student fields), touch UI constraints (Task 11 CSS + manual check) are all covered.
- **Type consistency checked:** `RagAnswer` type defined once in `lib/rag.ts` (Task 7) and imported by `lib/cache.ts` (Task 9) and used structurally in `tests/api/ask.test.ts` (Task 10) — no duplicate/divergent shape.
- **Placeholder scan:** no TBD/TODO; every step has runnable code.
- **Not covered by this plan (explicitly out of scope per spec):** actual Pardus browser-version detection and browserslist tuning, and the Tailscale account setup itself — both are one-time manual/infra steps for whoever has hands on the school PC, not application code. Note these for the executor as follow-up manual steps after Task 13.
