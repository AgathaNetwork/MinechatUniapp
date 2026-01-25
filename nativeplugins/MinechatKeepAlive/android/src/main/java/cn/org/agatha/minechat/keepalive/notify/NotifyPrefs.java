package cn.org.agatha.minechat.keepalive.notify;

import android.content.Context;
import android.content.SharedPreferences;

public final class NotifyPrefs {
    private static final String PREFS = "minechat_keepalive";

    public static final String KEY_WS_BASE = "notify.wsBase";
    public static final String KEY_SOCKET_PATH = "notify.socketPath";
    public static final String KEY_TOKEN = "notify.token";

    private NotifyPrefs() {}

    public static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static String getWsBase(Context context) {
        return prefs(context).getString(KEY_WS_BASE, "");
    }

    public static String getSocketPath(Context context) {
        return prefs(context).getString(KEY_SOCKET_PATH, "/api/notify");
    }

    public static String getToken(Context context) {
        return prefs(context).getString(KEY_TOKEN, "");
    }

    public static void setConfig(Context context, String wsBase, String socketPath) {
        SharedPreferences.Editor editor = prefs(context).edit();
        if (wsBase != null) editor.putString(KEY_WS_BASE, wsBase);
        if (socketPath != null) editor.putString(KEY_SOCKET_PATH, socketPath);
        editor.apply();
    }

    public static void setToken(Context context, String token) {
        SharedPreferences.Editor editor = prefs(context).edit();
        if (token == null) token = "";
        editor.putString(KEY_TOKEN, token);
        editor.apply();
    }
}
