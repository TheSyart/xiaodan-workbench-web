# 容器部署参考

使用仓库根目录的 `Dockerfile` 和 `compose.production.yml`。Compose 仅供人工审查；ServerOps 根据受 root 管理的策略生成生产配置，不直接以 root 执行仓库 Compose。

## 镜像与数据

CI 工作流 `serverops-image.yml` 只构建、发布 `linux/amd64` 私有 GHCR 镜像，push 与 workflow_dispatch 都使用完整 `sha-<40hex>` 标签。手动触发的 `commit` 可指定完整提交；标签与 OCI revision/source 取自实际 checkout，工作流不连接生产环境。保持 GHCR 包为 private，已有包也必须保持 private；不要为解决拉取权限而公开包。CI 使用仓库 `GITHUB_TOKEN` 的 `contents:read`、`packages:write`。生产拉取凭据 `ghcr.token` 由 ServerOps 保管，需有私有包读取权限，不进入 Git、构建参数或镜像。

复制 `compose.env.example` 到仓库外，填入已验证的 image digest、绝对 env 路径、UID/GID 和数据目录。运行时 env 从本目录示例复制到外部权限受限文件，填写凭据；不把 Compose 插值文件当作应用 env。绑定目录必须预先存在，且对配置的非 root UID/GID 可写；`create_host_path: false` 阻止自动创建空目录。数据备份、迁移、切换和回滚由 ServerOps 执行。

镜像内部固定 3210，根 URL 为 `/`；使用 `XIAODAN_DATA_DIR=/app/data`。保持代理 SSE 流、关闭缓冲；`/health/ready` 验证 SQLite 与数据目录。

## 检查和启动

```sh
docker compose --env-file /absolute/path/compose.env -f compose.production.yml config
docker compose --env-file /absolute/path/compose.env -f compose.production.yml up -d
docker compose --env-file /absolute/path/compose.env -f compose.production.yml ps
```

宿主端口只监听 `127.0.0.1`，公网入口由外部反向代理和认证控制。日志采用 json-file 的 10m × 3 轮转，进程以非 root 用户运行并自动重启。正式迁移前必须通过真实 Linux 镜像构建、容器健康检查、静态资源验证以及数据备份/回滚演练；源码构建成功不等于这些检查已通过。
