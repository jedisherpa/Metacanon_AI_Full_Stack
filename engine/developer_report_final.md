# Developer Report: Connecting AI Agents to Telegram and Discord

**Author:** Manus AI | **Date:** March 2026 | **Version:** 1.0

---

## Executive Summary

This report provides a complete technical reference for developers who want to connect an AI agent to Telegram and Discord. It covers every layer of the integration stack: platform registration, authentication, update delivery architecture, library selection, code implementation, conversation memory management, latency handling, and production deployment. The two platforms share a common goal but use fundamentally different architectures — Telegram is HTTP-first and stateless, while Discord mandates a persistent WebSocket Gateway — and this report treats them accordingly.

---

## Part I: Telegram

### 1.1 Platform Architecture Overview

Telegram's bot platform is built on a clean HTTP REST API called the **Telegram Bot API** [1]. Every bot is a first-class Telegram user, identified by a unique username ending in `bot`. All interactions flow through Telegram's servers: your application never communicates directly with end users. This means your server only needs outbound internet access and, optionally, a public HTTPS endpoint for webhooks.

The API is versioned and actively maintained. As of March 2026, the current version is **Bot API 9.5**, which introduced the `date_time` message entity type and the `sendMessageDraft` method for streaming partial responses to users while they are being generated — a capability directly relevant to AI agents with long inference times [1].

### 1.2 Step 1 — Creating a Bot with BotFather

All Telegram bots are registered through `@BotFather`, the official meta-bot. The process takes under two minutes.

1. Open a chat with `@BotFather` in any Telegram client.
2. Send the command `/newbot`.
3. Provide a display name (e.g., `My AI Assistant`) and a username ending in `bot` (e.g., `myaiassistant_bot`).
4. BotFather returns a **bot token** in the format `123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ`.

This token is the single credential that authenticates all API calls. It must be stored as an environment variable and **never committed to source control**.

```bash
# Store securely in your environment
export TELEGRAM_BOT_TOKEN="123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ"
```

You can also configure the bot's description, profile photo, and command list through BotFather using `/setdescription`, `/setuserpic`, and `/setcommands` respectively.

### 1.3 Step 2 — Choosing an Update Delivery Method

Telegram offers two mutually exclusive methods for receiving updates. **Only one can be active at a time.**

| Dimension | Long Polling (`getUpdates`) | Webhook (`setWebhook`) |
| :--- | :--- | :--- |
| **How it works** | Your server repeatedly calls `getUpdates`, which holds the connection open for up to 50 seconds until updates arrive | Telegram pushes a POST request to your HTTPS endpoint the moment an update occurs |
| **Infrastructure required** | None — any outbound internet connection works | A public domain with a valid TLS certificate (self-signed is supported) |
| **Latency** | ~100–500ms (one polling cycle) | Near-instant (sub-100ms) |
| **Scalability** | Single-process; difficult to scale horizontally | Stateless; trivially load-balanced |
| **Best for** | Local development, testing, simple single-instance bots | Production deployments |
| **Simultaneous instances** | Only one polling instance can run at a time | Multiple webhook receivers can run behind a load balancer |

**Setting a webhook** requires a single API call:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://yourdomain.com/webhook/<TOKEN>" \
  -d "allowed_updates=[\"message\",\"callback_query\"]"
```

The `allowed_updates` parameter is important for AI agents: filtering to only the update types you need reduces noise and processing overhead.

### 1.4 Step 3 — Understanding the Update Object

Every incoming event from Telegram arrives as an `Update` object. The fields most relevant to an AI agent are:

```json
{
  "update_id": 269387972,
  "message": {
    "message_id": 42,
    "from": {
      "id": 123456789,
      "first_name": "Alice",
      "username": "alice"
    },
    "chat": {
      "id": 123456789,
      "type": "private"
    },
    "text": "/ask What is the capital of France?",
    "entities": [
      { "type": "bot_command", "offset": 0, "length": 4 }
    ]
  }
}
```

The `chat.id` is the key identifier for routing responses back to the correct conversation. The `from.id` identifies the individual user.

### 1.5 Step 4 — Library Selection

Three major Python libraries exist for Telegram bot development. The choice depends on your use case.

| Library | Language | Style | Best For |
| :--- | :--- | :--- | :--- |
| **python-telegram-bot** (v21+) | Python | Async (asyncio) | Full-featured bots; excellent documentation; built-in `ConversationHandler` for FSM-based flows |
| **aiogram** (v3+) | Python | Async (asyncio) | High-performance production bots; middleware system; built-in FSM with Redis storage |
| **Pyrogram** | Python | Async (asyncio) | MTProto-level access (user accounts, not just bots); more powerful but more complex |

For AI agent integration, **`python-telegram-bot` v21** or **`aiogram` v3** are the recommended choices. Both support async/await natively, which is essential for non-blocking AI inference calls.

```bash
# Install python-telegram-bot
pip install "python-telegram-bot[webhooks]"

