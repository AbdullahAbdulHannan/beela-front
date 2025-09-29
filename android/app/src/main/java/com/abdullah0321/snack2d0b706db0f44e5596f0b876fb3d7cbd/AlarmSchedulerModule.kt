package com.abdullah0321.snack2d0b706db0f44e5596f0b876fb3d7cbd

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject

class AlarmSchedulerModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
    override fun getName(): String = "AlarmScheduler"

    private fun alarmsPrefs() = ctx.getSharedPreferences("voxa_alarms", Context.MODE_PRIVATE)
    private fun metaPrefs() = ctx.getSharedPreferences("voxa_meta", Context.MODE_PRIVATE)

    private fun persist(userId: String?, reminderId: String, triggerAt: Long, audioPath: String) {
        try {
            val key = "$reminderId:$triggerAt"
            val obj = JSONObject()
                .put("userId", userId ?: "")
                .put("reminderId", reminderId)
                .put("triggerAt", triggerAt)
                .put("audioPath", audioPath)
            alarmsPrefs().edit().putString(key, obj.toString()).apply()
        } catch (_: Exception) {}
    }

    private fun removePersisted(reminderId: String) {
        try {
            val prefs = alarmsPrefs()
            val keys = prefs.all.keys.toList()
            val editor = prefs.edit()
            for (k in keys) {
                if (k.startsWith("$reminderId:")) editor.remove(k)
            }
            editor.apply()
        } catch (_: Exception) {}
    }

    private fun removeAllForUser(userId: String) {
        try {
            val prefs = alarmsPrefs()
            val keys = prefs.all.keys.toList()
            val editor = prefs.edit()
            for (k in keys) {
                val raw = prefs.getString(k, null) ?: continue
                try {
                    val obj = JSONObject(raw)
                    if (userId == obj.optString("userId")) editor.remove(k)
                } catch (_: Exception) {}
            }
            editor.apply()
        } catch (_: Exception) {}
    }

    @ReactMethod
    fun setCurrentUser(userId: String?, promise: Promise) {
        try {
            metaPrefs().edit().putString("current_user_id", userId ?: "").apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SET_CURRENT_USER_ERROR", e)
        }
    }

    private fun currentUserId(): String? = try {
        metaPrefs().getString("current_user_id", "")?.takeIf { it.isNotEmpty() }
    } catch (_: Exception) { null }

    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                promise.resolve(am.canScheduleExactAlarms())
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("CHECK_EXACT_ALARM_ERROR", e)
        }
    }

    @ReactMethod
    fun requestScheduleExactAlarms(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                ctx.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("REQUEST_EXACT_ALARM_ERROR", e)
        }
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
            val pkg = ctx.packageName
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                promise.resolve(pm.isIgnoringBatteryOptimizations(pkg))
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("CHECK_BATTERY_OPT_ERROR", e)
        }
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val pkg = ctx.packageName
                try {
                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:$pkg")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    ctx.startActivity(intent)
                    promise.resolve(true)
                    return
                } catch (_: Exception) { /* fallthrough */ }

                // Fallback: open the full list screen
                try {
                    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    ctx.startActivity(intent)
                    promise.resolve(true)
                    return
                } catch (_: Exception) { /* fallthrough */ }

                // Final fallback: open app details
                try {
                    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.fromParts("package", pkg, null)
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    ctx.startActivity(intent)
                    promise.resolve(true)
                    return
                } catch (_: Exception) { /* fallthrough */ }
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("REQUEST_BATTERY_OPT_ERROR", e)
        }
    }

    @ReactMethod
    fun openOemPowerSettings(promise: Promise) {
        // Try a series of OEM-specific activities, then generic screens
        val tries = listOf(
            // Xiaomi / Redmi (MIUI)
            Intent().apply {
                component = ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")
            },
            Intent("miui.intent.action.OP_AUTO_START"),
            Intent().apply {
                component = ComponentName("com.miui.powerkeeper", "com.miui.powerkeeper.ui.HiddenAppsConfigActivity")
                putExtra("package_name", ctx.packageName)
                putExtra("package_label", "Voxa")
            },
            // Oppo / Realme (ColorOS)
            Intent().apply {
                component = ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")
            },
            Intent().apply {
                component = ComponentName("com.coloros.safecenter", "com.coloros.safecenter.applicationmanager.AppListActivity")
            },
            Intent().apply {
                component = ComponentName("com.coloros.safecenter", "com.coloros.safecenter.power.PowerConsumptionActivity")
            },
            // Vivo
            Intent().apply {
                component = ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity")
            },
            Intent().apply {
                component = ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")
            },
            // Huawei
            Intent().apply {
                component = ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity")
            },
            // OnePlus
            Intent().apply {
                component = ComponentName("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity")
            },
            // Samsung (Power/Battery)
            Intent(Settings.ACTION_BATTERY_SAVER_SETTINGS),
            // Generic battery optimization list
            Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
            // App details as last resort
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", ctx.packageName, null)
            }
        )
        try {
            for (intent in tries) {
                try {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    if (intent.resolveActivity(ctx.packageManager) != null) {
                        ctx.startActivity(intent)
                        promise.resolve(true)
                        return
                    }
                } catch (_: Exception) { }
            }
            promise.resolve(false)
        } catch (e: Exception) {
            promise.reject("OPEN_OEM_POWER_SETTINGS_ERROR", e)
        }
    }

    @ReactMethod
    fun openAppNotificationSettings(promise: Promise) {
        try {
            val pkg = ctx.packageName
            val intent = Intent().apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                    putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                } else {
                    action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                    putExtra("app_package", pkg)
                    putExtra("app_uid", ctx.applicationInfo.uid)
                }
            }
            if (intent.resolveActivity(ctx.packageManager) == null) {
                // Fallback to app details
                intent.action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS
                intent.data = Uri.fromParts("package", pkg, null)
            }
            ctx.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("OPEN_APP_NOTIF_SETTINGS_ERROR", e)
        }
    }

    @ReactMethod
    fun openOtherPermissions(promise: Promise) {
        // Specifically try MIUI 'Other permissions' editors for lock screen display
        val pkg = ctx.packageName
        val tries = listOf(
            Intent().apply {
                // Newer MIUI permission editor
                component = ComponentName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
                putExtra("extra_pkgname", pkg)
            },
            Intent().apply {
                // Alternate editor activity
                component = ComponentName("com.miui.securitycenter", "com.miui.permcenter.permissions.AppPermissionsEditorActivity")
                putExtra("extra_pkgname", pkg)
            },
            Intent().apply {
                // Older MIUI versions
                component = ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")
            },
            // Fallback to app notification settings
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                } else {
                    putExtra("app_package", pkg)
                    putExtra("app_uid", ctx.applicationInfo.uid)
                }
            },
            // Final fallback: app details
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", pkg, null)
            }
        )
        try {
            for (intent in tries) {
                try {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    if (intent.resolveActivity(ctx.packageManager) != null) {
                        ctx.startActivity(intent)
                        promise.resolve(true)
                        return
                    }
                } catch (_: Exception) {}
            }
            promise.resolve(false)
        } catch (e: Exception) {
            promise.reject("OPEN_OTHER_PERMISSIONS_ERROR", e)
        }
    }

    @ReactMethod
    fun schedule(timestampMs: Double, reminderId: String, audioPath: String, promise: Promise) {
        // Legacy: use currently set user if available
        scheduleForUser(timestampMs, reminderId, audioPath, currentUserId() ?: "", promise)
    }

    @ReactMethod
    fun scheduleForUser(timestampMs: Double, reminderId: String, audioPath: String, userId: String, promise: Promise) {
        try {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val triggerAt = timestampMs.toLong()
            val uniqueKey = "$reminderId:$triggerAt"

            val fireIntent = Intent(ctx, AlarmReceiver::class.java).apply {
                putExtra("reminderId", reminderId)
                putExtra("audioPath", audioPath)
                putExtra("userId", userId)
                data = Uri.parse("voxa://alarm/" + Uri.encode(uniqueKey))
                action = "com.voxa.ALARM_TRIGGER_" + uniqueKey
            }
            val firePiFlags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
            val firePi = PendingIntent.getBroadcast(
                ctx,
                uniqueKey.hashCode(),
                fireIntent,
                firePiFlags
            )

            try {
                // Use NoOpActivity so the UI is not brought to foreground on delivery (e.g., Nokia)
                val noopIntent = Intent(ctx, NoOpActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    data = Uri.parse("voxa://show/" + Uri.encode(uniqueKey))
                    action = "com.voxa.ALARM_SHOW_" + uniqueKey
                }
                val showPi = PendingIntent.getActivity(
                    ctx,
                    (uniqueKey.hashCode() shl 1) or 1,
                    noopIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
                )
                val acInfo = AlarmManager.AlarmClockInfo(triggerAt, showPi)
                am.setAlarmClock(acInfo, firePi)
            } catch (_: Exception) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, firePi)
                } else {
                    am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, firePi)
                }
            }

            // Persist for reboot recovery (include userId)
            persist(userId, reminderId, triggerAt, audioPath)

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SCHEDULE_ERROR", e)
        }
    }

    @ReactMethod
    fun cancel(reminderId: String, promise: Promise) {
        try {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val prefs = alarmsPrefs()
            val keys = prefs.all.keys.toList()
            for (k in keys) {
                if (!k.startsWith("$reminderId:")) continue
                val triggerAt = try { k.substringAfter(":").toLong() } catch (_: Exception) { 0L }
                if (triggerAt <= 0L) continue
                val uniqueKey = "$reminderId:$triggerAt"
                val intent = Intent(ctx, AlarmReceiver::class.java).apply {
                    putExtra("reminderId", reminderId)
                    putExtra("userId", currentUserId() ?: "")
                    data = Uri.parse("voxa://alarm/" + Uri.encode(uniqueKey))
                    action = "com.voxa.ALARM_TRIGGER_" + uniqueKey
                }
                val pi = PendingIntent.getBroadcast(
                    ctx,
                    uniqueKey.hashCode(),
                    intent,
                    PendingIntent.FLAG_NO_CREATE or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
                )
                if (pi != null) {
                    am.cancel(pi)
                    pi.cancel()
                }
            }

            // Best-effort cancel: remove persisted entries so BootReceiver won't reschedule them
            removePersisted(reminderId)

            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CANCEL_ERROR", e)
        }
    }

    @ReactMethod
    fun cancelAllForUser(userId: String, promise: Promise) {
        try {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val prefs = alarmsPrefs()
            val keys = prefs.all.keys.toList()
            for (k in keys) {
                val raw = prefs.getString(k, null) ?: continue
                try {
                    val obj = JSONObject(raw)
                    if (userId == obj.optString("userId")) {
                        val rid = obj.optString("reminderId", null) ?: continue
                        val triggerAt = obj.optLong("triggerAt", 0L)
                        val uniqueKey = "$rid:$triggerAt"
                        val intent = Intent(ctx, AlarmReceiver::class.java).apply {
                            putExtra("reminderId", rid)
                            putExtra("userId", userId)
                            data = Uri.parse("voxa://alarm/" + Uri.encode(uniqueKey))
                            action = "com.voxa.ALARM_TRIGGER_" + uniqueKey
                        }
                        val pi = PendingIntent.getBroadcast(
                            ctx,
                            uniqueKey.hashCode(),
                            intent,
                            PendingIntent.FLAG_NO_CREATE or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
                        )
                        if (pi != null) {
                            am.cancel(pi)
                            pi.cancel()
                        }
                    }
                } catch (_: Exception) {}
            }
            removeAllForUser(userId)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("CANCEL_ALL_FOR_USER_ERROR", e)
        }
    }
}
