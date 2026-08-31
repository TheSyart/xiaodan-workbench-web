# 小单工作台 Web 部署

## 构建与启动

```bash
npm ci
npm run build
NODE_ENV=production \
HOST=127.0.0.1 PORT=3210 \
XIAODAN_BASE_PATH=/xiaodan \
XIAODAN_DATA_DIR=/var/lib/xiaodan-workbench \
TZ=Asia/Shanghai \
npm run start
```

`/xiaodan/health/live` 仅说明进程可响应；`/xiaodan/health/ready` 会验证 SQLite 可读和数据目录可写。

反向代理必须保留 `/xiaodan` 前缀。对 `/xiaodan/api/v1/**/events` 关闭代理缓冲，读取超时至少设为 10 分钟。应用本身不处理登录，必须由上游入口统一鉴权。

## AI 环境变量

仅在服务器设置 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`XIAODAN_WRITING_MODEL`、`XIAODAN_AGENT_MODEL` 和 `XIAODAN_VISION_MODEL`。Key 不进入浏览器、接口或导出。

## 备份与导出

```bash
XIAODAN_DATA_DIR=/var/lib/xiaodan-workbench npm run backup
XIAODAN_DATA_DIR=/var/lib/xiaodan-workbench npm run export -- /safe/export/path
```

备份使用 SQLite 一致性备份 API。导出包含各领域 JSON 和附件副本，不包含环境变量或 API Key。

