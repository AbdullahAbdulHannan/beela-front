package com.abdullah0321.snack2d0b706db0f44e5596f0b876fb3d7cbd

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val audioPath = intent.getStringExtra("audioPath")
        val reminderId = intent.getStringExtra("reminderId") ?: ""
        val firingUserId = intent.getStringExtra("userId") ?: ""

        // Only allow playback for the currently logged-in user on this device
        val meta = context.getSharedPreferences("voxa_meta", Context.MODE_PRIVATE)
        val currentUser = try { meta.getString("current_user_id", "") ?: "" } catch (_: Exception) { "" }
        if (currentUser.isNullOrEmpty() || firingUserId.isEmpty() || currentUser != firingUserId) {
            return
        }

        // Acquire a short wake lock to ensure CPU stays awake long enough to start the service
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, context.packageName + ":AlarmWake")
        try {
            wl.acquire(10_000L)

            val serviceIntent = Intent(context, AudioPlaybackService::class.java).apply {
                putExtra("audioPath", audioPath)
                putExtra("reminderId", reminderId)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        } catch (_: Exception) {
            // swallow; nothing we can do here
        } finally {
            if (wl.isHeld) try { wl.release() } catch (_: Exception) {}
        }
    }
}
