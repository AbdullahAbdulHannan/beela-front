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
  Platform,
} from 'react-native';
// Replaced Feather with Ionicons for the new UI look
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import Navbar from './components/Navbar';
import api, { API_BASE_URL } from './services/api';
import { cancelScheduledFor } from './services/notificationService';
import { Colors } from './constants/colors';
import SuccessModal from './components/MessageModal';

// --- NEW UI CONSTANTS ---
const PRIMARY_COLOR = '#4668FF'; // Replaced green (#00C49F) with user-specified blue
const TEXT_COLOR = '#333';
const LIGHT_BACKGROUND = '#F9FAFB'; // Based on new safeArea style
const CARD_BACKGROUND = '#FFF';
const TEXT_MUTED_COLOR = '#777';
const DANGER_COLOR = '#F44336';
const MUTED_ICON_COLOR = '#777';
const SOFT_SHADOW = {
  ...Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
    },
    android: {
      elevation: 8,
    },
  }),
};
// --- END NEW UI CONSTANTS ---


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
  return path.split('.reduce((o, k) => (o ? o[k] : undefined), obj)');
};

const withinRange = (item, startField, endField, bounds) => {
  const startVal = getByPath(item, startField) || item.startTime;
  const endVal = getByPath(item, endField) || item.endTime || startVal;
  const s = new Date(startVal);
  const e = new Date(endVal);
  return s <= bounds.end && e >= bounds.start;
};

// --- Segmented Control for Tabs (NEW COMPONENT) ---
const PlannerTabs = ({ activeTab, setActiveTab, range, setRange }) => {
  return (
    <View style={styles.controlsContainer}>
      {/* Tabs */}
      <View style={styles.tabBarContainer}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabItem, activeTab === tab && styles.activeTabItem]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Range Filter - Only show for Tasks and Meetings */}
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
    </View>
  );
};
// --- END PlannerTabs ---


