import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import Navbar from './components/Navbar';
import api, { API_BASE_URL } from './services/api';
import { cancelScheduledFor } from './services/notificationService';
import { Colors } from './constants/colors';

const TABS = ['Tasks', 'Meetings', 'Locations'];
const RANGES = ['Today', 'Week', 'Month'];

const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

const getRangeBounds = (now, range) => {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  if (range === 'Today') return { start: todayStart, end: todayEnd };
  if (range === 'Week') {
    // From today through the next 6 days (inclusive)
    const weekStart = new Date(todayStart);
    const weekEnd = new Date(todayStart); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23,59,59,999);
    return { start: weekStart, end: weekEnd };
  }
  // Month: from today through end of current month
  const monthStart = new Date(todayStart);
  const monthEnd = new Date(todayStart.getFullYear(), todayStart.getMonth() + 1, 0);
  monthEnd.setHours(23,59,59,999);
  return { start: monthStart, end: monthEnd };
};

const dateKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
};

const getByPath = (obj, path) => {
  if (!path) return undefined;
  if (path.indexOf('.') === -1) return obj?.[path];
  return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
};

const withinRange = (item, startField, endField, bounds) => {
  const startVal = getByPath(item, startField) || item.startTime;
  const endVal = getByPath(item, endField) || item.endTime || startVal;
  const s = new Date(startVal);
  const e = new Date(endVal);
  return s <= bounds.end && e >= bounds.start;
};

