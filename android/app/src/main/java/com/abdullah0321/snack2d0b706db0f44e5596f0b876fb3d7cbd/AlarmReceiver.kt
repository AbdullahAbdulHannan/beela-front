package com.abdullah0321.snack2d0b706db0f44e5596f0b876fb3d7cbd

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val audioPath = intent.getStringExtra("audioPath")
        val reminderId = intent.getStringExtra("reminderId") ?: ""
        val serviceIntent = Intent(context, AudioPlaybackService::class.java).apply {
            putExtra("audioPath", audioPath)
            putExtra("reminderId", reminderId)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent)
        } else {
            context.startService(serviceIntent)
        }
    }
}
