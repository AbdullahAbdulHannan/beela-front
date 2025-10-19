import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  SafeAreaView,
  ScrollView,
  Platform,
  StatusBar,
  NativeModules,
  Dimensions, 
  Animated, 
  Image,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'; 
import { Colors } from './constants/colors';
import Navbar from './components/Navbar';
import { useOnboardingTarget } from './components/OnboardingProvider';
import api, { API_BASE_URL } from './services/api';
import SuccessModal from './components/MessageModal';

// Get screen width for responsive card design
const { width } = Dimensions.get('window');

// --- Component: PressableAnimated (for smooth scale animation on touch) ---
const PressableAnimated = ({ children, style, onPress, onLongPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95, // Scale down by 5%
      useNativeDriver: true,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1, // Return to original size
      friction: 5, // Smoothness
      tension: 40, // Smoothness
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onLongPress={onLongPress}
    >
      <Animated.View style={[style, { transform: [{ scale: scaleAnim }] }]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

// --- Global Constants and Helpers ---

// REMOVED: allowedFeatherIcons set as it's no longer used for validation.
// Icon component is now simpler: use the provided name or 'star' fallback.
const ItemIcon = ({ iconName, size=22, color=Colors.primary }) => {
  // Trust DB-provided names. Fallback to 'star' only if iconName is empty/null/undefined.
  const name = iconName ;
  return <Feather name={name} size={size} color={color} />;
};

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Updated: 20 Random, pleasant primary colors for icons/accents
const accentColors = [
  '#2ecc71', // Emerald
  '#3498db', // Peter River
  '#9b59b6', // Amethyst
  '#f1c40f', // Sun Flower
  '#e67e22', // Carrot
  '#e74c3c', // Alizarin
  '#1abc9c', // Turquoise
  '#34495e', // Wet Asphalt
  '#f39c12', // Orange
  '#d35400', // Pumpkin
  '#c0392b', // Pomegranate
  '#2980b9', // Belize Hole
  '#8e44ad', // Wisteria
  '#27ae60', // Nephritis
  '#7f8c8d', // Asbestos
  '#4c9c81', // Forest Green
  '#7f4a88', // Royal Purple
  '#ff6b6b', // Pastel Red
  '#2d98da', // Vivid Blue
  '#f7a73a', // Goldenrod
];

// Updated: 20 Random, pleasant light background colors for cards
const cardBgColors = [
  '#E0F7FA', // Cyan light
  '#E8EAF6', // Indigo light
  '#F3E5F5', // Purple light
  '#FFFDE7', // Yellow light
  '#FCE4EC', // Pink light
  '#E8F5E9', // Green light
  '#FBE9E7', // Deep Orange light
  '#E3F2FD', // Blue light
  '#F9FBE7', // Lime light
  '#EFEBE9', // Brown light
  '#F3F3F3', // Gray light
  '#F4FDFF', // Very light blue
  '#FEF7FF', // Very light purple
  '#FFFBF2', // Very light orange
  '#F0FCF0', // Very light green
  '#FFFBEB', // Light Gold
  '#E1F5FE', // Light Sky Blue
  '#F8F3FF', // Light Violet
  '#F0FDF4', // Mint Cream
  '#FFE9E9', // Light Peach
];


const getRandIndex = (arr) => Math.floor(Math.random() * arr.length);

/**
 * UPDATED: Uses the same random index for both accent and background
 * to ensure color pairing consistency on each card.
 */
const getRandColorCombo = () => {
    const index = getRandIndex(accentColors); // Select ONE random index
    return {
        accent: accentColors[index],          // Use index for accent
        background: cardBgColors[index],      // Use SAME index for background
    };
};

// Memoize color assignments to keep the same card the same color
const colorCache = {};
const getMemoizedColorCombo = (id) => {
    const key = id?.toString?.() || 'no-id';
    if (!colorCache[key]) {
        colorCache[key] = getRandColorCombo();
    }
    return colorCache[key];
};

// Ensure a stable, unique seed per item so items without ids don't all share 'no-id'
const getColorSeed = (item) => {
  // Prefer explicit identifiers
  const explicitId = item?.id || item?._id || item?.googleEventId || item?.googleId;
  if (explicitId) return explicitId;
  // Build a deterministic fallback from key fields
  const title = item?.title || item?.name || 'item';
  const start = item?.startTime || item?.startDate || '';
  const end = item?.endTime || item?.endDate || '';
  const location = typeof item?.location === 'string' ? item.location : (item?.location?.name || '');
  return `${title}|${start}|${end}|${location}`;
};

/**
 * Calculates time left until the task starts/ends and progress toward completion.
 * Interpretation: Progress is time elapsed since start time towards end time.
 * If start time is in the future, progress is 0.
 */
const getTimeLeftAndProgress = (startTimeISO, endTimeISO, isCompleted) => {
  if (isCompleted) {
    return { timeLeftText: 'Completed', progress: 100 };
  }

  const startDate = new Date(startTimeISO);
  const endDate = endTimeISO ? new Date(endTimeISO) : null;
  const now = new Date();

  // If task is in the future, calculate time until start date
  if (startDate > now) {
    const diffMs = startDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const timeLeftText = diffDays === 0 ? 'Today' : `${diffDays} day${diffDays !== 1 ? 's' : ''} left`;
    return { timeLeftText, progress: 0 };
  }

  // Task is now or in the past
  if (!endDate || endDate <= startDate) {
    // If no explicit end time or end time is same as start time, assume it's a point-in-time event.
    // If it's passed, call it 100%. If it's now, call it 50% "In Progress".
    if (startDate < now) {
        return { timeLeftText: 'Overdue', progress: 100 };
    }
    return { timeLeftText: 'In Progress', progress: 50 };
  }

  // Task is currently in progress (startDate < now < endDate)
  const totalDuration = endDate.getTime() - startDate.getTime();
  const elapsedDuration = now.getTime() - startDate.getTime();
  
  let progress = totalDuration > 0 ? (elapsedDuration / totalDuration) * 100 : 100;
  progress = Math.min(100, Math.max(0, progress));

  const diffMs = endDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const timeLeftText = diffDays === 0 ? 'Today' : `${diffDays} day${diffDays !== 1 ? 's' : ''} left`;

  return { timeLeftText, progress: Math.round(progress) };
};

// Simple simulated ProgressBar for React Native
const ProgressBar = ({ progress, color }) => (
    <View style={cardStyles.progressBarBackground}>
        <View style={[cardStyles.progressBarFill, { width: `${progress}%`, backgroundColor: color }]} />
    </View>
);

// Compute next occurrence ISO for routine tasks like PlannerScreen
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
      if (ok) return d.toISOString();
    }
    return null;
  } catch { return null; }
};

