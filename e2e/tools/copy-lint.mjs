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

const BINARY = /\.(png|jpe?g|gif|webp|avif|heic|ico|icns|ttf|otf|woff2?|mp4|mov|pdf|zip|gz|jar|mp3|wav)$/i;
const SKIP = new Set(["package-lock.json"]);

const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((file) => !BINARY.test(file) && !SKIP.has(file));

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
    re: /(?<!shared )only with/i,
    why: "the button and the sheet say only if, not only with",
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

const ANCHORS = [FADED_TITLE, FADED_BODY, BAIL_BODY, ONLY_IF_BUTTON, ONLY_IF_TITLE].map((text) => text.toLowerCase());
const SWIFT_LITERAL = /"((?:[^"\\\n]|\\.)*)"/g;

for (const file of files.filter((name) => name.endsWith(".swift"))) {
  const text = read(file);
  for (const found of text.matchAll(SWIFT_LITERAL)) {
    const body = found[1];
    if (!ANCHORS.some((anchor) => body.toLowerCase().includes(anchor))) continue;
    if (!body.includes("\\(")) continue;
    const line = text.slice(0, found.index).split("\n").length;
    errors.push(file + ":" + line + ": a faded or bail string is built by interpolation, so it can name a person or a count: " + JSON.stringify(body));
  }
}

for (const file of files.filter((name) => name.startsWith("e2e/flows/") && name.endsWith(".yaml"))) {
  const lines = read(file).split("\n");
  lines.forEach((line, index) => {
    if (!ANCHORS.some((anchor) => line.toLowerCase().includes(anchor))) return;
    if (!/\{\{|\$\{/.test(line)) return;
    errors.push(file + ":" + (index + 1) + ": a faded or bail flow assertion is templated: " + JSON.stringify(line.trim().slice(0, 140)));
  });
}

const REQUIRED = [
  ["design/mock/index.html", [FADED_TITLE, FADED_BODY, BAIL_BODY, ONLY_IF_BUTTON, ONLY_IF_TITLE]],
  ["convex/web/pageTemplate.ts", [FADED_TITLE, FADED_BODY]],
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

for (const line of errors) console.log("error " + line);
console.log("copy privacy: " + files.length + " files scanned, " + errors.length + " errors");
process.exit(errors.length ? 1 : 0);
