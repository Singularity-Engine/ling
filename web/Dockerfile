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

# SPA fallback + static asset caching
RUN cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
  listen 3001;
  root /usr/share/nginx/html;

  # hashed assets — cache aggressively (1 year)
  location /assets/ {
    add_header Cache-Control "public, immutable, max-age=31536000";
  }

  # service worker — never cache
  location = /sw.js {
    add_header Cache-Control "max-age=0, no-cache, must-revalidate";
  }

  # SPA fallback — short cache for index.html
  location / {
    try_files $uri $uri/ /index.html;
    add_header Cache-Control "no-cache";
  }

  # gzip
  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
  gzip_min_length 256;
}
EOF

EXPOSE 3001
CMD ["nginx", "-g", "daemon off;"]