// --- Main Component ---

const UserDashboard = () => {
  const [activeTab, setActiveTab] = useState('Notifications');
  const [isSyncing, setIsSyncing] = useState(false);
  const [batteryIgnored, setBatteryIgnored] = useState(true);
  const [isHorizontal, setIsHorizontal] = useState(true); // Toggles card view
  const today = useMemo(() => new Date(), []);
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState({
    date: today.getDate(),
    month: today.getMonth(),
    year: today.getFullYear(),
  });
  const [isCalendarExpanded, setIsCalendarExpanded] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [calendarItems, setCalendarItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const navigation = useNavigation();

  // Onboarding targets
  const headerProfileRef = useOnboardingTarget('header-profile');

  // Helper function to create a Date object from the state date
  const dateFromState = (dState) => new Date(dState.year, dState.month, dState.date);

  const isToday = (d) => d.date === today.getDate() && d.month === today.getMonth() && d.year === today.getFullYear();
  const isSelected = (d) => d.date === selectedDate.date && d.month === selectedDate.month && d.year === selectedDate.year;

  // --- Calendar Logic Updates ---

  const getMonthDates = (month, year) => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const numDays = lastDayOfMonth.getDate();
    const firstDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sunday, 6 for Saturday

    const dates = [];

    // Add previous month's dates to fill the first row
    const prevMonth = new Date(year, month, 0);
    const prevMonthDays = prevMonth.getDate();
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
        dates.push({
            date: prevMonthDays - i,
            month: prevMonth.getMonth(),
            year: prevMonth.getFullYear(),
            isCurrentMonth: false,
        });
    }

    // Add current month's dates
    for (let i = 1; i <= numDays; i++) {
        dates.push({
            date: i,
            month: month,
            year: year,
            isCurrentMonth: true,
        });
    }

    // Add next month's dates to complete the week rows
    const nextMonth = new Date(year, month + 1, 1);
    // Fill up to 6 rows (42 cells)
    for (let i = 1; dates.length < 42; i++) {
        if (dates.length % 7 === 0 && dates.length >= 35) break; // Stop after 5th row if it's full
        dates.push({
            date: i,
            month: nextMonth.getMonth(),
            year: nextMonth.getFullYear(),
            isCurrentMonth: false,
        });
    }

    // Trim to 5 or 6 weeks (35 or 42 cells)
    return dates.slice(0, Math.ceil(dates.length / 7) * 7);
  };
  
  const allMonthDates = useMemo(() => getMonthDates(currentMonth, currentYear), [currentMonth, currentYear]);

  // Use selectedDate for current week logic
  const currentWeek = useMemo(() => {
    const curr = dateFromState(selectedDate);
    const first = curr.getDate() - curr.getDay(); // Start of the week (Sunday)
    const week = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(curr);
      day.setDate(first + i);
      week.push({
        date: day.getDate(),
        month: day.getMonth(),
        year: day.getFullYear(),
        dayOfWeek: dayNames[i], // For the new UI
      });
    }
    return week;
  }, [selectedDate]);

  // --- End Calendar Logic Updates ---

  const refreshPermissions = async () => {
    try {
      if (Platform.OS !== 'android') return;
      const ignoring = await NativeModules?.AlarmScheduler?.isIgnoringBatteryOptimizations?.();
      setBatteryIgnored(Boolean(ignoring));
    } catch {
      setBatteryIgnored(false);
    }
  };

  useEffect(() => { refreshPermissions(); }, []);

  // fetch data when selectedDate changes
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingData(true);
        // Helpers
        const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
        const endOfDay = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
        const dayStart = startOfDay(new Date(selectedDate.year, selectedDate.month, selectedDate.date));
        const dayEnd = endOfDay(new Date(selectedDate.year, selectedDate.month, selectedDate.date));
        const overlap = (s, e) => { const S = new Date(s); const E = new Date(e || s); return !isNaN(S) && !isNaN(E) && S <= dayEnd && E >= dayStart; };
        const fmtTime = (d) => { try { const dt = new Date(d); if (isNaN(dt.getTime())) return undefined; return dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); } catch { return undefined; } };

        // 1) Calendar bundle
        let calEvents = [];
        let calMeetings = [];
        let calTasks = [];
        try {
          const calResp = await api.get('/calendar/items');
          const calJson = typeof calResp.data === 'string' ? JSON.parse(calResp.data) : calResp.data;
          const calData = calJson?.data || calJson || {};
          // Events like CalendarScreen
          calEvents = (calData.events || []).map(ev => {
            const isAllDay = !!ev?.start?.date && !ev?.start?.dateTime;
            const startISO = ev?.start?.dateTime || ev?.start?.date;
            const endISO = ev?.end?.dateTime || ev?.end?.date || startISO;
            const timeLabel = isAllDay ? 'All day' : `${fmtTime(ev?.start?.dateTime)} - ${fmtTime(ev?.end?.dateTime)}`;
            return {
              id: ev._id || ev.id || ev.googleEventId,
              title: ev.summary || ev.title || 'Event',
              startTime: startISO,
              endTime: endISO,
              allDay: isAllDay,
              time: timeLabel,
              location: ev.location || '',
              htmlLink: ev.htmlLink || null,
              icon: 'calendar',
            };
          }).filter(ev => overlap(ev.startTime, ev.endTime));
          // Meetings from bundle
          calMeetings = (calData.meetings || []).map(m => {
            const start = m.startDate || m.startTime;
            const end = m.endDate || m.endTime || start;
            return {
              id: m._id || m.id,
              title: m.title || 'Meeting',
              startTime: start,
              endTime: end,
              time: fmtTime(start),
              location: m.location?.name || m.location || '',
              aiSuggested: !!m.aiSuggested,
              // FIX: Ensures the icon from DB is used, or falls back to 'star'
              icon: (m.icon ),
            };
          }).filter(m => overlap(m.startTime, m.endTime));
          // Tasks from bundle (compute when needed)
          calTasks = (calData.tasks || []).map(t => {
            const routine = (t.isManualSchedule && t.scheduleType === 'routine');
            const start = t.startTime || t.startDate || (routine ? computeNextRoutineISO(t) : null);
            return {
              id: t._id || t.id,
              title: t.title || 'Task',
              startTime: start,
              endTime: t.endTime || start,
              isCompleted: !!t.isCompleted,
              aiSuggested: !!t.aiSuggested,
              time: fmtTime(start),
              // FIX: Ensures the icon from DB is used, or falls back to 'star'
              icon: (t.icon ),
            };
          }).filter(t => t.startTime && overlap(t.startTime, t.endTime));
        } catch {}

        // 2) Fallback to reminders by date if needed
        let tasksFinal = calTasks;
        let meetingsFinal = calMeetings;
        if (tasksFinal.length === 0 || meetingsFinal.length === 0) {
          try {
            const dateStr = `${dayStart.getFullYear()}-${String(dayStart.getMonth()+1).padStart(2,'0')}-${String(dayStart.getDate()).padStart(2,'0')}`;
            const [taskRes, meetRes] = await Promise.all([
              api.get('/reminders', { params: { type: 'Task', startDate: dateStr, endDate: dateStr } }),
              api.get('/reminders', { params: { type: 'Meeting', startDate: dateStr, endDate: dateStr } }),
            ]);
            const tJson = typeof taskRes.data === 'string' ? JSON.parse(taskRes.data) : taskRes.data;
            const mJson = typeof meetRes.data === 'string' ? JSON.parse(meetRes.data) : meetRes.data;
            const tArr = Array.isArray(tJson?.data) ? tJson.data : [];
            const mArr = Array.isArray(mJson?.data) ? mJson.data : [];
            const tNorm = tArr.map(t => {
              const routine = (t.isManualSchedule && t.scheduleType === 'routine');
              const start = t.startDate || (routine ? computeNextRoutineISO(t) : null);
              return { 
                id: t._id || t.id, 
                title: t.title || 'Task', 
                startTime: start, 
                endTime: t.endDate || start, 
                isCompleted: !!t.isCompleted, 
                aiSuggested: !!t.aiSuggested, 
                time: fmtTime(start), 
                // FIX: Ensures the icon from DB is used, or falls back to 'star'
                icon: (t.icon ) 
              };
            }).filter(t => t.startTime && overlap(t.startTime, t.endTime));
            const mNorm = mArr.map(m => ({ 
              id: m._id || m.id, 
              title: m.title || 'Meeting', 
              startTime: m.startDate, 
              endTime: m.endDate || m.startDate, 
              location: m.location?.name || m.location || '', 
              aiSuggested: !!m.aiSuggested, 
              time: fmtTime(m.startDate), 
              // FIX: Ensures the icon from DB is used, or falls back to 'star'
              icon: (m.icon ) 
            })).filter(m => m.startTime && overlap(m.startTime, m.endTime));
            if (tasksFinal.length === 0) tasksFinal = tNorm;
            if (meetingsFinal.length === 0) meetingsFinal = mNorm;
          } catch {}
        }

        // 3) Locations intact
        let locationsJson = null;
        try {
          const locResp = await api.get('/reminders', { params: { type: 'Location', limit: 100 } });
          const lJson = typeof locResp.data === 'string' ? JSON.parse(locResp.data) : locResp.data;
          locationsJson = lJson;
        } catch {}
        const normLoc = (arr) => Array.isArray(arr) ? arr.map((it) => {
          const title = it.title || it.location?.name || 'Location';
          const start = it?.startDate || it?.startTime;
          const time = fmtTime(start);
          const icon = (it?.icon || 'map-pin'); // Correctly uses the 'map-pin' Feather icon default
          return { ...it, title, time, icon, location: it.location?.name || it.location || '' }; // Added location for vertical card
        }) : [];

        // Set state
        setCalendarItems(calEvents);
        setMeetings(meetingsFinal);
        setTasks(tasksFinal);
        setLocations(normLoc(locationsJson?.data || locationsJson));
      } catch (e) {
        // keep UI, avoid crash
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, [selectedDate]);

  

  const handleDayPress = (d) => {
    setSelectedDate(d);
    // If selecting a date outside the current view in expanded mode,
    // update the month/year state to center the view
    if (d.month !== currentMonth || d.year !== currentYear) {
      setCurrentMonth(d.month);
      setCurrentYear(d.year);
    }
  };

  // --- Month Selector Component (FIXED DROPDOWN) ---
  const MonthSelector = ({ month, year, onSelect, onChangeYear }) => {
      const allMonths = useMemo(() => monthNames.map((name, index) => ({ name, index })), []);
      const [isSelectingMonth, setIsSelectingMonth] = useState(false);
      const scrollRef = useRef(null);
      const btnRef = useRef(null);
      const [tempMonth, setTempMonth] = useState(month);
      const [tempYear, setTempYear] = useState(year);
      
      useEffect(() => {
        if (isSelectingMonth) {
          setTempMonth(month);
          setTempYear(year);
        }
      }, [isSelectingMonth, month, year]);

      // Effect to scroll to the current month when the selector opens
      useEffect(() => {
          if (isSelectingMonth && scrollRef.current) {
              // Scroll to center the current month index (45px is estimated item height)
              const offset = (tempMonth * 45) - (45 * 2); 
              // Wait for the modal to fully render before scrolling
              setTimeout(() => {
                scrollRef.current.scrollTo({ y: Math.max(0, offset), animated: true });
              }, 10);
          }
      }, [isSelectingMonth, tempMonth]);

      const closeSelector = () => {
        // Apply year delta first so external state updates correctly
        if (typeof onChangeYear === 'function' && tempYear !== year) {
          const delta = tempYear - year;
          onChangeYear(delta);
        }
        // Apply month change
        onSelect(tempMonth);
        setIsSelectingMonth(false);
      };

      return (
        <View style={calendarStyles.monthSelectorWrapper}>
          <TouchableOpacity
            ref={btnRef}
            style={calendarStyles.monthSelectorButton}
            onPress={() => setIsSelectingMonth(true)} // Simplified open
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={calendarStyles.monthSelectorText}>{monthNames[isSelectingMonth ? tempMonth : month]} {isSelectingMonth ? tempYear : year}</Text>
            <Feather name={isSelectingMonth ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.primary} style={{ marginLeft: 6 }} />
          </TouchableOpacity>

          <Modal
            transparent
            visible={isSelectingMonth}
            animationType="fade"
            onRequestClose={closeSelector}
          >
            {/* Background Touchable to close modal */}
            <TouchableWithoutFeedback onPress={closeSelector}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>
            
            {/* Dropdown Container (Positioned absolutely relative to the screen) */}
            <View 
                pointerEvents="box-none" 
                style={calendarStyles.dropdownOverlay} // Full screen overlay to calculate position
            >
                <View style={calendarStyles.dropdownAnchor}>
                    <View style={calendarStyles.monthDropdownContainer}>
                        {/* 1. Year Change Controls (Fixed at the top) */}
                        <View style={calendarStyles.yearChangeContainer}>
                            <TouchableOpacity onPress={() => setTempYear(y => y - 1)} style={{ padding: 8 }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                <Feather name="chevron-left" size={18} color={Colors.textMuted} />
                            </TouchableOpacity>
                            <Text style={calendarStyles.yearChangeText}>{tempYear}</Text>
                            <TouchableOpacity onPress={() => setTempYear(y => y + 1)} style={{ padding: 8 }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                <Feather name="chevron-right" size={18} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                        
                        {/* 2. Scrollable Month List */}
                        <ScrollView
                            ref={scrollRef}
                            style={calendarStyles.monthDropdownScroll}
                            showsVerticalScrollIndicator={false}
                            nestedScrollEnabled={true}
                        >
                            {allMonths.map((m) => (
                                <TouchableOpacity
                                  key={m.index}
                                  style={[
                                      calendarStyles.monthItem,
                                        (isSelectingMonth ? m.index === tempMonth : m.index === month) && calendarStyles.selectedMonthItem,
                                    ]}
                                  onPress={() => {
                                        // Commit immediately: apply year delta first, then set month, then close
                                        if (typeof onChangeYear === 'function' && tempYear !== year) {
                                          onChangeYear(tempYear - year);
                                        }
                                        onSelect(m.index);
                                        setIsSelectingMonth(false);
                                    }}
                                >
                                  <Text
                                    style={[
                                        calendarStyles.monthItemText,
                                        (isSelectingMonth ? m.index === tempMonth : m.index === month) && calendarStyles.selectedMonthText,
                                    ]}
                                  >
                                    {m.name}
                                  </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </View>
          </Modal>
        </View>
      );
  };

  // --- Updated Calendar UI Rendering ---
  const renderCalendarHeader = () => (
    <View style={calendarStyles.calendarHeader}>
        <Text style={calendarStyles.startDateTimeText}>Start date and time</Text>
        <MonthSelector 
            month={currentMonth}
            year={currentYear}
            onSelect={(newMonth) => {
                setCurrentMonth(newMonth);
                // When selecting a new month, it's good practice to try and select the same date 
                // in the new month, or default to the 1st if the date doesn't exist.
                const daysInNewMonth = new Date(currentYear, newMonth + 1, 0).getDate();
                setSelectedDate(prev => ({
                    ...prev,
                    date: Math.min(prev.date, daysInNewMonth),
                    month: newMonth,
                }));
            }}
            onChangeYear={(delta) => {
                const newYear = currentYear + delta;
                setCurrentYear(newYear);
                const daysInNewMonth = new Date(newYear, currentMonth + 1, 0).getDate();
                setSelectedDate(prev => ({
                    ...prev,
                    date: Math.min(prev.date, daysInNewMonth),
                    year: newYear,
                }));
            }}
        />
    </View>
  );

  const renderWeekView = () => (
    <View style={calendarStyles.weekContainer}>
      <View style={calendarStyles.weekDays}>
        {currentWeek.map((d, i) => (
          <View key={i} style={calendarStyles.dayColumn}>
            <Text style={calendarStyles.weekDay}>{d.dayOfWeek}</Text>
          </View>
        ))}
      </View>
      <View style={calendarStyles.datesContainer}>
        {currentWeek.map((d, i) => (
          <View key={i} style={calendarStyles.dateColumn}>
            <TouchableOpacity
              style={[
                calendarStyles.dateButton, 
                isSelected(d) && calendarStyles.selectedDateCircle,
              ]}
              onPress={() => handleDayPress(d)}
            >
              <Text style={[
                calendarStyles.dateText, 
                isSelected(d) && calendarStyles.selectedDateText
              ]}>
                {d.date}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );

  const renderMonthView = () => {
    // Determine the number of rows based on the number of dates (e.g., 42 dates = 6 rows)
    const numRows = allMonthDates.length / 7;
    const rows = [];

    // Render the fixed week days header (Sun, Mon, Tue...)
    rows.push(
        <View key="week-header" style={calendarStyles.weekDays}>
            {dayNames.map((d, i) => (
                <View key={i} style={calendarStyles.dayColumn}>
                    <Text style={calendarStyles.weekDay}>{d}</Text>
                </View>
            ))}
        </View>
    );

    // Render the dates row by row
    for (let i = 0; i < numRows; i++) {
        const rowDates = allMonthDates.slice(i * 7, (i + 1) * 7);
        rows.push(
            <View key={`date-row-${i}`} style={calendarStyles.datesContainer}>
                {rowDates.map((d, index) => (
                    <View key={index} style={calendarStyles.dateColumn}>
                        <TouchableOpacity
                            style={[
                                calendarStyles.dateButton,
                                isSelected(d) && calendarStyles.selectedDateCircle,
                                !d.isCurrentMonth && calendarStyles.fadedDate, // Dates of prev/next month
                            ]}
                            onPress={() => handleDayPress(d)}
                        >
                            <Text style={[
                                calendarStyles.dateText,
                                isSelected(d) && calendarStyles.selectedDateText,
                                !d.isCurrentMonth && calendarStyles.fadedDateText,
                            ]}>
                                {d.date}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ))}
            </View>
        );
    }

    return <View style={calendarStyles.monthViewContainer}>{rows}</View>;
  };
  
  const handleCalendarToggle = () => {
      // If we are expanding, ensure the month/year reflect the selected date
      if (!isCalendarExpanded) {
          setCurrentMonth(selectedDate.month);
          setCurrentYear(selectedDate.year);
      }
      setIsCalendarExpanded(!isCalendarExpanded);
  };
  // --- End Updated Calendar UI Rendering ---
  
  // --- View Toggle Component ---
  const ViewToggle = ({ isHorizontal, onToggle }) => (
    <View style={styles.viewToggleContainer}>
        <TouchableOpacity style={styles.viewToggleButton} onPress={onToggle}>
            <Feather 
                name={isHorizontal ? 'list' : 'grid'} // list for vertical, grid for horizontal
                size={18} 
                color={Colors.primary} 
            />
            {/* REMOVED: View Toggle Text based on the user's uploaded file which commented it out. 
            <Text style={styles.viewToggleButtonText}>
                Switch to {isHorizontal ? 'Vertical' : 'Horizontal'} View
            </Text> */}
        </TouchableOpacity>
    </View>
  );

  const handleTabPress = (tabName) => {
    setActiveTab(tabName);
  };

  const showPermBanner = false; // moved to Profile
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.backgroundStatus} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollViewContent}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.navigate('Profile')} >
              <View ref={headerProfileRef} collapsable={false} style={{ alignSelf: 'flex-start' }}>
                <Feather name="user" size={24} color={Colors.primary} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('BelaAI')}>
              <Image source={require('./assets/beela-face.png')} style={styles.beelaFace} />
            </TouchableOpacity>
          </View>
          <View style={styles.calendarContainer}>
            {renderCalendarHeader()}
            
            {/* Conditional Rendering of Week vs Month View */}
            {isCalendarExpanded ? renderMonthView() : renderWeekView()}

            {/* Toggle Button for Expansion */}
            <TouchableOpacity 
                onPress={handleCalendarToggle} 
                style={calendarStyles.toggleCalendarButton}
            >
                <Feather 
                    name={isCalendarExpanded ? 'chevron-up' : 'chevron-down'} 
                    size={24} 
                    color={Colors.textMuted} 
                />
            </TouchableOpacity>
          </View>
          
          {/* New Toggle Button for Card View */}
          <ViewToggle isHorizontal={isHorizontal} onToggle={() => setIsHorizontal(!isHorizontal)} />
          {/* End New Toggle Button */}


          {loadingData && (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: 8 }} />
          )}

          {renderSection('Tasks', tasks, isHorizontal)}
          {renderSection('Meetings', meetings, isHorizontal)}
          {renderSection('Calendar', calendarItems, isHorizontal)}
          {renderSection('Locations', locations, isHorizontal, true)}
        </ScrollView>
      </SafeAreaView>
    
      {/* The pre-made Navbar component */}
      <Navbar />
      <SuccessModal
        visible={modalVisible}
        message={modalMessage}
        onClose={() => setModalVisible(false)}
      />
    </View>
  );
};

