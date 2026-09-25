// Production release gate: syntax + static feature/surface verification.
// Runtime health is verified separately by the release workflow against the live Worker.
await import(new URL("./final-static.mjs", import.meta.url).href + "?release=" + Date.now());
