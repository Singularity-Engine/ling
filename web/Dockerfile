# Ling Web - multi-stage build
FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# SPA fallback
RUN printf 'server {\n  listen 3001;\n  root /usr/share/nginx/html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 3001
CMD ["nginx", "-g", "daemon off;"]
