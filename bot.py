import os
import asyncio
from datetime import datetime

import aiohttp
import discord
from discord.ext import commands

TOKEN_FILE = os.getenv("DISCORD_TOKEN_FILE")
if not TOKEN_FILE:
    TOKEN_FILE = os.path.join(os.path.dirname(__file__), "token.txt")

TOKEN_API_URL = os.getenv("DISCORD_TOKEN_API_URL")


def _read_token_from_file(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                token = line.strip()
                if token:
                    return token
    except Exception as e:
        raise SystemExit(f"Failed to read token file '{path}': {e}")
    raise SystemExit(f"Token file '{path}' is empty")


PREFIX = os.getenv("BOT_PREFIX", "!")

API_BASE_URL = os.getenv("API_BASE_URL")
CLIENT_STATS_URL = os.getenv("CLIENT_STATS_URL")


def _resolve_stats_url() -> str:
    if CLIENT_STATS_URL:
        return CLIENT_STATS_URL
    if API_BASE_URL:
        return API_BASE_URL.rstrip("/") + "/api/client/stats"
    return "https://botdisxc.onrender.com/api/client/stats"


STATS_URL = _resolve_stats_url()


async def _read_token_from_api() -> str:
    if not TOKEN_API_URL:
        raise RuntimeError("DISCORD_TOKEN_API_URL is not set")

    headers = {}

    async with aiohttp.ClientSession() as session:
        async with session.get(TOKEN_API_URL) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise RuntimeError(f"Token API HTTP {resp.status}: {text}")
            data = await resp.json()
            token = (data.get("token") if isinstance(data, dict) else None)
            if not token or not isinstance(token, str):
                raise RuntimeError("Token API response does not contain 'token'")
            return token.strip()


def _format_ts_ms(ts_ms):
    if not ts_ms:
        return "—"
    try:
        dt = datetime.fromtimestamp(float(ts_ms) / 1000.0)
        return dt.strftime("%d.%m.%Y %H:%M:%S")
    except Exception:
        return str(ts_ms)


async def fetch_stats(session: aiohttp.ClientSession):
    async with session.get(STATS_URL) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}")
        return await resp.json()


intents = discord.Intents.default()
intents.guilds = True
intents.messages = True
intents.message_content = True

bot = commands.Bot(command_prefix=PREFIX, intents=intents)


@bot.event
async def on_ready():
    print(f"Bot logged in as {bot.user}")
    print(f"Using stats url: {STATS_URL}")


async def _reply_stats(ctx: commands.Context):
    async with aiohttp.ClientSession() as session:
        data = await fetch_stats(session)
        online = data.get("online", 0)
        stats = data.get("stats") or {}
        unique_users = stats.get("uniqueUsers", 0)

        await ctx.reply(
            "AeroProject\n"
            f"Всего пользователей запустивших клиент: {unique_users}\n"
            f"Онлайн сейчас: {online}"
        )


@bot.command(name="stats")
async def stats_cmd(ctx: commands.Context):
    try:
        await _reply_stats(ctx)
    except Exception as e:
        await ctx.reply(f"Failed to fetch stats: {e}")


@bot.command(name="online")
async def online_cmd(ctx: commands.Context):
    await stats_cmd(ctx)


async def main():
    token = None
    if TOKEN_API_URL:
        token = await _read_token_from_api()
    else:
        token = _read_token_from_file(TOKEN_FILE)

    async with bot:
        await bot.start(token)


if __name__ == "__main__":
    asyncio.run(main())
