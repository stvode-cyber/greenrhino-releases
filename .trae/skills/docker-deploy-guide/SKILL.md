# Skill: docker-deploy-guide

## 用途
AI 员工需要容器化部署 LocalServer 或 PWA 静态站点时加载。提供 Dockerfile 模板、docker-compose 示例、Cloudflare Tunnel 集成。

---

## 场景一：cloud_api.py 容器化（8787 端口）

### Dockerfile
```dockerfile
FROM python:3.12-alpine
WORKDIR /app
COPY server/ ./server/
COPY requirements.txt ./ || true  # 如果有 requirements.txt
EXPOSE 8787
USER python
CMD ["python", "server/cloud_api.py"]
```

### 运行
```bash
docker build -t greenrhino-cloud .
docker run --rm -p 8787:8787 greenrhino-cloud
```

### 关键注意事项
- **不要 COPY src/**：cloud_api.py 只需要 server/，前端由 Cloudflare Pages 提供
- **Python 依赖**：cloud_api.py 用了 Flask/requests，`pip install -r server/requirements.txt`（如果有）
- **非 root 用户**：`USER python`，Flask 不需要特权端口
- **这是 Python 后端，不是 LocalServer**：.NET LocalServer 在 Windows 壳里，不独立部署

---

## 场景二：PWA 静态站点（可选替代 Cloudflare Pages）

Dockerfile（用 nginx 静态服务）：
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm ci --omit=dev || true
COPY scripts/ ./scripts/
COPY src/ ./src/
COPY icons/ ./icons/
COPY index.html ./
COPY sw.js ./
RUN node scripts/build-web.mjs --role=music

FROM nginx:alpine
COPY --from=build /app/release/pwa-site-music /usr/share/nginx/html
EXPOSE 80
```

### 运行
```bash
# music 版
docker run -d -p 8080:80 greenrhino-pwa-music
# player 版（改 --role=player）
docker run -d -p 8081:80 greenrhino-pwa-player
```

### 为什么我们用 Cloudflare Pages 而不是这个
| 对比项 | Cloudflare Pages | Docker + nginx |
|---|---|---|
| HTTPS | ✅ 自动 | ❌ 需自己配 cert |
| 全球 CDN | ✅ 300+ edge | ❌ 单节点 |
| Assetlinks.json | ✅ 直连 `/` | ❌ 需 nginx alias |
| 成本 | ✅ 免费 | ❌ 服务器 + 带宽 |

**结论**：PWA 用 Cloudflare Pages 始终优先。Docker 只在 LocalServer 需要部署到远程媒体服务器时用。

---

## 场景三：docker-compose 一键起

```yaml
version: "3"
services:
  server:
    build: .
    image: greenrhino-server
    container_name: greenrhino-server
    ports: ["4173:4173"]
    volumes: ["~/Music:/media:ro"]
    restart: unless-stopped

  tunnel:
    image: cloudflare/cloudflared:latest
    container_name: greenrhino-tunnel
    command: tunnel --url http://server:4173
    environment:
      - TUNNEL_TOKEN=${CF_TUNNEL_TOKEN}
    restart: unless-stopped
    depends_on: [server]
```

---

## 避坑清单（v16 同步）

1. **不要把 release/ 里的旧产物 COPY 进镜像**：build 是 Dockerfile 中间阶段
2. **不要 COPY .env / .secrets.env**：用 docker secrets 或 env 文件 mount
3. **nginx SPA 回退**：PWA 需要 `try_files $uri $uri/ /index.html`
4. **cloud_api.py 端口**：默认 8787，改了需要同步 Cloudflare Tunnel 和 AGENTS.md
5. **三种服务端口别混**：Python cloud_api=8787 / .NET LocalServer=8800 / Android MediaHttpServer=40363
6. **ARM 兼容**：Apple Silicon Mac 上跑 `python:3.12-alpine` 原生

## 不需要 Docker 的场景
- Cloudflare Pages 部署 PWA
- GitHub Actions 跑三套 CI workflow
- 本地开发 `python -m http.server 4173`
- Android TWA / Windows EXE 打包
