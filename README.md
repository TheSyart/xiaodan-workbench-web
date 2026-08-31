# 小单工作台 Web

本地单用户的创作与事务工作台：内容系列、每日稿件、AI 候选改写、项目任务、记账凭证和可拖拽日历。

## 开发

```bash
npm install
npm run dev
```

Web 开发地址默认是 `http://127.0.0.1:5173/xiaodan/`，API 服务默认是 `http://127.0.0.1:3210/xiaodan/api/v1`。

## 发布门

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:production-smoke
npm run check:security
```

服务器部署、反向代理、备份和导出见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

