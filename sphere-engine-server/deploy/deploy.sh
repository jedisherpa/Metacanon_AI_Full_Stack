
#!/bin/bash
#
# LensForge Living Atlas — One-Command Deploy Script
# Target: Ubuntu 22.04 on Hetzner CCX23
# Domain: shamanyourself.com
#

set -e

# --- Configuration ---
DOMAIN="shamanyourself.com"
EMAIL="your_email@example.com" # <-- For Let's Encrypt alerts
APP_DIR="/var/www/lensforge"
REPO_DIR="/home/ubuntu/lensforge/lensforge-app" # Source code location

# --- Helper Functions ---
print_header() {
  echo -e "\n\033[1;35m$1\033[0m"
}

# --- 1. System Dependencies ---
print_header "1. Installing System Dependencies (Node, Nginx, PM2, Certbot)..."
sudo apt-get update
sudo apt-get install -y nginx nodejs npm python3-certbot-nginx

# Install pnpm globally
sudo npm install -g pnpm

# Install PM2 globally
sudo npm install -g pm2

# --- 2. Directory & Firewall Setup ---
print_header "2. Setting up directories and firewall..."
sudo mkdir -p ${APP_DIR}/app
sudo mkdir -p ${APP_DIR}/tma/dist
sudo chown -R ubuntu:ubuntu /var/www

# Allow HTTP and HTTPS traffic
sudo ufw allow 'Nginx Full'

# --- 3. Copy Application Code ---
print_header "3. Copying application code to ${APP_DIR}..."
cp -r ${REPO_DIR}/* ${APP_DIR}/app/

# --- 4. Install Dependencies & Build ---
print_header "4. Installing dependencies and building projects..."

# Build backend engine
cd ${APP_DIR}/app/engine
echo "Building backend..."
pnpm install
pnpm run build

# Build frontend TMA
cd ${APP_DIR}/app/tma
echo "Building frontend..."
pnpm install
pnpm run build

# Copy TMA build to final destination
cp -r ${APP_DIR}/app/tma/dist/* ${APP_DIR}/tma/dist/

# --- 5. Database Setup ---
print_header "5. Setting up PostgreSQL and running migrations..."
echo "IMPORTANT: This script assumes PostgreSQL is installed and a user/db has been created."
echo "You must run the following SQL commands:"
echo "  CREATE DATABASE lensforge;"
echo "  CREATE USER lensforge WITH ENCRYPTED PASSWORD 'your_password';"
echo "  GRANT ALL PRIVILEGES ON DATABASE lensforge TO lensforge;"

# Run migrations
cd ${APP_DIR}/app/engine
echo "Running database migrations..."
pnpm run db:migrate

# --- 6. Environment Setup ---
print_header "6. Setting up environment variables..."
cp ${REPO_DIR}/deploy/setup_env.sh ${APP_DIR}/app/setup_env.sh
chmod +x ${APP_DIR}/app/setup_env.sh
echo "Now running setup_env.sh. Please edit the generated .env file."
# This script will be run manually by the user to input secrets

# --- 7. Nginx & SSL Setup ---
print_header "7. Configuring Nginx and setting up SSL..."

# Copy Nginx config
sudo cp ${REPO_DIR}/deploy/nginx.conf /etc/nginx/sites-available/lensforge

# Create symlink
sudo ln -sf /etc/nginx/sites-available/lensforge /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx config
sudo nginx -t

# Obtain SSL certificate
sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos -m ${EMAIL}

# Reload Nginx
sudo systemctl reload nginx

# --- 8. Start Application with PM2 ---
print_header "8. Starting application with PM2..."

cd ${APP_DIR}/app
cp ${REPO_DIR}/deploy/ecosystem.config.cjs .

pm2 start ecosystem.config.cjs
pm2 startup
pm2 save

# --- 9. Final Instructions ---
print_header "🎉 Deployment Complete! 🎉"
echo ""
echo "Next steps:"
echo "1.  SSH into your server and run the environment setup script:"
echo "    cd ${APP_DIR}/app && ./setup_env.sh"

echo "2.  Edit the generated .env file with your secrets:"
echo "    nano ${APP_DIR}/app/.env"

echo "3.  Restart the application with the new environment:"
echo "    pm2 restart lensforge-api"

echo "4.  Go to @BotFather in Telegram, select your bot, and go to Bot Settings -> Menu Button."
echo "5.  Set the Menu Button URL to: https://${DOMAIN}"
echo ""
echo "Your Living Atlas is now live!"

