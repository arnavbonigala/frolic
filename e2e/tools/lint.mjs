#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let YAML;
for (const p of ['yaml', join(process.env.HOME, '.capy/work/deps/node_modules/yaml')]) {
  try { YAML = require(p); break } catch {}
}
if (!YAML) { console.error('yaml module missing. Run e2e/lint.sh instead of this file directly.'); process.exit(2) }
const { parse } = YAML;

const BLOCK_FIELDS = {
  instructions: ['type', 'step_description'],
  validation: ['type', 'step_description'],
  extraction: ['type', 'step_description', 'variable_name'],
  manual: ['type', 'step_type', 'step_description'],
  if: ['type', 'condition', 'then', 'else'],
  while: ['type', 'condition', 'body'],
  code_execution: ['type', 'script', 'step_description', 'variable_name', 'timeout_seconds'],
  module_import: ['type', 'step_description', 'module_id', 'module'],
};
const STEP_TYPES = new Set(['wait','open_app','kill_app','go_home','navigate','set_location','set_appearance','set_fold_state','download_file','end','set_orientation']);
const TOP = new Set(['metadata','build','device','blocks']);
const META = new Set(['name','platform','tags','variables']);
const BUILD = new Set(['name','branch_id','build_selection','pinned_build_id']);
const DEVICE = new Set(['model','os_version','orientation']);
const NAME_RE = /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/;
const BANNED = [/—/, /!/, /\bnot [^.,]{1,40}, but\b/];
const errors = [];
const warnings = [];

function bad(where, msg) { errors.push(where + ': ' + msg) }
function warn(where, msg) { warnings.push(where + ': ' + msg) }

function checkCopy(where, s) {
  for (const re of BANNED) if (re.test(s)) bad(where, 'copy breaks the Frolic copy rules: ' + JSON.stringify(s));
}

function checkBlocks(where, blocks, depth = 0) {
  if (!Array.isArray(blocks) || blocks.length === 0) return bad(where, 'blocks must be a non-empty array');
  blocks.forEach((b, n) => {
    const at = where + '[' + n + ']';
    if (!b || typeof b !== 'object') return bad(at, 'block must be a mapping');
    const allowed = BLOCK_FIELDS[b.type];
    if (!allowed) return bad(at, 'unknown block type ' + JSON.stringify(b.type));
    for (const k of Object.keys(b)) if (!allowed.includes(k)) bad(at, 'field ' + k + ' not allowed on ' + b.type);
    const silent = b.type === 'code_execution' || b.type === 'if' || b.type === 'while' || ['go_home','kill_app','end'].includes(b.step_type);
    if (!silent && typeof b.step_description !== 'string') warn(at, 'no step_description');
    if (typeof b.step_description === 'string') {
      if (!b.step_description.trim() && !silent) bad(at, 'step_description is empty');
      if (b.type !== 'manual' && b.type !== 'code_execution') checkCopy(at, b.step_description);
    }
    if (b.type === 'manual') {
      if (!STEP_TYPES.has(b.step_type)) bad(at, 'unknown step_type ' + JSON.stringify(b.step_type));
      if (['wait','navigate','set_location','set_appearance','set_fold_state','download_file','open_app','end'].includes(b.step_type) && typeof b.step_description !== 'string') bad(at, 'step_type ' + b.step_type + ' needs a step_description');
      if (b.step_type === 'wait' && !/^\d+$/.test(String(b.step_description))) bad(at, 'wait needs whole seconds, got ' + JSON.stringify(b.step_description));
      if (b.step_type === 'set_location' && !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(String(b.step_description))) bad(at, 'set_location needs "lat,lng"');
      if (b.step_type === 'set_appearance' && !['light','dark'].includes(b.step_description)) bad(at, 'set_appearance needs light or dark');
    }
    if (b.type === 'extraction' && !/^[a-z][a-z0-9_]*$/.test(b.variable_name || '')) bad(at, 'variable_name must be snake_case');
    if (b.type === 'code_execution') {
      if (!b.script) bad(at, 'code_execution needs a script name');
      if (b.timeout_seconds !== undefined && !(Number.isInteger(b.timeout_seconds) && b.timeout_seconds >= 1 && b.timeout_seconds <= 300)) bad(at, 'timeout_seconds must be 1..300');
    }
    if (b.type === 'if') {
      if (!b.condition) bad(at, 'if needs a condition');
      if (!Array.isArray(b.then) || !b.then.length) bad(at, 'if needs a non-empty then');
      if (b.then) checkBlocks(at + '.then', b.then, depth + 1);
      if (b.else) checkBlocks(at + '.else', b.else, depth + 1);
    }
    if (b.type === 'while') {
      if (!b.condition) bad(at, 'while needs a condition');
      if (!Array.isArray(b.body) || !b.body.length) bad(at, 'while needs a non-empty body');
      if (b.body) checkBlocks(at + '.body', b.body, depth + 1);
    }
  });
}

const dir = process.argv[2] || new URL('../flows/', import.meta.url).pathname;
const names = new Map();
const files = readdirSync(dir).filter(f => f.endsWith('.yaml')).sort();
for (const f of files) {
  const path = join(dir, f);
  let doc;
  try { doc = parse(readFileSync(path, 'utf8')) } catch (e) { bad(f, 'not valid YAML: ' + e.message); continue }
  if (!doc || !doc.test) { bad(f, 'missing top-level test:'); continue }
  if (Object.keys(doc).length !== 1) bad(f, 'top level must hold only test:');
  const t = doc.test;
  for (const k of Object.keys(t)) if (!TOP.has(k)) bad(f, 'unknown test key ' + k);
  if (!t.metadata) bad(f, 'missing metadata');
  else {
    const m = t.metadata;
    for (const k of Object.keys(m)) if (!META.has(k)) bad(f, 'unknown metadata key ' + k);
    if (!NAME_RE.test(m.name || '')) bad(f, 'metadata.name must be lowercase-dashed, got ' + JSON.stringify(m.name));
    if (!['ios','android','web'].includes(m.platform)) bad(f, 'metadata.platform must be ios, android or web');
    if (names.has(m.name)) bad(f, 'duplicate metadata.name ' + m.name + ' also in ' + names.get(m.name));
    names.set(m.name, f);
    if (m.tags && (!Array.isArray(m.tags) || m.tags.some(x => typeof x !== 'string'))) bad(f, 'tags must be a list of strings');
  }
  if (!t.build) bad(f, 'missing build');
  else {
    for (const k of Object.keys(t.build)) if (!BUILD.has(k)) bad(f, 'unknown build key ' + k);
    if (!t.build.name) bad(f, 'build.name is required');
    if (t.build.build_selection && !['inherit','latest','latest_all_branches','pinned'].includes(t.build.build_selection)) bad(f, 'unknown build_selection');
    if (t.build.build_selection === 'pinned' && !(t.build.branch_id && t.build.pinned_build_id)) bad(f, 'pinned needs branch_id and pinned_build_id');
  }
  if (t.device) {
    for (const k of Object.keys(t.device)) if (!DEVICE.has(k)) bad(f, 'unknown device key ' + k);
    if (t.device.orientation && !['portrait','landscape'].includes(t.device.orientation)) bad(f, 'device.orientation must be portrait or landscape');
  }
  checkBlocks(f, t.blocks);
}
for (const w of warnings) console.log('warn  ' + w);
for (const e of errors) console.log('error ' + e);
console.log(files.length + ' flow files, ' + errors.length + ' errors, ' + warnings.length + ' warnings');
process.exit(errors.length ? 1 : 0);
