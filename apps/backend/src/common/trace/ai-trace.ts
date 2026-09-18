import { Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";

type TraceValue = string | number | boolean | null | undefined;
type TraceMetadata = Record<string, TraceValue | TraceValue[]>;

const isTraceEnabled = () =>
  process.env.AI_TRACE === "true" || process.env.AI_TRACE === "1";

const serializeMetadata = (metadata: TraceMetadata) => {
  const entries = Object.entries(metadata).filter(
    ([, value]) => value !== undefined,
  );
  return entries.length
    ? ` ${JSON.stringify(Object.fromEntries(entries))}`
    : "";
};

export class AiTrace {
  private readonly logger: Logger;
  private readonly enabled: boolean;
  private readonly startedAt = Date.now();
  private ended = false;

  constructor(
    private readonly scope: string,
    private readonly traceId = randomUUID(),
    metadata: TraceMetadata = {},
  ) {
    this.enabled = isTraceEnabled();
    this.logger = new Logger(`AITrace:${scope}`);
    this.mark("start", metadata);
  }

  mark(node: string, metadata: TraceMetadata = {}) {
    if (!this.enabled) return;

    // Trace is opt-in; use the normal log level so it remains visible under
    // the production Winston level configuration when explicitly enabled.
    this.logger.log(
      `[${this.traceId}] node=${node} elapsedMs=${Date.now() - this.startedAt}${serializeMetadata(metadata)}`,
    );
  }

  async step<T>(
    node: string,
    operation: () => T | Promise<T>,
    metadata: TraceMetadata = {},
  ) {
    const startedAt = Date.now();
    this.mark(`${node}.start`, metadata);

    try {
      const result = await operation();
      this.mark(`${node}.complete`, {
        ...metadata,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      this.mark(`${node}.failed`, {
        ...metadata,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  end(metadata: TraceMetadata = {}) {
    if (this.ended) return;
    this.ended = true;
    this.mark("complete", {
      ...metadata,
      durationMs: Date.now() - this.startedAt,
    });
  }
}

export const createAiTrace = (scope: string, metadata: TraceMetadata = {}) =>
  new AiTrace(scope, randomUUID(), metadata);
