FROM node:22-slim AS client
WORKDIR /c
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=client /c/dist /client/dist
ENV CLIENT_DIST=/client/dist NODE_ENV=production
EXPOSE 4000
CMD ["node", "src/index.js"]
