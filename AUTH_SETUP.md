# 邮箱账号上线配置

## 云资源配置进度（2026-10-25）

- 已完成 Cloudflare 官方 Wrangler 授权。
- 已创建 D1 数据库 `shuttercat-auth`，ID：`6212c942-22f7-44e1-b085-4f05f17818ba`；已写入 `wrangler.jsonc`。
- 已执行远程迁移 `0001_auth.sql` 并查询确认 `auth_users`、`auth_sessions`、`auth_tokens`、`auth_limits` 四张业务表存在。无需重复创建数据库。
- 已通过生产构建及 `wrangler deploy --dry-run` 部署配置检查。
- 用户已选择照片仅存本机，R2 依赖已移除，无需激活 R2、创建照片桶或填写 R2 付款信息。
- Worker `shuttercat-android` 已部署，绑定业务 Durable Objects 和认证 D1，不依赖 R2。HTTPS 地址：https://shuttercat-android.l1330720739.workers.dev 。
- `PUBLIC_APP_URL` 已填写上述地址，最新调试 APK 已预填相同地址。
- 发信实现已由 Resend API 改为 Brevo Transactional Email API。Brevo 发件人 `ShutterCat <persicajane@gmail.com>` 已验证，受限 API Key 已作为 Cloudflare Worker Secret `BREVO_API_KEY` 保存，`AUTH_FROM_EMAIL` 已配置。
- 账号删除功能和公开删除说明页已随 Worker 版本 `afcf86ed-3471-4639-8079-470d87f0bca7` 部署。当前本机网络无法连接 `workers.dev`，尚未完成真实邮件送达和线上删除流程验收。

以下为完整设置说明；已经完成的步骤无需重复执行。

账号功能已改为邮箱 + 密码，注册后必须验证邮箱。支持重发验证邮件、找回密码、退出登录、旧匿名账号迁移和永久删除账号。密码为 12–128 位，服务端保存加盐密码摘要；会话使用 HttpOnly Cookie，30 天到期。验证和重置凭证有效期为 30 分钟、仅能使用一次，重置密码会使所有设备的旧会话失效。删除账号要求当前密码和二次确认，会清除 D1 认证数据、Durable Object 业务数据以及当前设备本地保存的照片；Google Play 订阅需由用户另行取消。

新账号注册不接受中国大陆邮箱：服务端拦截所有 `.cn` 邮箱，以及 QQ、Foxmail、网易、Sina、Sohu、阿里云、139、21CN、Tom、263 等常见大陆邮箱服务商及其子域名。已有账号仍可登录、验证邮箱和找回密码。仅凭邮箱域名无法识别所有使用国际域名的自建企业邮箱；需要拦截的新服务商应补充到 `shared/email-policy.ts`。

## 需要提供的信息

| 配置 | 由谁提供 / 填写位置 |
| --- | --- |
| 正式 HTTPS 服务地址 | 已使用 https://shuttercat-android.l1330720739.workers.dev；未来更换域名时同步更新 `PUBLIC_APP_URL` 和 Android `MEOW_APP_URL` |
| Cloudflare D1 数据库 ID | 已创建并填入 `wrangler.jsonc`，无需重复创建 |
| 发信邮箱 | 已在 Brevo 验证并配置 `ShutterCat <persicajane@gmail.com>`；暂时不需要购买域名 |
| Brevo API Key | 已创建 `shuttercat-worker` 受限密钥并写入 Cloudflare Secret `BREVO_API_KEY`；完整密钥未写入代码仓库或文档 |

网页、API 和 Android 的服务地址必须同源。邮件在浏览器打开后也能验证；回到 App 登录即可，也可以直接把邮件里的凭证复制回 App 完成验证。浏览器与 Android WebView 的登录 Cookie 相互独立，但同一邮箱登录后访问同一份云端数据。

## Cloudflare 部署步骤

以下命令由项目根目录执行。已有云资源见上方进度；尚未完成真实邮件送达测试。

