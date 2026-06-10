#!/usr/bin/env node
/**
 * Bridge HTTP pentru „Chat mode" din admin /terminal.
 *
 * Primește un prompt + sessionId opțional, rulează `claude -p` headless (pe
 * abonamentul Max — același login din ~/.claude ca terminalul) și streamează
 * înapoi evenimentele stream-json ca SSE. Clientul (pagina admin) randează
 * text live + tool chips.
 *
 * Auth: Authorization Bearer <JWT admin> — exact token-ul cu care e logat
 * adminul în dashboard; verificat HS256 cu JWT_SECRET + role==='admin'.
 * Fără auth NU pornește niciun proces.
 *
 * Node pur (http + crypto + child_process) — zero dependențe.
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');

const execFileP = promisify(execFile);

const PORT = 7682;
const SECRET = process.env.JWT_SECRET || '';
const MAX_BODY = 1024 * 1024; // 1MB
const TURN_TIMEOUT_MS = 15 * 60 * 1000; // un turn poate rula tool-uri lungi (regenerări)

/** Un singur turn de chat la un moment dat — Chat și Terminal împart ACEEAȘI
 *  conversație (cea mai recentă din /workspace), deci nu rulăm în paralel. */
let chatBusy = false;

/** Conversațiile din /workspace stau în ~/.claude/projects/-workspace/<sid>.jsonl.
 *  `--continue` fără nicio conversație existentă eșuează — verificăm înainte. */
function hasAnyConversation() {
  try {
    return fs
      .readdirSync(`${os.homedir()}/.claude/projects/-workspace`)
      .some((f) => f.endsWith('.jsonl'));
  } catch {
    return false;
  }
}

function verifyAdminJwt(authHeader) {
  if (!SECRET || typeof authHeader !== 'string') return null;
  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const expected = crypto
      .createHmac('sha256', SECRET)
      .update(`${parts[0]}.${parts[1]}`)
      .digest('base64url');
    const a = Buffer.from(parts[2]);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    if (payload.role !== 'admin') return null;
    return payload;
  } catch {
    return null;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sse(res, obj) {
  res.write(`data: ${typeof obj === 'string' ? obj : JSON.stringify(obj)}\n\n`);
}

/* ===== Injectare în sesiunea tmux „ops" (composer-ul din Terminal view) ===== */

// Tastele permise prin /terminal-input {key} — pentru dialogurile interactive
// (permisiuni Claude Code, meniuri) fără să atingi terminalul propriu-zis.
const ALLOWED_KEYS = {
  enter: 'Enter',
  escape: 'Escape',
  up: 'Up',
  down: 'Down',
  tab: 'Tab',
  'ctrl-c': 'C-c',
};

/** Sesiunea există și fără niciun client ttyd atașat (ttyd o creează abia la
 *  prima conexiune) — o creăm detached ca injectarea să meargă oricând. */
async function tmuxEnsureSession() {
  try {
    await execFileP('tmux', ['has-session', '-t', 'ops']);
  } catch {
    await execFileP('tmux', ['-u', 'new-session', '-d', '-s', 'ops']);
  }
}

/** Text dintr-o bucată (bracketed paste → multi-line safe în TUI-uri) + Enter. */
async function tmuxSendText(text) {
  await tmuxEnsureSession();
  const clean = text.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  await new Promise((resolve, reject) => {
    const p = spawn('tmux', ['load-buffer', '-b', 'opsbridge', '-']);
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`load-buffer exit ${c}`))));
    p.stdin.write(clean, 'utf8');
    p.stdin.end();
  });
  await execFileP('tmux', ['paste-buffer', '-p', '-d', '-b', 'opsbridge', '-t', 'ops']);
  // TUI-urile (Claude Code) au nevoie de un tick să proceseze paste-ul înainte de submit.
  await new Promise((r) => setTimeout(r, 250));
  await execFileP('tmux', ['send-keys', '-t', 'ops', 'Enter']);
}

async function tmuxSendKey(key) {
  await tmuxEnsureSession();
  await execFileP('tmux', ['send-keys', '-t', 'ops', ALLOWED_KEYS[key]]);
}

const server = http.createServer(async (req, res) => {
  // Caddy proxy-ează cu prefixul întreg — acceptăm ambele forme.
  const path = (req.url || '').split('?')[0].replace(/^\/ops-chat/, '') || '/';

  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== 'POST' || (path !== '/chat' && path !== '/terminal-input')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  const admin = verifyAdminJwt(req.headers['authorization']);
  if (!admin) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }

  // ===== POST /terminal-input — composer: text+Enter sau o tastă specială =====
  if (path === '/terminal-input') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const key = typeof body.key === 'string' ? body.key : null;
      const text = typeof body.text === 'string' ? body.text : '';
      if (key) {
        if (!ALLOWED_KEYS[key]) throw new Error(`tastă nepermisă: ${key}`);
        await tmuxSendKey(key);
      } else if (text.trim()) {
        await tmuxSendText(text);
      } else {
        throw new Error('text sau key obligatoriu');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err.message || err).slice(0, 500) }));
    }
    return;
  }

  let prompt = '';
  let fresh = false;
  try {
    const body = JSON.parse((await readBody(req)) || '{}');
    prompt = String(body.prompt || '').trim();
    fresh = body.fresh === true; // true = pornește conversație nouă (fără --continue)
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'bad json' }));
    return;
  }
  if (!prompt) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'prompt required' }));
    return;
  }
  if (chatBusy) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'busy — așteaptă turnul curent' }));
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    // Containerul e izolat (user non-root, DB role DML-only, repo read-only) —
    // în chat mode nu există TTY pentru prompts de permisiune.
    '--dangerously-skip-permissions',
  ];
  // O SINGURĂ conversație, partajată cu terminalul: continuăm mereu cea mai
  // recentă din /workspace (inclusiv una începută interactiv în tmux).
  if (!fresh && hasAnyConversation()) args.push('--continue');

  const child = spawn('claude', args, {
    cwd: '/workspace',
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.write(prompt);
  child.stdin.end();

  chatBusy = true;

  const timeout = setTimeout(() => {
    sse(res, { type: 'bridge_error', message: 'Timeout (15 min) — procesul a fost oprit.' });
    child.kill('SIGKILL');
  }, TURN_TIMEOUT_MS);

  let stdoutBuf = '';
  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk.toString('utf8');
    let nl;
    while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, nl).trim();
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (line) sse(res, line); // liniile sunt deja JSON (stream-json)
    }
  });

  let stderrBuf = '';
  child.stderr.on('data', (c) => {
    stderrBuf += c.toString('utf8');
    if (stderrBuf.length > 8192) stderrBuf = stderrBuf.slice(-8192);
  });

  child.on('close', (code) => {
    clearTimeout(timeout);
    chatBusy = false;
    if (code !== 0 && stderrBuf.trim()) {
      sse(res, { type: 'bridge_error', message: stderrBuf.trim().slice(0, 2000) });
    }
    sse(res, { type: 'bridge_done', code });
    res.end();
  });

  // Dacă clientul închide pagina, lăsăm turnul să se termine (poate rula o
  // regenerare — kill la jumătate e mai rău); timeout-ul rămâne plasa de siguranță.
  req.on('close', () => {});
});

server.listen(PORT, () => {
  console.log(`[bridge] ascult pe :${PORT} (chat mode pentru admin /terminal)`);
});
