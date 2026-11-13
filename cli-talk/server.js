#!/usr/bin/env node
// CLI Talk — CLI にチャット画面から指示を出すためのローカルサーバー（依存パッケージなし）
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.CLI_TALK_DATA || path.join(DIR, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const TOKEN_FILE = path.join(DATA_DIR, 'token');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const DEFAULT_CWD = process.env.CLI_TALK_CWD || process.cwd();
const MODES = ['acceptEdits', 'plan', 'bypassPermissions', 'dontAsk', 'auto'];
const MAX_BODY = 1024 * 1024;
const MAX_SHELL_OUTPUT = 200 * 1024;
const MAX_MESSAGES = 2000;

fs.mkdirSync(DATA_DIR, { recursive: true });

// ── 認証トークン ────────────────────────────────────────────────────────────
let TOKEN = process.env.CLI_TALK_TOKEN;
if (!TOKEN) {
  try { TOKEN = fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch {}
  if (!TOKEN) {
    TOKEN = crypto.randomBytes(18).toString('base64url');
    fs.writeFileSync(TOKEN_FILE, TOKEN, { mode: 0o600 });
  }
}
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// ── 状態 ────────────────────────────────────────────────────────────────────
let state = { rooms: [] };
try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
if (!Array.isArray(state.rooms)) state.rooms = [];
for (const r of state.rooms) for (const m of r.messages) delete m.streaming;

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = STATE_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(state), { mode: 0o600 }, (err) => {
      if (!err) fs.rename(tmp, STATE_FILE, () => {});
    });
  }, 300);
}

const runtime = new Map(); // roomId -> { proc, queue: [] }
const rt = (id) => {
  if (!runtime.has(id)) runtime.set(id, { proc: null, queue: [] });
  return runtime.get(id);
};
const uid = () => crypto.randomBytes(8).toString('hex');
const findRoom = (id) => state.rooms.find((r) => r.id === id);
const publicRoom = (r) => ({ ...r, busy: !!rt(r.id).proc, queued: rt(r.id).queue.length });

// ── SSE ─────────────────────────────────────────────────────────────────────
const clients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000).unref();

function addMessage(room, msg) {
  const m = { id: uid(), ts: Date.now(), ...msg };
  room.messages.push(m);
  if (room.messages.length > MAX_MESSAGES) room.messages.splice(0, room.messages.length - MAX_MESSAGES);
  room.updatedAt = m.ts;
  broadcast('message', { roomId: room.id, message: m });
  save();
  return m;
}
function appendText(room, m, text) {
  m.text += text;
  broadcast('delta', { roomId: room.id, id: m.id, text });
}
function finishMessage(room, m, patch = {}) {
  delete m.streaming;
  Object.assign(m, patch);
  broadcast('patch', { roomId: room.id, id: m.id, patch: { streaming: false, ...patch } });
  save();
}
const roomChanged = (room) => { broadcast('room', publicRoom({ ...room, messages: undefined })); save(); };

// ── 実行 ────────────────────────────────────────────────────────────────────
function enqueue(room, text) {
  const userMsg = addMessage(room, { role: 'me', text });
  const r = rt(room.id);
  r.queue.push(userMsg);
  roomChanged(room);
  pump(room);
}

function pump(room) {
  const r = rt(room.id);
  if (r.proc || !r.queue.length) return;
  const userMsg = r.queue.shift();
  userMsg.read = true;
  broadcast('patch', { roomId: room.id, id: userMsg.id, patch: { read: true } });
  const done = () => {
    r.proc = null;
    roomChanged(room);
    if (findRoom(room.id)) pump(room);
  };
  try {
    if (room.type === 'shell') runShell(room, userMsg.text, done);
    else runClaude(room, userMsg.text, done);
  } catch (e) {
    addMessage(room, { role: 'system', text: `起動に失敗しました: ${e.message}` });
    done();
    return;
  }
  roomChanged(room);
}

