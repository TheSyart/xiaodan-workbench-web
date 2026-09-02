# 小单工作台 Web 部署

## ServerOps 生产部署

生产地址固定为 `https://workbench.shanchen.space/`，代码目录为 `/srv/serverops/deployments/xiaodan-workbench-web`，服务名为 `xiaodan-workbench.service`。仓库提供以下配置：

- `.serverops/service.json`：ServerOps Git 更新、构建、重启、健康检查和失败回滚规则。
- `deploy/systemd/xiaodan-workbench.service`：非 root systemd 服务。
- `deploy/server/xiaodan-workbench.env.example`：生产环境变量样例，不含密钥。
- `deploy/nginx/workbench.shanchen.space.conf`：Nginx 与统一 Auth 参考；实际文件由 ServerOps 写入应用 ID 和证书路径。
- `deploy/nginx/workbench.bootstrap-http.conf`：首次签发证书前的临时 HTTP 入口；ServerOps 接管后移除。

服务器首次安装：

```bash
npm ci
npm run build
NODE_ENV=production \
HOST=127.0.0.1 PORT=3210 \
XIAODAN_BASE_PATH=/ \
XIAODAN_DATA_DIR=/var/lib/xiaodan-workbench \
XIAODAN_ALLOWED_ORIGINS=https://workbench.shanchen.space \
TZ=Asia/Shanghai \
npm run start
```

`/health/live` 仅说明进程可响应；`/health/ready` 会验证 SQLite 可读和数据目录可写。

生产反向代理由 ServerOps 提供统一 Auth。对 `/api/v1/**/events` 关闭代理缓冲，读取超时至少设为 10 分钟。应用本身不处理登录，不能绕过 Nginx 暴露公网。

## AI 环境变量

仅在服务器设置 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`XIAODAN_WRITING_MODEL`、`XIAODAN_AGENT_MODEL` 和 `XIAODAN_VISION_MODEL`。Key 不进入浏览器、接口或导出。

生产使用 Model Center 的专用网关 Token，入口为 `https://model.shanchen.space/v1`。Token 只存在于权限为 `0600` 的 systemd 环境文件中。

## 备份与导出

```bash
XIAODAN_DATA_DIR=/var/lib/xiaodan-workbench npm run backup
XIAODAN_DATA_DIR=/var/lib/xiaodan-workbench npm run export -- /safe/export/path
```

备份使用 SQLite 一致性备份 API。导出包含各领域 JSON 和附件副本，不包含环境变量或 API Key。

GitHub 更新前必须保持工作树干净。ServerOps 只允许 fast-forward 更新，并依次执行构建、systemd 重启和健康检查；失败时回退旧提交并重新构建。数据目录不随代码回退。