// --- Section Renderers (UPDATED FOR NEW AESTHETICS) ---

const renderCardHorizontal = (item, showAiTag = false, isLocation = false) => {
  // Use memoized random colors with a stable seed per item
  console.log('Rendering task:', item);

  const { accent: mainColor, background: bgColor } = getMemoizedColorCombo(getColorSeed(item));
  
  const { timeLeftText, progress } = getTimeLeftAndProgress(item.startTime, item.endTime, item.isCompleted);
  // Color the progress bar based on status
  const progressColor = item.isCompleted ? Colors.success : progress === 100 ? Colors.danger : mainColor;

  return (
    <PressableAnimated 
      key={item.id?.toString?.() ?? Math.random().toString()} 
      onPress={() => console.log('Tapped Horizontal Card')} // Placeholder action
      style={[cardStyles.taskCard, { backgroundColor: bgColor }]} // Use the paired background color
    >
      <View style={[cardStyles.taskIconCircle, { backgroundColor: mainColor + '10' }]}>
        {/* Accent color is the mainColor (paired with background color) */}
        <ItemIcon iconName={item.icon } size={24} color={mainColor} />
      </View>
      
      <Text style={cardStyles.taskTitle} numberOfLines={2} ellipsizeMode="tail">
        {item.title || item.name}
      </Text>
      
      {/* CONDITIONAL RENDERING: Hide time/progress for Locations */}
      {!isLocation && (
        <>
          <Text style={cardStyles.taskTime}>
            {item.time || 'Time unspecified'}
          </Text>
          
          <View style={cardStyles.taskDetailRow}>
            {/* We use timeLeftText as the "detail" text */}
            <Text style={cardStyles.taskDetailText}>{timeLeftText}</Text>
            <Text style={cardStyles.taskDetailText}>{progress}%</Text>
          </View>
          
          {/* Progress Bar */}
          <ProgressBar progress={progress} color={progressColor} />
        </>
      )}

      {/* AI Tag - placed where space permits */}
      {showAiTag && item?.aiSuggested === true && (
        <View style={cardStyles.aiTagOverlay}>
          <Text style={cardStyles.aiTagTextHorizontal}>AI</Text> 
        </View>
      )}
    </PressableAnimated>
  );
};

