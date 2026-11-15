import { argv } from 'node:process';

const base = argv[2];
const cmd = argv[3];
const run = argv[4] || 'default';

async function state() {
  const res = await fetch(base + '/state?run=' + run);
  return res.json();
}

if (!base || !cmd) {
  console.error('usage: node barrier.mjs <base-url> <state|release|watch> [run]');
  process.exit(2);
}

if (cmd === 'state') console.log(JSON.stringify(await state(), null, 2));

if (cmd === 'release') {
  const res = await fetch(base + '/release?run=' + run, { method: 'POST' });
  const s = await res.json();
  console.log('released at ' + s.released_at);
  for (const a of s.arrivals) console.log(a.name.padEnd(16) + ' arrived ' + (a.arrived_at - s.released_at) + ' ms after release');
}

if (cmd === 'watch') {
  let last = 0;
  for (;;) {
    const s = await state();
    if (s.arrivals.length !== last || s.released_at) {
      last = s.arrivals.length;
      console.log(new Date().toISOString() + ' ' + s.arrivals.map(a => a.name).join(', ') + (s.released_at ? ' released' : ' waiting'));
    }
    if (s.released_at) break;
    await new Promise(r => setTimeout(r, 1000));
  }
}
