/**
 * Conversation-intelligence endpoint (docs/21 §API surface).
 *
 * POST /v1/conversations/analyze — validate the body with the canonical
 * `analyzeConversationRequest` (@2day/core), run the offline deterministic
 * analyzer, and return a `ConversationAnalysis`. Same error envelope as every
 * other planner route (`{error:{code,message,details}}`, see server.ts / errors.ts).
 *
 * The analyzer is injectable so tests can swap engines; the default is the pure,
 * deterministic on-device analyzer (no clock, no I/O — reproducible responses).
 * The Claude engine is NOT wired here: it needs a network transport (doc 09 §6)
 * and the app's on-device path already prefers the deterministic floor (docs/21).
 */
import type { FastifyInstance } from "fastify";
import { analyzeConversationRequest, deterministicAnalyzer, type ConversationAnalyzer } from "./core.js";
import { zodErrorBody } from "./errors.js";

export interface ConversationRouteOptions {
  analyzer?: ConversationAnalyzer;
}

export function registerConversationRoutes(
  app: FastifyInstance,
  opts: ConversationRouteOptions = {},
): void {
  const analyzer = opts.analyzer ?? deterministicAnalyzer;

  app.post("/v1/conversations/analyze", async (request, reply) => {
    const parsed = analyzeConversationRequest.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(zodErrorBody("CONVERSATION_REQUEST_INVALID", parsed.error));
    }
    const { meta, transcript, context } = parsed.data;
    const analysis = await analyzer.analyze(meta, transcript, context);
    return reply.code(200).send(analysis);
  });
}
