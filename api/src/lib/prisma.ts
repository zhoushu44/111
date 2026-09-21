import { Prisma, PrismaClient } from '@prisma/client';

const basePrisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// 生产部署时应用位于 NAT 之后，需跨公网连接远程 PostgreSQL（RTT 约 250ms）。中间设备
// 会静默丢弃长时间空闲的 TCP 连接，导致 Prisma 从连接池里取到"死连接"时抛出连接类
// 错误（P1001 连不上 / P1002 连接超时 / P1008 socket 超时 / P1017 连接被服务端关闭 /
// P2024 池获取超时，或底层 ECONNRESET）。
//
// 这类错误的特点是：连接本身已失效，Prisma 内部会重建连接，因此"重试一次即可自愈"。
// Prisma 不支持配置 TCP keepalive（其连接固定使用约 120 分钟的 keepalive，容器 netns
// 的 net.ipv4.tcp_keepalive_* 对它无效），无法从连接参数层面根治，所以在客户端统一加
// 有限次自动重试，避免把可自愈的抖动直接变成 500 抛给用户。
const RETRYABLE_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 150;
const CONNECTION_ERROR_PATTERN = /connection reset|connection closed|server has closed|broken pipe|econnreset|connection refused/i;

const isRetryable = (error: unknown): boolean => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return RETRYABLE_CODES.has(error.code);
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (error instanceof Error) return CONNECTION_ERROR_PATTERN.test(error.message);
  return false;
};

// P2024 是等待连接池超时（pool_timeout=10s）后抛出的，此时每次尝试都还要再等一个
// pool_timeout，重试次数过多会让请求长时间挂起，因此只给它一次重试机会。
const maxAttemptsOf = (error: unknown): number =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2024' ? 2 : MAX_ATTEMPTS;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const prisma = basePrisma.$extends({
  name: 'retry-on-connection-error',
  query: {
    async $allOperations({ args, query }) {
      let attempt = 0;
      for (;;) {
        try {
          return await query(args);
        } catch (error) {
          attempt += 1;
          if (attempt >= maxAttemptsOf(error) || !isRetryable(error)) throw error;
          const delay = RETRY_BASE_DELAY_MS * attempt + Math.floor(Math.random() * 100);
          console.warn(
            `[prisma] 连接类错误，${delay}ms 后重试（第 ${attempt + 1} 次尝试）：${(error as Error).message.slice(0, 160)}`,
          );
          await sleep(delay);
        }
      }
    },
  },
});