function toolSummary(name, input = {}) {
  const pick = input.command ?? input.file_path ?? input.pattern ?? input.url ?? input.query
    ?? input.description ?? input.prompt ?? input.skill ?? '';
  const s = String(pick).replace(/\s+/g, ' ').trim();
  return s.length > 140 ? s.slice(0, 140) + '…' : s;
}

function runClaude(room, prompt, done) {
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose',
    '--include-partial-messages', '--permission-mode', MODES.includes(room.mode) ? room.mode : 'acceptEdits'];
  if (room.sessionId) args.push('--resume', room.sessionId);
  if (room.model) args.push('--model', room.model);
  const proc = spawn(CLAUDE_BIN, args, { cwd: room.cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  const r = rt(room.id);
  r.proc = proc;

  let current = null;            // ストリーミング中の吹き出し
  const streamed = new Set();    // ストリームで受け取り済みの API メッセージ ID
  let gotResult = false;
  let stderr = '';
  let buf = '';
  const closeCurrent = () => { if (current) { finishMessage(room, current); current = null; } };

  const handle = (ev) => {
    if (ev.session_id && ev.type === 'system' && ev.subtype === 'init') {
      if (room.sessionId !== ev.session_id) { room.sessionId = ev.session_id; save(); }
      return;
    }
    if (ev.parent_tool_use_id) return; // サブエージェント内部のやりとりは表示しない
    if (ev.type === 'stream_event') {
      const e = ev.event || {};
      if (e.type === 'content_block_start' && e.content_block?.type === 'text') {
        closeCurrent();
        current = addMessage(room, { role: 'bot', text: '', streaming: true });
        if (ev.api_message_id) streamed.add(ev.api_message_id);
      } else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && current) {
        appendText(room, current, e.delta.text);
      } else if (e.type === 'content_block_stop') {
        closeCurrent();
      }
      return;
    }
    if (ev.type === 'assistant') {
      const wasStreamed = streamed.has(ev.message?.id);
      for (const block of ev.message?.content || []) {
        if (block.type === 'text' && !wasStreamed && block.text.trim()) {
          closeCurrent();
          addMessage(room, { role: 'bot', text: block.text });
        } else if (block.type === 'tool_use') {
          closeCurrent();
          addMessage(room, { role: 'tool', tool: block.name, text: toolSummary(block.name, block.input) });
        }
      }
      return;
    }
    if (ev.type === 'result' || ('total_cost_usd' in ev && 'duration_api_ms' in ev)) {
      gotResult = true;
      closeCurrent();
      if (ev.session_id) room.sessionId = ev.session_id;
      if (ev.is_error) {
        const detail = typeof ev.result === 'string' && ev.result ? ev.result : (ev.subtype || 'unknown error');
        addMessage(room, { role: 'system', text: `エラーで終了しました: ${detail}` });
      }
      save();
    }
  };

  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { handle(JSON.parse(line)); } catch {}
    }
  });
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (c) => { stderr = (stderr + c).slice(-4000); });
  proc.on('error', (e) => {
    closeCurrent();
    addMessage(room, {
      role: 'system',
      text: e.code === 'ENOENT'
        ? `「${CLAUDE_BIN}」コマンドが見つかりません。Claude Code をインストールするか、CLAUDE_BIN で場所を指定してください。`
        : `起動に失敗しました: ${e.message}`,
    });
    done();
  });
  proc.on('close', (code, signal) => {
    if (r.proc !== proc) return;
    closeCurrent();
    if (proc.stoppedByUser) addMessage(room, { role: 'system', text: '停止しました' });
    else if (!gotResult) {
      addMessage(room, {
        role: 'system',
        text: `CLI が終了しました (code ${code ?? signal})${stderr.trim() ? '\n' + stderr.trim() : ''}`,
      });
    }
    done();
  });
}