```powershell
npx.cmd wrangler login
npx.cmd wrangler d1 create shuttercat-auth
```

把返回的 `database_id` 替换到 `wrangler.jsonc` 的占位符，再在该文件顶层添加真实配置：

```json
"vars": {
  "PUBLIC_APP_URL": "https://你的正式服务域名",
  "AUTH_FROM_EMAIL": "ShutterCat <你在Brevo验证的发件邮箱>"
}
```

在 Brevo 完成发件邮箱验证并创建 API Key 后执行：

```powershell
npx.cmd wrangler secret put BREVO_API_KEY
npx.cmd wrangler d1 migrations apply shuttercat-auth --remote
npm.cmd run deploy
```

部署到原有服务时，保留原 Worker、Durable Object 命名空间和域名，才能继续迁移旧账号数据。不要把原业务存储换成空的新环境。

Android 发布构建需传入正式地址，例如在 `android` 目录执行 `./gradlew.bat bundleRelease "-PMEOW_APP_URL=https://你的正式服务域名"`。正式签名仍需按 README 配置；本次未生成签名发布包。

## 本地开发与自动测试

复制 `.dev.vars.example` 为 `.dev.vars`，在本机填写测试发信配置。`.dev.vars` 已被忽略，不要提交。先配置 D1 的真实 ID，再执行：

```powershell
npx.cmd wrangler d1 migrations apply shuttercat-auth --local
npm.cmd run build
npm.cmd run preview
```

本地预览通过真实 Brevo API 发送邮件；不要填写假 Key 后期待收到邮件。自动测试使用独立内存数据库和模拟邮件，不需要真实 Key，不会发送外部邮件：

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

测试专用账号初始化和邮件读取接口只注入测试入口，不包含在正式 Worker 中。

## 旧账号与数据

在注册页展开「已有旧版匿名账号？」。默认尝试绑定本设备仍有效的旧 Cookie，也可填写原 `meow-…` 恢复码。验证邮箱成功后，绑定原任务、喵币、猫猫和订阅归属；同一旧账号只能绑定一个邮箱。原账号必须在同一服务内存在。旧的恢复码登录接口已停用。

如果旧 Cookie 和恢复码都丢失，就不能自行找回旧匿名账号。照片只保存在原设备，不能跨设备同步；卸载或清理数据可能丢失。未验证账号通过「找回密码」重新取得邮箱控制权时，会清除尚未完成的旧账号绑定，需要支持人员核实后处理数据迁移。

## 正式上线验收与尚待完成项

- 配置完成后，用真实邮箱在手机测试注册、垃圾邮件箱、重发验证、换设备登录、找回密码和退出；检查正式 HTTPS 地址与 Brevo 发件邮箱是否正确。
- 登录功能不是应用商店普遍强制要求。此项目为了云端数据和会员恢复采用账号系统；App 内注销、关联数据删除和公开说明页已经实现。正式上架前仍需把删除说明页中的客服邮箱占位文字替换为公开地址，并在 Play Console 填写正式删除页 URL。
- 需提供运营主体、客服联系方式、隐私政策和用户协议地址；披露邮箱、任务、照片、Cloudflare 和邮件服务的处理方式。当前注册页面尚未接入这些正式条款。
- 新认证页面、邮件和睡眠任务新增文案目前为简体中文，原业务页面仍支持六种语言。面向其他语言市场时需补全认证翻译。
- 如上线 Google Play 订阅，仍需配置 `PLAY_PACKAGE_NAME`、`PLAY_SERVICE_ACCOUNT`、Play Console 商品及正式签名，并进行真实购买/恢复测试。服务账号凭据使用 Worker secret 保存。
- D1 的过期会话、邮件凭证和频率限制记录不会再生效，但当前没有自动清理任务；运营时需安排定期清理过期记录和数据库备份。不要直接删除用户表来实现账号注销，业务数据另存在 Durable Objects，照片另存在设备本地。
- 无障碍权限申报、目标 SDK、真机兼容性和其他上架事项见 README。
