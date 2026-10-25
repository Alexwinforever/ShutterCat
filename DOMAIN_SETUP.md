# 发信域名与邮件服务配置记录

更新：2026-10-25（UTC+8）。

- DNSHE 域名 `shuttercat.de5.net` 已注册，控制台状态正常。
- 注册时间：2026-10-20 22:41；到期时间：2027-10-20 22:41。默认一年有效，可按 DNSHE 当前规则在到期前 180 天内免费续期。
- 管理入口：https://my.dnshe.com/index.php?m=domain_hub&view=domain&domain_id=4739858780
- DNSHE 域名 `shuttercat.us.ci` 已注册，控制台状态正常。注册时间：2026-10-21 11:35；到期时间：2027-10-21 11:35。
- 为满足第二个域名的注册条件，DNSHE 账户已由用户启用 TOTP；绑定奖励已领取。登录时需妥善保管验证器和恢复方式。
- 使用 DNSHE 默认 DNS；已确认控制台支持 TXT、MX 和嵌套主机记录。当前没有添加解析记录。
- Resend 网页端已分别完整校验 `shuttercat.de5.net`、`shuttercat.us.ci` 和未注册的 `shuttercat.cc.cd`，三者均被明确拒绝：`We don't allow free public domains. Please use a domain you own instead.`，添加按钮禁用。
- 2026-10-22 又使用临时 Full Access API Key 直接调用 Resend `POST /domains` 测试 `shuttercat.us.ci`，接口返回 HTTP 422、`validation_error`，错误信息与网页端相同：`We don't allow free public domains. Please use a domain you own instead.`。因此可以确认这是 Resend 的免费公共域名政策限制，不是 DNS 解析或网页端表单问题；提前在 Cloudflare 或 DNSHE 添加记录也不能绕过。
- 上述临时 API Key 已在测试后从 Resend 删除，本机临时凭据文件也已清理；账户当前没有保留这个测试密钥。
- `shuttercat.cc.cd` 没有注册，以免在确定不可用于 Resend 后继续占用免费名额。
- 2026-10-23 决定暂不购买普通域名，项目发信实现已从 Resend 切换为 Brevo Transactional Email API。Brevo 允许先通过发送到具体邮箱的 6 位验证码验证发件人，因此当前方案不依赖 `shuttercat.us.ci` 的 DNS。
- Brevo 发件人 `ShutterCat <persicajane@gmail.com>` 已验证；受限 API Key `shuttercat-worker` 已创建并作为 Cloudflare Worker 的 `BREVO_API_KEY` Secret 保存，`AUTH_FROM_EMAIL` 也已配置。完整密钥未写入代码仓库或聊天记录。
- 邮件配置已部署到 Worker 版本 `8fcacd6f-314f-4c02-8154-1511011965a3`。仍需从能够访问 `workers.dev` 的网络完成真实注册邮件送达测试。
- App 网页与 API 继续使用 https://shuttercat-android.l1330720739.workers.dev ，本次不更改 `PUBLIC_APP_URL` 或 Android 地址。此前本机访问该地址超时，仍需验证目标网络连通性。

DNSHE 域名继续保留，但当前邮件方案不使用它们。Brevo 和 Cloudflare 配置已经完成；当前剩余事项是真实注册邮件送达验收。其余上线事项见 AUTH_SETUP.md。
