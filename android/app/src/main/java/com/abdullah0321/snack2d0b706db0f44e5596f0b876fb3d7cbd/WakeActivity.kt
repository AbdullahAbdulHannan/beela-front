package com.abdullah0321.snack2d0b706db0f44e5596f0b876fb3d7cbd

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle

class WakeActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            val audioPath = intent.getStringExtra("audioPath")
            val reminderId = intent.getStringExtra("reminderId") ?: ""
            if (!audioPath.isNullOrEmpty()) {
                val serviceIntent = Intent(this, AudioPlaybackService::class.java).apply {
                    putExtra("audioPath", audioPath)
                    putExtra("reminderId", reminderId)
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(serviceIntent)
                } else {
                    startService(serviceIntent)
                }
            }
        } catch (_: Exception) {}
        // Finish immediately to avoid any visible UI
        finish()
        overridePendingTransition(0, 0)
    }
}