export default function PlannerScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('Tasks');
  const [range, setRange] = useState('Today');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [tasks, setTasks] = useState([]); // reminders tasks + google tasks
  const [meetings, setMeetings] = useState([]); // reminders meetings
  const [events, setEvents] = useState([]); // google calendar events
  const [locations, setLocations] = useState([]); // location reminders
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

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

  // Compute the next occurrence for a routine task (returns ISO string or null)
  const computeNextRoutineISO = (r) => {
    try {
      const fixed = r?.scheduleTime?.fixedTime || null; // 'HH:MM'
      if (!fixed) return null;
      const [hh, mm] = String(fixed).split(':').map(x => parseInt(x,10));
      const days = Array.isArray(r?.scheduleDays) ? r.scheduleDays : [];
      const now = new Date();
      for (let i = 0; i < 14; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        d.setHours(isNaN(hh)?9:hh, isNaN(mm)?0:mm, 0, 0);
        const ok = days.length === 0 || days.includes(d.getDay());
        if (ok && d.getTime() > now.getTime()) return d.toISOString();
      }
      return null;
    } catch { return null; }
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
            tasks: allRem.filter(r => r.type === 'Task').map(r => {
              const routine = r.scheduleType === 'routine' && r.isManualSchedule;
              const nextISO = routine ? computeNextRoutineISO(r) : (r.startDate || null);
              return ({
                id: r._id,
                title: r.title,
                description: r.description,
                startTime: nextISO,
                endTime: r.endDate || nextISO,
                isCompleted: !!r.isCompleted,
                status: r.isCompleted ? 'completed' : 'pending',
                aiSuggested: !!r.aiSuggested,
              });
            }),
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
      // Ensure routine tasks have a startTime computed for planner visibility
      const normalizedTasks = (calData.tasks || []).map(t => {
        try {
          const routine = (t.isManualSchedule && t.scheduleType === 'routine') || false;
          const nextISO = routine ? computeNextRoutineISO(t) : (t.startTime || t.startDate || null);
          return {
            ...t,
            startTime: nextISO,
            endTime: t.endTime || nextISO,
          };
        } catch { return t; }
      });
      setTasks(normalizedTasks);

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
      const msg = e?.response?.data?.message || 'Failed to load data. Please try again.';
      setError(msg);
      setModalMessage(msg);
      setModalVisible(true);
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
      setModalMessage('Failed to update task');
      setModalVisible(true);
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
      setModalMessage('Failed to delete');
      setModalVisible(true);
    }
  };

  const editReminder = (reminder, typeHint) => {
    navigation.navigate('CreateReminder', { editReminder: reminder, type: typeHint });
  };

  // --- Re-implementing ItemRow for the new UI look and functionality ---
  const ItemRow = ({ title, timeText, right, onPress, completed, aiSuggested, isEvent, isLocation }) => {
    const iconName = completed ? "checkmark-circle" : "radio-button-off-outline";
    const titleStyle = [styles.itemName, completed && styles.itemNameCompleted];
    const leftContent = isLocation ? (
      <View style={styles.locationLeft}>
        <Ionicons name="location-outline" size={24} color={PRIMARY_COLOR} style={styles.locationIcon} />
        <Text style={titleStyle} numberOfLines={1}>{title}</Text>
      </View>
    ) : (
      <View style={styles.itemLeft}>
        <Text style={styles.itemTime}>{timeText}</Text>
        <Text style={titleStyle} numberOfLines={1}>{title}</Text>
        {!!aiSuggested && <View style={styles.aiBadge}><Text style={styles.aiBadgeText}>AI</Text></View>}
      </View>
    );

    return (
      <TouchableOpacity 
        style={[styles.itemCard, SOFT_SHADOW]} 
        onPress={onPress} 
        activeOpacity={onPress ? 0.7 : 1}
      >
        {leftContent}
        <View style={styles.itemRight}>
          {right}
          {isEvent && <View style={styles.eventBadge}><Text style={styles.eventBadgeText}>Calendar</Text></View>}
        </View>
      </TouchableOpacity>
    );
  };
  // --- END ItemRow ---

  // Simple SectionHeader component to replace missing import
  const SectionHeader = ({ title }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
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
      <Ionicons name={label === 'Tasks' ? "checkmark-circle-outline" : label === 'Meetings' ? "calendar-outline" : "location-outline"} 
        color={TEXT_MUTED_COLOR} size={32} />
      <Text style={styles.emptyText}>No {label.toLowerCase()} in this range.</Text>
    </View>
  );

