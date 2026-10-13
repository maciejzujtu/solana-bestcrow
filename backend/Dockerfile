FROM node:22-bookworm-slim

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY --chown=node:node . .
RUN npm run build
RUN mkdir -p /app/data && chown node:node /app /app/data

USER node
EXPOSE 4000
CMD ["npm", "run", "start"]
