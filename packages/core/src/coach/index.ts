/**
 * Conversation-intelligence coach (docs/21-conversation-intelligence.md).
 *
 * Two engines behind one `ConversationAnalyzer` seam (conversation.ts):
 *   - `deterministicAnalyzer` — pure, offline, on-device lexicon rules engine (the
 *     floor the app UI is built against). Also `createDeterministicAnalyzer({clock})`.
 *   - `createClaudeAnalyzer(transport)` — online nuance engine over an injected
 *     Claude tool-use transport; validates the reply, never sends audio or GPS.
 *
 * Plus the doorstep `fixtures` and the shared lexicons/util for reuse and testing.
 */
export * from "./deterministic.js";
export * from "./claude.js";
export * from "./fixtures.js";
export * from "./lexicons.js";
export * from "./util.js";
