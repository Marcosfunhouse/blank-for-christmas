// Blank for Christmas — server.
//   /api/room/CODE        WebSocket: live game room (host + phones)
//   /api/room/CODE/peek   GET: does this game exist? (for the Join screen)
//   /api/ai               POST: relays a request to Claude, with limits
//   /api/config           GET: is AI switched on?
// Everything else is the static game in /public.

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const CODE_RE = /^[A-Z0-9]{3,8}$/;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function merge(t, p) { const o = isObj(t) ? { ...t } : {}; for (const k in p) { const v = p[k]; if (isObj(v) && isObj(o[k])) o[k] = merge(o[k], v); else o[k] = v; } return o; }
const today = () => new Date().toISOString().slice(0, 10);
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join(''); }

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;

    if (p === '/api/config') return json({ ai: env.AI_ENABLED !== 'false' && !!env.ANTHROPIC_API_KEY });

    let m = p.match(/^\/api\/room\/([A-Za-z0-9]+)(\/peek)?$/);
    if (m) {
      const code = m[1].toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'bad_code' }, 400);
      const stub = env.ROOMS.get(env.ROOMS.idFromName('room:' + code));
      return stub.fetch(new Request(new URL((m[2] ? '/peek' : '/ws'), url), req));
    }

    if (p === '/api/ai' && req.method === 'POST') return ai(req, env);
    if (p.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(req);
  }
};

// ---------------------------------------------------------------- AI relay
const SYSTEM = `You write content for "Blank for Christmas", a comedy party game where friends invent cheesy made-for-TV Christmas movies. Keep everything playful, PG-13 at most, and never mean-spirited about real people. Follow the requested output format exactly. If a request has nothing to do with the game, reply only with: Sorry, I can only help with the game.`;

async function ai(req, env) {
  if (env.AI_ENABLED === 'false' || !env.ANTHROPIC_API_KEY) return json({ error: 'ai_off' }, 503);
  let body; try { body = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }
  const prompt = String(body.prompt || '');
  if (!prompt || prompt.length > 8000) return json({ error: 'bad_request' }, 400);
  const quick = body.tier === 'quick';
  const room = String(body.room || '').toUpperCase();

  // limits: per internet connection per day, and per game room
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  const ipKey = 'ip:' + (await sha(ip + ':' + today()));
  const checks = [[ipKey, +env.AI_IP_DAILY_LIMIT || 120]];
  if (CODE_RE.test(room)) checks.push(['ai:' + room, +env.AI_ROOM_LIMIT || 60]);
  for (const [name, limit] of checks) {
    const r = await env.ROOMS.get(env.ROOMS.idFromName(name)).fetch('https://do/count?limit=' + limit, { method: 'POST' });
    if (r.status === 429) return json({ error: 'limit' }, 429);
  }

  const base = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const r = await fetch(base + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: quick ? env.MODEL_QUICK : env.MODEL_DEFAULT,
      max_tokens: quick ? 200 : 3000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok) { console.log('anthropic error', r.status, (await r.text()).slice(0, 300)); return json({ error: 'upstream' }, 502); }
  const out = await r.json();
  const text = (out.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return json({ text });
}

// ---------------------------------------------------------------- rooms
// One Durable Object per game code. State = {game, players, slips, votes}.
// Phones connect by WebSocket; every change is saved and broadcast to everyone.
export class Room {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }

  async state() { return (await this.ctx.storage.get('state')) || { game: null, players: {}, slips: {}, votes: {} }; }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/count') {           // AI limit counter
      const limit = +url.searchParams.get('limit') || 60;
      const n = ((await this.ctx.storage.get('n')) || 0) + 1;
      if (n > limit) return new Response('limit', { status: 429 });
      await this.ctx.storage.put('n', n);
      if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 3 * 86400e3);
      return new Response('ok');
    }
    if (url.pathname === '/peek') {
      const s = await this.state();
      return json({ exists: !!s.game, game: s.game });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].send(JSON.stringify({ t: 'state', s: await this.state() }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, raw) {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'ping') { ws.send('{"t":"pong"}'); return; }
    if (msg.t !== 'op') return;
    const reply = (ok, error) => ws.send(JSON.stringify({ t: 'ack', id: msg.id, ok, error }));
    if (raw.length > 200000) return reply(false, 'too_big');
    const s = await this.state();
    const parts = String(msg.path || '').split('/');   // "game" or "players/ID" etc.
    const coll = parts[0], id = parts[1];
    try {
      if (coll === 'game' && parts.length === 1) {
        if (msg.op === 'set') {
          if (s.game && msg.data && s.game.hostId && msg.data.hostId !== s.game.hostId) return reply(false, 'exists');
          s.game = msg.data; s.players = {}; s.slips = {}; s.votes = {};
        } else if (msg.op === 'update') { if (!s.game) return reply(false, 'not_found'); s.game = merge(s.game, msg.data); }
        else return reply(false, 'bad_op');
      } else if (['players', 'slips', 'votes'].includes(coll) && id && parts.length === 2) {
        if (!s.game) return reply(false, 'not_found');
        if (msg.op === 'set') s[coll] = { ...s[coll], [id]: msg.data };
        else if (msg.op === 'update') {
          let data = msg.data || {};
          if (coll === 'players' && Array.isArray(data._uniq)) {          // first come, first served on names/jobs/crises/hunks
            const fields = data._uniq; data = { ...data }; delete data._uniq;
            for (const f of fields) {
              if (data[f] == null) continue;
              const clash = Object.entries(s.players).some(([pid, pl]) => pid !== id && pl && pl[f] === data[f]);
              if (clash) return reply(false, 'taken');
            }
          }
          s[coll] = { ...s[coll], [id]: merge(s[coll][id], data) };
        }
        else if (msg.op === 'delete') { const c = { ...s[coll] }; delete c[id]; s[coll] = c; }
        else return reply(false, 'bad_op');
        if (Object.keys(s[coll]).length > 40) return reply(false, 'too_many');
      } else return reply(false, 'bad_path');
    } catch (e) { return reply(false, 'error'); }
    await this.ctx.storage.put('state', s);
    const hours = +this.env.ROOM_TTL_HOURS || 36;
    await this.ctx.storage.setAlarm(Date.now() + hours * 3600e3);
    reply(true);
    const out = JSON.stringify({ t: 'state', s });
    for (const peer of this.ctx.getWebSockets()) { try { peer.send(out); } catch {} }
  }

  async webSocketClose(ws, code) { try { ws.close(code, 'bye'); } catch {} }

  async alarm() { await this.ctx.storage.deleteAll(); }   // tidy up after the party
}
