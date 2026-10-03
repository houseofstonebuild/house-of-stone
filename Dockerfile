FROM node:24.19.0-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs catalog.mjs ./
COPY --chown=node:node public ./public
COPY --chown=node:node content ./content
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=8000 DATA_DIR=/app/data NODE_ENV=production
EXPOSE 8000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
