FROM node:22-alpine

WORKDIR /app

COPY package.json server.mjs index.html ./
COPY src ./src
COPY assets ./assets
COPY vendor ./vendor

RUN mkdir -p /app/data

ENV PORT=8642
ENV HOST=0.0.0.0
ENV DB_PATH=/app/data/ticklock.sqlite
ENV TICKLOCK_MODE=public

EXPOSE 8642

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8642) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "--no-warnings", "server.mjs"]
