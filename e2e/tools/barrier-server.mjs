import { createServer } from 'node:http';

const runs = new Map();
const port = Number(process.env.PORT || 8787);

function run(id) {
  if (!runs.has(id)) runs.set(id, { waiting: new Map(), released_at: null, arrivals: [] });
  return runs.get(id);
}

function send(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/state') {
    const r = run(url.searchParams.get('run') || 'default');
    return send(res, 200, { released_at: r.released_at, arrivals: r.arrivals });
  }
  if (req.method === 'POST' && url.pathname === '/release') {
    const r = run(url.searchParams.get('run') || 'default');
    r.released_at = Date.now();
    for (const resolve of r.waiting.values()) resolve();
    r.waiting.clear();
    return send(res, 200, { released_at: r.released_at, arrivals: r.arrivals });
  }
  if (req.method === 'POST' && url.pathname === '/arrive') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { name } = JSON.parse(body || '{}');
    const r = run(url.searchParams.get('run') || 'default');
    const arrived_at = Date.now();
    r.arrivals.push({ name, arrived_at });
    if (r.released_at) return send(res, 200, { arrived_at, released_at: r.released_at, offset_ms: arrived_at - r.released_at });
    await new Promise(resolve => { r.waiting.set(name, resolve); setTimeout(resolve, 280000) });
    return send(res, 200, { arrived_at, released_at: r.released_at, offset_ms: arrived_at - r.released_at });
  }
  send(res, 404, { error: 'not found' });
}).listen(port, () => console.log('barrier listening on ' + port));
