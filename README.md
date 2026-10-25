# ShutterCat · Android 版

这是从 `D:\APP制作机\shuttercat` 复制并适配的独立安卓版本，保留原项目当前的水彩界面、任务、凭证照片、喵币、猫猫收藏与 Cloudflare API。原 iOS 项目保留在原目录。

最低 Android 8.0（API 26）；compileSdk / targetSdk 35。Java 17+、Android Studio、Android SDK 35、Node.js 22+。界面由在线 React 页面提供，原生 Java + Android WebView 接入系统相机、相册、返回键和无障碍专注守护。

## 界面语言

点击页面右上角齿轮「设置 → 语言」，可选择简体中文、繁体中文、英语、日语、韩语、西班牙语，或跟随系统。切换立即生效并保存在当前设备；用户填写的任务和自定义凭证保留原文。原生守护提示同步使用所选语言。

语言表位于 `shared/locales.json`，依次包含繁体中文、英语、日语、韩语、西班牙语，简体中文使用键名。Web 页面更新后需部署对应项目的服务；仅更新原生安装包不会更新远程页面。

## 首次运行

先按 [邮箱账号上线配置](AUTH_SETUP.md) 配置 D1 和邮件服务，并执行本地数据库迁移。账号配置缺失时不会退回匿名登录。

1. 在本目录运行 `npm.cmd ci`、`npm.cmd run build`。
2. 本地预览：`npm.cmd run preview`，浏览器打开 http://127.0.0.1:8787。
3. Android Studio 打开本目录的 `android` 文件夹，等待 Gradle 同步。
4. 用 Run 安装到安卓手机或模拟器，首次启动填写服务根地址。

真实服务应使用自己的 HTTPS 地址。调试版连接本机：

```powershell
cd D:\APP制作机\first-meow-android
npm.cmd run build
npm.cmd run preview
# 另开终端，连接已开启 USB 调试的手机
adb reverse tcp:8787 tcp:8787
```

手机内填写 `http://127.0.0.1:8787`。模拟器可填写 `http://10.0.2.2:8787`。相机和 Web Crypto 优先使用 HTTPS 或 localhost/127.0.0.1；若模拟器的 WebView 将 10.0.2.2 视为非安全上下文，也使用 adb reverse + 127.0.0.1。正式版禁止明文 HTTP。网页和 API 必须由同一服务地址提供。

## 编译 APK

```powershell
cd D:\APP制作机\first-meow-android\android
.\gradlew.bat assembleDebug testDebugUnitTest lintDebug
```

调试 APK：`android/app/build/outputs/apk/debug/app-debug.apk`。调试版包名 `com.shuttercat.android.debug`，发布版 `com.shuttercat.android`。可在 `app/build.gradle` 修改 applicationId。

可选预填地址：

```powershell
.\gradlew.bat assembleDebug "-PMEOW_APP_URL=https://你的服务.workers.dev"
```

运行中在「专注守护 → 修改服务地址」更换；连接错误页也能修改。非睡眠守护期间，切换服务会清空原生守护计划并关闭守护；已开始的睡眠守护期间禁止切换。浏览器与 App 内 WebView 独立登录；同一邮箱账号可同步云端任务、喵币和订阅。

`local.properties` 是本机 SDK 路径，不应提交或复制到其他电脑使用；Android Studio 可以重新生成。发布版需用自己的签名密钥，通过 Android Studio 的 Generate Signed Bundle / APK 生成 APK 或 AAB，当前没有配置正式签名。

### Windows 中文目录构建（本机 Java 21）

Gradle 8.9 在此环境中将测试 classpath 参数文件写成 UTF-8，而 Java 启动器按 Windows 本机编码读取，导致已编译的测试类报 `ClassNotFoundException`。本机使用下面的命令构建；`COMPAT` 让 Java 21 的 Gradle 进程使用本机编码，Java 源文件仍明确按 UTF-8 编译：

```powershell
cd D:\APP制作机\first-meow-android\android
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug "-Dorg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=COMPAT"
```

此参数针对本机 Java 21；其他操作系统或不含中文的目录可使用上面的标准命令。无需修改系统编码或移动项目。首次下载完成后 Gradle 8.9 会保存在用户缓存中，后续构建复用。

## 专注守护

在 App 中进入「专注守护」，阅读用途说明并主动同意，再到系统无障碍设置开启「ShutterCat专注守护」。选择需要守护的非系统娱乐 App，然后安排任务。

