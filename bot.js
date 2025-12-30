const { Client, GatewayIntentBits } = require('discord.js');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const STATS_URL = process.env.STATS_URL || 'https://messenger-server-klav.onrender.com/api/client/stats';
const PREFIX = process.env.BOT_PREFIX || '!';

async function getFetch() {
  if (typeof fetch === 'function') return fetch;
  const mod = await import('node-fetch');
  return mod.default;
}

if (!DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN env var');
  process.exit(1);
}

async function fetchStats() {
  const fetchImpl = await getFetch();
  const res = await fetchImpl(STATS_URL, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.json();
}

function formatTs(ts) {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('ru-RU');
  } catch {
    return String(ts);
  }
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  console.log(`Using stats url: ${STATS_URL}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const [cmd] = message.content.slice(PREFIX.length).trim().split(/\s+/);
  if (!cmd) return;

  if (cmd.toLowerCase() !== 'stats' && cmd.toLowerCase() !== 'online') return;

  try {
    const data = await fetchStats();
    const online = data?.online ?? 0;
    const totalStarts = data?.stats?.totalStarts ?? 0;
    const totalStops = data?.stats?.totalStops ?? 0;
    const lastStartAt = formatTs(data?.stats?.lastStartAt);
    const lastStopAt = formatTs(data?.stats?.lastStopAt);
    const ttlSec = Math.round((data?.ttlMs ?? 0) / 1000);

    await message.reply(
      `AeroProject stats\n` +
      `Online clients: ${online} (ttl ${ttlSec}s)\n` +
      `Total starts: ${totalStarts}\n` +
      `Total stops: ${totalStops}\n` +
      `Last start: ${lastStartAt}\n` +
      `Last stop: ${lastStopAt}`
    );
  } catch (e) {
    await message.reply(`Failed to fetch stats: ${e.message || e}`);
  }
});

client.login(DISCORD_TOKEN);
