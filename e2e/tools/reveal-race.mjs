#!/usr/bin/env node
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';

const E2E_URL = must('E2E_URL').replace(/\/+$/, '');
const E2E_SECRET = must('E2E_SECRET');
const CONVEX_URL = must('SHARED_CONVEX_URL').replace(/\/+$/, '');
const RACES = Number(process.env.REVEAL_RACES || 10);
const RUN_PREFIX = process.env.REVEAL_RUN || 'p1reveal';
const REVEAL_DELAY_MS = 1500;
const BARRIER_LIMIT_MS = 100;
const REVEAL_WAIT_MS = 8000;
const ZONE = 'America/Los_Angeles';

const failures = [];
const runs = [];

function must(name) {
  const value = process.env[name];
  if (!value) {
    console.error('missing environment variable ' + name);
    process.exit(2);
  }
  return value;
}

function check(scope, label, ok, detail) {
  if (!ok) failures.push({ scope, label, detail: detail ?? null });
  return ok;
}

async function e2e(path, body) {
  const res = await fetch(E2E_URL + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', 'x-e2e-secret': E2E_SECRET },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(path + ' ' + res.status + ' ' + text);
  return JSON.parse(text);
}

function convexCall(kind, path, args) {
  const started = performance.now();
  const promise = fetch(CONVEX_URL + '/api/' + kind, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, args, format: 'json' }),
  }).then(async (res) => {
    const body = await res.json();
    const done = performance.now();
    if (body.status !== 'success') {
      throw new Error(path + ' failed: ' + (body.errorMessage || JSON.stringify(body).slice(0, 300)));
    }
    return { value: body.value, done, rtt: done - started };
  });
  return { started, promise };
}

function query(path, args) {
  return convexCall('query', path, args).promise.then((result) => result.value);
}

function dayInZone(utcMs) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(utcMs));
}

function collectUserIds(value, out) {
  if (Array.isArray(value)) {
    for (const item of value) collectUserIds(item, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'userId' && typeof child === 'string') out.push(child);
    else collectUserIds(child, out);
  }
  return out;
}

function keysIn(value, out) {
  if (Array.isArray(value)) {
    for (const item of value) keysIn(item, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value)) {
    out.push(key);
    keysIn(child, out);
  }
  return out;
}

const SECRET_KEYS = ['onlyIf', 'taps', 'reveals', 'down', 'attendees', 'matchedAt'];
const OWN_TAP_PATH = 'myTap';

function scanForSecrets(value, where, scope) {
  if (Array.isArray(value)) {
    for (const item of value) scanForSecrets(item, where, scope);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const here = where ? where + '.' + key : key;
    const allowed = here.endsWith(OWN_TAP_PATH + '.onlyIf') || here.endsWith(OWN_TAP_PATH + '.kind');
    if (!allowed && SECRET_KEYS.includes(key)) {
      check(scope, 'no ' + key + ' on a client read before revealAt', false, here);
    }
    if (!allowed && key === 'reveal' && child !== null) {
      check(scope, 'no reveal on a client read before revealAt', false, here);
    }
    scanForSecrets(child, here, scope);
  }
}

const PRE_REVEAL_QUERIES = [
  { path: 'frolics:today', args: (m, ctx) => ({ deviceToken: m.deviceToken, groupId: ctx.groupId }) },
  { path: 'crew:crew', args: (m, ctx) => ({ deviceToken: m.deviceToken, groupId: ctx.groupId, day: ctx.day }) },
  { path: 'crews:mine', args: (m) => ({ deviceToken: m.deviceToken }) },
  { path: 'users:me', args: (m) => ({ deviceToken: m.deviceToken }) },
  { path: 'you:totals', args: (m) => ({ deviceToken: m.deviceToken }) },
  { path: 'garden:overview', args: (m, ctx) => ({ deviceToken: m.deviceToken, groupId: ctx.groupId }) },
  { path: 'dailyPick:today', args: (m, ctx) => ({ deviceToken: m.deviceToken, groupId: ctx.groupId }) },
  { path: 'etas:forFrolic', args: (m, ctx) => ({ deviceToken: m.deviceToken, frolicId: ctx.frolicId }) },
  { path: 'snaps:forFrolic', args: (m, ctx) => ({ deviceToken: m.deviceToken, frolicId: ctx.frolicId }) },
];

