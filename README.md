# 小单工作台 Web

本地单用户的创作与事务工作台：内容系列、每日稿件、AI 候选改写、项目任务、记账凭证和可拖拽日历。

生产环境由 ServerOps 统一管理 HTTPS、登录认证、镜像发布、运行日志、健康检查与回滚。应用本身不保存管理员账号，也不直接暴露公网端口。

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

## ServerOps 部署范式

仓库中的 [`.serverops/service.json`](.serverops/service.json) 使用 v2 镜像发布约定，声明 `web` 服务、3210 端口、`/health/ready` 和挂载到 `/app/data` 的逻辑 `data`。容器使用 `HOST=0.0.0.0`、`XIAODAN_BASE_PATH=/`、`XIAODAN_DATA_DIR=/app/data`；反向代理保持根路径、关闭 SSE 缓冲并保留长连接。镜像与外部数据的使用方式见 [容器部署说明](docker/README.md)。`deploy/` 与旧部署文档保留为 systemd 迁移参考。
