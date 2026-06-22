require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const qrImage = require('qrcode');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID || '';
const TARGET_GROUP_NAME = process.env.TARGET_GROUP_NAME || '';
const IGNORED_PARTICIPANT_IDS = new Set(
  (process.env.IGNORED_PARTICIPANT_IDS || '58090154115181@lid,237804470702200@lid')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
);
const DRY_RUN = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';
const PORT = Number(process.env.PORT || 3000);

let latestQr = null;
let latestQrDataUrl = null;
let botStatus = 'starting';

// Matches common URLs, bare domains, and WhatsApp invite links.
const LINK_REGEX = /((https?:\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?|chat\.whatsapp\.com\/\S+)/i;

function cleanupChromiumProfileLocks() {
  const authRoot = path.join(process.cwd(), '.wwebjs_auth');
  const lockNames = new Set(['SingletonCookie', 'SingletonLock', 'SingletonSocket']);

  if (!fs.existsSync(authRoot)) return;

  const stack = [authRoot];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (lockNames.has(entry.name)) {
        fs.rmSync(fullPath, { force: true });
        console.log(`Removed stale Chromium profile lock: ${fullPath}`);
      }
    }
  }
}

cleanupChromiumProfileLocks();

const app = express();

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="10" />
    <title>Fiver Ceaser WhatsApp Bot</title>
    <style>
      body { font-family: system-ui, sans-serif; background:#0b0f19; color:#f8fafc; display:grid; place-items:center; min-height:100vh; margin:0; }
      main { max-width:720px; padding:32px; text-align:center; }
      .card { background:#111827; border:1px solid #334155; border-radius:16px; padding:24px; box-shadow:0 20px 80px #0008; }
      img { width:min(420px, 92vw); height:auto; background:white; padding:16px; border-radius:12px; }
      code { background:#020617; padding:2px 6px; border-radius:6px; }
      .ok { color:#22c55e; } .warn { color:#f59e0b; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Fiver Ceaser WhatsApp Bot</h1>
      <p>Status: <strong class="${botStatus === 'ready' ? 'ok' : 'warn'}">${botStatus}</strong></p>
      ${latestQrDataUrl ? `<p>Scan this QR in WhatsApp → Linked devices:</p><img src="${latestQrDataUrl}" alt="WhatsApp login QR" />` : '<p>No QR available right now. If status is ready, WhatsApp is already linked.</p>'}
      <p>Target: <code>${TARGET_GROUP_ID || TARGET_GROUP_NAME || 'all groups'}</code></p>
      <p>Ignored IDs: <code>${Array.from(IGNORED_PARTICIPANT_IDS).join(', ') || 'none'}</code></p>
      <p>Dry run: <code>${DRY_RUN}</code></p>
    </main>
  </body>
</html>`);
});

app.get('/health', (_req, res) => res.json({ ok: true, status: botStatus }));
app.get('/qr', (_req, res) => {
  if (!latestQrDataUrl) return res.status(404).json({ error: 'No QR available', status: botStatus });
  return res.json({ qr: latestQr, dataUrl: latestQrDataUrl, status: botStatus });
});

app.listen(PORT, () => console.log(`Status/QR page listening on port ${PORT}`));

const client = new Client({
  authStrategy: new LocalAuth({ clientId: process.env.SESSION_NAME || 'fiver-ceaser' }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
    ],
  },
});

client.on('qr', async (qr) => {
  botStatus = 'waiting_for_qr_scan';
  latestQr = qr;
  latestQrDataUrl = await qrImage.toDataURL(qr, { margin: 1, width: 512 });
  console.log('Scan this QR code with WhatsApp > Linked devices:');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  botStatus = 'authenticated';
  latestQr = null;
  latestQrDataUrl = null;
  console.log('Authenticated.');
});

client.on('ready', () => {
  botStatus = 'ready';
  latestQr = null;
  latestQrDataUrl = null;
  console.log('Fiver Ceaser link guard is ready.');
});

client.on('auth_failure', (message) => {
  botStatus = 'auth_failure';
  console.error('Auth failure:', message);
});
client.on('disconnected', (reason) => {
  botStatus = 'disconnected';
  console.error('Disconnected:', reason);
});

function hasLink(text) {
  return LINK_REGEX.test(text || '');
}

async function isTargetGroup(chat) {
  if (!chat || !chat.isGroup) return false;
  if (TARGET_GROUP_ID) return chat.id && chat.id._serialized === TARGET_GROUP_ID;
  if (TARGET_GROUP_NAME) return chat.name === TARGET_GROUP_NAME;
  // If neither env var is set, guard every group the bot is in.
  return true;
}

async function removeParticipant(chat, participantId) {
  if (DRY_RUN) {
    console.log(`[dry-run] Would remove ${participantId} from ${chat.name}`);
    return;
  }

  if (typeof chat.removeParticipants === 'function') {
    await chat.removeParticipants([participantId]);
    return;
  }

  // Older whatsapp-web.js versions use removeParticipants via client internals less consistently.
  throw new Error('chat.removeParticipants is not available in this whatsapp-web.js version');
}

client.on('message', async (message) => {
  try {
    const chat = await message.getChat();
    if (!(await isTargetGroup(chat))) return;

    const participantId = message.author || message.from;
    if (!participantId) {
      console.warn('Could not resolve participant for message', message.id && message.id._serialized);
      return;
    }

    if (IGNORED_PARTICIPANT_IDS.has(participantId)) {
      console.log(`Ignoring message from exempt participant ${participantId}.`);
      return;
    }

    if (!hasLink(message.body)) return;

    console.log(`Link detected in "${chat.name}" from ${participantId}: ${message.body}`);

    if (!DRY_RUN) {
      await message.delete(true); // true = delete for everyone; bot must have permission/admin where required.
      console.log('Deleted message for everyone.');
    } else {
      console.log('[dry-run] Would delete message for everyone.');
    }

    await removeParticipant(chat, participantId);
    console.log(`Removed participant ${participantId}.`);
  } catch (error) {
    console.error('Failed to enforce link rule:', error && error.stack ? error.stack : error);
  }
});

client.initialize();
