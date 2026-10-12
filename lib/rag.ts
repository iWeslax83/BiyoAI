import { retrieveChunks, retrieveFeedback } from "./retrieve";
import { chatComplete, embed } from "./groq";
import { buildSystemPrompt } from "./prompt";
import { query } from "./db";
import { minSupport, supportScore } from "./grounding";

export type RagAnswer = {
  answer: string;
  grounded: boolean;
  sourceIds: number[];
  sourceTitles: string[];
  // Share of the answer's content words found in the retrieved sources.
  supportScore: number;
};

export type Exchange = { question: string; answer: string };

type AnswerOptions = {
  // Earlier question/answer pairs of the same conversation, oldest first, so
  // a follow-up like "and in meiosis?" can be understood.
  history?: Exchange[];
  // Set to false for evaluation runs so test questions do not end up in the
  // teacher's question log.
  log?: boolean;
};

export async function answerQuestion(
  question: string,
  options: AnswerOptions = {},
): Promise<RagAnswer> {
  // Embed the question once and reuse the vector for both retrieval calls,
  // instead of each independently calling Groq's embeddings endpoint for the
  // identical text (2x the calls, latency, and rate-limit consumption).
  const history = options.history ?? [];
  // A follow-up is often meaningless on its own ("peki ya mayozda?"), so
  // search with the previous question as well.
  const lastQuestion = history[history.length - 1]?.question;
  const searchText = lastQuestion ? `${lastQuestion}\n${question}` : question;
  const [vector] = await embed([searchText]);
  const [chunks, feedback] = await Promise.all([
    retrieveChunks(vector, 5),
    retrieveFeedback(vector, 5),
  ]);

  const systemPrompt = buildSystemPrompt(chunks, feedback);
  const answer = await chatComplete([
    { role: "system", content: systemPrompt },
    ...history.flatMap((turn) => [
      { role: "user" as const, content: turn.question },
      { role: "assistant" as const, content: turn.answer },
    ]),
    { role: "user", content: question },
  ]);

  const citedIds = Array.from(
    new Set(
      Array.from(answer.matchAll(/\[kaynak:(\d+)\]/g)).map((m) => Number(m[1])),
    ),
  );

  const retrievedSourceIds = new Set(chunks.map((c) => c.sourceId));
  const validatedIds = citedIds.filter((id) => retrievedSourceIds.has(id));
  // Citing a source is not enough: the answer must also say things the
  // retrieved text supports, otherwise a made-up sentence with a valid
  // [kaynak:N] tag would pass as verified.
  const support = supportScore(answer, chunks);
  const grounded = validatedIds.length > 0 && support >= minSupport();

  if (options.log !== false) {
    await query(
      `INSERT INTO qa_log (question, answer, grounded, source_ids) VALUES ($1, $2, $3, $4)`,
      [question, answer, grounded, validatedIds],
    );
  }

  const sourceTitles =
    validatedIds.length > 0
      ? (
          await query<{ title: string }>(
            "SELECT title FROM sources WHERE id = ANY($1)",
            [validatedIds],
          )
        ).map((s) => s.title)
      : [];

  return {
    answer,
    grounded,
    sourceIds: validatedIds,
    sourceTitles,
    supportScore: support,
  };
}
