# MinechatKeepAlive (Android 云打包)

云打包要求本地原生插件以 **AAR** 形式提供：

- 将本插件编译产物 `MinechatKeepAlive.aar` 放到本目录（即 `nativeplugins/MinechatKeepAlive/android/`）
- 不要把 `uniapp-v8-release.aar` / `uniapp-release.aar` 放进来（官方文档明确会冲突）

当前插件注册信息在：
- `nativeplugins/MinechatKeepAlive/package.json`：`integrateType` 已设置为 `aar`
- `src/manifest.json`：已注册 `app-plus.plugins.MinechatKeepAlive`

## 产出 AAR（建议用 Android Studio）

按 DCloud 官方示例，插件 Module 需要依赖 uni-app 的离线 SDK aar（通常用 `compileOnly` 引入），然后执行 `assembleRelease` 生成 aar。

你可以把本插件源码放入一个基于 `UniPlugin-Hello-AS(2.9.8+)` 的工程里，作为 library module 编译 `assembleRelease`，再把生成的 aar 复制到本目录。

生成后，云打包如果提示“插件不存在/找不到 class”，优先检查：
- AAR 是否真的存在于本目录
- AAR 内 `classes.jar` 是否包含 `cn.org.agatha.minechat.keepalive` 与 `cn.org.agatha.minechat.keepalive.uni` 的 class
- `package.json` 的 `class` 是否与 AAR 中的类全名一致
