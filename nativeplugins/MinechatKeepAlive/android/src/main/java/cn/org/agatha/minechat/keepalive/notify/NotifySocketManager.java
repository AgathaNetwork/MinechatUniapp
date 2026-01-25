package cn.org.agatha.minechat.keepalive.notify;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;

import org.json.JSONObject;

import java.net.URLEncoder;

import io.socket.client.IO;
import io.socket.client.Socket;
import io.socket.emitter.Emitter;

public final class NotifySocketManager {
    private static final String CHANNEL_ID = "minechat_notify";
    private static final int NOTIFICATION_ID_BASE = 20300;

    private Socket socket;
    private String lastWsBase = "";
    private String lastPath = "";
    private String lastToken = "";

    private volatile String state = "init";
    private volatile String lastError = "";
    private volatile long lastEventAt = 0L;

    public synchronized void refresh(Context context) {
        if (context == null) return;

        String wsBase = safeTrim(NotifyPrefs.getWsBase(context));
        String path = safeTrim(NotifyPrefs.getSocketPath(context));
        String token = safeTrim(NotifyPrefs.getToken(context));

        boolean hasWsBase = !wsBase.isEmpty();
        boolean hasToken = !token.isEmpty();
        boolean same = wsBase.equals(lastWsBase) && path.equals(lastPath) && token.equals(lastToken);

        if (!hasWsBase) {
            state = "disabled";
            lastError = "missing wsBase";
            lastEventAt = System.currentTimeMillis();
            stop();
            return;
        }

        if (!hasToken) {
            state = "waiting_token";
            lastError = "missing token";
            lastEventAt = System.currentTimeMillis();
            stop();
            // wsBase 已有，但未登录/未同步 token，不启动 socket
            return;
        }

        if (same && socket != null && socket.connected()) {
            state = "connected";
            return;
        }

        stop();
        lastWsBase = wsBase;
        lastPath = path.isEmpty() ? "/api/notify" : path;
        lastToken = token;

        state = "connecting";
        lastError = "";
        lastEventAt = System.currentTimeMillis();

        ensureChannel(context);
        startSocket(context, wsBase, lastPath, token);
    }

    public String getStatusText(Context context) {
        String s = state;
        if (s == null) s = "unknown";
        if ("connected".equals(s)) return "通知:已连接";
        if ("connecting".equals(s)) return "通知:连接中";
        if ("disconnected".equals(s)) return "通知:已断开";
        if ("connect_error".equals(s)) return "通知:连接失败";
        if ("no_permission".equals(s)) return "通知:无权限";
        if ("disabled".equals(s)) return "通知:未配置";
        if ("waiting_token".equals(s)) return "通知:未登录";
        if ("notifications_disabled".equals(s)) return "通知:已关闭";
        return "通知:" + s;
    }

    public String getLastError() {
        return lastError;
    }

    public synchronized void stop() {
        try {
            if (socket != null) {
                socket.off();
                socket.disconnect();
                socket.close();
            }
        } catch (Throwable ignored) {
        }
        socket = null;
    }

    private void startSocket(Context context, String wsBase, String path, String token) {
        try {
            IO.Options options = new IO.Options();
            options.path = path;
            options.reconnection = true;
            options.reconnectionAttempts = Integer.MAX_VALUE;
            options.reconnectionDelay = 1000;
            options.reconnectionDelayMax = 5000;
            options.timeout = 20000;
            options.transports = new String[]{"websocket"};

            // token 同时放 query，兼容后端
            try {
                String q = "token=" + URLEncoder.encode(token, "UTF-8");
                options.query = q;
            } catch (Throwable ignored) {
                options.query = "token=" + token;
            }

            socket = IO.socket(Uri.parse(wsBase).toString(), options);
        } catch (Throwable ignored) {
            socket = null;
            return;
        }

        if (socket == null) return;

        socket.on(Socket.EVENT_CONNECT, new Emitter.Listener() {
            @Override
            public void call(Object... args) {
                state = "connected";
                lastError = "";
                lastEventAt = System.currentTimeMillis();
            }
        });

        socket.on(Socket.EVENT_CONNECT_ERROR, new Emitter.Listener() {
            @Override
            public void call(Object... args) {
                state = "connect_error";
                lastEventAt = System.currentTimeMillis();
                try {
                    if (args != null && args.length > 0 && args[0] != null) {
                        lastError = String.valueOf(args[0]);
                    }
                } catch (Throwable ignored) {
                }
            }
        });

        socket.on(Socket.EVENT_DISCONNECT, new Emitter.Listener() {
            @Override
            public void call(Object... args) {
                state = "disconnected";
                lastEventAt = System.currentTimeMillis();
            }
        });

        socket.on("notify.message", new Emitter.Listener() {
            @Override
            public void call(Object... args) {
                try {
                    Object payload = (args != null && args.length > 0) ? args[0] : null;
                    showPayloadNotification(context, payload);
                } catch (Throwable ignored) {
                }
            }
        });

        try {
            socket.connect();
        } catch (Throwable ignored) {
        }
    }

