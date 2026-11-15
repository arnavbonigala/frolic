#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const COPY_FILE = "convex/lib/copy.ts";
const errors = [];

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function constant(name) {
  const found = read(COPY_FILE).match(new RegExp('export const ' + name + ' = "([^"]*)";'));
  if (!found) {
    errors.push(COPY_FILE + ": has no string constant named " + name);
    return "";
  }
  return found[1];
}

const FADED_TITLE = constant("FADED_TITLE");
const FADED_BODY = constant("FADED_BODY");
const BAIL_BODY = constant("BAIL_BODY");
const ONLY_IF_BUTTON = constant("ONLY_IF_BUTTON");
const ONLY_IF_TITLE = constant("ONLY_IF_TITLE");
const PROMISE = constant("PROMISE");

const BINARY = /\.(png|jpe?g|gif|webp|avif|heic|ico|icns|ttf|otf|woff2?|mp4|mov|pdf|zip|gz|jar|mp3|wav)$/i;
const SKIP = new Set(["package-lock.json", "e2e/tools/copy-lint.mjs"]);
const SKIP_PREFIX = ["e2e/reports/"];

const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => !BINARY.test(file) && !SKIP.has(file) && !SKIP_PREFIX.some((prefix) => file.startsWith(prefix)));

const OLD_PHRASES = [
  {
    re: /not everyone you picked/i,
    why: "the faded screen must never say who did or did not say yes",
  },
  {
    re: /one fewer|one less/i,
    why: "the bail sheet must never tell anyone that someone bailed",
  },
  {
    re: /Only if…/,
    why: "the button and the sheet use the mock's words: only with",
  },
  {
    re: /I'm down only if/i,
    why: "the sheet title is I'm down only with",
  },
  {
    re: /\.join\(" and "\)/,
    why: "name lists go through listNames, so three or more names get their commas",
  },
  {
    re: /view\.place !== view\.title/,
    why: "the place is appended only through titleNamesPlace, so a title never says it twice",
  },
];

for (const file of files) {
  const lines = read(file).split("\n");
  lines.forEach((line, index) => {
    for (const phrase of OLD_PHRASES) {
      if (phrase.re.test(line)) {
        errors.push(file + ":" + (index + 1) + ": " + phrase.why + ": " + JSON.stringify(line.trim().slice(0, 140)));
      }
    }
  });
}

const ONLY_IF_LINE = /I'm down if/;
for (const file of files.filter((name) => name.endsWith(".swift"))) {
  if (!file.includes("only-ignore")) {
    read(file)
      .split("\n")
      .forEach((line, index) => {
        if (!ONLY_IF_LINE.test(line)) return;
        if (line.includes("ifIn(")) return;
        errors.push(file + ":" + (index + 1) + ": the only with button reads through ifIn, so it says comes or come: " + JSON.stringify(line.trim().slice(0, 140)));
      });
  }
}

for (const file of files.filter((name) => name.endsWith(".swift"))) {
  read(file)
    .split("\n")
    .forEach((line, index) => {
      if (!line.includes('"you and " +')) return;
      errors.push(file + ":" + (index + 1) + ": you joins the name list, so it reads you, Dev and Jordan: " + JSON.stringify(line.trim().slice(0, 140)));
    });
}

const MEMORY_CALL = /(?:personal|group)\("[a-z_]+", "([^"\\]*)/g;
for (const found of read("convex/memory/mapping.ts").matchAll(MEMORY_CALL)) {
  const start = found[1].charAt(0);
  if (start && start === start.toLowerCase() && start !== start.toUpperCase()) {
    errors.push("convex/memory/mapping.ts: a memory line is a full sentence and starts with a capital: " + JSON.stringify(found[0].slice(0, 100)));
  }
}

for (const found of read("convex/dailyPickBank.ts").matchAll(/o\("([^"]*)"/g)) {
  const start = found[1].charAt(0);
  if (start && start === start.toLowerCase() && start !== start.toUpperCase()) {
    errors.push("convex/dailyPickBank.ts: a pick option is capitalized on the card: " + JSON.stringify(found[1]));
  }
}

