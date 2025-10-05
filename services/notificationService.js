import * as Notifications from 'expo-notifications';
import notifee, { AndroidImportance, TimestampTrigger, TriggerType, AndroidColor, EventType } from '@notifee/react-native';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { Platform, NativeModules, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureReminderTTS, getReminders, getCalendarEvents, getReminder, setLocationPermission, scanNearbyForLocationReminders } from './api';

// Configure how notifications are displayed when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let listenersRegistered = false;
const GEOFENCE_TASK = 'voxa_geofence_task';
const LOCATION_SCAN_TASK = 'voxa_location_scan_task';
let geofenceTaskRegistered = false;
let locationTaskRegistered = false;
let fgLocationWatch = null;

// Storage keys for scheduled notification IDs per reminder, namespaced by user
const baseKey = 'scheduledReminderNotificationsMap';
const keyForUser = (userId) => `${baseKey}:${userId || 'anonymous'}`;

async function getCurrentUserId() {
  try {
    const raw = await AsyncStorage.getItem('user');
    const u = raw ? JSON.parse(raw) : null;
    return u?._id || u?.id || u?.email || 'anonymous';
  } catch {
    return 'anonymous';
  }
}

async function startForegroundLocationWatchIfNoBG() {
  try {
    if (fgLocationWatch) return;
    fgLocationWatch = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 10,
        timeInterval: 30 * 1000,
      },
      async (loc) => {
        try {
          if (!loc?.coords) return;
          const { latitude, longitude, accuracy } = loc.coords;
          console.log('[loc-fg] update', { latitude, longitude, accuracy });
          const res = await scanNearbyForLocationReminders({ lat: latitude, lng: longitude, radius: 500 });
          const results = res?.results || [];
          console.log('[loc-fg] scan results', results.length);
          for (const r of results) {
            if (!r || r.skipped) continue;
            let localAudioPath = null;
            try {
              if (r.reminderId && r.ttsTextHash) {
                localAudioPath = await ensureReminderAudioCached({ reminderId: r.reminderId, textHash: r.ttsTextHash });
              }
            } catch {}
            try {
              const channelId = await notifee.createChannel({ id: 'reminders', name: 'Reminders', importance: AndroidImportance.HIGH });
              await notifee.displayNotification({
                id: `${r.reminderId}-loc-${Date.now()}`,
                android: { channelId, pressAction: { id: 'default' }, importance: AndroidImportance.HIGH },
                title: 'Nearby Reminder',
                body: r.body || r.bodyFallback || `Reminder: You're near a place for ${r.title || 'your item'}.`,
                data: { type: 'location_reminder', reminderId: r.reminderId, localAudioPath: localAudioPath || null },
              });
            } catch {}
            if (localAudioPath) { try { await playAudioFile(localAudioPath); } catch {} }
          }
        } catch {}
      }
    );
    // Immediate scan on startup for foreground fallback
    try {
      const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (now?.coords) {
        console.log('[loc-fg] immediate scan kickoff');
        const { latitude, longitude } = now.coords;
        await scanNearbyForLocationReminders({ lat: latitude, lng: longitude, radius: 500 });
      }
    } catch {}
    return true;
  } catch (e) {
    console.warn('[loc-fg] watch failed', e?.message);
    return false;
  }
}

export async function scanNow() {
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    if (!loc?.coords) return { success: false };
    const res = await scanNearbyForLocationReminders({ lat: loc.coords.latitude, lng: loc.coords.longitude, radius: 500 });
    return res || { success: true, results: [] };
  } catch (e) {
    return { success: false, message: e?.message };
  }
}