const daysSorted = useCallback(
  // The new UI uses a descending sort to show newest first for locations. 
  // For tasks/meetings, ascending is typically better (future items first).
  // Given the old code sorted ascending (a-b), I'll preserve that for tasks/meetings 
  // but use descending for locations per the new UI's logic.
  (groups, isAscending = true) => Object.keys(groups).sort((a, b) => isAscending ? new Date(a) - new Date(b) : new Date(b) - new Date(a)),
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
                    <TouchableOpacity style={styles.actionButton} onPress={() => toggleTaskCompletion(t)}>
                       <Ionicons name={checked ? "checkmark-circle" : "radio-button-off-outline"} size={24} color={checked ? PRIMARY_COLOR : TEXT_MUTED_COLOR} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => editReminder(t, 'Task')} style={styles.actionButton}>
                      <Ionicons name="create-outline" size={20} color={MUTED_ICON_COLOR} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteReminder(id)} style={styles.actionButton}>
                      <Ionicons name="trash-outline" size={20} color={DANGER_COLOR} />
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
    // Sorting: Tasks should be ascending time/day (nearest first)
    const keys = daysSorted(groups, true); 
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
                right={
                  <View style={styles.actionsRow}>
                    {/* No checkbox for week/month view as per original code's logic */}
                    <TouchableOpacity onPress={() => editReminder(t, 'Task')} style={styles.actionButton}>
                      <Ionicons name="create-outline" size={20} color={MUTED_ICON_COLOR} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteReminder(t.id || t._id)} style={styles.actionButton}>
                      <Ionicons name="trash-outline" size={20} color={DANGER_COLOR} />
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

    // Sorting: Meetings should be ascending time/day (nearest first)
    const keys = daysSorted(mergedGroups, true); 
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
                onPress={item.__isEvent && item.htmlLink ? () => openEventLink(item.htmlLink) : undefined}
                isEvent={item.__isEvent}
                right={!item.__isEvent ? (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity onPress={() => editReminder(item, 'Meeting')} style={styles.actionButton}>
                      <Ionicons name="create-outline" size={20} color={MUTED_ICON_COLOR} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteReminder(item.id || item._id)} style={styles.actionButton}>
                      <Ionicons name="trash-outline" size={20} color={DANGER_COLOR} />
                    </TouchableOpacity>
                  </View>
                ) : null}
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
        <Ionicons name="map-pin-outline" color={TEXT_MUTED_COLOR} size={32} />
        <Text style={styles.emptyText}>No saved locations yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.locationsList}>
      {/* Sorting: Locations should be newest first (descending createdAt) */}
      {list
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) 
        .map((loc) => (
        <ItemRow
          key={loc._id || loc.id}
          title={loc.title || (loc.location?.name || 'Location')}
          timeText={loc.startDate ? formatTimeShort(loc.startDate) : ''}
          isLocation={true} // special flag to render the location style
          right={
            <View style={styles.locationActions}>
              <TouchableOpacity onPress={() => editReminder(loc, 'Location')} style={styles.actionButton}>
                <Ionicons name="create-outline" size={20} color={MUTED_ICON_COLOR} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteReminder(loc._id || loc.id)} style={styles.actionButton}>
                <Ionicons name="trash-outline" size={20} color={DANGER_COLOR} />
              </TouchableOpacity>
            </View>
          }
        />
      ))}
      <Text style={styles.listFooter}>All locations listed.</Text>
    </View>
  );
};


  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={CARD_BACKGROUND} />
      <View style={styles.container}>
        {/* Header (Re-styled to match the new UI's screenHeader) */}
        <View style={styles.screenHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back-outline" size={28} color={TEXT_COLOR} />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Planner</Text>
          <TouchableOpacity onPress={() => { if (!loading) fetchData(); }} disabled={loading} style={{ opacity: loading ? 0.5 : 1 }}>
            <Ionicons name="refresh-circle-outline" size={28} color={PRIMARY_COLOR} />
          </TouchableOpacity>
        </View>

        {/* Tabs & Filter (Using the new PlannerTabs component) */}
        <PlannerTabs activeTab={activeTab} setActiveTab={setActiveTab} range={range} setRange={setRange} />

        <ScrollView contentContainerStyle={styles.scrollViewContent}>
          {activeTab === 'Tasks' && renderTasksTab()}
          {activeTab === 'Meetings' && renderMeetingsTab()}
          {activeTab === 'Locations' && renderLocationsTab()}
          {/* Add extra padding at the bottom of the scroll view to prevent Navbar overlap */}
          <View style={{height: 100}} /> 
        </ScrollView>
      </View>
      <Navbar />
      <SuccessModal
        visible={modalVisible}
        message={modalMessage}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

function Loading() {
  return (
    <View style={styles.loadingBox}>
      <ActivityIndicator size="large" color={PRIMARY_COLOR} />
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

// --- NEW STYLES ---
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: LIGHT_BACKGROUND,
  },
  container: { flex: 1 },
  
  // Header Style (screenHeader from new UI)
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingTop:30,
    backgroundColor: CARD_BACKGROUND,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT_COLOR,
  },

  // Tab & Range Controls Container
  controlsContainer: {
    backgroundColor: CARD_BACKGROUND,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: '#EEE',
    ...SOFT_SHADOW // Added shadow to mimic the card feel of the header
  },
  
  // Tab Bar (Segmented Control)
  tabBarContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
  },
  tabItem: {
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderColor: 'transparent',
    minWidth: 80, // Ensure tabs have a decent minimum width
    alignItems: 'center',
  },
  activeTabItem: {
    borderColor: PRIMARY_COLOR,
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_MUTED_COLOR,
  },
  activeTabText: {
    color: PRIMARY_COLOR,
  },

  // Range Filter
  rangeContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    paddingHorizontal: 20, 
    marginTop: 10 
  },
  rangeButton: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: LIGHT_BACKGROUND,
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  activeRangeButton: { 
    backgroundColor: PRIMARY_COLOR,
    // Note: Removed borderWidth/borderColor to match the solid background style from the new UI
  },
  rangeText: { color: TEXT_MUTED_COLOR, fontWeight: '600', fontSize: 13 },
  activeRangeText: { color: CARD_BACKGROUND }, // White text on blue background

  // Scroll View Content
  scrollViewContent: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 20,
  },

  // Section Header (Kept simple, similar to original)
  sectionHeader: { 
    paddingVertical: 8, 
    paddingHorizontal: 0, 
    marginTop: 15, 
    marginBottom: 5,
    borderBottomWidth: 1,
    borderColor: '#E0E0E0',
  },
  sectionHeaderText: { 
    color: TEXT_COLOR, 
    fontWeight: '700', 
    fontSize: 14 
  },

  // Item Card (Task/Meeting/Event)
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CARD_BACKGROUND,
    padding: 15,
    borderRadius: 15,
    marginBottom: 10,
    ...SOFT_SHADOW
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  itemTime: { 
    fontSize: 14, 
    fontWeight: '600', 
    color: PRIMARY_COLOR, 
    width: 60 
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_COLOR,
    flexShrink: 1,
    paddingRight: 10,
  },
  itemNameCompleted: {
    textDecorationLine: 'line-through',
    color: TEXT_MUTED_COLOR,
  },

  // Location Card Specific Styles
  locationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationIcon: {
    marginRight: 15,
  },
  locationActions: { // Same as actionsRow but named for clarity in the location tab
    flexDirection: 'row',
    alignItems: 'center',
  },

  itemRight: { 
    paddingLeft: 8, 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  actionsRow: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  actionButton: {
    marginLeft: 10,
    padding: 5,
  },
  
  // Badges
  eventBadge: { 
    backgroundColor: '#F0F0F0', // Muted background for badges
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    borderRadius: 8,
    marginLeft: 8, 
  },
  eventBadgeText: { 
    color: TEXT_MUTED_COLOR, 
    fontSize: 12, 
    fontWeight: '600' 
  },
  aiBadge: { 
    marginLeft: 8, 
    backgroundColor: PRIMARY_COLOR, 
    paddingHorizontal: 8, 
    paddingVertical: 2, 
    borderRadius: 6,
  },
  aiBadgeText: { 
    color: CARD_BACKGROUND, 
    fontSize: 10, 
    fontWeight: '700' 
  },

  // Empty State & Footer
  locationsList: {}, // List container for locations
  listFooter: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
    fontSize: 12,
  },
  emptyBox: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 40, 
    marginTop: 30,
    backgroundColor: CARD_BACKGROUND,
    borderRadius: 15,
    ...SOFT_SHADOW
  },
  emptyText: { 
    color: TEXT_MUTED_COLOR, 
    marginTop: 15, 
    fontSize: 16, 
    fontWeight: '500' 
  },

  // Loading & Error States
  loadingBox: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingText: { color: TEXT_COLOR, marginTop: 10, fontSize: 16 },

  errorBox: { 
    alignItems: 'center', 
    padding: 20, 
    backgroundColor: CARD_BACKGROUND, 
    borderRadius: 15, 
    marginTop: 30,
    ...SOFT_SHADOW
  },
  errorText: { color: DANGER_COLOR, marginBottom: 12, textAlign: 'center', fontSize: 16 },
  retryBtn: { 
    backgroundColor: PRIMARY_COLOR, 
    paddingHorizontal: 20, 
    paddingVertical: 10, 
    borderRadius: 10 
  },
  retryText: { color: CARD_BACKGROUND, fontWeight: '700' },
});