async function sweep(members, ctx, scope) {
  const names = Object.keys(members);
  const calls = [];
  for (const name of names) {
    for (const spec of PRE_REVEAL_QUERIES) {
      calls.push({
        name,
        path: spec.path,
        promise: query(spec.path, spec.args(members[name], ctx)).catch((error) => ({
          error: String(error.message || error),
        })),
      });
    }
  }
  const settled = await Promise.all(calls.map((call) => call.promise));
  const views = {};
  names.forEach((name) => {
    views[name] = {};
  });
  calls.forEach((call, index) => {
    views[call.name][call.path] = settled[index];
  });
  for (const [name, out] of Object.entries(views)) {
    for (const [path, value] of Object.entries(out)) {
      if (value && value.error) continue;
      scanForSecrets(value, path, scope + ':' + name);
    }
    const today = out['frolics:today'];
    if (!today || today.error) continue;
    check(scope, name + ' reads no reveal before revealAt', today.reveal === null, JSON.stringify(today.reveal));
    const foreign = collectUserIds(today, []).filter((id) => id !== members[name].userId);
    const own = new Set((today.myTap?.onlyIf ?? []).map((p) => p.userId));
    const leaked = foreign.filter((id) => !own.has(id));
    check(scope, name + ' todays card names nobody else', leaked.length === 0, leaked.join(','));
    for (const path of ['etas:forFrolic', 'snaps:forFrolic']) {
      const value = out[path];
      if (value && value.error) continue;
      check(scope, name + ' gets nothing from ' + path + ' before revealAt', Array.isArray(value) && value.length === 0, JSON.stringify(value));
    }
    const crew = out['crew:crew'];
    if (crew && !crew.error && Array.isArray(crew.members)) {
      const shapes = new Set();
      for (const member of crew.members) {
        for (const key of Object.keys(member)) shapes.add(key);
      }
      const extra = [...shapes].filter(
        (key) => !['userId', 'name', 'color', 'photoUrl', 'isMe', 'together', 'free'].includes(key),
      );
      check(scope, name + ' crew read carries no tap state', extra.length === 0, extra.join(','));
    }
  }
  return views;
}