async function getScheduledMap() {
  try {
    const userId = await getCurrentUserId();
    const raw = await AsyncStorage.getItem(keyForUser(userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setScheduledMap(map) {
  try {
    const userId = await getCurrentUserId();
    await AsyncStorage.setItem(keyForUser(userId), JSON.stringify(map || {}));
  } catch {}
}

async function setScheduledFor(reminderId, payload) {
  const map = await getScheduledMap();
  if (payload) map[reminderId] = payload; else delete map[reminderId];
  await setScheduledMap(map);
}

export async function cancelScheduledFor(reminderId) {
  try {
    const map = await getScheduledMap();
    const entry = map[reminderId];
    if (entry) {
      // Cancel Expo (if any, legacy)
      if (entry.expoId) await Notifications.cancelScheduledNotificationAsync(entry.expoId).catch(() => {});
      // Cancel Notifee trigger
      if (entry.notifeeId) await notifee.cancelTriggerNotification(entry.notifeeId).catch(() => {});
      // Cancel native alarm
      try { await NativeModules.AlarmScheduler?.cancel(String(reminderId)); } catch {}

      delete map[reminderId];
      await setScheduledMap(map);
    }
  } catch {}
}

// Define the background task (idempotent)
function defineGeofenceTaskOnce() {
  if (geofenceTaskRegistered) return;
  if (!TaskManager.isTaskDefined(GEOFENCE_TASK)) {
    TaskManager.defineTask(GEOFENCE_TASK, async ({ data, error }) => {
      try {
        if (error) {
          console.warn('[geofence] task error', error);
          return;
        }
        const { eventType, region } = data || {};
        // eventType 1 = enter, 2 = exit (per expo-location docs)
        if (eventType === Location.GeofencingEventType.Enter && region) {
          const reminderId = region?.identifier || null;
          const locationName = region?.identifierName || 'your saved place';
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Location Reminder',
              body: `You are near ${locationName}.`,
              data: { type: 'location_reminder', reminderId },
            },
            trigger: null,
          });
        }
      } catch (e) {
        console.warn('[geofence] task handler failed', e);
      }
    });
  }
  geofenceTaskRegistered = true;
}

export const initLocationServices = async () => {
  try {
    defineGeofenceTaskOnce();
    // Request permissions (foreground is sufficient to receive enter events while app is running; background for true background)
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      console.warn('[location] foreground permission not granted');
    }
    // Try background permission, ignore if denied
    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg?.status === 'granted') {
        try { await setLocationPermission(true); } catch {}
        // Start periodic background location updates for scanning
        await startBackgroundLocationScan();
      } else {
        // Foreground fallback: watch position while app is open
        await startForegroundLocationWatchIfNoBG();
        // Hint user to enable "Allow all the time" in settings for reliable background scanning
        try { Linking.openSettings?.(); } catch {}
      }
    } catch {}
  } catch (e) {
    console.warn('[location] init failed', e);
  }
};

function defineLocationScanTaskOnce() {
  if (locationTaskRegistered) return;
  if (!TaskManager.isTaskDefined(LOCATION_SCAN_TASK)) {
    TaskManager.defineTask(LOCATION_SCAN_TASK, async ({ data, error }) => {
      try {
        if (error) { console.warn('[loc-scan] task error', error); return; }
        const { locations } = data || {};
        const loc = Array.isArray(locations) && locations.length ? locations[0] : null;
        if (!loc?.coords) return;
        const { latitude, longitude, accuracy } = loc.coords;
        console.log('[loc-bg] update', { latitude, longitude, accuracy });
        // Call backend to evaluate triggers with anti-spam/collision rules
        let results = [];
        try {
          const res = await scanNearbyForLocationReminders({ lat: latitude, lng: longitude, radius: 500 });
          results = res?.results || [];
          console.log('[loc-bg] scan results', results.length);
        } catch (e) {
          // swallow network errors
          return;
        }
        // Trigger local notifications for each result
        for (const r of results) {
          if (!r || r.skipped) continue;
          // try to download audio ahead of time if provided
          let localAudioPath = null;
          try {
            if (r.reminderId && r.ttsTextHash) {
              localAudioPath = await ensureReminderAudioCached({ reminderId: r.reminderId, textHash: r.ttsTextHash });
            }
          } catch {}

          // Notifee notification immediate
          try {
            const channelId = await notifee.createChannel({ id: 'reminders', name: 'Reminders', importance: AndroidImportance.HIGH });
            await notifee.displayNotification({
              id: `${r.reminderId}-loc-${Date.now()}`,
              android: { channelId, pressAction: { id: 'default' }, importance: AndroidImportance.HIGH },
              title: 'Nearby Reminder',
              body: r.body || r.bodyFallback || `Reminder: You're near a place for ${r.title || 'your item'}.`,
              data: { type: 'location_reminder', reminderId: r.reminderId, localAudioPath: localAudioPath || null },
            });
          } catch {}

          // Attempt audio playback via JS as a fallback; native service may also play if integrated
          if (localAudioPath) {
            try { await playAudioFile(localAudioPath); } catch {}
          }
        }
      } catch (e) {
        // swallow
      }
    });
  }
  locationTaskRegistered = true;
}

