# 空战棋 · Aerial Warfare

一款基于经典海战棋玩法改编的空战策略游戏。布置飞机编队、预判敌方布局、夺取制空权。

## 玩法

- **人机对战（PVE）**：与智能 AI 对战，设置飞机编队并运用策略击败敌方。
- **在线对战（PVP）**：创建房间或输入房间号，与好友实时对局。
- **飞机**：大 / 小飞机可击毁；十字干扰机只能命中、不能击毁，用于干扰判断。
- **胜负**：击中敌方飞机机头（`*`）即击毁整机，击毁对方所有机头获胜。
- **炸弹**：每方 3 枚，命中后揭示以该格为中心的 3×3 区域。

## 技术栈

- React 19 + TypeScript + Vite
- Hono + Cloudflare Workers
- Cloudflare Durable Objects（PVP 房间状态）

## 快速开始

```bash
npm install      # 安装依赖
npm run dev      # 本地开发，http://localhost:5173
npm run build    # 构建
npm run deploy   # 部署到 Cloudflare Workers
```

其他：`npm run lint`（ESLint）、`npx wrangler tail`（查看 Worker 日志）。

## 目录结构

```
src/
  react-app/    # 前端页面（Home / PVE / PVP / Introduction）
  worker/       # Cloudflare Worker 后端（Hono + Durable Object）
  shared/       # 前后端共享的游戏规则引擎
```

部署前请确认 `wrangler.json` 中的 Durable Objects 配置。

