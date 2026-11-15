#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const allowlistPath = join(root, "tests/backend/depth/uncovered-allowlist.ts");
const REGISTRATION = /export const (\w+) = (query|mutation|action|internalQuery|internalMutation|internalAction)\(/g;
const SKIP_OPEN = "test.skip(";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "_generated" || entry === "node_modules") continue;
      walk(path, out);
    } else if (entry.endsWith(".ts")) {
      out.push(path);
    }
  }
  return out;
}

function withoutSkips(source) {
  let out = "";
  let index = 0;
  for (;;) {
    const start = source.indexOf(SKIP_OPEN, index);
    if (start === -1) return out + source.slice(index);
    out += source.slice(index, start);
    let depth = 0;
    let cursor = start + SKIP_OPEN.length - 1;
    for (; cursor < source.length; cursor++) {
      if (source[cursor] === "(") depth += 1;
      else if (source[cursor] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    index = cursor + 1;
  }
}

const files = walk(join(root, "convex"));
const sources = files
  .filter((path) => !path.endsWith(".test.ts") && !path.includes("/tests/") && !path.endsWith("convex.config.ts"))
  .map((path) => ({ path, text: readFileSync(path, "utf8") }));

const tests = files
  .filter((path) => path.endsWith(".test.ts"))
  .map((path) => withoutSkips(readFileSync(path, "utf8")))
  .concat(
    files
      .filter((path) => path.startsWith(join(root, "tests")) && path.endsWith(".test.ts"))
      .map((path) => withoutSkips(readFileSync(path, "utf8"))),
  );
const testText = tests.join("\n");

const registered = [];
for (const { path, text } of sources) {
  const module = relative(join(root, "convex"), path).replace(/\.ts$/, "").replace(/\//g, ".");
  for (const match of text.matchAll(REGISTRATION)) {
    const accessor = match[2].startsWith("internal") ? "internal" : "api";
    registered.push(`${accessor}.${module}.${match[1]}`);
  }
}

const uncovered = [...new Set(registered)].filter((dotted) => !testText.includes(dotted)).sort();
const write = process.argv.includes("--write");
const mdIndex = process.argv.indexOf("--md");

if (write) {
  const body = uncovered.map((name) => `  "${name}",`).join("\n");
  writeFileSync(allowlistPath, `export const UNCOVERED_ALLOWLIST: string[] = [\n${body}\n];\n`);
  console.log(`wrote ${uncovered.length} known uncovered functions to ${relative(root, allowlistPath)}`);
}

if (mdIndex !== -1 && process.argv[mdIndex + 1]) {
  const lines = [
    "## Functions no test calls",
    "",
    "Regenerate with `node scripts/depth-coverage.mjs --write --md <file>`. The list is the checked-in allowlist in `tests/backend/depth/uncovered-allowlist.ts`; it may only grow by regenerating both files on purpose.",
    "",
    uncovered.length === 0 ? "None. Every registered function is called by a test." : uncovered.map((name) => `- \`${name}\``).join("\n"),
    "",
  ];
  writeFileSync(process.argv[mdIndex + 1], lines.join("\n"));
  console.log(`wrote the markdown section to ${process.argv[mdIndex + 1]}`);
}

console.log(`${registered.length} registered functions, ${uncovered.length} with no test`);
for (const name of uncovered) console.log(`  ${name}`);