async function startBackgroundLocationScan() {
  try {
    defineLocationScanTaskOnce();
    const has = await Location.hasStartedLocationUpdatesAsync(LOCATION_SCAN_TASK);
    if (has) return true;
    await Location.startLocationUpdatesAsync(LOCATION_SCAN_TASK, {
      // Balanced accuracy to save battery; adjust as needed
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 25, // meters
      timeInterval: 30 * 1000, // 30 seconds
      showsBackgroundLocationIndicator: false,
      pausesUpdatesAutomatically: true,
      foregroundService: Platform.select({
        android: {
          notificationTitle: 'Location Scanning',
          notificationBody: 'Scanning nearby places for your location reminders',
          notificationColor: '#4668FF',
        },
        ios: undefined,
      }),
    });
    // Immediate scan on startup for background service
    try {
      const now = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (now?.coords) {
        console.log('[loc-bg] immediate scan kickoff');
        const { latitude, longitude } = now.coords;
        await scanNearbyForLocationReminders({ lat: latitude, lng: longitude, radius: 500 });
      }
    } catch {}
    return true;
  } catch (e) {
    console.warn('[loc-scan] start failed', e?.message);
    return false;
  }
}

export const startGeofencingForLocationReminder = async ({ id, title, location }) => {
  try {
    defineGeofenceTaskOnce();
    if (!location?.coordinates || typeof location.coordinates.lat !== 'number' || typeof location.coordinates.lng !== 'number') {
      console.warn('[geofence] invalid coordinates, skipping');
      return { started: false, reason: 'no_coords' };
    }
    // Read preferred radius in meters
    let meters = 20;
    try {
      const stored = await AsyncStorage.getItem('locationProximityMeters');
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed)) meters = parsed;
      }
      if (meters === -1) {
        const custom = await AsyncStorage.getItem('locationProximityCustom');
        const c = parseInt(custom || '', 10);
        if (!isNaN(c) && c > 0) meters = c; else meters = 20;
      }
    } catch {}

    const region = [{
      identifier: String(id || title || 'location'),
      latitude: location.coordinates.lat,
      longitude: location.coordinates.lng,
      radius: meters,
      notifyOnEnter: true,
      notifyOnExit: false,
    }];

    // Make sure we don't have an old geofencing session lingering
    try {
      const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
      if (started) {
        await Location.stopGeofencingAsync(GEOFENCE_TASK);
      }
    } catch {}

    // On iOS, must be called in foreground and after permissions
    await Location.startGeofencingAsync(GEOFENCE_TASK, region);
    return { started: true };
  } catch (e) {
    console.warn('[geofence] start failed', e);
    return { started: false, reason: e?.message };
  }
};

export const configureNotifications = async () => {
  // Ask permission on first launch
  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('Notification permissions not granted');
    }
  }

  // Android notification channel for proper sounds
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  // Register listeners once
  if (!listenersRegistered) {
    // Expo notifications (geofencing + legacy)
    Notifications.addNotificationReceivedListener(async (notification) => {
      try {
        // No JS playback on delivery; native service handles audio
      } catch (e) {
        console.warn('Error handling foreground notification', e);
      }
    });

    Notifications.addNotificationResponseReceivedListener(async (response) => {
      try {
        // Suppress audio on tap to avoid duplicate playback
      } catch (e) {
        console.warn('Error handling notification response', e);
      }
    });

    // Notifee notifications (primary path)
    try {
      notifee.onForegroundEvent(async ({ type, detail }) => {
        try {
          // Do not play audio on DELIVERED or PRESS; native handles playback
        } catch (e) {
          console.warn('[notifee] fg event error', e?.message);
        }
      });

      // Background handler must be registered at the root level; Notifee allows inline registration
      notifee.onBackgroundEvent(async ({ type, detail }) => {
        try {
          // Suppress playback on PRESS/ACTION_PRESS to avoid duplicates
        } catch (e) {
          // swallow
        }
      });
    } catch (e) {
      console.warn('[notifee] listener registration failed', e?.message);
    }

    listenersRegistered = true;
  }
};

