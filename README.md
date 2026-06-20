# Fiver Ceaser WhatsApp Group Link Guard

A `whatsapp-web.js` bot that watches WhatsApp group chats. When any participant sends a link, the bot deletes the message and removes that participant from the group.

## Requirements

- Node.js 20+
- A WhatsApp account linked through WhatsApp Web
- The bot account must be an **admin** in the target group, otherwise WhatsApp will reject message deletion/removal.

## Setup

```bash
npm install
cp .env.example .env
npm start
```

On first start, scan the QR code using WhatsApp → **Linked devices**.

## Configuration

Edit `.env`:

- `TARGET_GROUP_ID`: exact WhatsApp group id, safest option. Example: `1203630xxxxxx@g.us`
- `TARGET_GROUP_NAME`: exact group name if you do not know the id.
- If neither is set, the bot guards **every group** the account is in.
- `DRY_RUN=true` logs what would happen without deleting/kicking.

## Getting the group id

Run:

```bash
npm run list-groups
```

After scanning QR / authenticating, it prints all groups the bot account can see.

## Run

```bash
npm start
```

The bot also starts a small status page on `PORT`/3000:

- `/` — scan-friendly WhatsApp QR page
- `/health` — JSON health/status
- `/qr` — current QR data URL, if login is pending

For production, run it under pm2/systemd/Docker/Coolify so it stays online.

## Important notes

- Admins are ignored: if an admin sends a link, the bot logs it and takes no delete/kick action.
- Deleting for everyone can fail if WhatsApp does not allow the bot to delete that message; the code logs the error.
- Participant removal requires the bot account to be group admin.
- This uses WhatsApp Web automation, not the official WhatsApp Business Cloud API.
