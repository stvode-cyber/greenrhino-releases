# Skill: security-secrets-index

## 用途
审计/安全扫描/发版前自动加载绿角犀所有敏感信息的索引位置。只存引用位置，绝不存密码值。

**触发条件**：用户说「安全审计」「secrets 检查」「密钥」「证书」「签名」「敏感信息」，或发版前检查密钥配置时。

---

## 核心原则

| 规则 | 说明 |
|---|---|
| ✅ 只存引用 | 本文件只记 key 名 + 用途 + 存放位置 |
| ✅ 值在哪 | 实际密码/指纹在 **本地 `.secrets.env`**（gitignore）或 **GitHub Secrets**（仓库 Settings） |
| ✅ 指纹可留 | assetlinks.json SHA256 指纹是公开的（Google 要验证），可明文写 |
| ❌ 严禁写入 | 密码/私钥/base64 keystore 内容绝对不能贴进任何 git 追踪文件 |

---

## Android 签名（双 App 共用同一 keystore）

| Key 名 | 用途 | 位置 |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | keystore 二进制的 base64 编码 | GitHub Secrets + 本地 .secrets.env |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 打开密码 | GitHub Secrets + 本地 .secrets.env |
| `ANDROID_KEY_ALIAS` | key 别名 | GitHub Secrets + 本地 .secrets.env |
| `ANDROID_KEY_PASSWORD` | key 密码 | GitHub Secrets + 本地 .secrets.env |

### assetlinks.json SHA256 指纹（公开可写）

| 类型 | 值 | 位置 |
|---|---|---|
| 生产指纹 | `sha256:0fec2838848aceb04bdbd4f6dd46c4ae5436b36a9d547af9a856d0a86bb0c77e` | `build-web.mjs` FINGERPRINT + `clients/android-*/.well-known/assetlinks.json` |
| 获取命令 | `keytool -list -v -keystore xxx.jks \| grep SHA256` | - |

---

## Cloudflare Pages 部署

| Key 名 | 用途 | 位置 |
|---|---|---|
| wrangler token | Cloudflare API Token | GitHub Secrets（CI）+ 本地 `~/.wrangler/config/default.toml` |
| 双站域名 | `greenrhino-music.pages.dev` / `greenrhino-player.pages.dev` | `build-web.mjs` siteUrl 常量 |

---

## 本地构建关键资源位置

| 资源 | 路径 | 备注 |
|---|---|---|
| JDK 17 | `C:\Program Files\Java\jdk-17` | 必须 |
| Android SDK | `C:\Users\Administrator\Android\Sdk` | local.properties 已写 |
| Moto XT2401 | USB 真机 | 唯一真机 |
| ASCII 构建路径 | `C:\greenrhino-build\android-{player,music}\` | 铁律 #9 |
| ffmpeg.exe | `clients/windows/GreenRhino/ffmpeg.exe` | 98MB，gitignore |

---

## 安全红线（重申）

1. `.secrets.env` 已 gitignore ✅
2. `*.keystore` / `*.jks` 已 gitignore ✅
3. GitHub Secrets 是生产环境唯一密码来源 ✅
4. 严禁 AI 把密码/私钥/指纹贴进源码、日志、台账正文 ❌

---

## 快速定位命令

```powershell
# 查所有可能泄露密钥的模式
rg -n "password|secret|key|token|private" server/ clients/ -i -l

# 查 gitignore 里有哪些敏感文件
cat .gitignore | Select-String -Pattern "secret|key|cert|keystore|env"
```