- WebView 将服务端保存成功的任务状态同步到本机 SharedPreferences。
- 任务到期后，服务使用窗口切换事件中的应用包名判断是否打开了选定 App，显示当前陪伴猫对应的图片遮盖页。
- 已在选定 App 内时，服务存活期间也会按下一任务时间检查，最长每 30 秒重新检查系统时间。
- 普通任务完成照片提交或主动接受惩罚后同步服务端状态；多个到期任务都处理完才解除。
- 普通任务断网仍可在提醒页「紧急关闭守护」，不会自动结算或扣币。睡眠任务开始后没有提前关闭入口。
- 不读取窗口内容、不执行手势或自动点击、不上传已安装应用列表。没有申请广泛存储、后台定位、悬浮窗、精确闹钟或全部应用查询权限。
- 系统应用、默认电话、桌面和ShutterCat不能选择。部分厂商预装娱乐 App 也会因此被排除。

安卓没有 iOS Screen Time 的同等普通应用权限；这是用户自愿开启的无障碍提醒层，不是不可绕过的系统封锁。分屏、画中画、系统弹窗、锁屏、服务重启和厂商省电行为必须实测。强行停止、撤销权限或系统终止服务后不能保证守护。服务重连后保留已同步计划，但要收到下一次前台窗口事件才知道当前应用；重启后是否重连由系统控制。没有把轮询描述成保证准点的闹钟。

## 按时睡觉

默认任务选择区与「常做的事」新增蓝紫色的「按时睡觉」。可选择日期和开始时间，开始前可修改；开始后固定六小时，不提交照片，不奖扣喵币，创建沿用一次提醒额度。它只记录约定时段，不判断是否真的睡着。

安装新版安卓客户端，开启无障碍守护并选好娱乐 App 后安排任务。本机保存已同步计划，断网仍按计划守护；开始后退出登录、刷新、修改服务地址、修改应用选择或提交普通任务均不能清除当前睡眠约定。六小时到期自动结束睡眠覆盖；若另有普通任务到期未处理，仍显示普通守护。系统设置、桌面和电话不受影响，撤销系统权限、强停、省电限制和修改设备时间仍可能影响计时与覆盖。网页可以安排任务，但必须在安卓端同步才能覆盖其他 App。

新增睡眠文案目前使用简体中文回退，其他语言翻译仍待补全。真机验收需覆盖跨午夜、断网、重启、睡眠结束及普通任务同时到期。

## 照片与连接安全

「拍一张」调用系统相机并通过 FileProvider 传递临时图片；「从相册选择」使用系统文件选择器，不索取相机或全相册常驻权限。网页压缩到最长边 1600px、去元数据，仅存本设备 IndexedDB，服务端仅接收任务确认和照片摘要，不接收照片文件；换机无法查看照片，卸载或清理数据可能丢失。照片使用本人确认，尚无 AI 内容审核。

原生桥接通过 AndroidX WebKit 的允许源规则限制到配置的服务域名，另行拒绝子框架消息。WebView 不加载其他来源的导航，不开放本地文件，不忽略 HTTPS 证书错误。只填写你信任的服务地址。旧 WebView 不支持安全桥接时会要求更新。

## Cloudflare 部署

安卓副本使用独立 Worker 名称 `shuttercat-android`，避免覆盖原项目。照片仅存本地，已移除 R2 依赖，不需要开通 R2。部署进度见 AUTH_SETUP.md。

完整的数据库创建、邮件配置和部署步骤见 [邮箱账号上线配置](AUTH_SETUP.md)。D1 数据库已创建并初始化，真实数据库 ID 已填入 `wrangler.jsonc`；邮件配置尚待完成。

把正式 HTTPS 地址填入安卓 App。Worker Durable Objects 保留原业务：见面礼 200、开始 +50、主动放弃 −100、抽猫 −100。没有充值、提现、自动超时惩罚或自动真伪审核。新用户使用邮箱注册并完成验证后登录，支持密码找回；旧匿名账号可在注册时通过本设备 Cookie 或旧恢复码绑定。

## 验证

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
cd android
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug
```

浏览器测试使用本机 Chrome，8787 端口必须空闲，会独立启动本项目服务器。新增测试验证安卓桥接、授权状态、关闭守护不扣币以及回到 App 时刷新任务。原生单测覆盖重叠任务、到期判断、关闭与选择条件、时间解析、可信地址限制。

真实安卓设备验收：拍照/取消、相册/取消、系统返回关闭弹窗、键盘和导航栏遮挡、到期时停留娱乐 App、多个任务、提交后解除、主动放弃、断网紧急关闭、权限撤销、强停、重启、时间修改、锁屏来电。浏览器测试不能替代无障碍和相机实测。

## 发布前

需要真实 HTTPS 服务、正式签名和设备验证。应用商店对无障碍 API 有专门申报和审核要求；应说明用途、展示主动同意流程，并准备隐私政策与演示视频。targetSdk 35 是本次工程配置，正式上架时按商店当期要求升级。当前不能视为已通过上架审核的正式产品。

目录：`src/` 页面、`worker/` 后端、`shared/` 业务规则、`android/` 原生工程、`tests/` Web 测试。
