#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const require = createRequire(import.meta.url);
let YAML;
for (const p of ['yaml', join(process.env.HOME, '.capy/work/deps/node_modules/yaml')]) {
  try { YAML = require(p); break } catch {}
}
if (!YAML) { console.error('yaml module missing. Run e2e/lint.sh instead of this file directly.'); process.exit(2) }

const INTERP = '\u0001';
const errors = [];
const notes = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === '_generated' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const rel = (p) => p.slice(root.length + 1);
const swiftFiles = walk(join(root, 'ios')).filter((f) => f.endsWith('.swift'));
const scriptFiles = walk(join(root, 'convex')).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
const webFiles = walk(join(root, 'web')).filter((f) => /\.(js|ts|html)$/.test(f));

const literals = [];
function addLiteral(file, text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length >= 2) literals.push({ file, text: flat });
}

for (const file of swiftFiles) {
  const source = readFileSync(file, 'utf8');
  for (const found of source.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
    addLiteral(rel(file), found[1].replace(/\\\([^()]*(?:\([^()]*\)[^()]*)*\)/g, INTERP).replace(/\\n/g, ' '));
  }
}
for (const file of [...scriptFiles, ...webFiles]) {
  const source = readFileSync(file, 'utf8');
  for (const found of source.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
    addLiteral(rel(file), found[2].replace(/\$\{[^}]*\}/g, INTERP));
  }
}
for (const file of webFiles.filter((f) => f.endsWith('.html'))) {
  const source = readFileSync(file, 'utf8');
  for (const found of source.matchAll(/>([^<>{}]{4,})</g)) addLiteral(rel(file), found[1]);
}

