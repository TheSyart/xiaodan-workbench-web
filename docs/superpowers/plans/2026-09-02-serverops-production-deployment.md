# 小单工作台 ServerOps 生产部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将小单工作台安全部署到 `workbench.shanchen.space`，并完成 ServerOps 运行、代码、Nginx、证书和统一 Auth 纳管。

**Architecture:** Fastify 以独立非 root systemd 服务监听 loopback，Nginx 提供 TLS 和 ServerOps 统一 Auth。仓库内 `.serverops/service.json` 描述固定构建与运行方式，服务器 root-only 环境文件保存 Model Center 专用 Token。

**Tech Stack:** Node.js 22、TypeScript、Fastify、React/Vite、SQLite、systemd、Nginx、Certbot、ServerOps。

**Spec:** `docs/superpowers/specs/2026-09-02-serverops-production-deployment-design.md`

## Global Constraints

- 生产域名固定为 `workbench.shanchen.space`，访问模式固定为 ServerOps 统一 Auth。
- 服务仅监听 `127.0.0.1:3210`，代码归 `xiaodan-workbench` 用户，秘密只进入 root-only 环境文件。
- GitHub 部署只允许干净工作树与 fast-forward，不使用任意 shell 部署钩子。
- 只运行精简关键验证；部署完成声明前必须验证应用、TLS、认证与 ServerOps 纳管。

---

### Task 1: 生产 Origin 与根路径行为

**Files:**
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/tests/boundaries.test.ts`
- Modify: `apps/web/vite.config.ts`

**Interfaces:**
- Consumes: `XIAODAN_ALLOWED_ORIGINS`（逗号分隔绝对 Origin）和 `XIAODAN_BASE_PATH`。
- Produces: 生产域名写请求白名单与可由进程环境覆盖的 Vite base。

- [ ] 在 `apps/server/tests/boundaries.test.ts` 增加测试：配置 `https://workbench.shanchen.space` 后允许该 Origin，拒绝其他 Origin。
- [ ] 运行目标测试并确认因当前只允许 loopback 而失败。
- [ ] 在 `buildApp` 中解析严格 Origin 白名单；未配置时保留 loopback 默认值。
- [ ] 将 Vite base 改为优先读取 `process.env.XIAODAN_BASE_PATH`。
- [ ] 运行服务器边界测试、类型检查并提交。

### Task 2: ServerOps 与生产配置文件

**Files:**
- Create: `.serverops/service.json`
- Create: `deploy/systemd/xiaodan-workbench.service`
- Create: `deploy/nginx/workbench.shanchen.space.conf`
- Create: `deploy/server/xiaodan-workbench.env.example`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/DEPLOYMENT.md`

**Interfaces:**
- Consumes: ServerOps manifest v1、systemd、Nginx auth_request 约定。
- Produces: 固定 npm 构建、`xiaodan-workbench.service`、端口 3210、`/health/ready` 和域名配置样例。

- [ ] 写入严格的 manifest：`build=node/npm/ci/build`、`publish=in_place`、`runtime=systemd`、HTTP 健康检查。
- [ ] 写入无秘密的环境样例与最小权限 systemd 单元。
- [ ] 写入 HTTP/HTTPS、ACME、统一 Auth、SSE 的 Nginx 样例。
- [ ] 更新 README 和部署文档，说明 ServerOps 的作用、发布、备份和回滚。
- [ ] 运行 JSON 解析、类型检查、测试和生产构建并提交。

### Task 3: GitHub 同步与服务器应用安装

**Files:**
- Server: `/srv/serverops/deployments/xiaodan-workbench-web`
- Server: `/etc/xiaodan-workbench/xiaodan-workbench.env`
- Server: `/etc/systemd/system/xiaodan-workbench.service`
- Server: `/var/lib/xiaodan-workbench`

**Interfaces:**
- Consumes: GitHub `codex/web-rewrite` 最新提交和仓库部署文件。
- Produces: 可由 systemd 管理、loopback 健康检查通过的生产进程。

- [ ] 推送本地提交到 GitHub 并记录精确提交 SHA。
- [ ] 创建非 root 用户、目录与 root-only 环境文件。
- [ ] 使用服务器 GitHub 凭据克隆精确分支，随后确保 remote 不含内嵌凭据。
- [ ] 以应用用户执行 `npm ci` 和 `npm run build`。
- [ ] 安装 systemd 单元，启动并验证 `/health/ready`。

### Task 4: Model Center 专用凭据

**Files:**
- Server: `/etc/xiaodan-workbench/xiaodan-workbench.env`

**Interfaces:**
- Consumes: Model Center 网关 Token 管理接口或其项目提供的受支持 CLI/API。
- Produces: 仅小单工作台使用的 Bearer Token，以及 `k3`/视觉模型配置。

- [ ] 检查 Model Center 支持的 Token 创建接口和现有 Token 哈希存储方式。
- [ ] 创建专用 Token，不在命令输出中显示明文。
- [ ] 原子写入 root-only 环境文件并重启工作台。
- [ ] 从服务器调用 `/v1/chat/completions` 验证网关可用，输出仅保留状态与模型名。

### Task 5: Nginx、证书与 ServerOps 纳管

**Files:**
- Server: `/etc/nginx/serverops.d/apps/<service-id>.conf`
- Server: `/etc/serverops/serverops.env`
- Server: `/var/lib/serverops/app/serverops.sqlite`

**Interfaces:**
- Consumes: 可用 DNS、ACME Webroot、ServerOps helper 与服务协调 API。
- Produces: HTTPS 统一 Auth 入口和完整服务详情。

- [ ] 再次确认权威 DNS 指向 `118.178.254.196`。
- [ ] 备份 ServerOps 数据库、环境和 Nginx 配置。
- [ ] 增加精确 deployment root，重启 helper 并验证 socket。
- [ ] 生成 HTTP 入口、签发证书，再生成 HTTPS 统一 Auth 配置；每步执行 `nginx -t`。
- [ ] 执行 ServerOps reconcile，绑定 systemd 与 GitHub 仓库并验证 manifest。
- [ ] 验证 HTTP 跳转、TLS、未登录跳转、登录后页面与写请求、服务启停能力和部署预览。

### Task 6: 最终核验与交付

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: GitHub SHA、systemd/Nginx/ServerOps 状态和线上 URL。
- Produces: 可复核的部署证据与恢复路径。

- [ ] 确认 GitHub、服务器 checkout 和运行版本 SHA 完全一致。
- [ ] 运行精简单元测试、类型检查、构建和生产 smoke。
- [ ] 检查 systemd 日志与 Nginx 错误日志无新增错误。
- [ ] 记录备份目录、服务名、数据目录和后续更新入口。

