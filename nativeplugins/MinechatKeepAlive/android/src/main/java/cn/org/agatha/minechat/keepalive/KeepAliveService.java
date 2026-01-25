package cn.org.agatha.minechat.keepalive;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

public class KeepAliveService extends Service {
    private static final String CHANNEL_ID = "minechat_keepalive";
    private static final int NOTIFICATION_ID = 10301;

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
    }

    @Override
    public void onDestroy() {
        try {
            removeForegroundNotification();
        } catch (Throwable ignored) {
        }
        super.onDestroy();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // 当用户从最近任务划掉/系统移除任务时，尽量把通知也移除
        try {
            removeForegroundNotification();
        } catch (Throwable ignored) {
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            ensureChannel();
            startForeground(NOTIFICATION_ID, buildNotification());
        } catch (Throwable ignored) {
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "Minechat 后台服务",
                    NotificationManager.IMPORTANCE_LOW
            );
            ch.setDescription("用于保持 Minechat 在后台运行（显示常驻通知）");
            nm.createNotificationChannel(ch);
        } catch (Throwable ignored) {
        }
    }

    private void removeForegroundNotification() {
        try {
            if (Build.VERSION.SDK_INT >= 33) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                // true 表示移除通知
                stopForeground(true);
            }
        } catch (Throwable ignored) {
        }

        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIFICATION_ID);
        } catch (Throwable ignored) {
        }
    }

    private Notification buildNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return new Notification.Builder(this, CHANNEL_ID)
                    .setContentTitle("Minechat")
                    .setContentText("后台运行中")
                    .setOngoing(true)
                    .setSmallIcon(android.R.drawable.stat_notify_chat)
                    .build();
        }
        return new Notification.Builder(this)
                .setContentTitle("Minechat")
                .setContentText("后台运行中")
                .setOngoing(true)
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .build();
    }
}
