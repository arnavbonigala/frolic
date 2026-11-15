#!/usr/bin/env node
import process from 'node:process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ZONE = 'America/Los_Angeles';
const RUN = /^[A-Za-z0-9_-]{1,64}$/;
const run = process.argv[2] || process.env.FROLIC_E2E_RUN || '';

function must(name) {
  const value = process.env[name];
  if (!value) {
    console.error('missing environment variable ' + name);
    process.exit(2);
  }
  return value;
}

if (!RUN.test(run)) {
  console.error('usage: npm run rehearse -- <run name, A-Z a-z 0-9 _ ->');
  process.exit(2);
}

const e2eUrl = must('E2E_URL').replace(/\/+$/, '');
const secret = must('E2E_SECRET');

function clock(at) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
}

const response = await fetch(e2eUrl + '/e2e/rehearse', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-e2e-secret': secret },
  body: JSON.stringify({ run }),
});

const text = await response.text();
if (!response.ok) {
  console.error('/e2e/rehearse ' + response.status + ' ' + text);
  process.exit(1);
}

const body = JSON.parse(text);
const lines = [];
lines.push('run ' + body.run + ' on ' + body.day);
for (const crew of body.crews) {
  lines.push(
    crew.name +
      ' (' +
      crew.members.join(', ') +
      ') open: ' +
      crew.planTitle +
      ', starts ' +
      clock(crew.startsAt) +
      ', deadline ' +
      clock(crew.deadline) +
      ', ' +
      crew.taps +
      ' taps',
  );
}
lines.push(
  'kept: ' +
    body.kept.pastFrolics +
    ' past frolics, ' +
    body.kept.snaps +
    ' flowers, ' +
    body.kept.moneyRows +
    ' money rows',
);
lines.push(
  'cleared: ' +
    body.cleared.frolics +
    ' todays frolics, ' +
    body.cleared.rows +
    ' rows, ' +
    body.cleared.revealLog +
    ' reveal log rows',
);

const fresh = body.users.filter((user) => user.link);
const dir = process.env.FROLIC_REHEARSE_DIR || join(homedir(), '.capy', 'work', 'rehearse');
await mkdir(dir, { recursive: true });
const path = join(dir, 'rehearse-' + body.run + '.json');
let earlier = null;
try {
  earlier = JSON.parse(await readFile(path, 'utf8'));
} catch {
  earlier = null;
}
const carried = (name) => earlier?.users?.find((user) => user.name === name)?.link ?? null;
body.users = body.users.map((user) => ({ ...user, link: user.link ?? carried(user.name) }));
await writeFile(path, JSON.stringify(body, null, 2) + '\n', 'utf8');
lines.push(
  fresh.length === 0
    ? 'no new sign-ins, the links already at ' + path + ' still work'
    : fresh.length === body.users.length
      ? 'sign-in links written to ' + path
      : 'new sign-in links for ' + fresh.map((user) => user.name).join(', ') + ' written to ' + path,
);

console.log(lines.join('\n'));