function runShell(room, command, done) {
  const SEP = '\x1e';
  const script = `${command}\n__rc=$?; printf '${SEP}%s' "$PWD"; exit $__rc`;
  const proc = spawn('bash', ['-c', script], {
    cwd: room.cwd, env: { ...process.env, TERM: 'dumb' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  const r = rt(room.id);
  r.proc = proc;
  const msg = addMessage(room, { role: 'bot', mono: true, text: '', streaming: true });
  let total = 0, truncated = false, tail = '';
  const onData = (chunk) => {
    let text = tail + chunk;
    tail = '';
    // 末尾の区切り（作業ディレクトリ通知）はチャットに出さない
    const idx = text.lastIndexOf(SEP);
    if (idx >= 0) { tail = text.slice(idx); text = text.slice(0, idx).replace(/\n$/, ''); }
    else if (text.endsWith('\n')) { tail = '\n'; text = text.slice(0, -1); }
    if (!text || truncated) return;
    if (total + text.length > MAX_SHELL_OUTPUT) {
      text = text.slice(0, MAX_SHELL_OUTPUT - total) + '\n…（出力が長いため省略）';
      truncated = true;
    }
    total += text.length;
    appendText(room, msg, text);
  };
  proc.stdout.setEncoding('utf8');
  proc.stderr.setEncoding('utf8');
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  proc.on('error', (e) => {
    finishMessage(room, msg, { text: `起動に失敗しました: ${e.message}` });
    done();
  });
  proc.on('close', (code, signal) => {
    if (r.proc !== proc) return;
    const idx = tail.lastIndexOf(SEP);
    if (idx >= 0) {
      const cwd = tail.slice(idx + 1).trim();
      if (cwd && cwd !== room.cwd && fs.existsSync(cwd)) room.cwd = cwd;
    }
    const exit = proc.stoppedByUser ? '停止' : (code ?? signal);
    finishMessage(room, msg, { text: msg.text || (proc.stoppedByUser ? '（停止しました）' : '（出力なし）'), exit });
    done();
  });
}

function stopRoom(room) {
  const r = rt(room.id);
  r.queue.length = 0;
  const proc = r.proc;
  if (!proc) return;
  proc.stoppedByUser = true;
  const kill = (sig) => {
    try { room.type === 'shell' ? process.kill(-proc.pid, sig) : proc.kill(sig); } catch {}
  };
  kill('SIGINT');
  setTimeout(() => { if (r.proc === proc) kill('SIGKILL'); }, 4000).unref();
}

// ── HTTP ────────────────────────────────────────────────────────────────────
const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c);
  });
  req.on('end', () => {
    try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
    catch (e) { reject(e); }
  });
  req.on('error', reject);
});
const cookieToken = (req) => {
  const m = /(?:^|;\s*)clitalk=([^;]+)/.exec(req.headers.cookie || '');
  return m ? decodeURIComponent(m[1]) : '';
};
const expandHome = (p) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p);

