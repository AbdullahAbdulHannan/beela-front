package com.abdullah0321.snack2d0b706db0f44e5596f0b876fb3d7cbd

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class AudioPlaybackService : Service() {
    private var mediaPlayer: MediaPlayer? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val audioPath = intent?.getStringExtra("audioPath")
        val reminderId = intent?.getStringExtra("reminderId") ?: ""
        if (audioPath.isNullOrEmpty()) {
            // Brief foreground to satisfy OEM policy, then stop
            startForegroundService(reminderId)
            stopForeground(true)
            stopSelf()
            return START_NOT_STICKY
        }

        startForegroundService(reminderId)

        try {
            mediaPlayer = MediaPlayer()
            try {
                val uri = Uri.parse(audioPath)
                mediaPlayer?.setDataSource(this, uri)
            } catch (_: Exception) {
                mediaPlayer?.setDataSource(audioPath)
            }
            mediaPlayer?.setOnPreparedListener { it.start() }
            mediaPlayer?.setOnCompletionListener {
                stopForeground(true)
                stopSelf()
            }
            mediaPlayer?.prepareAsync()
        } catch (e: Exception) {
            stopForeground(true)
            stopSelf()
        }

        return START_NOT_STICKY
    }

    private fun startForegroundService(reminderId: String) {
        // Use stable HIGH-importance channel ID
        val channelId = "voice_reminders_alarm_v2"
        val channelName = "Voice Reminder Playback"
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Plays voice reminders in the foreground"
                enableVibration(true)
                setShowBadge(false)
                // Do not force a custom sound URI to avoid OEM permission/URI issues
            }
            nm.createNotificationChannel(ch)
        }

        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val contentPi = PendingIntent.getActivity(
            this,
            (reminderId.hashCode() shl 2) or 3,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
        )

        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Beela AI Reminder")
            .setContentText("Your voice reminder is playing")
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setVibrate(longArrayOf(0, 300, 200, 300))
            // Use a regular contentIntent, not full-screen, so UI only opens if user taps
            .setContentIntent(contentPi)
            .build()

        startForeground(1001, notification)
    }

    override fun onDestroy() {
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
        } catch (_: Exception) {}
        mediaPlayer = null
        super.onDestroy()
    }
}
