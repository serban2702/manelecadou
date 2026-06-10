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
const { spawn } = require('child_process');

const PORT = 7682;
const SECRET = process.env.JWT_SECRET || '';
const MAX_BODY = 1024 * 1024; // 1MB
const TURN_TIMEOUT_MS = 15 * 60 * 1000; // un turn poate rula tool-uri lungi (regenerări)

/** Sesiunile cu un turn în execuție — refuzăm al doilea mesaj concurent pe aceeași sesiune. */
const busySessions = new Set();

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

const server = http.createServer(async (req, res) => {
  // Caddy proxy-ează cu prefixul întreg — acceptăm ambele forme.
  const path = (req.url || '').split('?')[0].replace(/^\/ops-chat/, '') || '/';

  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== 'POST' || path !== '/chat') {
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

  let prompt = '';
  let sessionId = null;
  try {
    const body = JSON.parse((await readBody(req)) || '{}');
    prompt = String(body.prompt || '').trim();
    sessionId = typeof body.sessionId === 'string' && body.sessionId ? body.sessionId : null;
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
  if (sessionId && busySessions.has(sessionId)) {
    res.writeHead(409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'session busy' }));
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
  if (sessionId) args.push('--resume', sessionId);

  const child = spawn('claude', args, {
    cwd: '/workspace',
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.write(prompt);
  child.stdin.end();

  if (sessionId) busySessions.add(sessionId);
  const lock = sessionId;

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
    if (lock) busySessions.delete(lock);
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