# Install aiogram
pip install aiogram
```

### 1.6 Step 5 — Complete AI Agent Implementation

The following is a production-ready pattern for a Telegram AI agent using `python-telegram-bot` v21 and the OpenAI API. It demonstrates proper async handling, conversation memory, and typing indicators.

```python
import os
import asyncio
from openai import AsyncOpenAI
from telegram import Update
from telegram.constants import ChatAction
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    filters,
    ContextTypes,
)

# --- Configuration ---
TELEGRAM_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

# In-memory conversation history (keyed by chat_id)
# For production, replace with a persistent store (Redis, PostgreSQL)
conversation_history: dict[int, list[dict]] = {}

SYSTEM_PROMPT = """You are a helpful AI assistant. Be concise and accurate."""

# --- Handlers ---

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /start command."""
    chat_id = update.effective_chat.id
    conversation_history[chat_id] = []  # Reset conversation
    await update.message.reply_text(
        "Hello! I am your AI assistant. Ask me anything."
    )


async def clear_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /clear command to reset conversation history."""
    chat_id = update.effective_chat.id
    conversation_history[chat_id] = []
    await update.message.reply_text("Conversation history cleared.")


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle incoming text messages and route them to the AI agent."""
    chat_id = update.effective_chat.id
    user_message = update.message.text

    # Initialize history for new chats
    if chat_id not in conversation_history:
        conversation_history[chat_id] = []

    # Append user message to history
    conversation_history[chat_id].append({"role": "user", "content": user_message})

    # Send a "typing..." indicator while the AI generates a response
    await context.bot.send_chat_action(chat_id=chat_id, action=ChatAction.TYPING)

    try:
        # Build the messages list with system prompt + conversation history
        # Limit history to last 20 messages to manage context window
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages += conversation_history[chat_id][-20:]

        # Call the AI model
        response = await openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=messages,
            max_tokens=1024,
        )

        ai_response = response.choices[0].message.content

        # Append assistant response to history
        conversation_history[chat_id].append(
            {"role": "assistant", "content": ai_response}
        )

        # Send the response back to the user
        await update.message.reply_text(ai_response)

    except Exception as e:
        await update.message.reply_text(
            f"An error occurred while processing your request. Please try again."
        )
        print(f"Error: {e}")


# --- Application Setup ---

def main() -> None:
    """Start the bot."""
    application = Application.builder().token(TELEGRAM_TOKEN).build()

    # Register handlers
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("clear", clear_command))
    application.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message)
    )

    # Run with polling (for development)
    # For production, use: application.run_webhook(...)
    application.run_polling(allowed_updates=["message"])


if __name__ == "__main__":
    main()
```

### 1.7 Step 6 — Streaming Responses with `sendMessageDraft`

Bot API 9.3 introduced `sendMessageDraft`, which allows bots to stream partial responses to a user while the AI is still generating. This is the Telegram equivalent of ChatGPT's streaming output and significantly improves perceived responsiveness for long AI responses.

```python
async def handle_message_streaming(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    user_message = update.message.text

    # Send an initial draft message
    draft_message = await context.bot.send_message_draft(
        chat_id=chat_id,
        text="Thinking..."
    )

    full_response = ""
    # Stream from OpenAI
    stream = await openai_client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[{"role": "user", "content": user_message}],
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta.content or ""
        full_response += delta
        # Update the draft every ~50 characters to avoid rate limits
        if len(full_response) % 50 == 0:
            await context.bot.edit_message_text(
                chat_id=chat_id,
                message_id=draft_message.message_id,
                text=full_response
            )

    # Final update with complete response
    await context.bot.edit_message_text(
        chat_id=chat_id,
        message_id=draft_message.message_id,
        text=full_response
    )
```

### 1.8 Rate Limits

Telegram enforces the following rate limits for bots [1]:

| Scope | Limit |
| :--- | :--- |
| Global message sending | 30 messages/second |
| Single chat | 1 message/second |
| Group broadcasts | 20 messages/minute per group |
| Bulk notifications | Spread over 8–12 hour intervals recommended |

Exceeding these limits results in a `429 Too Many Requests` error with a `retry_after` field indicating how long to wait.

---

## Part II: Discord

### 2.1 Platform Architecture Overview

Discord's bot platform is architecturally more complex than Telegram's. While Telegram bots communicate via a simple HTTP REST API, Discord requires bots to maintain a **persistent WebSocket connection** to the **Gateway** — Discord's real-time event delivery system [2]. This connection must be actively maintained with heartbeat messages, and bots must handle reconnection logic for production reliability.

The key architectural components are:

- **Gateway**: The WebSocket endpoint that delivers real-time events (messages, reactions, member joins, etc.).
- **REST API**: Used for sending messages, creating channels, managing roles, and all write operations.
- **Interactions**: A newer, HTTP-based system for slash commands and UI components that does not require a Gateway connection.
- **Intents**: A permission system that controls which events your bot receives over the Gateway.

### 2.2 Step 1 — Creating a Discord Application and Bot

1. Navigate to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and give it a name.
3. In the left sidebar, click **Bot**.
4. Click **Add Bot** and confirm.
5. Under **Token**, click **Reset Token** to generate your bot token. Store it securely.
6. Under **Privileged Gateway Intents**, enable **Message Content Intent**. This is required for your bot to read the content of messages. For bots in more than 100 servers, this requires verification and approval from Discord.

### 2.3 Step 2 — Configuring OAuth2 and Inviting the Bot

Discord uses OAuth2 to grant bots access to servers. To generate an invite link:

1. In the Developer Portal, navigate to **OAuth2 > URL Generator**.
2. Under **Scopes**, select `bot` and `applications.commands`.
3. Under **Bot Permissions**, select the permissions your bot needs. For a basic AI chatbot, you need: `Send Messages`, `Read Message History`, `Use Application Commands`, `Create Public Threads`, and `Send Messages in Threads`.
4. Copy the generated URL and open it in a browser to add the bot to your server.

The minimum required OAuth2 scopes for an AI agent are:

```
https://discord.com/api/oauth2/authorize
  ?client_id=YOUR_CLIENT_ID
  &permissions=274877908992
  &scope=bot%20applications.commands
```

### 2.4 Step 3 — Understanding Gateway Intents

Intents are a critical concept in Discord bot development. They act as a subscription filter, telling Discord which events to send to your bot over the Gateway. Requesting unnecessary intents increases bandwidth and processing overhead.

| Intent | Events Received | Privileged? |
| :--- | :--- | :--- |
| `Guilds` | Server create/update/delete, channel events | No |
| `GuildMessages` | Message create/update/delete in servers | No |
| `MessageContent` | The actual text content of messages | **Yes** |
| `GuildMembers` | Member join/leave/update events | **Yes** |
| `DirectMessages` | Messages in DMs | No |
| `GuildPresences` | Online status, activity updates | **Yes** |

For an AI chatbot, you need at minimum `Guilds`, `GuildMessages`, `MessageContent`, and `DirectMessages`.

### 2.5 Step 4 — The 3-Second Interaction Rule

This is the most important architectural constraint for AI-powered Discord bots. When a user triggers a slash command, Discord sends an interaction payload to your bot. **You must respond within 3 seconds**, or Discord will display an "application did not respond" error to the user [2].

Since AI models typically take 2–30 seconds to generate a response, the correct pattern is a **deferred response**:

1. Immediately send `type: 5` (Deferred Channel Message with Source) to acknowledge the interaction.
2. Process the AI inference asynchronously.
3. Use the interaction token (valid for 15 minutes) to send a follow-up message with the AI response.

```
User sends /ask command
  → Discord sends Interaction to your bot
  → Bot immediately responds: { "type": 5 }  ← Must happen within 3 seconds
  → Discord shows "Bot is thinking..." to user
  → Bot calls AI model (takes 5–15 seconds)
  → Bot sends follow-up via PATCH /webhooks/{app_id}/{token}/messages/@original
  → User sees the AI response
```

### 2.6 Step 5 — Library Selection

| Library | Language | Style | Best For |
| :--- | :--- | :--- | :--- |
| **discord.py** (v2+) | Python | Async (asyncio) | Most widely used Python library; excellent documentation; strong community |
| **discord.js** (v14+) | JavaScript/TypeScript | Async (Promises) | Most widely used overall; best for Node.js environments |
| **nextcord** | Python | Async (asyncio) | Fork of discord.py with faster updates; good slash command support |
| **interactions.py** | Python | Async (asyncio) | Focused exclusively on interactions/slash commands; good for serverless |

For Python-based AI agents, **discord.py v2** is the standard recommendation.

```bash
pip install "discord.py[voice]"
# or for slash commands only
pip install discord.py
```

### 2.7 Step 6 — Complete AI Agent Implementation

The following is a production-ready pattern for a Discord AI agent using `discord.py` v2 and the OpenAI API, with proper deferred responses, conversation threading, and error handling.

```python
import os
import asyncio
from openai import AsyncOpenAI
import discord
from discord import app_commands
from discord.ext import commands

# --- Configuration ---
DISCORD_TOKEN = os.environ["DISCORD_BOT_TOKEN"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

SYSTEM_PROMPT = """You are a helpful AI assistant on Discord. Be concise and accurate.
Format responses using Discord markdown where appropriate."""

# --- Bot Setup ---
intents = discord.Intents.default()
intents.message_content = True  # Requires privileged intent enabled in Developer Portal
intents.messages = True

bot = commands.Bot(command_prefix="!", intents=intents)
tree = bot.tree

# In-memory conversation history (keyed by thread_id or channel_id)
# For production, replace with Redis or PostgreSQL
conversation_history: dict[int, list[dict]] = {}


# --- Events ---

@bot.event
async def on_ready():
    """Called when the bot is ready. Syncs slash commands."""
    await tree.sync()
    print(f"Logged in as {bot.user} (ID: {bot.user.id})")
    print("Slash commands synced.")


# --- Slash Commands ---

@tree.command(name="ask", description="Ask the AI agent a question")
@app_commands.describe(question="Your question for the AI agent")
async def ask_command(interaction: discord.Interaction, question: str):
    """
    Main AI interaction command.
    Uses deferred response to handle AI latency gracefully.
    """
    # CRITICAL: Defer immediately to avoid the 3-second timeout
    await interaction.response.defer(thinking=True)

    channel_id = interaction.channel_id

    # Initialize history for new channels
    if channel_id not in conversation_history:
        conversation_history[channel_id] = []

    # Append user message
    conversation_history[channel_id].append({"role": "user", "content": question})

    try:
        # Build messages with system prompt + last 20 turns of history
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        messages += conversation_history[channel_id][-20:]

        # Call the AI model
        response = await openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=messages,
            max_tokens=1024,
        )

        ai_response = response.choices[0].message.content

        # Append assistant response to history
        conversation_history[channel_id].append(
            {"role": "assistant", "content": ai_response}
        )

        # Truncate if response exceeds Discord's 2000-character limit
        if len(ai_response) > 2000:
            ai_response = ai_response[:1990] + "\n...(truncated)"

        # Send the follow-up response (interaction token valid for 15 minutes)
        await interaction.followup.send(ai_response)

    except Exception as e:
        await interaction.followup.send(
            "An error occurred while processing your request. Please try again.",
            ephemeral=True  # Only visible to the user who triggered the command
        )
        print(f"Error in /ask command: {e}")


@tree.command(name="clear", description="Clear the conversation history for this channel")
async def clear_command(interaction: discord.Interaction):
    """Reset conversation history for the current channel."""
    channel_id = interaction.channel_id
    conversation_history[channel_id] = []
    await interaction.response.send_message(
        "Conversation history cleared.", ephemeral=True
    )


# --- Message Handler (for @mentions) ---

@bot.event
async def on_message(message: discord.Message):
    """Handle messages that mention the bot directly."""
    # Ignore messages from bots (including self)
    if message.author.bot:
        return

    # Only respond to @mentions
    if bot.user not in message.mentions:
        return

    # Remove the @mention from the message content
    user_message = message.content.replace(f"<@{bot.user.id}>", "").strip()
    if not user_message:
        await message.reply("Yes? How can I help you?")
        return

    # Show typing indicator
    async with message.channel.typing():
        channel_id = message.channel.id
        if channel_id not in conversation_history:
            conversation_history[channel_id] = []

        conversation_history[channel_id].append(
            {"role": "user", "content": user_message}
        )

        try:
            messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            messages += conversation_history[channel_id][-20:]

            response = await openai_client.chat.completions.create(
                model="gpt-4.1-mini",
                messages=messages,
                max_tokens=1024,
            )

            ai_response = response.choices[0].message.content
            conversation_history[channel_id].append(
                {"role": "assistant", "content": ai_response}
            )

            if len(ai_response) > 2000:
                ai_response = ai_response[:1990] + "\n...(truncated)"

            await message.reply(ai_response)

        except Exception as e:
            await message.reply("An error occurred. Please try again.")
            print(f"Error in on_message: {e}")

    # Process other commands
    await bot.process_commands(message)


# --- Run ---

if __name__ == "__main__":
    bot.run(DISCORD_TOKEN)
```

### 2.8 Step 7 — Registering Slash Commands (Global vs. Guild)

Discord slash commands can be registered at two scopes:

| Scope | Propagation Time | Best For |
| :--- | :--- | :--- |
| **Guild (server-specific)** | Instant | Development and testing |
| **Global** | Up to 1 hour | Production deployment |

To register commands for a specific guild during development (for instant propagation), pass the `guild` parameter to `tree.sync()`:

```python
@bot.event
async def on_ready():
    MY_GUILD_ID = discord.Object(id=123456789012345678)
    # Sync to a specific guild for instant updates during development
    tree.copy_global_to(guild=MY_GUILD_ID)
    await tree.sync(guild=MY_GUILD_ID)
    print("Guild commands synced.")
```

For production, call `await tree.sync()` without arguments to register globally.

### 2.9 Step 8 — Gateway Reconnection and Production Resilience

Discord's Gateway connection can drop due to network issues, Discord maintenance, or heartbeat timeouts. `discord.py` handles most reconnection scenarios automatically, but you should be aware of the close codes that require a full restart vs. a session resume.

The library's built-in reconnection handles:
- **Opcode 7 (Reconnect)**: Discord requests a reconnect; the library resumes the session automatically.
- **Close code 4000 (Unknown error)**: Reconnect and resume.
- **Close code 4014 (Disallowed intent)**: Fatal — requires fixing your intent configuration.

For production, wrap your bot runner in a supervisor process (e.g., `systemd`, `pm2`, or Docker with a restart policy) to handle unexpected crashes.

### 2.10 Discord Rate Limits

Discord enforces per-route rate limits on REST API calls [2]:

| Operation | Limit |
| :--- | :--- |
| Sending messages | 5 requests per 5 seconds per channel |
| Global rate limit | 50 requests per second |
| Slash command registration | 200 global commands, 200 guild commands |
| Interaction token follow-up | Valid for 15 minutes after initial interaction |

`discord.py` handles rate limit headers automatically and queues requests when limits are reached.

---

## Part III: Shared Patterns and Production Considerations

### 3.1 Conversation Memory Architecture

Both platforms require you to manage conversation context explicitly. The choice of storage backend depends on your scale and durability requirements.

| Backend | Latency | Durability | Scalability | Best For |
| :--- | :--- | :--- | :--- | :--- |
| **In-memory dict** | ~0ms | None (lost on restart) | Single instance only | Development |
| **Redis** | ~1ms | Configurable (AOF/RDB) | Horizontal | Production; high-traffic bots |
| **PostgreSQL** | ~5ms | Full ACID | Horizontal | Production; analytics needed |
| **Vector DB (Pinecone, Weaviate)** | ~20ms | Full | Horizontal | Long-term semantic memory; RAG |

A production conversation store using Redis:

```python
import redis.asyncio as redis
import json

redis_client = redis.Redis(host="localhost", port=6379, decode_responses=True)

async def get_history(chat_id: str, limit: int = 20) -> list[dict]:
    """Retrieve the last `limit` messages for a conversation."""
    raw = await redis_client.lrange(f"history:{chat_id}", -limit, -1)
    return [json.loads(msg) for msg in raw]

async def append_message(chat_id: str, role: str, content: str) -> None:
    """Append a message to the conversation history."""
    message = json.dumps({"role": role, "content": content})
    await redis_client.rpush(f"history:{chat_id}", message)
    # Keep only the last 100 messages
    await redis_client.ltrim(f"history:{chat_id}", -100, -1)
    # Set a 24-hour TTL on inactive conversations
    await redis_client.expire(f"history:{chat_id}", 86400)
```

### 3.2 Handling AI Latency

| Platform | Mechanism | Implementation |
| :--- | :--- | :--- |
| **Telegram** | `send_chat_action` with `ChatAction.TYPING` | Call before the AI inference; repeat every 5 seconds for long responses |
| **Telegram (API 9.3+)** | `sendMessageDraft` | Stream partial responses to the user in real time |
| **Discord** | `interaction.response.defer(thinking=True)` | Must be called within 3 seconds; shows "Bot is thinking..." |
| **Discord** | `message.channel.typing()` context manager | Shows typing indicator for @mention responses |

### 3.3 Security Considerations

Both platforms require careful attention to security:

- **Token storage**: Always use environment variables or a secrets manager (AWS Secrets Manager, HashiCorp Vault). Never hardcode tokens.
- **User authorization**: Implement allowlists by user ID or server ID to restrict who can interact with your bot.
- **Input sanitization**: Validate and sanitize user input before passing it to your AI model to prevent prompt injection attacks.
- **Output filtering**: Consider using a moderation API (OpenAI Moderation, Perspective API) to filter harmful AI outputs before sending them to users.
- **Rate limiting**: Implement per-user rate limiting at the application level to prevent abuse.

### 3.4 Deployment Checklist

| Step | Telegram | Discord |
| :--- | :--- | :--- |
| Store token in environment variable | ✓ | ✓ |
| Use webhook (not polling) in production | ✓ | N/A (Gateway is always persistent) |
| Enable only required update types / intents | ✓ | ✓ |
| Implement conversation history with TTL | ✓ | ✓ |
| Handle AI latency with typing indicator | ✓ | ✓ |
| Implement exponential backoff for API errors | ✓ | ✓ |
| Wrap in a process supervisor (systemd, Docker) | ✓ | ✓ |
| Set up logging and error alerting | ✓ | ✓ |
| Register slash commands globally (Discord only) | N/A | ✓ |

---

## Part IV: Quick Reference

### Telegram Quick Reference

```
1. Create bot: @BotFather → /newbot → get TOKEN
2. Install: pip install "python-telegram-bot[webhooks]"
3. Set webhook: POST https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL>
4. Receive update: POST to your webhook URL
5. Send message: POST https://api.telegram.org/bot<TOKEN>/sendMessage
   Body: { "chat_id": 123, "text": "Hello!" }
6. Rate limit: 30 msg/s global, 1 msg/s per chat
7. Current API version: Bot API 9.5 (March 2026)
```

### Discord Quick Reference

```
1. Create app: discord.com/developers/applications → New Application → Add Bot → get TOKEN
2. Enable intents: Bot tab → Privileged Gateway Intents → Message Content Intent
3. Generate invite: OAuth2 → URL Generator → scopes: bot + applications.commands
4. Install: pip install discord.py
5. Connect: client.run(TOKEN) — maintains persistent WebSocket to Gateway
6. Slash command: @tree.command() decorator + await tree.sync()
7. Defer response: await interaction.response.defer() — MUST be within 3 seconds
8. Follow up: await interaction.followup.send("AI response")
9. Rate limit: 5 msg/5s per channel, 50 req/s global
10. Interaction token valid: 15 minutes
```

---

## References

[1] Telegram. *Telegram Bot API*. https://core.telegram.org/bots/api

[2] Discord. *Interactions: Receiving and Responding*. https://docs.discord.com/developers/interactions/receiving-and-responding

[3] Siwiec, D. *Building an AI Telegram Agent with Python and Claude. Part 1: FastAPI Telegram Integration*. Dan On Coding, October 2026. https://danoncoding.com/building-an-ai-telegram-agent-with-python-and-claude-2f18a0d1a6dc

[4] Render. *How do I integrate my AI agent with Slack or Discord as a bot?* January 2026. https://render.com/articles/how-do-i-integrate-my-ai-agent-with-slack-or-discord-as-a-bot

[5] FlowHunt. *Discord AI: The Complete Guide to Building and Integrating AI Chatbots on Discord*. October 2025. https://www.flowhunt.io/blog/discord-ai/

[6] OpenAI. *gpt-discord-bot: Example Discord bot written in Python*. GitHub. https://github.com/openai/gpt-discord-bot

[7] Discord. *Gateway Intents*. https://discordpy.readthedocs.io/en/latest/intents.html

[8] Discord. *Gateway — Documentation*. https://docs.discord.com/developers/events/gateway
