import { readFile, writeFile, rm } from "node:fs/promises";

const sourcePath = new URL("./smoke.mjs", import.meta.url);
const tempPath = new URL("./.release-smoke.generated.mjs", import.meta.url);
let source = await readFile(sourcePath, "utf8");

source = source.replace(
  '"0007_platform_expansion.sql"])',
  '"0007_platform_expansion.sql", "0008_advanced_inventory_and_booking.sql"])'
);

source = source.replace(
  /requestedFrom: "(\d{4}-\d{2}-\d{2})", requestedUntil: "(\d{4}-\d{2}-\d{2})"/g,
  'requestedFrom: "$1T10:00", requestedUntil: "$2T10:00", quantity: 1'
);

source = source.replace(
  'const migration = await readFile(\`migrations/\${filename}\`, "utf8");',
  'const migration = (await readFile(\`migrations/\${filename}\`, "utf8")).replace(/^\\s*--.*$/gm, "");'
);

if (!source.includes("0008_advanced_inventory_and_booking.sql")) {
  throw new Error("Release smoke did not inject migration 0008");
}
if (/requestedFrom: "\d{4}-\d{2}-\d{2}"/.test(source)) {
  throw new Error("Release smoke still contains date-only loan requests");
}

await writeFile(tempPath, source, "utf8");
try {
  await import(tempPath.href + "?release=" + Date.now());
} finally {
  await rm(tempPath, { force: true });
}
