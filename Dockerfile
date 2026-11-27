# CEASA VIRTUAL — imagem para EasyPanel ou qualquer host de containers.
# O banco (SQLite) e as fotos ficam em /app/dados: monte um volume nesse caminho, ou tudo se perde a cada deploy.

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
# TZ: o servidor registra a hora das evidências e confere a janela de recebimento das escolas pelo relógio local
ENV NODE_ENV=production \
    PORT=3000 \
    CEASA_DADOS=/app/dados \
    TZ=America/Fortaleza
COPY --from=build /app/package.json ./
# o servidor roda o TypeScript com tsx, que está nas dependências de desenvolvimento
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/compartilhado ./compartilhado
RUN mkdir -p /app/dados && chown -R node:node /app/dados
USER node
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "server/index.ts"]
