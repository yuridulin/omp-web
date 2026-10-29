import openapiTS, { astToString } from "openapi-typescript";

/**
 * Generates the typed client schema from the committed OpenAPI artifact.
 * `--check` fails when the generated file is stale (CI).
 */

const source = new URL("../contract/open-api.yaml", import.meta.url);
const output = new URL("../web/src/api/schema.d.ts", import.meta.url);
const header = "// Generated from contract/open-api.yaml by scripts/generate-web-types.ts. Do not edit.\n";

const ast = await openapiTS(source);
const text = header + astToString(ast);

if (process.argv.includes("--check")) {
  const current = await Bun.file(output).text().catch(() => "");
  if (current !== text) {
    console.error("web/src/api/schema.d.ts is stale. Run `bun run web:types`.");
    process.exit(1);
  }
  console.log("web/src/api/schema.d.ts is current");
} else {
  await Bun.write(output, text);
  console.log("wrote web/src/api/schema.d.ts");
}
