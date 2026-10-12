import { query } from "./db";
import { ProviderError } from "./provider-error";

export type IngestFailure =
  | { status: "failed"; message: string }
  | { status: "pending"; configProblem: boolean };

// Decides what an ingest failure means for a source and records it.
// - input rejected: retrying the same text cannot succeed, so the source is
//   marked failed with the reason (the teacher can edit it or retry).
// - config or transient: the source stays pending and is retried
//   automatically once the provider works again.
export async function recordIngestFailure(
  sourceId: number,
  err: unknown,
): Promise<IngestFailure> {
  if (err instanceof ProviderError && err.kind === "input") {
    await query(
      "UPDATE sources SET status = 'failed', error = $2 WHERE id = $1",
      [sourceId, err.message],
    );
    return { status: "failed", message: err.message };
  }
  return {
    status: "pending",
    configProblem: err instanceof ProviderError && err.kind === "config",
  };
}
