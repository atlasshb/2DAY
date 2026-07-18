/**
 * POST /v1/conversations/analyze acceptance tests (vitest + fastify.inject, no network).
 * Reuses the doorstep fixtures from @2day/core so the wire path is exercised end-to-end:
 * request → zod validation → deterministic analyzer → ConversationAnalysis.
 */
import { describe, it, expect } from "vitest";
import { buildServer } from "./server.js";
import { nlSaleFixture, enFollowUpFixture } from "./core.js";
import type { ConversationAnalysis } from "./core.js";

const body = (f: { meta: unknown; transcript: unknown; context: unknown }) => ({
  meta: f.meta,
  transcript: f.transcript,
  context: f.context,
});

describe("POST /v1/conversations/analyze", () => {
  it("valid NL sale fixture → 200 with a classified ConversationAnalysis", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/analyze",
      payload: body(nlSaleFixture),
    });
    expect(res.statusCode).toBe(200);
    const analysis = res.json() as ConversationAnalysis;
    expect(analysis.outcome).toBe("sale");
    expect(analysis.engine).toBe("deterministic");
    expect(analysis.conversationId).toBe(nlSaleFixture.meta.id);
    expect(analysis.objections.some((o) => o.kind === "price" && o.handled)).toBe(true);
    await app.close();
  });

  it("valid EN follow-up fixture → 200 with a next step", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/analyze",
      payload: body(enFollowUpFixture),
    });
    expect(res.statusCode).toBe(200);
    const analysis = res.json() as ConversationAnalysis;
    expect(analysis.outcome).toBe("follow_up");
    expect(analysis.nextStep).toBeDefined();
    await app.close();
  });

  it("invalid body → 400 with the error taxonomy envelope", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/analyze",
      payload: { meta: { id: "not-a-ulid" }, transcript: [], context: {} },
    });
    expect(res.statusCode).toBe(400);
    const err = res.json() as { error: { code: string; message: string; details?: unknown } };
    expect(err.error.code).toBe("CONVERSATION_REQUEST_INVALID");
    expect(err.error.details).toBeDefined();
    await app.close();
  });
});
