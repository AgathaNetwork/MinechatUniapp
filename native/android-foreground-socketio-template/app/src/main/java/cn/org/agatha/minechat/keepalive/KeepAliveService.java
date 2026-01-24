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
    public int onStartCommand(Intent intent, int flags, int startId) {
        // START_STICKY: 被系统回收后尽力重启
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

    private Notification buildNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return new Notification.Builder(this, CHANNEL_ID)
                    .setContentTitle("Minechat")
                    .setContentText("后台运行中")
                    .setOngoing(true)
                    .setSmallIcon(android.R.drawable.stat_notify_chat)
                    .build();
        }
        // 低版本兜底
        return new Notification.Builder(this)
                .setContentTitle("Minechat")
                .setContentText("后台运行中")
                .setOngoing(true)
                .setSmallIcon(android.R.drawable.stat_notify_chat)
                .build();
    }
}
