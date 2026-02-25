FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install
RUN ln -s /app/node_modules /node_modules

COPY . .

ARG VITE_ENGINE_URL
ARG VITE_ENGINE_WS_URL
ARG VITE_SENTRY_DSN

ENV VITE_ENGINE_URL=${VITE_ENGINE_URL}
ENV VITE_ENGINE_WS_URL=${VITE_ENGINE_WS_URL}
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}

RUN npm run build

FROM nginx:1.27-alpine
ENV PORT=8080

COPY nginx.template.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080
