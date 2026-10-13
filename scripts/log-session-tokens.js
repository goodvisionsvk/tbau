#!/usr/bin/env node
// Claude Code SessionEnd hook: sčíta reálne tokeny z transkriptu session a pošle ich do portálu.
// Zapisuje sa cez chránený endpoint /api/worklog (X-Worklog-Secret z lokálneho .worklog-secret).
// Zlyháva potichu – nikdy neblokuje Claude Code.
const fs = require('fs');
const path = require('path');
const https = require('https');

try {
  const input = fs.readFileSync(0, 'utf8');
  const data = JSON.parse(input || '{}');
  const transcript = data.transcript_path;
  const session = data.session_id || '';
  if (!transcript || !session || !fs.existsSync(transcript)) process.exit(0);

  const projectDir = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..');
  const secret = fs.readFileSync(path.join(projectDir, '.worklog-secret'), 'utf8').trim();
  if (!secret) process.exit(0);

  let total = 0;
  const times = [];
  for (const line of fs.readFileSync(transcript, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch (e) { continue; }
    const u = obj && obj.message && obj.message.usage;
    if (u) {
      total += (u.input_tokens || 0) + (u.output_tokens || 0) +
               (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    }
    if (obj && obj.timestamp) {
      const t = Date.parse(obj.timestamp);
      if (!isNaN(t)) times.push(t);
    }
  }

  // reálny spoločný čas = súčet medzier medzi správami, každá medzera obmedzená na 20 min
  // (aby sa nerátal čas, keď nikto nie je pri počítači)
  times.sort((a, b) => a - b);
  const CAP = 20 * 60 * 1000;
  let activeMs = 0;
  for (let i = 1; i < times.length; i++) activeMs += Math.min(times[i] - times[i - 1], CAP);
  const hours = Math.round((activeMs / 3600000) * 100) / 100;

  if (!total && !activeMs) process.exit(0);

  const body = 'session=' + encodeURIComponent(session) +
    '&tokens=' + total + '&hours=' + hours + '&date=' + new Date().toISOString().slice(0, 10);
  const req = https.request('https://tbau.goodvision.sk/api/worklog', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
      'X-Worklog-Secret': secret,
    },
    timeout: 8000,
  }, (res) => { res.resume(); res.on('end', () => process.exit(0)); });
  req.on('error', () => process.exit(0));
  req.on('timeout', () => { req.destroy(); process.exit(0); });
  req.write(body);
  req.end();
} catch (e) {
  process.exit(0);
}
