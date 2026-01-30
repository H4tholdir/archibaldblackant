# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY archibald-web-app/backend/package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Build TypeScript
FROM node:20-alpine AS builder
WORKDIR /app
COPY archibald-web-app/backend/package*.json archibald-web-app/backend/tsconfig.json ./
COPY archibald-web-app/backend/src ./src
RUN npm ci && \
    npm run build && \
    npm cache clean --force

# Stage 3: Production runtime with Chromium
FROM node:20-alpine

# Install Chromium, Python3, and dependencies for Puppeteer + PDF parsing
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    font-noto-emoji \
    python3 \
    py3-pip

# Install Python PDF parsing library
RUN pip3 install --no-cache-dir pdfplumber==0.11.4 --break-system-packages

# Chromium executable path for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Force Italian locale for consistent PDF structure
ENV LANG=it_IT.UTF-8
ENV LANGUAGE=it_IT:it
ENV LC_ALL=it_IT.UTF-8

WORKDIR /app

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist
COPY archibald-web-app/backend/package*.json ./

# Copy Python scripts for PDF parsing
COPY --chown=node:node scripts /scripts

# Create directories for application runtime
RUN mkdir -p /app/data /app/.cache /app/logs && \
    chown -R node:node /app/data /app/.cache /app/logs

# Run as non-root user
USER node

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "dist/index.js"]