// Download and cache TTS audio for a reminder. Returns local file path or null on failure.
export const ensureReminderAudioCached = async ({ reminderId, textHash }) => {
  try {
    if (!reminderId || !textHash) return null;
    const dir = FileSystem.documentDirectory + 'tts/';
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const filePath = `${dir}${reminderId}-${textHash}.mp3`;
    // If already exists, return
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists && info.size > 0) return filePath;

    // Remove any old versions for this reminderId
    const listing = await FileSystem.readDirectoryAsync(dir).catch(() => []);
    await Promise.all(
      (listing || [])
        .filter(name => name.startsWith(`${reminderId}-`) && name !== `${reminderId}-${textHash}.mp3`)
        .map(name => FileSystem.deleteAsync(dir + name, { idempotent: true }))
    );

    // Download with auth header
    const token = await AsyncStorage.getItem('userToken');
    const baseUrl = (process.env.EXPO_PUBLIC_API_URL || 'https://voxa-backend-three.vercel.app/api').replace(/\/$/, '');
    const url = `${baseUrl}/reminders/${reminderId}/tts`;
    const res = await FileSystem.downloadAsync(url, filePath, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        Accept: 'audio/mpeg'
      }
    });
    if (res.status !== 200) {
      console.warn('[tts] download failed with status', res.status);
      return null;
    }
    return filePath;
  } catch (e) {
    console.warn('[tts] ensure cache failed', e?.message);
    return null;
  }
};

async function playAudioFile(localUri) {
  try {
    const { sound } = await Audio.Sound.createAsync(
      { uri: localUri },
      { shouldPlay: true, staysActiveInBackground: true }
    );
    // Optionally unload after playback
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
  } catch (e) {
    console.warn('[audio] playback failed', e?.message);
  }
}

