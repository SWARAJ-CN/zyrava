/**
 * Regenerates the dictionaries for the non-English languages from the English
 * master copy. Translations already made are kept; only new messages are
 * added, and they arrive in English so a translator can pick them up.
 *   node scripts/sync-messages.mjs
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const MESSAGES = new URL("../lib/i18n/messages/", import.meta.url).pathname;
const LOCALES = ["hi", "ml", "ta"];
const MODULES = ["shell", "common", "dashboard", "sales", "expenses", "products", "tools", "developer", "settings"];

/** Transpile one message module and return its exported object. */
function loadModule(dir, name) {
  const file = path.join(dir, `${name}.ts`);
  if (!fs.existsSync(file)) return null;
  const source = fs.readFileSync(file, "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const mod = { exports: {} };
  const factory = new Function("module", "exports", "require", js);
  factory(mod, mod.exports, () => ({}));
  return mod.exports[name] ?? null;
}

const enDir = path.join(MESSAGES, "en");
const enModules = {};
for (const name of MODULES) {
  const dict = loadModule(enDir, name);
  if (!dict) continue;
  enModules[name] = dict;
}

function writeModule(dir, name, dict) {
  const lines = [];
  lines.push(`import type { ${name} as en } from "../en/${name}";`);
  lines.push("");
  lines.push(`export const ${name}: Record<keyof typeof en, string> = {`);
  for (const [key, value] of Object.entries(dict)) {
    lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  }
  lines.push("};");
  fs.writeFileSync(path.join(dir, `${name}.ts`), lines.join("\n") + "\n");
  console.log(`wrote ${path.basename(path.dirname(dir))}/${name}.ts (${Object.keys(dict).length} messages)`);
}

for (const locale of LOCALES) {
  const dir = path.join(MESSAGES, locale);
  fs.mkdirSync(dir, { recursive: true });
  const mergedModules = {};
  for (const [name, enDict] of Object.entries(enModules)) {
    const existing = loadModule(dir, name) ?? {};
    const merged = {};
    for (const key of Object.keys(enDict)) {
      merged[key] = existing[key] ?? enDict[key];
    }
    mergedModules[name] = merged;
    writeModule(dir, name, merged);
  }
  const imports = Object.keys(mergedModules)
    .map((name) => `import { ${name} } from "./${name}";`)
    .join("\n");
  const spread = Object.keys(mergedModules)
    .map((name) => `  ...${name},`)
    .join("\n");
  const reexport = `export { ${Object.keys(mergedModules).join(", ")} };`;
  fs.writeFileSync(
    path.join(dir, "index.ts"),
    `${imports}\n\n/**\n * The language's dictionary, assembled from its message modules.\n */\nexport const ${locale} = {\n${spread}\n};\n\n${reexport}\n`
  );
  console.log(`wrote ${locale}/index.ts`);
}