const renderCardVertical = (item, showAiTag = false, isLocation = false) => {
  // Use memoized random colors with a stable seed per item
  const { accent: mainColor } = getMemoizedColorCombo(getColorSeed(item));

  const { timeLeftText } = getTimeLeftAndProgress(item.startTime, item.endTime, item.isCompleted);

  const titleText = item.title || item.name;

  // CONDITIONAL SUBTITLE LOGIC: If it's a location, show location only. Otherwise, use existing logic.
  const subtitleText = isLocation
    ? item.location || ''
    : item.isCompleted 
      ? 'Completed'
      : item.location && item.location.trim() !== '' 
        ? item.location
        : timeLeftText;
      
  return (
    <PressableAnimated 
      key={item.id?.toString?.() ?? Math.random().toString()} 
      onPress={() => console.log('Tapped Vertical Card')} // Placeholder action
      style={cardStyles.listAppointment} // Use the new vertical style
    >
      <View style={cardStyles.listAppointmentLeft}>
        {/* Icon Circle */}
        <View style={[cardStyles.taskIconCircle, { backgroundColor: mainColor + '10' }]}>
          {/* Accent color is the mainColor */}
          <ItemIcon iconName={item.icon} size={24} color={mainColor} />
        </View>
        <View style={{ marginLeft: 15, flexShrink: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text 
              style={cardStyles.listTitle}
              numberOfLines={1} 
              ellipsizeMode="tail"
            >
              {titleText}
            </Text>
            {/* AI Tag - Inline for vertical list */}
            {showAiTag && item?.aiSuggested === true && (
              <View style={[cardStyles.aiTagPillVertical, { borderColor: mainColor }]}>
                <Text style={[cardStyles.aiTagTextVertical, { color: mainColor }]}>AI</Text>
              </View>
            )}
          </View>
          {/* CONDITIONAL RENDERING: Hide time for Locations, and simplify subtitle */}
          <Text style={cardStyles.listTime} numberOfLines={1}>
            {!isLocation && (item.time || 'Time unspecified')}
            {subtitleText && !isLocation && ` | ${subtitleText}`}
            {subtitleText && isLocation && subtitleText}
          </Text>
        </View>
      </View>
      
      
    </PressableAnimated>
  );
};

const renderSection = (title, items, isHoriz, noVerticalScroll = false) => {
  const isLocationSection = title === 'Locations'; // Flag to simplify card rendering
  
  return (
    <View style={styles.section}> 
      <Text style={styles.sectionTitle}>{title}</Text>
      {Array.isArray(items) && items.length === 0 ? (
        <View style={styles.noDataContainer}>
          <View style={styles.noDataIconCircle}>
            <Feather
              // Ensure fallback icons are correct for the 'No Data' message as well
              name={title === 'Tasks' ? 'star' : title === 'Meetings' ? 'star' : title === 'Locations' ? 'map-pin' : 'calendar'}
              size={28}
              color={Colors.primary}
            />
          </View>
          <Text style={styles.noDataText}>
            {title === 'Tasks' && 'No tasks found for this date.'}
            {title === 'Meetings' && 'No meetings found for this date.'}
            {title === 'Locations' && 'No location reminders found.'}
            {title === 'Calendar' && 'No calendar events found for this date.'}
          </Text> 
        </View>
      ) : (
        isHoriz ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll} contentContainerStyle={cardStyles.horizontalScrollContent}>
            {/* Pass the isLocationSection flag to the card renderer */}
            {items?.map?.((it) => renderCardHorizontal(it, title === 'Tasks', isLocationSection)) || null}
          </ScrollView>
        ) : (
          // The maxHeight here ensures the scrolling is contained within the section view.
          <ScrollView style={[styles.verticalScrollContainer, noVerticalScroll && { maxHeight: undefined }]}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={false}
          >
            {/* Pass the isLocationSection flag to the card renderer */}
            <View style={cardStyles.verticalListContainer}>
              {items?.map?.((it) => renderCardVertical(it, title === 'Tasks' || title === 'Meetings', isLocationSection)) || null}
            </View>
          </ScrollView>
        )
      )}
    </View>
  );
};

