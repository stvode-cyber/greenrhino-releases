# Skill: docker-deploy-guide

## 用途
AI 员工需要容器化部署 LocalServer 或 PWA 静态站点时加载。提供 Dockerfile 模板、docker-compose 示例、Cloudflare Tunnel 集成。

---

## 场景一：LocalServer 容器化

### Dockerfile
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY scripts ./scripts/
EXPOSE 4173
USER node
CMD ["node", "server/index.js"]
```

### 运行
```bash
docker build -t greenrhino-server .
docker run --rm -p 4173:4173 -v ~/Music:/media greenrhino-server
```

### 关键注意事项
- **不要 COPY src/**：LocalServer 只需要 server/ + scripts/，前端由 Cloudflare Pages 或 Windows WebView2 提供
- **媒体目录 volume mount**：不要 COPY 媒体文件进镜像，用 `-v ~/Music:/media`
- **非 root 用户**：`USER node`，LocalServer 不需要特权端口

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

## 避坑清单

1. **不要把 release/ 里的旧产物 COPY 进镜像**：build 是 Dockerfile 中间阶段
2. **不要 COPY .env / .secrets.env**：用 docker secrets 或 env 文件 mount
3. **nginx 版本号**：PWA 需要 `try_files $uri $uri/ /index.html`（SPA 回退）
4. **LocalServer 端口**：默认 4173，改了需要同步 Cloudflare Tunnel 和 assetlinks.json
5. **ARM 兼容**：Apple Silicon Mac 上跑 `node:22-alpine` 原生；如果部署到树莓派用 `node:22-alpine3.20`

## 不需要 Docker 的场景
- Cloudflare Pages 部署 PWA
- GitHub Actions 跑三套 CI workflow
- 本地开发 `python -m http.server 4173`
- Android TWA / Windows EXE 打包
