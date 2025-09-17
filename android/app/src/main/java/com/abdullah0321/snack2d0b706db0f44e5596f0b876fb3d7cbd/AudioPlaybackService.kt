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
        val channelId = "tts_playback_channel"
        val channelName = "Voice Reminder Playback"
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_LOW)
            nm.createNotificationChannel(ch)
        }

        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("Playing reminder")
            .setContentText("Your voice reminder is playing")
            .setSmallIcon(android.R.drawable.ic_lock_silent_mode)
            .setOngoing(true)
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