// --- Style Sheets (UPDATED FOR NEW AESTHETICS AND SHADOWS) ---

/**
 * UPDATED: Enhanced shadow style for a more pronounced "3D look"
 * with a larger radius and vertical offset while keeping opacity/elevation
 * low enough to avoid a harsh bottom shadow.
 */
const softShadow = {
    ...Platform.select({
        ios: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 }, // Increased vertical offset
            shadowOpacity: 0.1, // Increased opacity for depth
            shadowRadius: 8, // Increased radius for softer spread
        },
        android: {
            elevation: 5, // Increased elevation for a 3D effect
        },
    }),
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  safeArea: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 220,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 25,
    paddingTop: 35,
  },
  beelaFace: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 14,
  },
  noDataContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  noDataIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F0F3FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  noDataText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  // Calendar styling (base container) - Applying soft shadow here as well
  calendarContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    paddingBottom: 10, // Adjust for the toggle button
    marginBottom: 12, // Reduced margin to place the view toggle closer
    marginHorizontal: 20,
    ...softShadow, // Use the new soft shadow style
  },
  // Cards - Base layout properties
  horizontalScroll: { marginHorizontal: -10, paddingHorizontal: 20 }, // Adjusted padding for edges
  verticalScrollContainer: { maxHeight: 400 }, // Enforces vertical scroll within the section
  
  // New View Toggle Styles
  viewToggleContainer: {
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  viewToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#E8ECFF', // Light primary background
    ...softShadow, // Use the new soft shadow style
  },
  viewToggleButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
});

