# Deployment Guide for Hostinger VPS

## Updating the WhatsApp fixes without replacing the database

Use the existing deployment directory and Compose project name, so the existing
`db-data` and `wwebjs-auth` volumes keep their identities. These changes add only
the `wwebjs-outbox` volume, which stores pending WhatsApp notifications and delivery
receipts separately from the orders database. No database migration is required.

After pulling the reviewed changes on the server, rebuild **only the app**:

```bash
docker compose up -d --build --no-deps app
docker compose logs --tail=100 app
```

This does not recreate the database service. Do not use `docker compose down -v`,
remove `db-data`, or start a fresh Compose project for this update.

Open `/wa` to check the connection and pending notifications. New notifications
retry automatically after reconnects and app restarts. Already-missed notifications
from before this queue was installed are not automatically replayed; use the
existing order actions for a deliberate resend. The existing recovery reminder
timings and five-customer daily limit are unchanged.

For PM2, use `backend/ecosystem.config.cjs` with a single instance. Do not run PM2
and the Docker app against the same WhatsApp session at the same time. Outside
Docker, keep `.wwebjs_outbox` on persistent storage (or set `WHATSAPP_OUTBOX_DIR`).

Local checks: `npm run test:whatsapp` and `npm run build`. Automated tests use mock
WhatsApp sessions and temporary outbox files; they do not send messages or connect
to a production database. A real delivery check requires the deployed app and an
authorized test recipient.

This guide will walk you through deploying your E-commerce application to your Hostinger VPS using Docker.

## Prerequisites

- Access to your Hostinger VPS (IP Address, Username (usually `root`), and Password).
- Your project files ready to be uploaded or cloned.

## Step 1: Connect to your VPS

Open your terminal (on Mac/Linux) or PowerShell/Putty (on Windows) and SSH into your server:

```bash
ssh root@your_vps_ip_address
```
*Replace `your_vps_ip_address` with the actual IP from your Hostinger dashboard.*

## Step 2: Install Docker & Docker Compose

Run the following commands on your VPS to install Docker:

```bash
# Update package list
apt-get update

# Install Docker
apt-get install -y docker.io

# Install Docker Compose
apt-get install -y docker-compose

# Start and enable Docker
systemctl start docker
systemctl enable docker
```

## Step 3: Upload Your Project

You can either `git clone` your repository (if you pushed it to GitHub) or copy the files directly from your computer using `scp`.

**Method A: Using Git (Recommended)**
1.  Push your local code to GitHub.
2.  On VPS: `git clone https://github.com/your-username/your-repo.git app`
3.  `cd app`

**Method B: Direct Copy (SCP)**
Run this **from your local computer** (not the VPS):

```bash
# Make sure you are in the project folder
scp -r . root@your_vps_ip_address:/root/app
```

## Step 4: Configure Environment

On your VPS, navigate to the app folder:
```bash
cd /root/app
```

Create/Edit your `.env` file for production:
```bash
nano .env
```

Paste your production environment variables. Make sure to set `DB_TYPE=postgres`, `ADMIN_PASSCODE` (secure password), and `DATABASE_URL` pointing to the docker container name `db`:

```env
PORT=3000
NODE_ENV=production
# This matches the service name 'db' and password in docker-compose.yml
DATABASE_URL=postgresql://postgres:postgrespassword@db:5432/ecommerce

# PhonePe Keys (Production)
PHONEPE_MERCHANT_ID=YOUR_REAL_MERCHANT_ID
PHONEPE_SALT_KEY=YOUR_REAL_SALT_KEY
PHONEPE_HOST_URL=https://api.phonepe.com/apis/hermes
APP_BE_URL=http://your_vps_ip_address

# Security
ADMIN_PASSCODE=StrongPassword123!
```

Press `Ctrl+O`, `Enter` to save, and `Ctrl+X` to exit.

## Step 5: Start the Application

Build and start the containers:

```bash
docker-compose up -d --build
```

- `--build`: Rebuilds the images.
- `-d`: Runs in detached mode (background).

## Step 6: Verify

Open your browser and visit: `http://your_vps_ip_address`

You should see your website!

## Managing the App

- **Stop App**: `docker-compose down`
- **View Logs**: `docker-compose logs -f`
- **Update App**:
    1.  `git pull` (or re-upload files)
    2.  `docker-compose up -d --build`