export const scheduleReminderSpeechNotification = async ({
  username = 'there',
  meetingName = 'your meeting',
  startDateISO,
  reminderId,
  textHash,
  replaceExisting = false,
  leadMinutes: leadMinutesOverride,
}) => {
  try {
    if (!startDateISO) return { scheduled: false, reason: 'No start date' };
    console.log('[notify] schedule start', { startDateISO });
    // Read preferred lead minutes
    let leadMinutes = typeof leadMinutesOverride === 'number' ? leadMinutesOverride : 10;
    if (typeof leadMinutesOverride !== 'number') {
      try {
        const stored = await AsyncStorage.getItem('notificationLeadMinutes');
        if (stored) {
          const parsed = parseInt(stored, 10);
          if (!isNaN(parsed)) {
            if (parsed === -1) {
              const custom = await AsyncStorage.getItem('notificationCustomMinutes');
              const cParsed = parseInt(custom || '', 10);
              if (!isNaN(cParsed) && cParsed > 0) leadMinutes = cParsed;
            } else if (parsed > 0) {
              leadMinutes = parsed;
            }
          }
        }
      } catch {}
    }
    console.log('[notify] computed leadMinutes', leadMinutes);

    const start = new Date(startDateISO);
    const preferredTriggerMs = start.getTime() - leadMinutes * 60 * 1000;
    const nowMs = Date.now();
    let triggerMs = preferredTriggerMs;

    // Fallback: if preferred trigger is in the past, schedule at max(now+30s, 1 minute before start)
    if (triggerMs <= nowMs) {
      const oneMinuteBefore = start.getTime() - 60 * 1000;
      triggerMs = Math.max(nowMs + 30 * 1000, oneMinuteBefore);
      // If still in the past (event already started), stop scheduling
      if (triggerMs <= nowMs) {
        return { scheduled: false, reason: 'Event is too close or already started' };
      }
    }
    console.log('[notify] times', {
      now: new Date(nowMs).toISOString(),
      start: start.toISOString(),
      preferredTrigger: new Date(preferredTriggerMs).toISOString(),
      finalTrigger: new Date(triggerMs).toISOString(),
    });

    // Helper: get AI line by polling briefly (bounded) before fallback (do NOT generate TTS here)
    const awaitAiLine = async (rid, maxWaitMs = 2500) => {
      const startTs = Date.now();
      let lastAi = null;
      while (Date.now() - startTs < maxWaitMs) {
        try {
          // 1) GET reminder
          const r = await getReminder(rid);
          const data = r?.data || r?.reminder || r;
          if (!meetingName && data?.title) meetingName = data.title;
          if (!username) {
            const userString = await AsyncStorage.getItem('user');
            if (userString) { try { const u = JSON.parse(userString); username = u?.fullname || 'there'; } catch {} }
          }
          if (data?.aiNotificationLine) return data.aiNotificationLine;
        } catch {}
        await new Promise(r => setTimeout(r, 250));
      }
      return lastAi;
    };

    // Try to resolve AI line before scheduling
    let body = null;
    if (reminderId) {
      body = await awaitAiLine(reminderId, 2500);
      // After AI line is available (or even if still null), ensure TTS once to align audio text with AI line
      try {
        const ensureRes = await ensureReminderTTS(reminderId, {});
        effectiveTextHash = ensureRes?.tts?.textHash || effectiveTextHash;
        // If server exposes aiNotificationLine on ensure response, prefer it
        if (!body && ensureRes?.aiNotificationLine) body = ensureRes.aiNotificationLine;
      } catch {}
    }
    if (!body) {
      // Friendly fallback: use the configured leadMinutes
      const m = typeof leadMinutes === 'number' && leadMinutes > 0 ? leadMinutes : Math.max(1, Math.round((start.getTime() - triggerMs) / (60 * 1000)));
      body = m <= 1
        ? `Heads up ${username || 'there'} — ${meetingName || 'your task'} is due in about a minute.`
        : `Heads up ${username || 'there'} — ${meetingName || 'your task'} is due in ${m} minutes.`;
    }

    // Attempt to ensure audio cached before scheduling
    const localAudioPath = await ensureReminderAudioCached({ reminderId, textHash: effectiveTextHash });

    // Replace existing scheduled notification for this reminder if requested
    if (replaceExisting && reminderId) {
      await cancelScheduledFor(String(reminderId));
    }

    // 1) Schedule user-visible notification via Notifee
    const channelId = await notifee.createChannel({
      id: 'reminders',
      name: 'Reminders',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
    });
    const trigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: triggerMs,
      alarmManager: true,
    };
    const notifeeId = await notifee.createTriggerNotification({
      id: `${reminderId}-notify`,
      android: {
        channelId,
        color: AndroidColor.WHITE,
        pressAction: { id: 'default' },
        importance: AndroidImportance.HIGH,
      },
      title: 'Upcoming Reminder',
      body,
      data: {
        type: 'reminder_speech',
        reminderId: reminderId || null,
        startDateISO,
        localAudioPath: localAudioPath || null,
      },
    }, trigger);

    // 2) Schedule the native alarm to auto-play audio in background/killed, scoped to user
    try {
      // Redundant cancel to avoid duplicate native alarms in edge cases
      try { await NativeModules.AlarmScheduler?.cancel(String(reminderId)); } catch {}
      const userId = await getCurrentUserId();
      await NativeModules.AlarmScheduler?.scheduleForUser?.(triggerMs, String(reminderId), localAudioPath || '', String(userId));
    } catch (e) {
      console.warn('[alarm] schedule failed', e?.message);
    }

    console.log('[notify] scheduled notifeeId', notifeeId);
    if (reminderId) {
      await setScheduledFor(String(reminderId), { notifeeId });
    }
    return { scheduled: true, id: notifeeId };
  } catch (e) {
    console.warn('Failed to schedule notification', e);
    return { scheduled: false, reason: e?.message || 'Unknown error' };
  }
};