// --- New Card Specific Styles from the provided code ---
const cardStyles = StyleSheet.create({
    // --- Horizontal Task Card Styles (From TaskCard) ---
    horizontalScrollContent: {
      paddingRight: 40, // Space for the last card
    },
    taskCard: {
        width: width * 0.45,
        minHeight: 180,
        borderRadius: 20,
        padding: 15,
        marginRight: 15,
        marginBottom:5,
        justifyContent: 'space-between',
        position: 'relative', // For AI tag overlay
        ...softShadow, // Use the new soft shadow style
    },
    taskIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    taskTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.text, // Using app's Colors.text
    },
    taskTime: {
        fontSize: 12,
        color: Colors.textMuted, // Using app's Colors.textMuted
        marginTop: 5,
        marginBottom: 10,
    },
    taskDetailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 5,
    },
    taskDetailText: {
        fontSize: 12,
        color: Colors.textMuted, // Using app's Colors.textMuted
    },
    progressBarBackground: {
        height: 6,
        backgroundColor: '#EEE',
        borderRadius: 3,
        marginTop: 5,
    },
    progressBarFill: {
        height: 6,
        borderRadius: 3,
    },
    aiTagOverlay: {
      position: 'absolute',
      top: 15,
      right: 15,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: Colors.primary, // Primary color background
    },
    aiTagTextHorizontal: {
      fontSize: 10,
      color: 'white',
      fontWeight: '700',
    },

    // --- Vertical List Appointment Styles (From ListAppointment) ---
    verticalListContainer: {
      marginTop: 5,
    },
    listAppointment: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 15,
        borderRadius: 15,
        marginBottom: 10,
        ...softShadow, // Use the new soft shadow style
    },
    listAppointmentLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1, // Allow the left side to shrink
    },
    listTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text, // Using app's Colors.text
    },
    listTime: {
        fontSize: 12,
        color: Colors.textMuted, // Using app's Colors.textMuted
        marginTop: 2,
    },
    aiTagPillVertical: {
        marginLeft: 8,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1.5, // Added border for better separation
    },
    aiTagTextVertical: {
        fontSize: 10, 
        fontWeight: '700' 
    },
    verticalOptionsButton: {
      paddingLeft: 10, // Ensure touch target is good
    },
    
    // Previous unused styles removed for cleanliness
});