async function oneRace(index) {
  const run = RUN_PREFIX + String(index);
  const scope = 'race' + String(index);
  runs.push(run);
  await e2e('/e2e/reset', { run });
  const seed = await e2e('/e2e/seed', { run, scenario: 'demo' });
  const members = seed.users;
  const ctx = { groupId: seed.groupId, frolicId: seed.frolicId, day: dayInZone(Date.now()) };
  check(scope, 'seeded frolic', typeof seed.frolicId === 'string');

  await Promise.all([
    query('users:me', { deviceToken: 'warmup' }),
    query('users:me', { deviceToken: 'warmup' }),
  ]);

  const barrierAt = Date.now();
  const mayaTap = convexCall('mutation', 'taps:tap', {
    deviceToken: members.maya.deviceToken,
    frolicId: seed.frolicId,
    kind: 'down',
    onlyIf: [members.dev.userId],
  });
  const devTap = convexCall('mutation', 'taps:tap', {
    deviceToken: members.dev.deviceToken,
    frolicId: seed.frolicId,
    kind: 'down',
  });
  const issueSpread = Math.abs(mayaTap.started - devTap.started);
  const [mayaDone, devDone] = await Promise.all([mayaTap.promise, devTap.promise]);
  const lastIssue = Math.max(mayaTap.started, devTap.started);
  const responseSpread = Math.abs(mayaDone.done - devDone.done);
  check(scope, 'both taps landed inside the ' + BARRIER_LIMIT_MS + 'ms barrier', issueSpread <= BARRIER_LIMIT_MS, issueSpread.toFixed(2) + 'ms');

  const views = await sweep(members, ctx, scope);
  for (const name of ['maya', 'dev']) {
    const phase = views[name]['frolics:today']?.phase;
    check(scope, name + ' waits after tapping', phase === 'waiting', String(phase));
  }
  for (const name of ['jordan', 'priya']) {
    const today = views[name]['frolics:today'];
    check(scope, name + ' sees the card unanswered', today?.phase === 'open', String(today?.phase));
    check(scope, name + ' holds no tap of their own', today?.myTap === null, JSON.stringify(today?.myTap));
  }
  check(scope, 'maya keeps her own only-if', views.maya['frolics:today']?.myTap?.onlyIf?.length === 1, JSON.stringify(views.maya['frolics:today']?.myTap));
  check(scope, 'dev sees no only-if at all', views.dev['frolics:today']?.myTap?.onlyIf?.length === 0, JSON.stringify(views.dev['frolics:today']?.myTap));

  const logBefore = await e2e('/e2e/reveals?run=' + run);
  const sweepWasPreReveal = logBefore.reveals.length === 0;

  const polls = [];
  let revealed = null;
  const pollStart = performance.now();
  while (performance.now() - pollStart < REVEAL_WAIT_MS) {
    const [mayaView, devView] = await Promise.all([
      query('frolics:today', { deviceToken: members.maya.deviceToken, groupId: seed.groupId }),
      query('frolics:today', { deviceToken: members.dev.deviceToken, groupId: seed.groupId }),
    ]);
    const at = performance.now();
    const both = { maya: mayaView, dev: devView, at };
    polls.push(both);
    if (mayaView.reveal !== null || devView.reveal !== null) {
      revealed = both;
      break;
    }
    await sleep(50);
  }
  const lastNull = [...polls].reverse().find((p) => p.maya.reveal === null && p.dev.reveal === null) ?? null;
  check(scope, 'the reveal lands within ' + REVEAL_WAIT_MS + 'ms', revealed !== null);
  if (!revealed) return { run, failed: true };

  const log = await e2e('/e2e/reveals?run=' + run);
  const rows = log.reveals.filter((row) => row.frolicId === seed.frolicId);
  check(scope, 'exactly one reveal record per committed phone', rows.length === 2, String(rows.length));
  if (rows.length !== 2) return { run, failed: true };
  const frolicsInLog = [...new Set(log.reveals.map((row) => row.frolicId))];
  check(scope, 'exactly one revealed frolic', frolicsInLog.length === 1, frolicsInLog.join(','));
  const revealAts = [...new Set(rows.map((row) => row.reveal_at))];
  const bloomAts = [...new Set(rows.map((row) => row.bloom_at))];
  check(scope, 'attendee rows share one revealAt', revealAts.length === 1, revealAts.join(','));
  check(scope, 'attendee rows share one bloomAt', bloomAts.length === 1, bloomAts.join(','));
  const logUserIds = rows.map((row) => row.userId).sort();
  check(scope, 'attendee rows are the two committed phones', logUserIds.join(',') === [members.maya.userId, members.dev.userId].sort().join(','), logUserIds.join(','));

  const [settledMaya, settledDev] = await Promise.all([
    query('frolics:today', { deviceToken: members.maya.deviceToken, groupId: seed.groupId }),
    query('frolics:today', { deviceToken: members.dev.deviceToken, groupId: seed.groupId }),
  ]);
  const readMaya = settledMaya.reveal;
  const readDev = settledDev.reveal;
  check(scope, 'both phones show the reveal', readMaya !== null && readDev !== null, JSON.stringify([readMaya, readDev]).slice(0, 200));
  check(scope, 'maya and dev read the same revealAt', readMaya?.revealAt === readDev?.revealAt, readMaya?.revealAt + ' vs ' + readDev?.revealAt);
  check(scope, 'the app read matches the stored revealAt', readMaya?.revealAt === revealAts[0], readMaya?.revealAt + ' vs ' + revealAts[0]);
  const fromBarrier = revealAts[0] - (barrierAt + REVEAL_DELAY_MS);
  check(scope, 'the reveal was scheduled from this barrier', fromBarrier >= 0 && fromBarrier <= 1000, fromBarrier.toFixed(1) + 'ms past the barrier plus the 1500ms delay');
  const goingMaya = (readMaya?.going ?? []).map((p) => p.userId).sort();
  const goingDev = (readDev?.going ?? []).map((p) => p.userId).sort();
  check(scope, 'both phones see the same going list', goingMaya.join(',') === goingDev.join(','), goingMaya.join(',') + ' vs ' + goingDev.join(','));
  check(scope, 'both committed phones are named', goingMaya.length === 2, goingMaya.join(','));
  check(scope, 'dev is revealed as going', readDev?.me?.going === true);
  check(scope, 'maya is revealed as going', readMaya?.me?.going === true);

  const restoreAt = await e2e('/e2e/advance', { run });
  const secondAt = await e2e('/e2e/advance', { run });
  const logAfter = await e2e('/e2e/reveals?run=' + run);
  const rowsAfter = logAfter.reveals.filter((row) => row.frolicId === seed.frolicId);
  check(scope, 'advance does not reveal twice', rowsAfter.length === 2, String(rowsAfter.length));
  check(scope, 'advance adds no reveal record', logAfter.reveals.length === log.reveals.length, log.reveals.length + ' -> ' + logAfter.reveals.length);
  check(scope, 'advance is idempotent', restoreAt.frolicId === secondAt.frolicId, restoreAt.frolicId + ' vs ' + secondAt.frolicId);

  const deliverLag = rows[0].delivered_at - revealAts[0];
  return {
    run,
    failed: false,
    issueSpread,
    responseSpread,
    revealAt: revealAts[0],
    bloomAt: bloomAts[0],
    deliveredAt: rows[0].delivered_at,
    deliverLag,
    revealFromBarrier: revealAts[0] - (barrierAt + REVEAL_DELAY_MS),
    barrierAt: Math.round(barrierAt + Math.max(0, lastIssue - performance.now())),
    polls: polls.length,
    nullPolls: polls.filter((p) => p.maya.reveal === null && p.dev.reveal === null).length,
    lastNullToReveal: revealed.at - (lastNull?.at ?? revealed.at),
    sweepWasPreReveal,
    revealLagFromLastNullPoll: lastNull ? revealed.at - lastNull.at : null,
  };
}