    private void showPayloadNotification(Context context, Object payload) {
        // Android 13+：缺少 POST_NOTIFICATIONS 时会直接抛 SecurityException；这里避免静默失败
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                int granted = context.checkSelfPermission("android.permission.POST_NOTIFICATIONS");
                if (granted != PackageManager.PERMISSION_GRANTED) {
                    state = "no_permission";
                    lastError = "POST_NOTIFICATIONS not granted";
                    lastEventAt = System.currentTimeMillis();
                    return;
                }
            }
        } catch (Throwable ignored) {
        }

        try {
            NotificationManager nm0 = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm0 != null && Build.VERSION.SDK_INT >= 24 && !nm0.areNotificationsEnabled()) {
                state = "notifications_disabled";
                lastError = "NotificationManager.areNotificationsEnabled=false";
                lastEventAt = System.currentTimeMillis();
                return;
            }
        } catch (Throwable ignored) {
        }

        ensureChannel(context);

        String title = "Minechat";
        String body = "你有新消息";

        try {
            JSONObject json = null;
            if (payload instanceof JSONObject) {
                json = (JSONObject) payload;
            } else if (payload instanceof String) {
                json = new JSONObject((String) payload);
            }

            if (json != null) {
                if (json.has("chatName")) title = optString(json, "chatName", title);
                if (json.has("chat")) {
                    JSONObject chat = json.optJSONObject("chat");
                    if (chat != null && chat.has("name")) title = optString(chat, "name", title);
                }

                JSONObject msg = json.optJSONObject("message");
                if (msg != null) {
                    Object content = msg.opt("content");
                    if (content instanceof String) {
                        body = (String) content;
                    } else if (content instanceof JSONObject) {
                        JSONObject c = (JSONObject) content;
                        body = optString(c, "text", optString(c, "body", body));
                    } else if (content != null) {
                        body = String.valueOf(content);
                    }
                }
            }
        } catch (Throwable ignored) {
        }

        Intent launchIntent = null;
        try {
            PackageManager pm = context.getPackageManager();
            launchIntent = pm.getLaunchIntentForPackage(context.getPackageName());
        } catch (Throwable ignored) {
        }

        PendingIntent pi = null;
        if (launchIntent != null) {
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            pi = PendingIntent.getActivity(context, 0, launchIntent, flags);
        }

        Notification notification;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder builder = new Notification.Builder(context, CHANNEL_ID)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setSmallIcon(android.R.drawable.stat_notify_chat)
                    .setAutoCancel(true);
            if (pi != null) builder.setContentIntent(pi);
            notification = builder.build();
        } else {
            Notification.Builder builder = new Notification.Builder(context)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setSmallIcon(android.R.drawable.stat_notify_chat)
                    .setAutoCancel(true);
            if (pi != null) builder.setContentIntent(pi);
            notification = builder.build();
        }

        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                int id = NOTIFICATION_ID_BASE + (int) (System.currentTimeMillis() % 1000);
                nm.notify(id, notification);
            }
        } catch (Throwable ignored) {
            try {
                state = "notify_error";
                lastError = String.valueOf(ignored);
                lastEventAt = System.currentTimeMillis();
            } catch (Throwable ignored2) {
            }
        }
    }

    private void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "Minechat 消息通知",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            ch.setDescription("Minechat 消息提醒");
            nm.createNotificationChannel(ch);
        } catch (Throwable ignored) {
        }
    }

    private static String safeTrim(String s) {
        return s == null ? "" : s.trim();
    }

    private static String optString(JSONObject obj, String key, String def) {
        try {
            String v = obj.optString(key, "");
            if (v == null) return def;
            v = v.trim();
            return v.isEmpty() ? def : v;
        } catch (Throwable ignored) {
            return def;
        }
    }
}
