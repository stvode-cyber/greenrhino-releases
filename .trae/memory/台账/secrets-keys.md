# 🔐 敏感信息索引（只存引用，不存密码）

> 所有实际值存在 **本地 `.secrets.env`**（已 gitignore）和 **GitHub Secrets**（仓库 Settings → Secrets）
> 本文件只做：key 名 + 用途 + 存放位置 + 如何获取
> **严禁把密码/私钥/指纹贴进本文件或任何 git 追踪文件**

---

## Android 签名（双 App 共用同一 keystore）

| Key 名 | 用途 | 位置 | 备注 |
|---|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | keystore 二进制的 base64 编码 | GitHub Secrets + 本地 .secrets.env | `.jks` 文件转 base64 |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 打开密码 | GitHub Secrets + 本地 .secrets.env | - |
| `ANDROID_KEY_ALIAS` | key 别名 | GitHub Secrets + 本地 .secrets.env | - |
| `ANDROID_KEY_PASSWORD` | key 密码（通常和 keystore 密码相同） | GitHub Secrets + 本地 .secrets.env | - |

### assetlinks.json SHA256 指纹

| 类型 | 值 | 位置 |
|---|---|---|
| 生产指纹 | `sha256:0fec2838848aceb04bdbd4f6dd46c4ae5436b36a9d547af9a856d0a86bb0c77e` | `build-web.mjs` FINGERPRINT 常量 + `clients/android-*/.well-known/assetlinks.json` |
| 获取方式 | `keytool -list -v -keystore xxx.jks | grep SHA256` | - |

---

## iOS 签名（🔒 暂注释，未启用）

| Key 名 | 用途 | 位置 |
|---|---|---|
| `IOS_TEAM_ID` | Apple 开发者团队 ID | GitHub Secrets（commented out） |
| `IOS_CERT_P12_BASE64` | 分发证书 .p12 base64 | GitHub Secrets（commented out） |
| `IOS_CERT_PASSWORD` | 证书密码 | GitHub Secrets（commented out） |
| `IOS_PROVISIONING_BASE64` | Provisioning Profile base64 | GitHub Secrets（commented out） |

---

## Cloudflare Pages 部署

| Key 名 | 用途 | 位置 |
|---|---|---|
| (wrangler token) | Cloudflare API Token | GitHub Secrets（CI 用）+ 本地 `~/.wrangler/config/default.toml` |
| 双站域名 | `greenrhino-music.pages.dev` / `greenrhino-player.pages.dev` | `build-web.mjs` siteUrl 常量 |

---

## Python cloud_api.py LRCLIB 代理

| Key 名 | 用途 | 位置 |
|---|---|---|
| (LRCLIB 免费) | 歌词代理，无需 API key | 公开接口 |

---

## 本地构建铁律

| 资源 | 位置 | 备注 |
|---|---|---|
| JDK 17 | `C:\Program Files\Java\jdk-17` | 必须，Android 构建用 |
| Android SDK | `C:\Users\Administrator\Android\Sdk` | 必须，已写入 local.properties |
| Moto XT2401 | 真机，USB 连接 | 唯一真机，ADB 调试用 |
| Gradle wrapper | `C:\greenrhino-build\android-{player,music}\gradle\wrapper\` | ASCII 路径必须 |
| ffmpeg.exe | `clients/windows/GreenRhino/ffmpeg.exe` | 98MB，gitignore，HEVC 转码用 |

---

## 安全红线（AGENTS.md 重申）

1. ✅ 本文件只存引用，不存值
2. ✅ `.secrets.env` 已 gitignore
3. ✅ `*.keystore` / `*.jks` 已 gitignore
4. ✅ GitHub Secrets 是生产环境唯一密码来源
5. ❌ 严禁任何 AI 把密码/私钥/指纹贴进源码、日志、台账正文
6. ❌ 严禁把 `.secrets.env` 提交到 git 或复制到公共位置