export default function PlannerScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('Tasks');
  const [range, setRange] = useState('Today');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [tasks, setTasks] = useState([]); // reminders tasks + google tasks
  const [meetings, setMeetings] = useState([]); // reminders meetings
  const [events, setEvents] = useState([]); // google calendar events
  const [locations, setLocations] = useState([]); // location reminders

  const openEventLink = async (url) => {
    try {
      if (!url) return;
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else if (WebBrowser && WebBrowser.openBrowserAsync) {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (e) {
      console.warn('Failed to open event link', e);
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Calendar items (events + tasks + meetings)
      let calData = { events: [], meetings: [], tasks: [] };
      try {
        const calResp = await api.get('/calendar/items');
        const cal = typeof calResp.data === 'string' ? JSON.parse(calResp.data) : calResp.data;
        calData = cal?.data || cal || {};
      } catch (err) {
        // Fallback to manual reminders if calendar/items fails
        console.warn('calendar/items failed; falling back to reminders. Details:', {
          status: err?.response?.status,
          data: err?.response?.data,
          message: err?.message,
        });
        try {
          const remResp = await api.get('/reminders', { params: { limit: 200 } });
          const rem = typeof remResp.data === 'string' ? JSON.parse(remResp.data) : remResp.data;
          const allRem = rem?.data || [];
          calData = {
            events: [],
            tasks: allRem.filter(r => r.type === 'Task').map(r => ({
              id: r._id,
              title: r.title,
              description: r.description,
              startTime: r.startDate,
              endTime: r.endDate || r.startDate,
              isCompleted: !!r.isCompleted,
              status: r.isCompleted ? 'completed' : 'pending',
              aiSuggested: !!r.aiSuggested,
            })),
            meetings: allRem.filter(r => r.type === 'Meeting').map(r => ({
              id: r._id,
              title: r.title,
              description: r.description,
              startTime: r.startDate,
              endTime: r.endDate || r.startDate,
              location: r.location?.name || '',
              aiSuggested: !!r.aiSuggested,
            })),
          };
        } catch (fallbackErr) {
          console.error('Fallback reminders fetch also failed:', {
            status: fallbackErr?.response?.status,
            data: fallbackErr?.response?.data,
            message: fallbackErr?.message,
          });
          throw err; // surface original error
        }
      }

      // Normalize calendar events so they have startTime/endTime/title/location/htmlLink
      const normalizedEvents = (calData.events || []).map(ev => {
        const isAllDay = !!ev?.start?.date && !ev?.start?.dateTime;
        const startISO = ev?.start?.dateTime || ev?.start?.date;
        const endISO = ev?.end?.dateTime || ev?.end?.date || ev?.start?.dateTime || ev?.start?.date;
        return {
          id: ev._id || ev.id || ev.googleEventId,
          title: ev.summary || ev.title || 'Event',
          startTime: startISO,
          endTime: endISO,
          location: ev.location || '',
          htmlLink: ev.htmlLink,
          allDay: isAllDay,
          __isEvent: true,
        };
      });
      setEvents(normalizedEvents);
      setMeetings(calData.meetings || []);
      setTasks(calData.tasks || []);

      // Locations: fetch reminders filtered by type
      try {
        const locResp = await api.get('/reminders', { params: { type: 'Location', limit: 100 } });
        const locData = typeof locResp.data === 'string' ? JSON.parse(locResp.data) : locResp.data;
        setLocations(locData.data || []);
      } catch (locErr) {
        console.warn('Failed to fetch locations:', {
          status: locErr?.response?.status,
          data: locErr?.response?.data,
          message: locErr?.message,
        });
        setLocations([]);
      }
    } catch (e) {
      console.error('Failed to load planner data', {
        status: e?.response?.status,
        data: e?.response?.data,
        message: e?.message,
      });
      setError(e?.response?.data?.message || 'Failed to load data. Please try again.');
      Alert.alert('Error', e?.response?.data?.message || 'Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const bounds = useMemo(() => getRangeBounds(new Date(), range), [range]);

  const grouped = useMemo(() => {
    const groupByDay = (list, startField = 'startTime', endField = 'endTime') => {
      const filtered = list.filter((it) => withinRange(it, startField, endField, bounds));
      const groups = {};
      for (const it of filtered) {
        const startVal = getByPath(it, startField) || it.startTime;
        const key = dateKey(startVal);
        if (!groups[key]) groups[key] = [];
        groups[key].push(it);
      }
      // sort each group by time
      Object.values(groups).forEach(arr => arr.sort((a,b) => {
        const av = getByPath(a, startField) || a.startTime;
        const bv = getByPath(b, startField) || b.startTime;
        return new Date(av) - new Date(bv);
      }));
      return groups;
    };

    return {
      tasks: groupByDay(tasks),
      meetings: groupByDay(meetings),
      events: groupByDay(events),
      // For locations, show all regardless of date range (no grouping used in UI)
      locationsAll: locations,
    };
  }, [tasks, meetings, events, locations, bounds]);

  const isToday = range === 'Today';

  const toggleTaskCompletion = async (reminder) => {
    try {
      const current = reminder.status === 'completed' || reminder.isCompleted;
      const id = reminder.id || reminder._id;
      if (!id) return;
      await api.put(`/reminders/${id}`, { isCompleted: !current });
      // refresh tasks by updating local state
      setTasks(prev => prev.map(t => {
        const tid = t.id || t._id;
        if (tid === id) {
          return { ...t, status: !current ? 'completed' : 'pending', isCompleted: !current };
        }
        return t;
      }));
    } catch (e) {
      console.error('Failed to toggle completion', e);
      Alert.alert('Error', 'Failed to update task');
    }
  };

  const deleteReminder = async (id) => {
    try {
      await api.delete(`/reminders/${id}`);
      // Cancel scheduled local notification for this reminder
      await cancelScheduledFor(String(id));
      // remove from all lists where present
      setTasks(prev => prev.filter(t => (t.id||t._id) !== id));
      setMeetings(prev => prev.filter(m => (m.id||m._id) !== id));
      setLocations(prev => prev.filter(l => (l._id||l.id) !== id));
    } catch (e) {
      console.error('Failed to delete reminder', e);
      Alert.alert('Error', 'Failed to delete');
    }
  };

  const editReminder = (reminder, typeHint) => {
    navigation.navigate('CreateReminder', { editReminder: reminder, type: typeHint });
  };

  const SectionHeader = ({ title }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );

  const ItemRow = ({ title, timeText, subtitle, right, onPress, completed, aiSuggested }) => (
    <TouchableOpacity style={styles.itemRow} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={styles.itemTimeBox}>
        <Text style={styles.itemTime}>{timeText}</Text>
      </View>
      <View style={styles.itemMain}>
        <View style={{ flexDirection:'row', alignItems:'center' }}>
          <Text style={[styles.itemTitle, completed && styles.itemTitleCompleted]} numberOfLines={1}>{title}</Text>
          {!!aiSuggested && <View style={styles.eventBadge}><Text style={styles.eventBadgeText}>AI Suggested</Text></View>}
        </View>
        {/* {!!subtitle && <Text style={styles.itemSub} numberOfLines={1}>{subtitle}</Text>} */}
      </View>
      <View style={styles.itemRight}>{right}</View>
    </TouchableOpacity>
  );

  const formatTimeShort = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2,'0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hh = ((h % 12) || 12);
    return `${hh}:${m} ${ampm}`;
  };

  const renderEmpty = (label) => (
    <View style={styles.emptyBox}>
      <Feather name="inbox" color={Colors.iconMuted} size={28} />
      <Text style={styles.emptyText}>No {label.toLowerCase()} in this range</Text>
    </View>
  );

const daysSorted = useCallback(
  (groups) => Object.keys(groups).sort((a, b) => new Date(b) - new Date(a)),
  []
);

  const renderTasksTab = () => {
    if (loading) return <Loading />;
    if (error) return <ErrorView onRetry={fetchData} message={error} />;

    if (isToday) {
      // Only show today's pending tasks and checkboxes
      const todayKey = dateKey(new Date());
      const allToday = grouped.tasks[todayKey] || tasks.filter(t => withinRange(t, 'startTime', 'endTime', bounds));
      const list = allToday.filter(t => !(t.status === 'completed' || t.isCompleted));
      if (!list.length) return renderEmpty('Tasks');
      return (
        <View>
          {list.map((t) => {
            const id = t.id || t._id;
            const checked = t.status === 'completed' || t.isCompleted;
            return (
              <ItemRow
                key={id}
                title={t.title || 'Task'}
                timeText={formatTimeShort(t.startTime)}
                completed={checked}
                aiSuggested={!!t.aiSuggested}
                right={
                  <View style={styles.actionsRow}>
                    <TouchableOpacity style={[styles.checkBox, checked && styles.checkBoxChecked]} onPress={() => toggleTaskCompletion(t)}>
                      {checked && <Feather name="check" size={16} color={Colors.btnText} />}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => editReminder(t, 'Task')} style={styles.iconBtn}>
                      <Feather name="edit-2" size={18} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteReminder(id)} style={styles.iconBtn}>
                      <Feather name="trash-2" size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                }
              />
            );
          })}
        </View>
      );
    }

    // Week/Month: grouped by day, no checkbox
    const groups = grouped.tasks;
    const keys = daysSorted(groups);
    if (!keys.length) return renderEmpty('Tasks');
    return (
      <View>
        {keys.map(k => (
          <View key={k}>
            <SectionHeader title={k} />
            {(groups[k] || []).map(t => (
              <ItemRow
                key={t.id || t._id}
                title={t.title || 'Task'}
                timeText={formatTimeShort(t.startTime)}
                completed={t.status === 'completed' || t.isCompleted}
                aiSuggested={!!t.aiSuggested}
                // subtitle={t.description}
                right={
                  <View style={styles.actionsRow}>
                    <TouchableOpacity onPress={() => editReminder(t, 'Task')} style={styles.iconBtn}>
                      <Feather name="edit-2" size={18} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteReminder(t.id || t._id)} style={styles.iconBtn}>
                      <Feather name="trash-2" size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                }
              />
            ))}
          </View>
        ))}
      </View>
    );
  };

  const renderMeetingsTab = () => {
    if (loading) return <Loading />;
    if (error) return <ErrorView onRetry={fetchData} message={error} />;

    // merge meetings and events for display
    const mergedGroups = {};
    const mGroups = grouped.meetings;
    const eGroups = grouped.events;
    const addAll = (src, isEvent) => {
      for (const k of Object.keys(src)) {
        if (!mergedGroups[k]) mergedGroups[k] = [];
        for (const item of src[k]) {
          mergedGroups[k].push({ ...item, __isEvent: !!isEvent });
        }
      }
    };
    addAll(mGroups, false);
    addAll(eGroups, true);

    const keys = daysSorted(mergedGroups);
    if (!keys.length) return renderEmpty('Meetings');

    return (
      <View>
        {keys.map(k => (
          <View key={k}>
            <SectionHeader title={k} />
            {(mergedGroups[k] || []).sort((a,b)=> new Date(a.startTime||a.start?.dateTime) - new Date(b.startTime||b.start?.dateTime)).map(item => (
              <ItemRow
                key={item.id || item._id || item.googleEventId || Math.random()}
                title={item.title || item.summary || 'Event'}
                timeText={formatTimeShort(item.startTime || item.start?.dateTime)}
                // subtitle={item.location || ''}
                onPress={item.__isEvent && item.htmlLink ? () => openEventLink(item.htmlLink) : undefined}
                right={!item.__isEvent ? (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity onPress={() => editReminder(item, 'Meeting')} style={styles.iconBtn}>
                      <Feather name="edit-2" size={18} color="#D4AF37" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteReminder(item.id || item._id)} style={styles.iconBtn}>
                      <Feather name="trash-2" size={18} color="#FF6B6B" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.eventBadge}><Text style={styles.eventBadgeText}>Calendar</Text></View>
                )}
              />
            ))}
          </View>
        ))}
      </View>
    );
  };

