
#!/bin/bash
# Creates the .env file for the LensForge backend.

set -e

# Default values - override as needed
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="postgres"
DB_PASSWORD="your_postgres_password" # <-- IMPORTANT: CHANGE THIS
DB_NAME="lensforge"

TELEGRAM_BOT_TOKEN="your_telegram_bot_token" # <-- IMPORTANT: CHANGE THIS
KIMI_API_KEY="your_kimi_api_key" # <-- IMPORTANT: CHANGE THIS

# You can get this from the TMA in dev mode
DEV_INIT_DATA="your_dev_init_data" # Optional, for local testing

# --- No changes needed below this line ---

# Generate a secure secret for JWT
JWT_SECRET=$(openssl rand -hex 32)

# Create the .env file in the app directory
cat > /var/www/lensforge/app/.env << EOL
# PostgreSQL Database
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=public"

# JWT
JWT_SECRET=${JWT_SECRET}

# Telegram
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}

# LLM Providers
LLM_PROVIDER_DEFAULT=kimi
KIMI_API_KEY=${KIMI_API_KEY}
# GROQ_API_KEY=
# MORPHEUS_API_KEY=

# Server
PORT=3001
CORS_ORIGINS=https://www.shamanyourself.com,http://localhost:5173

# Sentry (optional)
SENTRY_DSN=

# Dev settings
DEV_INIT_DATA=${DEV_INIT_DATA}
EOL

echo "✅ .env file created at /var/www/lensforge/app/.env"
echo "🛑 IMPORTANT: Edit the file to set your DB_PASSWORD, TELEGRAM_BOT_TOKEN, and KIMI_API_KEY."

