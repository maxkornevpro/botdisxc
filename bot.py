import os
import asyncio
from datetime import datetime

import aiohttp
import discord
from discord.ext import commands


DISCORD_TOKEN = "MTQ1NTY0MzUyNDk2Mjk3NTg2MA.GDxr4K.o6DGAWBsraP6vbexHhmwO1KVYxPKpgGAJDtltk"
PREFIX = os.getenv("BOT_PREFIX", "!")

API_BASE_URL = os.getenv("API_BASE_URL")
CLIENT_STATS_URL = os.getenv("CLIENT_STATS_URL")

if not DISCORD_TOKEN or DISCORD_TOKEN == "YOUR_TOKEN_HERE":
    raise SystemExit("Missing or placeholder DISCORD_TOKEN. Please replace 'YOUR_TOKEN_HERE' with your actual token.")


def _resolve_stats_url() -> str:
    if CLIENT_STATS_URL:
        return CLIENT_STATS_URL
    if API_BASE_URL:
        return API_BASE_URL.rstrip("/") + "/api/client/stats"
    return "https://botdisxc.onrender.com/api/client/stats"


STATS_URL = _resolve_stats_url()


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
    async with bot:
        await bot.start(DISCORD_TOKEN)


if __name__ == "__main__":
    asyncio.run(main())


