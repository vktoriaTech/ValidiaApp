FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite "hornea" las variables VITE_* dentro del bundle en tiempo de build,
# no en tiempo de ejecución. Por defecto apunta a localhost (dev).
# Para EC2/staging, pasar: docker compose build --build-arg VITE_API_URL=http://<ip-o-dominio>:8000
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
