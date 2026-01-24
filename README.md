# minechat-uniapp

## 说明

- 启动页为 `src/pages/webview/webview.vue`，地址：`https://front-dev.agatha.org.cn/`

## Android 开机自启/后台常驻

本项目已加入“开机广播 -> 启动前台常驻 Service（带常驻通知）”的本地原生插件实现：

- 原生入口：
	- [nativeplugins/MinechatKeepAlive/android/src/main/AndroidManifest.xml](nativeplugins/MinechatKeepAlive/android/src/main/AndroidManifest.xml)
	- `cn.org.agatha.minechat.keepalive.BootReceiver` / `KeepAliveService`
- JS 兜底：App 启动时会尝试启动前台服务（见 [src/main.js](src/main.js#L1) 与 [src/keepAlive.js](src/keepAlive.js#L1)）。

离线打包/自定义基座时需要确保本地插件已生效：项目根目录存在 `nativeplugins/MinechatKeepAlive`，且 [src/manifest.json](src/manifest.json#L1) 已注册 `app-plus.plugins.MinechatKeepAlive`。

注意：不同厂商系统通常还需要用户在系统设置里手动开启“允许自启动/后台运行/不受限制”，否则开机广播可能被拦截。

## Project setup
```
npm install
```

## 运行（开发）

### H5（浏览器）
```
npm run serve
```

等价命令：

```
npm run dev:h5
```

### App（app-plus）

```
npm run dev:app-plus
```

## 构建（生产）

### H5
```
npm run build
```

等价命令：

```
npm run build:h5
```

### App（app-plus）

```
npm run build:app-plus
```

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).