const renderLocationsTab = () => {
  if (loading) return <Loading />;
  if (error) return <ErrorView onRetry={fetchData} message={error} />;

  const list = grouped.locationsAll || [];
  if (!list.length) {
    return (
      <View style={styles.emptyBox}>
        <Feather name="map-pin" color={Colors.iconMuted} size={28} />
        <Text style={styles.emptyText}>No saved locations yet</Text>
      </View>
    );
  }

  return (
    <View>
      {list
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) // newest first
        .map((loc) => (
        <ItemRow
          key={loc._id || loc.id}
          title={loc.title || (loc.location?.name || 'Location')}
          timeText={loc.startDate ? formatTimeShort(loc.startDate) : ''}
          // subtitle={loc.location?.name}
          right={
            <View style={styles.actionsRow}>
              <TouchableOpacity onPress={() => editReminder(loc, 'Location')} style={styles.iconBtn}>
                <Feather name="edit-2" size={18} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteReminder(loc._id || loc.id)} style={styles.iconBtn}>
                <Feather name="trash-2" size={18} color={Colors.danger} />
              </TouchableOpacity>
            </View>
          }
        />
      ))}
    </View>
  );
};


  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.backgroundStatus} />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="chevron-left" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Planner</Text>
          <TouchableOpacity onPress={() => { if (!loading) fetchData(); }} disabled={loading} style={{ opacity: loading ? 0.5 : 1 }}>
            <Feather name="refresh-ccw" size={20} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Tabs & Filter */}
        <View style={styles.controlsRow}>
          <View style={styles.tabsContainer}>
            {TABS.map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabButton, activeTab === tab && styles.activeTabButton]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
                <View style={[styles.tabUnderline, activeTab === tab && styles.tabUnderlineActive]} />
              </TouchableOpacity>
            ))}
          </View>
{activeTab !== 'Locations' && (
          <View style={styles.rangeContainer}>
            {RANGES.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.rangeButton, range === r && styles.activeRangeButton]}
                onPress={() => setRange(r)}
              >
                <Text style={[styles.rangeText, range === r && styles.activeRangeText]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
)}
          <View style={styles.separator} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollBody}>
          {activeTab === 'Tasks' && renderTasksTab()}
          {activeTab === 'Meetings' && renderMeetingsTab()}
          {activeTab === 'Locations' && renderLocationsTab()}
        </ScrollView>
      </View>
      <Navbar />
    </SafeAreaView>
  );
}