async function stragglerRace() {
  const scope = 'straggler';
  const run = RUN_PREFIX + 'late';
  runs.push(run);
  await e2e('/e2e/reset', { run });
  const seed = await e2e('/e2e/seed', { run, scenario: 'demo' });
  const members = seed.users;
  await Promise.all([
    query('users:me', { deviceToken: 'warmup' }),
    query('users:me', { deviceToken: 'warmup' }),
  ]);
  const barrierAt = Date.now();
  const mayaTap = convexCall('mutation', 'taps:tap', {
    deviceToken: members.maya.deviceToken,
    frolicId: seed.frolicId,
    kind: 'down',
  });
  const devTap = convexCall('mutation', 'taps:tap', {
    deviceToken: members.dev.deviceToken,
    frolicId: seed.frolicId,
    kind: 'down',
  });
  await Promise.all([mayaTap.promise, devTap.promise]);
  await sleep(250);
  await query('frolics:today', { deviceToken: members.jordan.deviceToken, groupId: seed.groupId });
  const jordanAt = Date.now();
  const jordanTap = convexCall('mutation', 'taps:tap', {
    deviceToken: members.jordan.deviceToken,
    frolicId: seed.frolicId,
    kind: 'down',
  });
  await jordanTap.promise.catch((error) => {
    check(scope, 'the third tap lands', false, String(error.message || error));
  });
  await sleep(REVEAL_DELAY_MS + 800);
  const log = await e2e('/e2e/reveals?run=' + run);
  const rows = log.reveals.filter((row) => row.frolicId === seed.frolicId);
  check(scope, 'a late tap reveals once, not twice', rows.length === 3, String(rows.length));
  const ats = [...new Set(rows.map((row) => row.reveal_at))];
  check(scope, 'a late tap does not move the instant', ats.length === 1, ats.join(','));
  const shifted = ats[0] - (barrierAt + REVEAL_DELAY_MS);
  check(scope, 'the instant came from the barrier, not the late tap', shifted >= 0 && shifted < 600, shifted + 'ms, late tap at +' + (jordanAt - barrierAt) + 'ms');
  return { rows: rows.length, revealAt: ats[0], shifted, jordanDelay: jordanAt - barrierAt };
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return { min: 0, p50: 0, max: 0, mean: 0 };
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    min: sorted[0],
    p50: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
  };
}

function pad(value, width) {
  return String(value).padStart(width);
}

async function cleanup() {
  for (const run of [...new Set(runs)]) {
    try {
      await e2e('/e2e/reset', { run });
    } catch (error) {
      failures.push({ scope: 'cleanup', label: 'reset ' + run, detail: String(error.message || error) });
    }
  }
}

