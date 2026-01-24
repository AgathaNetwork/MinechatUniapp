package cn.org.agatha.minechat.keepalive.uni;

import android.content.Intent;
import android.os.Build;

import io.dcloud.feature.uniapp.annotation.UniJSMethod;
import io.dcloud.feature.uniapp.common.UniModule;

import cn.org.agatha.minechat.keepalive.KeepAliveService;

public class MinechatKeepAliveModule extends UniModule {

    @UniJSMethod(uiThread = false)
    public boolean startService() {
        if (mUniSDKInstance == null || mUniSDKInstance.getContext() == null) return false;

        try {
            Intent serviceIntent = new Intent(mUniSDKInstance.getContext(), KeepAliveService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                mUniSDKInstance.getContext().startForegroundService(serviceIntent);
            } else {
                mUniSDKInstance.getContext().startService(serviceIntent);
            }
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }
}