function Loading() {
  return (
    <View style={styles.loadingBox}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.loadingText}>Loading...</Text>
    </View>
  );
}

function ErrorView({ message, onRetry }) {
  return (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{message || 'Something went wrong'}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.background,
    paddingTop:35,
  },
  headerTitle: { color: Colors.text, fontSize: 20, fontWeight: 'bold' },

  controlsRow: { paddingHorizontal: 16 },
  separator: { height: 1, backgroundColor: Colors.border, marginTop: 8, marginBottom: 8, borderRadius: 1 },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  // Remove rectangle style for active tab; we keep underline and text color only
  activeTabButton: { backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent' },
  tabText: { color: Colors.textMuted, fontWeight: '600' },
  activeTabText: { color: Colors.text },
  tabUnderline: { height: 2, width: '60%', backgroundColor: 'transparent', marginTop: 6, borderRadius: 1 },
  tabUnderlineActive: { backgroundColor: Colors.primary },

  rangeContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  rangeButton: {
    flex: 1,
    marginRight: 8,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  activeRangeButton: { borderWidth: 1, borderColor: Colors.primary, backgroundColor: Colors.surface },
  rangeText: { color: Colors.textMuted, fontWeight: '600' },
  activeRangeText: { color: Colors.text },

  scrollBody: { padding: 16, paddingBottom: 180 },

  sectionHeader: { paddingVertical: 6, paddingHorizontal: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 8, marginTop: 8, marginBottom: 6 },
  sectionHeaderText: { color: Colors.primary, fontWeight: '700' },

  itemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, padding: 12, borderRadius: 12, marginVertical: 6 },
  itemTimeBox: { width: 80 },
  itemTime: { color: Colors.primary, fontWeight: '600' },
  itemMain: { flex: 1, marginLeft: 12 },
  itemTitle: { color: Colors.text, fontSize: 16, fontWeight: '500' },
  itemTitleCompleted: { textDecorationLine: 'line-through', color: Colors.textSubtle },
  itemSub: { color: Colors.textSubtle, fontSize: 12, marginTop: 2 },
  itemRight: { paddingLeft: 8, flexDirection: 'row', alignItems: 'center' },

  actionsRow: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  checkBox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: 8, backgroundColor: 'transparent' },
  checkBoxChecked: { backgroundColor: Colors.primary },

  eventBadge: { backgroundColor: Colors.badge, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  eventBadgeText: { color: Colors.textMuted, fontSize: 12 },
  aiBadge: { marginLeft: 8, backgroundColor: Colors.badge, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  aiBadgeText: { color: Colors.textMuted, fontSize: 10, fontWeight: '700' },

  emptyBox: { alignItems: 'center', justifyContent: 'center', padding: 40, opacity: 0.7 },
  emptyText: { color: Colors.text, marginTop: 8 },

  loadingBox: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingText: { color: Colors.text, marginTop: 10 },

  errorBox: { alignItems: 'center', padding: 20 },
  errorText: { color: Colors.errorText, marginBottom: 12, textAlign: 'center' },
  retryBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: Colors.black, fontWeight: '700' },
});
