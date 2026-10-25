# 守护图片

图片跟随网页状态中的 `activeCat`，通过 `sync` 桥接与任务一起保存到本机。离线显示最后一次同步的陪伴猫；旧网页未传此字段时保留本机选择，首次默认 cloud。更换服务器时重置为 cloud。切换陪伴猫后，正在显示的遮盖页也会刷新。

对应关系按 `src/Cat.tsx` 使用的实际插画核对（目录里的色值、猫名不代表插画实际颜色），不轮换：

| 陪伴猫 ID | 名称 | 插画颜色 | 来源 | Android 资源 |
| --- | --- | --- | --- | --- |
| cloud | 云朵 | 紫 | artifacts/1 (2).png | drawable-nodpi/guard_1.png |
| peach | 桃桃 | 黄 | artifacts/2 (2).png | drawable-nodpi/guard_2.png |
| matcha | 抹茶 | 粉 | artifacts/3 (2).png | drawable-nodpi/guard_3.png |
| butter | 布丁 | 黑 | artifacts/4 (2).png | drawable-nodpi/guard_4.png |
| moon | 晚安 | 白 | artifacts/5 (2).png | drawable-nodpi/guard_5.png |

这批 PNG 实际为 841 × 1870，约为 9:20。推荐后续直接导出 1080 × 2400；更高清可用 1440 × 3200，避免将小图简单拉伸后当作高清原图。

图片使用 FIT_CENTER 等比例完整展示，不拉伸、不裁掉猫。剩余区域由不透明米色背景填满，不会露出下面的娱乐 App。竖屏按钮位于图片下方，横屏在右侧；按钮区支持滚动，避让系统栏和刘海。布局按窗口实际尺寸和系统安全边距计算，不需要为每款手机另做图片。不同屏幕比例可能有留白；若未来改为 CENTER_CROP 全屏铺满，需接受边缘裁切并为猫和重要内容预留安全区。

资源使用 drawable-nodpi，避免系统按密度额外放大位图。图片随 APK 打包，离线可用。修改 artifacts 后需重新复制对应资源并构建 APK。

此功能同时涉及网页同步字段和原生 APK，两端都需更新。浏览器测试验证陪伴猫同步；真实覆盖效果、横竖屏、折叠屏、刘海及大字体需在设备上验收。