const PUNCT = /[.,:;·—"“…]/g;
function tokens(text) {
  return text.replace(PUNCT, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

const properNouns = new Set();
for (const { text } of literals) for (const w of text.match(/\b[A-Z][a-zA-Z']{1,}\b/g) || []) properNouns.add(w);
const CONNECTORS = new Set(['and', 'or', 'the', 'a', 'an', 'at', 'in', 'on', 'of', 'to', 'for', 'with', 'is', 'are', 'was', 'be', 'it', 'you', 'your', 'im', "i'm", 'if', 'now', 'up', 'out', 'all', 'one', 'two', 'so', 'do', 'we', 'my', 'me', 'no', 'by']);
const MAX_RUN_TOKENS = 8;

const phrases = new Set();
for (const literal of literals) {
  let current = [];
  const flush = () => {
    for (let start = 0; start < current.length; start++) {
      for (let end = current.length; end > start && end - start <= MAX_RUN_TOKENS; end--) {
        const phrase = current.slice(start, end).join(' ');
        if (phrase.length >= 6) phrases.add(phrase);
      }
    }
    current = [];
  };
  for (const token of tokens(literal.text.replace(/\u0001/g, ' \u0001 '))) {
    if (token === '\u0001') flush();
    else current.push(token);
  }
  flush();
}

function atom(token) {
  if (/\d/.test(token)) return true;
  if (token.startsWith('$')) return true;
  if (properNouns.has(token)) return true;
  return CONNECTORS.has(token.toLowerCase());
}

function fragmentGaps(fragment) {
  const flat = fragment.replace(/\s+/g, ' ').trim();
  if (literals.some((literal) => literal.text.includes(flat))) return [];
  const words = tokens(flat);
  const matches = [];
  for (let start = 0; start < words.length; start++) {
    for (let end = words.length; end > start; end--) {
      const counter = end - start;
      const candidate = words.slice(start, end).join(' ');
      if (counter === 1 && candidate.length < 6) continue;
      if (!phrases.has(candidate)) continue;
      matches.push({ start, end, weight: counter * 1000 + candidate.length });
    }
  }
  matches.sort((a, b) => b.weight - a.weight);
  const covered = new Array(words.length).fill(false);
  for (const match of matches) {
    let free = true;
    for (let n = match.start; n < match.end; n++) if (covered[n]) free = false;
    if (!free) continue;
    for (let n = match.start; n < match.end; n++) covered[n] = true;
  }
  return words.filter((word, n) => !covered[n] && !atom(word));
}

const routes = new Set();
for (const file of swiftFiles) {
  const source = readFileSync(file, 'utf8');
  const tabSwitch = source.match(/var tab: AppTab\? \{[\s\S]*?\n    \}/);
  if (tabSwitch) for (const found of tabSwitch[0].matchAll(/"([a-z]+)"/g)) routes.add(found[1]);
  for (const found of source.matchAll(/route\.screen == "([a-z]+)"/g)) routes.add(found[1]);
  const onboarding = source.match(/\["join", "name", "taste", "reading", "calendar"\]/);
  if (onboarding) for (const name of ['join', 'name', 'taste', 'reading', 'calendar']) routes.add(name);
  if (/url\.host == "signin"/.test(source)) routes.add('signin');
  if (/url\.host == "gallery"/.test(source)) routes.add('gallery');
}
const todayFixture = readFileSync(join(root, 'ios/Frolic/Today/TodayFixture.swift'), 'utf8');
const todayStates = new Set(['open']);
const todaySwitch = todayFixture.match(/switch state \{([\s\S]*?)\n        \}/);
if (todaySwitch) {
  for (const found of todaySwitch[1].matchAll(/"([a-z]+)"/g)) todayStates.add(found[1]);
  for (const found of todaySwitch[1].matchAll(/case ([^:]+):/g)) for (const name of found[1].matchAll(/"([a-z]+)"/g)) todayStates.add(name[1]);
}
const crewStates = new Set(['ready', 'friend', 'invite', 'went', 'nobody-free', 'fund-empty', 'free']);
const crewStandIn = readFileSync(join(root, 'ios/Frolic/Crew/CrewStandIn.swift'), 'utf8');
for (const found of crewStandIn.matchAll(/case ([^:]+):/g)) for (const name of found[1].matchAll(/"([a-z-]+)"/g)) crewStates.add(name[1]);
const STATE_SETS = { today: todayStates, crew: crewStates };

const identifiers = new Set();
const identifierPrefixes = [];
const ID_SHAPE = /^[a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9]+)+$/;
function addIdentifier(value) {
  const cut = value.indexOf('\\(');
  if (cut === -1) {
    if (ID_SHAPE.test(value)) identifiers.add(value);
  } else if (cut >= 4) identifierPrefixes.push(value.slice(0, cut));
}
for (const file of swiftFiles) {
  const source = readFileSync(file, 'utf8');
  for (const found of source.matchAll(/"((?:[^"\\]|\\.)*)"/g)) addIdentifier(found[1]);
}
for (const file of webFiles) {
  const source = readFileSync(file, 'utf8');
  for (const found of source.matchAll(/data-testid="([a-z0-9.-]+)"/g)) identifiers.add(found[1]);
}
const identifiersDoc = readFileSync(join(root, 'e2e/identifiers.md'), 'utf8');

const flowDir = process.argv[2] || join(root, 'e2e/flows');
const files = readdirSync(flowDir).filter((f) => f.endsWith('.yaml')).sort();
const QUOTED = /"([^"]{2,})"/g;
const ABSENT = /appear nowhere|nowhere on the screen|is not visible|isn't visible|does not appear|never appear|is never shown|is not shown|no longer appears|no [^.]{0,40} is shown/;
const LINK = /frolic:\/\/([a-z0-9]+)/g;
const LINK_HOSTS = new Set(['e2e', 'join', 'signin', 'gallery', 'today', 'crew', 'garden', 'you']);
const ID_TOKEN = /\b((?:tab|today|join|name|photo|taste|reading|calendar|free|onlyIf|hopin|sunday|chip|crew|garden|memory|you|otw|bail|checkin|push|liveActivity|web|state|app)\.[a-z0-9.]+)\b/g;
const flows = [];

function walkBlocks(blocks, file, visit) {
  blocks.forEach((block, index) => {
    visit(block, index);
    for (const key of ['then', 'else', 'body']) if (Array.isArray(block[key])) walkBlocks(block[key], file, visit);
  });
}

for (const name of files) {
  let doc;
  try { doc = YAML.parse(readFileSync(join(flowDir, name), 'utf8')) } catch { errors.push(name + ': not valid YAML, run e2e/lint.sh for the parse error'); continue }
  const test = doc && doc.test;
  if (!test || !Array.isArray(test.blocks)) continue;
  const flow = { name, route: null, fragments: [], validations: [] };
  walkBlocks(test.blocks, name, (block) => {
    const description = typeof block.step_description === 'string' ? block.step_description : '';
    if (block.type === 'manual' && block.step_type === 'navigate') {
      for (const link of description.matchAll(LINK)) {
        if (!LINK_HOSTS.has(link[1])) errors.push(name + ': deep link frolic://' + link[1] + ' never reaches the app, which handles frolic://e2e, frolic://join, frolic://signin and the tab names');
      }
      const found = description.match(/frolic:\/\/e2e\/([a-z]+)(?::([a-z-]+))?/);
      if (found) {
        flow.route = found[1] + (found[2] ? ':' + found[2] : '');
        if (!routes.has(found[1])) errors.push(name + ': deep link names screen "' + found[1] + '", which the app does not route (routes: ' + [...routes].sort().join(', ') + ')');
        else if (found[2] && STATE_SETS[found[1]] && !STATE_SETS[found[1]].has(found[2])) errors.push(name + ': deep link names ' + found[1] + ' state "' + found[2] + '", which the app does not render (states: ' + [...STATE_SETS[found[1]]].sort().join(', ') + ')');
      }
    }
    if (['validation', 'instructions', 'extraction'].includes(block.type)) {
      const PRESENT = /visible|shows|reads|titled|button|lists|labelled|row|caption|selected|enabled|disabled|toast/;
      const near = (pattern, at) => {
        let best = Infinity;
        for (const hit of description.matchAll(new RegExp(pattern, 'g'))) {
          const left = at - (hit.index + hit[0].length);
          const right = hit.index - (at + 1);
          best = Math.min(best, Math.max(0, Math.min(left < 0 ? Infinity : left, right < 0 ? Infinity : right)));
        }
        return best;
      };
      for (const found of description.matchAll(QUOTED)) {
        const gaps = fragmentGaps(found[1]);
        const covered = [...description.matchAll(new RegExp(ABSENT.source, 'g'))].some((hit) => found.index >= hit.index && found.index < hit.index + hit[0].length);
        if (covered || near(ABSENT.source, found.index) < near(PRESENT.source, found.index)) {
          const flat = found[1].replace(/\s+/g, ' ').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const word = new RegExp('(?<![A-Za-z0-9])' + flat + '(?![A-Za-z0-9])');
          const rendered = literals.find((literal) => word.test(literal.text));
          if (rendered) errors.push(name + ': asserts ' + JSON.stringify(found[1]) + ' is absent, but ' + rendered.file + ' renders ' + JSON.stringify(rendered.text));
          continue;
        }
        if (gaps.length) errors.push(name + ': copy in a ' + block.type + ' block is not in the app source ' + JSON.stringify(found[1]) + ' (missing: ' + gaps.join(', ') + ')');
        else flow.fragments.push(found[1]);
        if (block.type === 'validation') flow.validations.push(found[1]);
      }
      for (const found of description.matchAll(ID_TOKEN)) {
        if (!identifiers.has(found[1])) errors.push(name + ': asserts identifier ' + found[1] + ', which no iOS view sets');
        if (!identifiersDoc.includes('`' + found[1] + '`') && !identifiersDoc.includes(found[1])) errors.push(name + ': asserts identifier ' + found[1] + ', which e2e/identifiers.md does not document');
      }
    }
  });
  flows.push(flow);
}

const documented = new Set();
for (const found of identifiersDoc.matchAll(/`(app|state|tab|join|name|photo|taste|reading|calendar|free|today|onlyIf|hopin|sunday|chip|crew|garden|memory|you|otw|bail|checkin|liveActivity)\.[a-zA-Z0-9.<>_]+`/g)) documented.add(found[0].slice(1, -1));
for (const name of documented) {
  if (name.includes('<') || name.includes('…')) continue;
  if (identifiers.has(name)) continue;
  if (identifierPrefixes.some((prefix) => name.startsWith(prefix))) continue;
  errors.push('e2e/identifiers.md: documents ' + name + ', which no iOS view sets');
}

for (let a = 0; a < flows.length; a++) {
  for (let b = a + 1; b < flows.length; b++) {
    const left = flows[a];
    const right = flows[b];
    if (!left.route || left.route !== right.route) continue;
    if (left.validations.length < 2 || right.validations.length < 2) continue;
    const shared = left.validations.filter((text) => right.validations.includes(text));
    const ratio = shared.length / Math.min(left.validations.length, right.validations.length);
    if (ratio >= 0.8) errors.push(left.name + ' and ' + right.name + ' test the same ' + left.route + ' state: ' + shared.length + ' of ' + Math.min(left.validations.length, right.validations.length) + ' validations are identical, so one of them is a duplicate');
  }
}

for (const line of notes) console.log('note  ' + line);
for (const error of errors) console.log('error ' + error);
console.log('flow drift: ' + files.length + ' flows, ' + documented.size + ' documented identifiers, ' + flows.reduce((sum, flow) => sum + flow.fragments.length, 0) + ' copy assertions checked against ' + literals.length + ' app strings, ' + errors.length + ' errors');
process.exit(errors.length ? 1 : 0);
