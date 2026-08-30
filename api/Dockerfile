# 多阶段构建：构建阶段编译 TS，运行阶段只保留生产依赖
# 服务监听地址固定为 0.0.0.0（见 src/server.ts），容器外可通过映射端口访问

# ---- 构建阶段 ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- 运行阶段 ----
FROM node:24-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
# seed-assets（公司 Logo 等种子静态资源）：seed 时复制到 uploads 持久卷
COPY seed-assets ./seed-assets
EXPOSE 3000
CMD ["node", "dist/server.js"]