// Reschedule all time-based reminders (Task/Meeting) after user changes lead time settings.
export const rescheduleAllTimeBasedReminders = async () => {
  try {
    const result = await getReminders();
    const reminders = result?.data || [];
    // Also include calendar events
    let calendarEvents = [];
    try {
      const cal = await getCalendarEvents();
      calendarEvents = (cal?.data?.events || []).map(ev => ({
        id: ev._id || ev.id,
        type: 'Meeting',
        title: ev.summary || 'Event',
        startDate: ev.start?.dateTime || ev.start?.date,
      }));
    } catch {}
    const now = Date.now();
    const userString = await AsyncStorage.getItem('user');
    let username = 'there';
    if (userString) {
      try { const user = JSON.parse(userString); username = user?.fullname || 'there'; } catch {}
    }

    // Build list of items to schedule next trigger for
    const items = [];
    for (const r of reminders) {
      if (!(r.type === 'Task' || r.type === 'Meeting')) continue;
      const id = r._id || r.id;
      const title = r.title || 'your meeting';
      const perItemMinutes = (typeof r.notificationPreferenceMinutes === 'number')
        ? r.notificationPreferenceMinutes
        : (r?.scheduleTime?.minutesBeforeStart ?? 10);
      if (r.isManualSchedule && r.scheduleType === 'routine') {
        // Compute next occurrence based on fixedTime and scheduleDays
        const fixed = r?.scheduleTime?.fixedTime || '09:00';
        const [hh, mm] = String(fixed).split(':').map(x => parseInt(x, 10));
        const days = Array.isArray(r.scheduleDays) ? r.scheduleDays : [];
        const now = new Date();
        // Generate dates for the next 14 days and pick the earliest in future
        let next = null;
        for (let i = 0; i < 14; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() + i);
          d.setHours(hh || 9, mm || 0, 0, 0);
          const dayOk = days.length === 0 || days.includes(d.getDay());
          if (dayOk && d.getTime() > now.getTime()) { next = d; break; }
        }
        if (next) items.push({ id, title, startISO: next.toISOString(), leadMinutes: perItemMinutes });
      } else {
        const startISO = r.startDate || r.startTime || null;
        if (startISO) items.push({ id, title, startISO, leadMinutes: perItemMinutes });
      }
    }
    // Include calendar events unchanged (use default lead minutes)
    for (const e of calendarEvents) {
      items.push({ id: e.id, title: e.title, startISO: e.startDate, leadMinutes: undefined });
    }

    for (const it of items) {
      try {
        if (!it.startISO) continue;
        const startMs = new Date(it.startISO).getTime();
        if (isNaN(startMs) || startMs <= now) continue; // skip past events
        // Ensure TTS and get textHash
        const id = it.id;
        let textHash = null;
        if (id) {
          try {
            // Do not pass fixedMinutes so the server uses the same Gemini one-line for voice
            const ensureRes = await ensureReminderTTS(id, {});
            textHash = ensureRes?.tts?.textHash || null;
          } catch {}
        }
        await scheduleReminderSpeechNotification({
          username,
          meetingName: it.title || 'your meeting',
          startDateISO: it.startISO,
          reminderId: id,
          textHash,
          replaceExisting: true,
          leadMinutes: it.leadMinutes,
        });
      } catch {}
    }
    return { ok: true };
  } catch (e) {
    console.warn('[notify] reschedule all failed', e?.message);
    return { ok: false };
  }
};

// Clear local caches so subsequent schedules are not skipped by legacy caches
export const clearAllSchedulingCaches = async () => {
  try {
    const userId = await getCurrentUserId();
    await AsyncStorage.removeItem(keyForUser(userId));
    await AsyncStorage.removeItem('scheduledCalendarEvents');
  } catch {}
};

// Cancel all local Notifee trigger notifications for the current user and clear the per-user map
export const cancelAllLocalSchedulesForCurrentUser = async () => {
  try {
    const userId = await getCurrentUserId();
    const key = keyForUser(userId);
    const raw = await AsyncStorage.getItem(key);
    const map = raw ? JSON.parse(raw) : {};
    const ids = Object.values(map).map(v => v?.notifeeId).filter(Boolean);
    for (const id of ids) {
      try { await notifee.cancelTriggerNotification(id); } catch {}
    }
    await AsyncStorage.removeItem(key);
  } catch {}
};

// Clear ALL locally scheduled notifications and state across any previously logged-in users on this device.
// Use this on login before rescheduling for the new user to ensure user-scoped schedules.
export const cancelAllLocalSchedulesAllUsers = async () => {
  try {
    // Cancel any native alarms stored by our module (best-effort)
    try { await NativeModules.AlarmScheduler?.cancelAll?.(); } catch {}

    // Read all keys and clear our namespaced maps
    const keys = await AsyncStorage.getAllKeys();
    const toRead = (keys || []).filter(k => k && k.startsWith('scheduledReminderNotificationsMap:'));
    for (const key of toRead) {
      try {
        const raw = await AsyncStorage.getItem(key);
        const map = raw ? JSON.parse(raw) : {};
        const ids = Object.values(map).map(v => v?.notifeeId).filter(Boolean);
        for (const id of ids) {
          try { await notifee.cancelTriggerNotification(id); } catch {}
        }
        await AsyncStorage.removeItem(key);
      } catch {}
    }

    // Safety: cancel all remaining scheduled notifications
    try { await notifee.cancelAllNotifications(); } catch {}
  } catch {}
};

