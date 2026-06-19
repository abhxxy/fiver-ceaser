require('dotenv').config();

const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
  authStrategy: new LocalAuth({ clientId: process.env.SESSION_NAME || 'fiver-ceaser' }),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});

client.on('qr', (qr) => {
  console.log('Scan this QR code with WhatsApp > Linked devices:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  const chats = await client.getChats();
  const groups = chats.filter((chat) => chat.isGroup);

  console.log(`Found ${groups.length} group(s):`);
  for (const group of groups) {
    console.log(`${group.name} => ${group.id._serialized}`);
  }

  await client.destroy();
  process.exit(0);
});

client.on('auth_failure', (message) => console.error('Auth failure:', message));
client.initialize();
