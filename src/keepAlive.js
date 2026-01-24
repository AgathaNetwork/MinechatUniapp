// Android 自启动/保活：启动前台常驻 Service（需要原生侧提供 KeepAliveService）

function isAppPlus() {
  // #ifdef APP-PLUS
  return true;
  // #endif
  return false;
}

function isAndroid() {
  if (!isAppPlus()) return false;
  try {
    const sys = uni.getSystemInfoSync && uni.getSystemInfoSync();
    const platform = (sys && (sys.platform || sys.osName)) || '';
    return String(platform).toLowerCase() === 'android';
  } catch (e) {
    return false;
  }
}

function startAndroidKeepAliveService() {
  // #ifdef APP-PLUS
  try {
    if (!isAndroid()) return false;

    const main = plus.android.runtimeMainActivity();
    const Intent = plus.android.importClass('android.content.Intent');
    const Build = plus.android.importClass('android.os.Build');

    const pkg = String(main.getPackageName());
    const cls = 'cn.org.agatha.minechat.keepalive.KeepAliveService';

    const intent = new Intent();
    intent.setClassName(pkg, cls);

    // Android 8+ 需要 startForegroundService
    if (Build.VERSION.SDK_INT >= 26) {
      main.startForegroundService(intent);
    } else {
      main.startService(intent);
    }
    return true;
  } catch (e) {
    console.warn('[keepAlive] startAndroidKeepAliveService failed', e);
    return false;
  }
  // #endif
  return false;
}

export { startAndroidKeepAliveService };
