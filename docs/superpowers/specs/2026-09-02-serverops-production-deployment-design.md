# 小单工作台 ServerOps 生产部署设计

## 目标

将 `TheSyart/xiaodan-workbench-web` 的 `codex/web-rewrite` 分支部署到 `https://workbench.shanchen.space/`，由 ServerOps 统一认证、监控、启停、日志和 GitHub 更新。

## 应用形态

- Node.js 22 单进程 Fastify 服务，同时提供 API、React 静态资源和 SQLite 数据。
- 仅监听 `127.0.0.1:3210`，不直接暴露公网端口。
- 生产根路径为 `/`，健康检查为 `/health/ready`。
- 运行用户为 `xiaodan-workbench`，代码目录为 `/srv/serverops/deployments/xiaodan-workbench-web`，数据目录为 `/var/lib/xiaodan-workbench`。
- systemd 单元名为 `xiaodan-workbench.service`，环境文件为 `/etc/xiaodan-workbench/xiaodan-workbench.env`。

## 仓库改动

- 增加 `.serverops/service.json`，声明 npm 构建、原目录发布、systemd 运行和 HTTP 健康检查。
- 增加可审计的 systemd、Nginx 与环境文件样例。
- Vite 构建允许通过进程环境把站点基路径设为 `/`。
- 后端把写请求 Origin 校验改为显式的 `XIAODAN_ALLOWED_ORIGINS` 白名单；生产只允许 `https://workbench.shanchen.space`，开发默认仍只允许 loopback。
- README 和部署文档说明 ServerOps 作用、目录、更新和备份方式。

## AI 接入

- 使用服务器现有 Model Center 的 OpenAI 兼容入口 `https://model.shanchen.space/v1`。
- 创建用途仅为小单工作台的独立网关 Token，明文只写入 root-only 环境文件，不进入 Git、日志、ServerOps 数据库或浏览器。
- 写作与 Agent 默认使用 `k3`，视觉默认使用 `deepseek-v4-flash-vision-exp`。
- AI Token 创建或验证失败不允许伪装成完整上线；必须明确修复后再完成验收。

## Nginx、证书与认证

- `workbench.shanchen.space` 的 HTTP 入口保留 `/.well-known/acme-challenge/`，其余请求跳转 HTTPS。
- HTTPS 使用 Let's Encrypt 证书并反代 `127.0.0.1:3210`。
- 全站使用 ServerOps 统一 Auth；Nginx 在转发前清除 ServerOps 应用会话 Cookie。
- AI 事件流路径关闭代理缓冲并设置 10 分钟读取超时。
- Nginx 变更执行备份、`nginx -t`、原子写入和 reload；失败恢复原配置。

## ServerOps 纳管

- 把代码目录加入 `SERVEROPS_DEPLOYMENT_ROOTS` 精确白名单并重启 helper。
- Nginx 站点生效后执行服务协调，按域名自动创建/复用服务。
- 服务运行时绑定到 `xiaodan-workbench.service`，仓库绑定到 GitHub URL、分支和代码目录。
- `service.json` 作为后续 GitHub 更新、构建、重启、健康检查和失败回滚的统一范式。

## 安全与恢复

- 代码目录和进程归非 root 用户所有；密钥环境文件为 root-only。
- systemd 使用 `NoNewPrivileges`、`PrivateTmp`、`ProtectSystem=strict` 和明确的可写数据目录。
- 首次部署前备份 ServerOps 环境、Nginx 配置和数据库；应用数据目录首次为空，无旧数据覆盖。
- GitHub 更新只允许干净工作树和 fast-forward；构建或健康检查失败回退旧提交。

## 验收

- 仓库类型检查、34 个现有单元测试和生产构建通过。
- systemd 为 active，`127.0.0.1:3210/health/ready` 返回 ready。
- HTTP 跳转 HTTPS，TLS 域名有效，未登录浏览器跳转 Ops 登录。
- 登录后首页和至少一个写 API 成功，不出现 Origin 403。
- ServerOps 服务详情能显示运行状态、日志、仓库、部署清单和 Git 更新预览。

