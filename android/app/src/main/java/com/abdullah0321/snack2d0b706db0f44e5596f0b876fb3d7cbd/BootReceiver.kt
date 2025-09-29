package com.abdullah0321.snack2d0b706db0f44e5596f0b876fb3d7cbd

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import org.json.JSONObject

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_LOCKED_BOOT_COMPLETED) return

        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        // Use device-protected storage when possible so we can access prefs before user unlock
        val dpContext = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            context.createDeviceProtectedStorageContext()
        } else context
        val prefs = dpContext.getSharedPreferences("voxa_alarms", Context.MODE_PRIVATE)
        val meta = dpContext.getSharedPreferences("voxa_meta", Context.MODE_PRIVATE)
        val currentUser = try { meta.getString("current_user_id", "") ?: "" } catch (_: Exception) { "" }
        val now = System.currentTimeMillis()
        val keys = prefs.all.keys.toList()
        for (key in keys) {
            try {
                val raw = prefs.getString(key, null) ?: continue
                val obj = JSONObject(raw)
                // Only reschedule for the currently logged-in user
                val userId = obj.optString("userId", "")
                if (currentUser.isEmpty() || userId.isEmpty() || userId != currentUser) continue
                val reminderId = obj.optString("reminderId", null) ?: continue
                val triggerAt = obj.optLong("triggerAt", 0L)
                val audioPath = obj.optString("audioPath", "")
                if (triggerAt <= now + 1_000L) continue

                val uniqueKey = "$reminderId:$triggerAt"
                val fireIntent = Intent(context, AlarmReceiver::class.java).apply {
                    putExtra("reminderId", reminderId)
                    putExtra("audioPath", audioPath)
                    putExtra("userId", userId)
                    data = Uri.parse("voxa://alarm/" + Uri.encode(uniqueKey))
                    this.action = "com.voxa.ALARM_TRIGGER_" + uniqueKey
                }
                val firePi = PendingIntent.getBroadcast(
                    context,
                    uniqueKey.hashCode(),
                    fireIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
                )

                val wakeIntent = Intent(context, WakeActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    putExtra("reminderId", reminderId)
                    putExtra("audioPath", audioPath)
                    data = Uri.parse("voxa://wake/" + Uri.encode(uniqueKey))
                    this.action = "com.voxa.ALARM_WAKE_" + uniqueKey
                }
                val showPi = PendingIntent.getActivity(
                    context,
                    (uniqueKey.hashCode() shl 1) or 1,
                    wakeIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
                )

                val acInfo = AlarmManager.AlarmClockInfo(triggerAt, showPi)
                am.setAlarmClock(acInfo, firePi)
            } catch (_: Exception) {
                // ignore
            }
        }
    }
}
