// The release gate runs the same production-level smoke suite as local CI.
// Keeping one canonical test prevents booking rules and migrations from
// drifting between development and deployment verification.
await import(new URL("./smoke.mjs", import.meta.url).href + "?release=" + Date.now());
