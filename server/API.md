# 绿角犀账号云盘 · 客户端接口约定（MVP）

后端：零依赖 Python（`server/cloud_api.py`，默认 8787）。生产可换 FastAPI/uvicorn 或迁入 C# LocalServer。
存储：MOCK（本地文件）默认；设 `OSS_MODE=oss` + `OSS_ENDPOINT/BUCKET/KEY/SECRET` 切阿里云 OSS（按 `user_id` 分目录）。

## 鉴权
所有受保护接口在 Header 带 `Authorization: Bearer <token>`。token 由注册/登录返回，登录即轮换。

## 接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/register` | body `{username,password}` → `{token,quota}` |
| POST | `/api/login` | body `{username,password}` → `{token,quota,used}` |
| GET  | `/api/quota` | → `{quota,used}`（字节） |
| POST | `/api/files` | multipart `file=@path` → `{id,name,size}`；上传前服务端校验 `used+size<=quota` |
| GET  | `/api/files` | → `{files:[{id,name,size,ctime}]}` |
| GET  | `/api/files/<id>` | 下载（application/octet-stream） |
| DELETE | `/api/files/<id>` | 删除并回退配额 |

## 配额
每个注册用户 `quota = 5GB`（`server/cloud_api.py` 的 `QUOTA_BYTES`）。
"送5G"是**配额上限**不是预付容量：MOCK/按量计费存储下，用户不存不花钱，只有实际占用字节计费。

## 三端接入要点
- Windows（C# WebView2）：WebView 内 fetch 直连本服务；或用 C# HttpClient 代理（同 LocalServer.cs 风格）。
- iOS / Android：原生网络层调用同一 REST；上传走 multipart，下载走签名 URL/直连。
- 同步场景：播放进度+歌单+收藏体积极小（KB级），先用 50MB 实际配额即够，5GB 作营销上限。

## 生产化待办（P2）
- 密码改 bcrypt/argon2；token 改 JWT（带过期）。
- OSS 直传走 STS 临时凭证，服务端不落文件；下载返回 OSS 签名 URL（302）。
- HTTPS 必须（含签名/登录）；本地开发可用自签。
