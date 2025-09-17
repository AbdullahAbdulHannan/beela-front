import * as Notifications from 'expo-notifications';
import notifee, { AndroidImportance, TimestampTrigger, TriggerType, AndroidColor } from '@notifee/react-native';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureReminderTTS, getReminders, getCalendarEvents } from './api';

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
let geofenceTaskRegistered = false;

// Storage keys for scheduled notification IDs per reminder
const SCHEDULED_MAP_KEY = 'scheduledReminderNotificationsMap';

async function getScheduledMap() {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULED_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function setScheduledMap(map) {
  try {
    await AsyncStorage.setItem(SCHEDULED_MAP_KEY, JSON.stringify(map || {}));
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
      await Location.requestBackgroundPermissionsAsync();
    } catch {}
  } catch (e) {
    console.warn('[location] init failed', e);
  }
};

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
    Notifications.addNotificationReceivedListener(async (notification) => {
      try {
        const data = notification?.request?.content?.data || {};
        if (data.type === 'reminder_speech' && data.localAudioPath) {
          // Play saved audio when app is in foreground
          await playAudioFile(data.localAudioPath);
        }
      } catch (e) {
        console.warn('Error handling foreground notification', e);
      }
    });

    Notifications.addNotificationResponseReceivedListener(async (response) => {
      try {
        const data = response?.notification?.request?.content?.data || {};
        if (data.type === 'reminder_speech' && data.localAudioPath) {
          // When user taps from background/closed, play saved audio
          await playAudioFile(data.localAudioPath);
        }
      } catch (e) {
        console.warn('Error handling notification response', e);
      }
    });

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
}) => {
  try {
    if (!startDateISO) return { scheduled: false, reason: 'No start date' };
    console.log('[notify] schedule start', { startDateISO });
    // Read preferred lead minutes
    let leadMinutes = 5;
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

    // Compute display minutes from trigger to start to keep message accurate
    const displayMinutes = Math.round((start.getTime() - triggerMs) / (60 * 1000));
    const body = displayMinutes < 1
      ? `Hey ${username}, you have ${meetingName} in less than a minute.`
      : `Hey ${username}, you have ${meetingName} in ${displayMinutes} minutes.`;

    // Ensure TTS exists with fixedMinutes so voice matches the text
    let effectiveTextHash = textHash || null;
    try {
      if (reminderId) {
        const ensureRes = await ensureReminderTTS(reminderId, { fixedMinutes: displayMinutes });
        effectiveTextHash = ensureRes?.tts?.textHash || effectiveTextHash;
      }
    } catch {}

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

    // 2) Schedule the native alarm to auto-play audio in background/killed
    try {
      await NativeModules.AlarmScheduler?.schedule(triggerMs, String(reminderId), localAudioPath || '');
    } catch (e) {
      console.warn('[alarm] schedule failed', e?.message);
    }

    // Optionally also schedule with Expo as a fallback when app is in foreground only
    let expoId = null;
    try {
      expoId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Upcoming Reminder',
          body,
          sound: 'default',
          data: {
            type: 'reminder_speech',
            reminderId: reminderId || null,
            startDateISO,
            localAudioPath: localAudioPath || null,
          },
        },
        trigger: new Date(triggerMs),
      });
    } catch {}

    console.log('[notify] scheduled notifeeId', notifeeId, 'expoId', expoId);
    if (reminderId) {
      await setScheduledFor(String(reminderId), { notifeeId, expoId });
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

    // Determine current lead minutes setting to use as fixedMinutes
    let leadMinutes = 5;
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

    const items = [
      ...reminders.filter(r => r.type === 'Task' || r.type === 'Meeting').map(r => ({
        id: r._id || r.id,
        title: r.title || 'your meeting',
        startISO: r.startDate || r.startTime,
      })),
      ...calendarEvents.map(e => ({ id: e.id, title: e.title, startISO: e.startDate }))
    ];

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
            const ensureRes = await ensureReminderTTS(id, { fixedMinutes: leadMinutes });
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
    await AsyncStorage.removeItem(SCHEDULED_MAP_KEY);
    await AsyncStorage.removeItem('scheduledCalendarEvents');
  } catch {}
};