// --- New/Updated Calendar Styles (Month Selector Dropdown) ---
const calendarStyles = StyleSheet.create({
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  startDateTimeText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  monthSelectorWrapper: {
    // Positioning context for the dropdown
    zIndex: 20,
    position: 'relative',
  },
  monthSelectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  monthSelectorText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  // New styles for modal positioning
  dropdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end', // This aligns the dropdown to the right side of the screen
    paddingHorizontal: 20, // Match the main container's padding
    paddingTop: 100, // Sufficient padding from the top
    zIndex: 99, // Ensure it's above other elements
  },
  dropdownAnchor: {
    // This view ensures the dropdown aligns relative to the anchor point (top-right of the screen section)
    position: 'absolute',
    top: 55, // Adjusted to position it correctly below the header button
    right: 20,
  },
  
  monthDropdownContainer: {
    minWidth: 170,
    maxWidth: 220,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    // Soft shadow for a floating card look
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
    overflow: 'hidden', // Keep edges clean
  },
  monthDropdownScroll: {
      maxHeight: 220, // Show ~5 months and allow scrolling
  },
  monthItem: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#F3F4F6',
  },
  selectedMonthItem: {
      backgroundColor: Colors.primary + '10', // Very light tint of primary
  },
  monthItemText: {
      fontSize: 14,
      color: Colors.text,
  },
  selectedMonthText: {
      fontWeight: '700',
      color: Colors.primary,
  },
  yearChangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between', // Spaced out elements
    paddingVertical: 8,
    paddingHorizontal: 10,
    // Add bottom border to separate from the scrollable list
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  yearChangeText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  closeButton: {
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.primary,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // End Month Dropdown Styles
  monthViewContainer: {
    marginTop: 0, 
  },
  weekContainer: { 
    width: '100%' 
  }, 
  weekDays: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: 10,
  },
  dayColumn: { 
    width: '14.28%', 
    alignItems: 'center',
  },
  weekDay: { 
    fontSize: 13, 
    color: Colors.textMuted, 
    fontWeight: '500'
  },
  datesContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: 10, 
  },
  dateColumn: { 
    width: '14.28%', 
    alignItems: 'center',
  },
  dateButton: { 
    width: 38, 
    height: 38, 
    borderRadius: 19, 
    justifyContent: 'center', 
    alignItems: 'center' ,
    backgroundColor: 'transparent',
  },
  selectedDateCircle: { 
    backgroundColor: Colors.primary, 
  },
  selectedDateText: { 
    color: '#fff', 
    fontWeight: '700',
    fontSize: 16,
  },
  dateText: { 
    fontSize: 16, 
    color: Colors.text, 
    fontWeight: '500' 
  },
  fadedDate: {
    backgroundColor: 'transparent',
  },
  fadedDateText: { 
    color: '#D1D5DB',
  },
  toggleCalendarButton: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 5,
  }
});


export default UserDashboard;