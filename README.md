# 小单工作台 Web

本地单用户的创作与事务工作台：内容系列、每日稿件、AI 候选改写、项目任务、记账凭证和可拖拽日历。

生产环境由 ServerOps 统一管理：它负责 `workbench.shanchen.space` 的 HTTPS 与登录认证、systemd 启停、运行日志、健康检查，以及从本 GitHub 仓库安全更新和失败回滚。应用本身不保存管理员账号，也不直接暴露公网端口。

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

仓库中的 [`.serverops/service.json`](.serverops/service.json) 是部署事实源，限定为 npm 锁定依赖安装、`build` 脚本、`xiaodan-workbench.service` 和 `/health/ready` 健康检查。`deploy/` 保存可审计的生产配置样例；密钥只写入服务器的 `/etc/xiaodan-workbench/xiaodan-workbench.env`，不得提交到 Git。