function validateRoomInput(body, room = {}) {
  const out = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 60);
    if (!name) throw new Error('名前を入力してください');
    out.name = name;
  }
  if (body.cwd !== undefined) {
    const cwd = path.resolve(expandHome(String(body.cwd).trim() || DEFAULT_CWD));
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error(`フォルダが見つかりません: ${cwd}`);
    if (room.cwd && room.cwd !== cwd && room.type === 'claude') out.sessionId = null; // セッションはフォルダごと
    out.cwd = cwd;
  }
  if (body.mode !== undefined) {
    if (!MODES.includes(body.mode)) throw new Error('不明な権限モードです');
    out.mode = body.mode;
  }
  if (body.model !== undefined) out.model = String(body.model).trim().slice(0, 80);
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  // ?token= 付きで開いたら Cookie に保存してリダイレクト
  if (p === '/' && url.searchParams.has('token')) {
    if (!safeEq(url.searchParams.get('token'), TOKEN)) { res.writeHead(403).end('Invalid token'); return; }
    res.writeHead(302, {
      'Set-Cookie': `clitalk=${encodeURIComponent(TOKEN)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`,
      Location: '/',
    }).end();
    return;
  }
  if (!safeEq(cookieToken(req), TOKEN)) {
    res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('認証が必要です。サーバー起動時に表示された URL（?token=... 付き）を開いてください。');
    return;
  }
  // 他サイトからの書き込みを拒否
  if (req.method !== 'GET') {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) { json(res, 403, { error: 'bad origin' }); return; }
  }

  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      fs.createReadStream(path.join(DIR, 'public', 'index.html')).pipe(res);
      return;
    }
    if (req.method === 'GET' && p === '/api/state') {
      json(res, 200, { rooms: state.rooms.map(publicRoom), defaultCwd: DEFAULT_CWD, modes: MODES });
      return;
    }
    if (req.method === 'GET' && p === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
      });
      res.write('retry: 2000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'POST' && p === '/api/rooms') {
      const body = await readBody(req);
      const type = body.type === 'shell' ? 'shell' : 'claude';
      const fields = validateRoomInput({ name: body.name, cwd: body.cwd ?? '', mode: body.mode ?? 'acceptEdits', model: body.model ?? '' });
      const room = { id: uid(), type, sessionId: null, createdAt: Date.now(), updatedAt: Date.now(), messages: [], ...fields };
      state.rooms.push(room);
      broadcast('room', publicRoom(room));
      save();
      json(res, 200, publicRoom(room));
      return;
    }
    const m = /^\/api\/rooms\/([0-9a-f]+)(?:\/(send|stop|reset))?$/.exec(p);
    if (m) {
      const room = findRoom(m[1]);
      if (!room) { json(res, 404, { error: 'トークが見つかりません' }); return; }
      const action = m[2];
      if (!action && req.method === 'PATCH') {
        Object.assign(room, validateRoomInput(await readBody(req), room));
        roomChanged(room);
        json(res, 200, { ok: true });
        return;
      }
      if (!action && req.method === 'DELETE') {
        stopRoom(room);
        state.rooms = state.rooms.filter((x) => x.id !== room.id);
        broadcast('deleted', { roomId: room.id });
        save();
        json(res, 200, { ok: true });
        return;
      }
      if (req.method === 'POST' && action === 'send') {
        const text = String((await readBody(req)).text ?? '').trim();
        if (!text) { json(res, 400, { error: '空のメッセージです' }); return; }
        enqueue(room, text);
        json(res, 200, { ok: true });
        return;
      }
      if (req.method === 'POST' && action === 'stop') {
        stopRoom(room);
        json(res, 200, { ok: true });
        return;
      }
      if (req.method === 'POST' && action === 'reset') {
        stopRoom(room);
        room.sessionId = null;
        addMessage(room, { role: 'system', text: '会話をリセットしました。次のメッセージから新しいセッションで始まります。' });
        roomChanged(room);
        json(res, 200, { ok: true });
        return;
      }
    }
    json(res, 404, { error: 'not found' });
  } catch (e) {
    json(res, 400, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' || HOST === '::' ? lanAddress() : HOST;
  console.log('\n  CLI Talk を起動しました\n');
  console.log(`  ▶ http://${shown}:${PORT}/?token=${TOKEN}\n`);
  if (HOST === '127.0.0.1' || HOST === 'localhost') {
    console.log('  このPCからのみ接続できます。スマホから使うには HOST=0.0.0.0 を付けて起動してください。');
  } else {
    console.log('  ⚠ ネットワーク越しに接続できます。上の URL を知っている人は、このPCで CLI を実行できます。');
  }
  console.log(`  作業フォルダ（既定）: ${DEFAULT_CWD}\n`);
});

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return 'localhost';
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const room of state.rooms) stopRoom(room);
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(state), { mode: 0o600 }); } catch {}
    process.exit(0);
  });
}
