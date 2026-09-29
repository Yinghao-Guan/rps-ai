import type { NextConfig } from "next";

// 后端（Python）地址；由 scripts/run.mjs 注入，单独跑前端时用默认值
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // 浏览器只访问前端同源的 /api/*，由 Next 转发给 Python 后端（免 CORS，跨平台无需配置）
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }];
  },
};

export default nextConfig;
