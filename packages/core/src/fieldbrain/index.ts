/**
 * Field brain public API (docs/10-ai-architecture.md §4). Deterministic on-device
 * rules engine: `defaultRules()` → catalog, `nextNudge()` → arbitration, `Signals`
 * in, at-most-one `Nudge` out. No LLM, no I/O, no timers.
 */
export * from "./types.js";
export * from "./rules.js";
export * from "./arbitrate.js";
