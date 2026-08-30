# 单容器生产镜像：Node.js 同时提供 API、React 静态页面和上传图片
FROM node:24-bookworm-slim AS web-build
WORKDIR /frontend
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN VITE_API_BASE_URL=/api npx vite build

FROM node:24-bookworm-slim AS api-build
WORKDIR /app
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/prisma ./prisma
RUN npx prisma generate
COPY api/tsconfig.json ./
COPY api/src ./src
RUN npm run build

FROM node:24-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=api-build /app/dist ./dist
COPY --from=api-build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=api-build /app/prisma ./prisma
# seed-assets（公司 Logo 等种子静态资源，源文件在 api/seed-assets）：seed 时复制到 uploads 持久卷
COPY api/seed-assets ./seed-assets
COPY --from=web-build /frontend/dist ./web
RUN mkdir -p /app/uploads
EXPOSE 3000
VOLUME ["/app/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