const started = performance.now();
const results = [];
let straggler = null;
try {
  for (let i = 1; i <= RACES; i++) {
    let result;
    try {
      result = await oneRace(i);
    } catch (error) {
      failures.push({ scope: 'race' + String(i), label: 'race threw', detail: String(error.message || error) });
      result = { run: RUN_PREFIX + String(i), failed: true };
    }
    results.push(result);
    process.stderr.write(
      result.failed ? 'race ' + i + ' failed\n' : 'race ' + i + ' ok  revealAt ' + result.revealAt + '  lag ' + result.deliverLag + 'ms\n',
    );
  }
  straggler = await stragglerRace().catch((error) => {
    failures.push({ scope: 'straggler', label: 'straggler race threw', detail: String(error.message || error) });
    return null;
  });
} finally {
  await cleanup();
}

for (const failure of failures) {
  process.stderr.write('FAIL ' + failure.scope + ': ' + failure.label + (failure.detail ? ' [' + failure.detail + ']' : '') + '\n');
}

const ok = results.filter((r) => !r.failed);
const lag = stats(ok.map((r) => r.deliverLag));
const issue = stats(ok.map((r) => r.issueSpread));
const response = stats(ok.map((r) => r.responseSpread));
const fromBarrier = stats(ok.map((r) => r.revealFromBarrier));
const distinctAts = [...new Set(ok.map((r) => r.revealAt))];

const width = 8;
console.log('');
console.log('race  issue_ms  resp_ms  revealAt             deliver_lag_ms');
for (const row of results) {
  if (row.failed) {
    console.log(pad(row.run, 6) + '  failed');
    continue;
  }
  console.log(
    pad(row.run, 6) +
      pad(row.issueSpread.toFixed(2), 10) +
      pad(row.responseSpread.toFixed(2), 9) +
      '  ' +
      pad(row.revealAt, 20) +
      pad(row.deliverLag, 16),
  );
}
console.log('');

const summary = {
  races: results.length,
  completed: ok.length,
  barrier_spread_ms: issue,
  response_spread_ms: response,
  scheduler_fire_lag_ms: lag,
  reveal_at_minus_barrier_ms: fromBarrier,
  distinct_reveal_at_values: distinctAts.length,
  failures: failures.length,
  straggler,
  wall_clock_ms: Math.round(performance.now() - started),
};

check('summary', 'every race completed', ok.length === results.length, ok.length + '/' + results.length);
check('summary', 'one revealAt per race, never a second', distinctAts.length === ok.length, distinctAts.length + ' distinct over ' + ok.length);
check('summary', 'no reveal fires before revealAt', lag.min >= 0, String(lag.min));

console.log('barrier spread      ' + issue.min.toFixed(2) + ' / ' + issue.p50.toFixed(2) + ' / ' + issue.max.toFixed(2) + ' ms (min/p50/max)');
console.log('response spread     ' + response.min.toFixed(2) + ' / ' + response.p50.toFixed(2) + ' / ' + response.max.toFixed(2) + ' ms');
console.log('scheduler fire lag  ' + lag.min + ' / ' + lag.p50 + ' / ' + lag.max + ' ms after revealAt, mean ' + lag.mean.toFixed(1));
console.log('revealAt - barrier  ' + fromBarrier.min.toFixed(1) + ' / ' + fromBarrier.p50.toFixed(1) + ' / ' + fromBarrier.max.toFixed(1) + ' ms around the 1500ms reveal delay');
if (straggler) {
  console.log('straggler           one reveal of ' + straggler.rows + ' phones at ' + straggler.revealAt + ', ' + straggler.shifted + 'ms past the barrier plus delay, third tap at +' + straggler.jordanDelay + 'ms');
}
console.log('failed assertions   ' + failures.length);
console.log('');
console.log(JSON.stringify({ summary, failures }, null, 2));
if (results.some((r) => !r.failed)) {
  console.log('');
  for (const row of ok) {
    console.log(
      row.run + ': revealAt ' + row.revealAt + ', flipped ' + row.deliveredAt + ', polls ' + row.polls + ' (' + row.nullPolls + ' empty), first revealed ' + row.lastNullToReveal.toFixed(0) + 'ms after the last empty poll, sweep pre-reveal ' + row.sweepWasPreReveal,
    );
  }
}
process.exit(failures.length === 0 ? 0 : 1);
