// Production release gate: static checks plus a real end-to-end worker workflow.
await import(new URL("./final-static.mjs", import.meta.url).href + "?release=" + Date.now());
await import(new URL("./smoke.mjs", import.meta.url).href + "?release=" + Date.now());
