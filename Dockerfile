# Stage 1: Build the Frontend
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for Vite)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build the frontend (Vite builds to dist/)
RUN npm run build

# Stage 2: Production Runtime
FROM node:20-alpine

WORKDIR /app

# Install Chromium and dependencies for whatsapp-web.js / Puppeteer on Alpine
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

# Copy package files for production install
COPY package*.json ./

# Install ONLY production dependencies
RUN npm ci --only=production --legacy-peer-deps

# Copy backend files
COPY backend ./backend

# Copy scripts folder
COPY scripts ./scripts

# Copy static pages (legacy)
COPY pages ./pages

# Copy built frontend from builder stage
COPY --from=builder /app/dist ./dist

# Copy public folder if it exists (for static assets not processed by Vite)
COPY public ./public

# Expose port
EXPOSE 3000

# Environment variables (defaults, can be overridden)
ENV PORT=3000
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

# Start command
CMD ["node", "backend/server.js"]
