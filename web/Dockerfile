# Ling Web - multi-stage production build
# Stage 1: build Vite SPA
FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

# Stage 2: serve static files via nginx
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Add WASM MIME type if not already present
RUN grep -q 'wasm' /etc/nginx/mime.types || \
    sed -i '/^}/i \    application/wasm                                         wasm;' /etc/nginx/mime.types

# SPA fallback + static asset caching + COOP/COEP for SharedArrayBuffer (VAD/ONNX)
RUN cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
  listen 3001;
  root /usr/share/nginx/html;

  # SharedArrayBuffer requires COOP + COEP headers (needed by ONNX Runtime WASM for VAD)
  add_header Cross-Origin-Opener-Policy "same-origin" always;
  add_header Cross-Origin-Embedder-Policy "credentialless" always;

  # hashed assets — cache aggressively (1 year)
  location /assets/ {
    add_header Cache-Control "public, immutable, max-age=31536000";
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "credentialless" always;
  }

  # service worker — never cache
  location = /sw.js {
    add_header Cache-Control "max-age=0, no-cache, must-revalidate";
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "credentialless" always;
  }

  # API proxy — forward to backend engine
  location /api/ {
    proxy_pass http://ling-engine:12393;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Origin $http_origin;
    proxy_set_header Referer $http_referer;
    proxy_buffering off;
  }

  # WebSocket proxy — for real-time communication
  location /ws {
    proxy_pass http://ling-engine:12393;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
  }

  # SPA fallback — short cache for index.html
  location / {
    try_files $uri $uri/ /index.html;
    add_header Cache-Control "no-cache";
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "credentialless" always;
  }

  # gzip
  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml application/wasm;
  gzip_min_length 256;
}
EOF

EXPOSE 3001
CMD ["nginx", "-g", "daemon off;"]
