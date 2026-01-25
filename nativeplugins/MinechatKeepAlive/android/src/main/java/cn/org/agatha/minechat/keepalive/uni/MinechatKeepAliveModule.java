package cn.org.agatha.minechat.keepalive.uni;

import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.lang.reflect.Method;

import cn.org.agatha.minechat.keepalive.KeepAliveService;
import cn.org.agatha.minechat.keepalive.notify.NotifyPrefs;
import io.dcloud.feature.uniapp.annotation.UniJSMethod;
import io.dcloud.feature.uniapp.common.UniModule;

public class MinechatKeepAliveModule extends UniModule {

	private Context getContextSafe() {
		try {
			if (mUniSDKInstance != null) {
				Method m = mUniSDKInstance.getClass().getMethod("getContext");
				Object ctx = m.invoke(mUniSDKInstance);
				if (ctx instanceof Context) return (Context) ctx;
			}
		} catch (Throwable ignored) {
		}

		// 兜底：某些机型/时机 mUniSDKInstance 可能为空，但 currentApplication 仍可用
		try {
			Class<?> at = Class.forName("android.app.ActivityThread");
			Method m = at.getMethod("currentApplication");
			Object app = m.invoke(null);
			if (app instanceof Context) return (Context) app;
		} catch (Throwable ignored) {
		}

		return null;
	}

	private void startOrRefreshKeepAliveService(Context context) {
		if (context == null) return;
		try {
			Intent serviceIntent = new Intent(context, KeepAliveService.class);
			if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
				context.startForegroundService(serviceIntent);
			} else {
				context.startService(serviceIntent);
			}
		} catch (Throwable ignored) {
		}
	}

	@UniJSMethod(uiThread = false)
	public boolean setNotifyConfig(String wsBase, String socketPath) {
		try {
			Context ctx = getContextSafe();
			if (ctx == null) return false;
			NotifyPrefs.setConfig(ctx.getApplicationContext(), wsBase, socketPath);
			startOrRefreshKeepAliveService(ctx.getApplicationContext());
			return true;
		} catch (Throwable ignored) {
			return false;
		}
	}

	@UniJSMethod(uiThread = false)
	public boolean setNotifyToken(String token) {
		try {
			Context ctx = getContextSafe();
			if (ctx == null) return false;
			NotifyPrefs.setToken(ctx.getApplicationContext(), token);
			startOrRefreshKeepAliveService(ctx.getApplicationContext());
			return true;
		} catch (Throwable ignored) {
			return false;
		}
	}
}