const ANCHORS = [FADED_TITLE, FADED_BODY, BAIL_BODY, ONLY_IF_BUTTON, ONLY_IF_TITLE].map((text) => text.toLowerCase());
const PREFIXES = ["this one drifted", "nobody knows", "your crew will see", "spot open up", "only if", "i'm down only if"];
const SWIFT_LITERAL = /"((?:[^"\\\n]|\\.)*)"/g;

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

for (const file of files.filter((name) => name.endsWith(".swift"))) {
  const text = read(file);
  for (const found of text.matchAll(SWIFT_LITERAL)) {
    const body = found[1].toLowerCase();
    if (!PREFIXES.some((anchor) => body.includes(anchor))) continue;
    if (!found[1].includes("\\(")) continue;
    errors.push(file + ":" + lineOf(text, found.index) + ": a faded or bail string is built by interpolation, so it can name a person or a count: " + JSON.stringify(found[1]));
  }
}

for (const file of files.filter((name) => /\.(js|ts|tsx|html)$/.test(name) && name !== COPY_FILE && name !== "convex/web/pageTemplate.ts")) {
  const text = read(file);
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    if (!PREFIXES.some((anchor) => lower.includes(anchor))) return;
    if (!/\$\{/.test(line)) return;
    errors.push(file + ":" + (index + 1) + ": a faded or bail string is templated, so it can name a person or a count: " + JSON.stringify(line.trim().slice(0, 140)));
  });
}

for (const file of files.filter((name) => name.startsWith("e2e/flows/") && name.endsWith(".yaml"))) {
  const lines = read(file).split("\n");
  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    if (!PREFIXES.some((anchor) => lower.includes(anchor))) return;
    if (!/\{\{|\$\{/.test(line)) return;
    errors.push(file + ":" + (index + 1) + ": a faded or bail flow assertion is templated: " + JSON.stringify(line.trim().slice(0, 140)));
  });
}

const REQUIRED = [
  ["design/mock/index.html", [FADED_TITLE, FADED_BODY, BAIL_BODY, ONLY_IF_BUTTON, ONLY_IF_TITLE]],
  ["convex/web/pageTemplate.ts", [FADED_TITLE, FADED_BODY, PROMISE]],
  ["e2e/identifiers.md", [FADED_TITLE, FADED_BODY, BAIL_BODY, ONLY_IF_BUTTON, ONLY_IF_TITLE]],
  ["e2e/flows/09-today-faded.yaml", [FADED_TITLE, FADED_BODY]],
  ["e2e/flows/18-bail-and-refill.yaml", [BAIL_BODY]],
];

for (const [file, needed] of REQUIRED) {
  const text = read(file);
  for (const piece of needed) {
    if (!text.includes(piece)) errors.push(file + ": is missing the approved copy " + JSON.stringify(piece));
  }
}

const PAGE_SHAPE = [
  "' + esc(FADED_TITLE) + '</h1>",
  "' + esc(FADED_BODY) + '</p>",
  "' + esc(PROMISE) + \"</p>\"",
];

const PROMISE_SHAPE = [
  ["web/src/client.js", "+ promise(v) + packet("],
  ["convex/keiki/tools.ts", "welcome: PROMISE,"],
  ["convex/keiki/tools.ts", "say: 'Open with \"' + PROMISE"],
];

for (const [file, piece] of PROMISE_SHAPE) {
  if (!read(file).includes(piece)) {
    errors.push(file + ": the promise line must come from PROMISE, missing " + JSON.stringify(piece));
  }
}

for (const piece of PAGE_SHAPE) {
  if (!read("web/src/client.js").includes(piece)) {
    errors.push("web/src/client.js: the faded card must draw the approved string and nothing after it, missing " + JSON.stringify(piece));
  }
}

for (const line of errors) console.log("error " + line);
console.log("copy privacy: " + files.length + " files scanned, " + errors.length + " errors");
process.exit(errors.length ? 1 : 0);
