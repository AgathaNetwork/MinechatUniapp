# MinechatKeepAlive (Android 云打包)

云打包要求本地原生插件以 **AAR** 形式提供：

- 将本插件编译产物 `MinechatKeepAlive.aar` 放到本目录（即 `nativeplugins/MinechatKeepAlive/android/`）
- 不要把 `uniapp-v8-release.aar` / `uniapp-release.aar` 放进来（官方文档明确会冲突）

## 新增：原生通知 socket 托管

本插件的 `KeepAliveService` 现在会在前台服务存活期间托管一条 socket.io 连接（事件：`notify.message`），用于在 Android 后台也能持续收到消息并弹出系统通知。

JS 侧需要在登录/Token 变化时把配置同步给原生：

- `MinechatKeepAlive.setNotifyConfig(wsBase, socketPath)`
- `MinechatKeepAlive.setNotifyToken(token)`

注意：这要求你用当前源码重新编译 AAR（并确保云打包能拉取 `io.socket:socket.io-client` 依赖）。

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

## 一键生成 AAR（Windows，可选）

如果你不想手工搭 Android Studio 工程，这个仓库提供了脚本，会自动下载 Android SDK 到项目目录下的 `.cache`，并编译 AAR：

- 生成/刷新 AAR：`npm run build:keepalive-aar`
- 如果你在 PowerShell 里运行 `npm` 提示“禁止运行脚本”，可改用：`npm.cmd run build:keepalive-aar` 或直接执行 `scripts/build-keepalive-aar.cmd`
- 输出路径：`nativeplugins/MinechatKeepAlive/android/MinechatKeepAlive.aar`

另外，`npm run build:app-plus` 已经把该命令挂到了 `prebuild:app-plus`，所以走 CLI 编译 app-plus 时会自动刷新 AAR。
