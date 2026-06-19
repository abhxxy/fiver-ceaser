require('dotenv').config();

const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const TARGET_GROUP_ID = process.env.TARGET_GROUP_ID || '';
const TARGET_GROUP_NAME = process.env.TARGET_GROUP_NAME || '';
const DRY_RUN = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';

// Matches common URLs, bare domains, and WhatsApp invite links.
const LINK_REGEX = /((https?:\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?|chat\.whatsapp\.com\/\S+)/i;

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

client.on('qr', (qr) => {
  console.log('Scan this QR code with WhatsApp > Linked devices:');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('Authenticated.'));
client.on('ready', () => console.log('Fiver Ceaser link guard is ready.'));
client.on('auth_failure', (message) => console.error('Auth failure:', message));
client.on('disconnected', (reason) => console.error('Disconnected:', reason));

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
    if (!hasLink(message.body)) return;

    const participantId = message.author || message.from;
    if (!participantId) {
      console.warn('Could not resolve participant for message', message.id && message.id._serialized);
      return;
    }

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
