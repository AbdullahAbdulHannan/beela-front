import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ScrollView, 
  SafeAreaView, 
  StatusBar, 
  ActivityIndicator 
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import Navbar from './components/Navbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';
import { scheduleReminderSpeechNotification } from './services/notificationService';
import { ensureReminderTTS } from './services/api';
import { Colors } from './constants/colors';
import { useOnboardingTarget } from './components/OnboardingProvider';

const CalendarScreen = ({ navigation }) => {
    const API_BASE_URL= 'https://voxa-backend-three.vercel.app'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const calSyncRef = useOnboardingTarget('cal-sync');

  const openEventLink = async (url) => {
    try {
      if (!url) return;
      
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else if (WebBrowser && WebBrowser.openBrowserAsync) {
        await WebBrowser.openBrowserAsync(url);
      } else {
        console.warn('Web browser functionality not available');
      }
    } catch (error) {
      console.error('Error opening browser:', error);
    }
  };

  // Format time from ISO string to 12-hour format
  const formatTime = (dateTimeString) => {
    if (!dateTimeString) return '';
    
    const date = new Date(dateTimeString);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12
    
    return `${hours}:${minutes} ${ampm}`;
  };

  // Fetch calendar events from the backend
  const fetchCalendarEvents = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem('userToken');
      
      const response = await fetch(`${API_BASE_URL}/api/calendar/events`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        // Special-case: not synced yet
        if (response.status === 404) {
          setEvents([]);
          setLastSynced(null);
          setError('Calendar not synced. Connect Google Calendar to view events.');
          return;
        }
        throw new Error(`Failed to fetch calendar events (${response.status})`);
      }

      const data = await response.json();

      // Transform events to match our frontend format, including all-day & multi-day handling
      const formattedEvents = (data.data.events || []).map(event => {
        const isAllDay = !!event.start?.date && !event.start?.dateTime;
        const startISO = event.start?.dateTime || event.start?.date;
        const endISO = event.end?.dateTime || event.end?.date;
        const timeLabel = isAllDay ? 'All day' : `${formatTime(event.start?.dateTime)} - ${formatTime(event.end?.dateTime)}`;
        return {
          id: event._id,
          title: event.summary || 'No Title',
          startTime: startISO,
          endTime: endISO,
          startISO,
          endISO,
          allDay: isAllDay,
          time: timeLabel,
          location: event.location || '',
          htmlLink: event.htmlLink
        };
      });
      setEvents(formattedEvents);
      setLastSynced(data.data.lastSynced);
      setError(null);
      try {
        const userString = await AsyncStorage.getItem('user');
        let username = 'there';
        if (userString) {
          const user = JSON.parse(userString);
          username = user?.name || user?.fullName || user?.username || (user?.email ? user.email.split('@')[0] : 'there');
        }

        const cacheRaw = await AsyncStorage.getItem('scheduledCalendarEvents');
        const cache = cacheRaw ? JSON.parse(cacheRaw) : {};

        for (const ev of formattedEvents) {
          try {
            const triggerTime = new Date(new Date(ev.startTime).getTime() - 5 * 60 * 1000).getTime();
            if (isNaN(triggerTime) || triggerTime <= Date.now()) continue;
            if (cache[ev.id]) continue; // already scheduled

            // Ensure TTS exists to get textHash, then schedule
            let textHash = null;
            try {
              const ensureRes = await ensureReminderTTS(ev.id);
              textHash = ensureRes?.tts?.textHash || null;
            } catch {}

            const res = await scheduleReminderSpeechNotification({
              username,
              meetingName: ev.title,
              startDateISO: ev.startTime,
              reminderId: ev.id,
              textHash,
            });
            if (res?.scheduled) {
              cache[ev.id] = true;
            }
          } catch (e) {
            // continue scheduling others
          }
        }
        await AsyncStorage.setItem('scheduledCalendarEvents', JSON.stringify(cache));
      } catch (e) {
        // ignore scheduling errors to not break UI
      }
    } catch (err) {
      console.error('Error fetching calendar events:', err);
      // Show inline error but do not pop alert
      setError('Failed to load calendar events. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch events when component mounts
  useEffect(() => {
    fetchCalendarEvents();
  }, []);

  // Format date to YYYY-MM-DD in local timezone
  const formatDateToLocal = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Generic filter for a given list and the selected date
  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0,0,0,0);
    return x;
  };
  const endOfDay = (d) => {
    const x = new Date(d);
    x.setHours(23,59,59,999);
    return x;
  };
  const getItemsForSelectedDate = (list) => {
    if (!selectedDate) return [];
    const dayStart = startOfDay(selectedDate);
    const dayEnd = endOfDay(selectedDate);
    return (list || []).filter(item => {
      const s = new Date(item.startISO || item.startTime);
      let e = new Date(item.endISO || item.endTime || item.startISO || item.startTime);
      // For all-day Google events, the end date is exclusive; adjust to inclusive range
      if (item.allDay && (item.endISO || item.endTime)) {
        e = new Date(e.getTime() - 1);
      }
      return s <= dayEnd && e >= dayStart; // overlap check
    });
  };

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month, 1).getDay();
  };

  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const today = new Date();
    
    const isToday = (day) => {
      return (
        day === today.getDate() &&
        month === today.getMonth() &&
        year === today.getFullYear()
      );
    };

    const isSelected = (day) => {
      return (
        day === selectedDate.getDate() &&
        month === selectedDate.getMonth() &&
        year === selectedDate.getFullYear()
      );
    };

    const daysArray = [];
    const totalDays = Math.ceil((daysInMonth + firstDay) / 7) * 7;

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      daysArray.push(<View key={`empty-${i}`} style={styles.dayCell} />);
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      daysArray.push(
        <TouchableOpacity
          key={day}
          style={[
            styles.dayCell,
            isToday(day) && styles.todayCell,
            isSelected(day) && styles.selectedCell
          ]}
          onPress={() => setSelectedDate(new Date(year, month, day))}
        >
          <Text style={[
            styles.dayText,
            isToday(day) && styles.todayText,
            isSelected(day) && styles.selectedText
          ]}>
            {day}
          </Text>
        </TouchableOpacity>
      );
    }

    // Add empty cells to complete the grid (always 7 days per week)
    const remainingCells = 7 - (daysArray.length % 7);
    if (remainingCells < 7) { // Only add if we don't have a complete week
      for (let i = 0; i < remainingCells; i++) {
        daysArray.push(<View key={`empty-end-${i}`} style={styles.dayCell} />);
      }
    }

    return daysArray;
  };

  const changeMonth = (increment) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + increment);
    setCurrentDate(newDate);
  };

  const handleGoogleCalendarSync = async () => {
    try {
      setIsSyncing(true);
      
      // Get the auth URL from the backend
      const response = await fetch(`${API_BASE_URL}/api/auth/calendar`, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await AsyncStorage.getItem('userToken')}`
        }
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        console.error('Error response data:', responseData);
        throw new Error(responseData.message || `Failed to initiate Google Calendar sync (${response.status})`);
      }

      if (!responseData.data || !responseData.data.url) {
        throw new Error('Failed to get authentication URL from server');
      }

      // Open the Google OAuth consent screen in the browser
      const result = await WebBrowser.openAuthSessionAsync(
        responseData.data.url,
        responseData.data.url
      );

      // After closing/dismissing, verify sync with backend instead of assuming success
      try {
        const verifyToken = await AsyncStorage.getItem('userToken');
        const verifyResp = await fetch(`${API_BASE_URL}/api/calendar/events`, {
          headers: { 'Authorization': `Bearer ${verifyToken}` }
        });
        if (verifyResp.ok) {
          // Now it is actually synced
          Alert.alert('Success', 'Google Calendar has been successfully synced!');
          const data = await verifyResp.json();
          setLastSynced(data?.data?.lastSynced || new Date().toISOString());
          // Refresh events after sync
          fetchCalendarEvents();
        } else if (verifyResp.status === 404) {
          // Not synced/canceled – do not show success
        } else {
          // Other server error
        }
      } catch (vErr) {
        // Silent fail on verify
      }
    } catch (error) {
      console.error('Error syncing Google Calendar:', error);
      Alert.alert('Error', error.message || 'Failed to sync Google Calendar');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
    
      <StatusBar barStyle="light-content" backgroundColor={Colors.backgroundStatus} />
      <View style={styles.container}>
      <View style={styles.header}>
  <TouchableOpacity onPress={() => navigation.goBack()}>
    <Feather name="chevron-left" size={24} color={Colors.primary} />
  </TouchableOpacity>

  <Text style={styles.headerTitle}>Calendar</Text>

  <TouchableOpacity
    style={styles.syncButton}
    onPress={handleGoogleCalendarSync}
    disabled={isSyncing}
  >
    <View ref={calSyncRef} collapsable={false} style={{ alignSelf: 'center' }}>
      {isSyncing ? (
        <ActivityIndicator color={Colors.white} size="small" />
      ) : (
        <FontAwesome5 name="sync" size={20} color={Colors.white} />
      )}
    </View>
  </TouchableOpacity>
</View>

        <View style={styles.calendarContainer}>
          <View style={styles.monthSelector}>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.arrowButton}>
              <Feather name="chevron-left" size={20} color={Colors.primary} />
            </TouchableOpacity>
            
            <Text style={styles.monthText}>
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </Text>
            
            <TouchableOpacity onPress={() => changeMonth(1)} style={styles.arrowButton}>
              <Feather name="chevron-right" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.weekDaysContainer}>
            {days.map((day) => (
              <Text key={day} style={styles.weekDayText}>
                {day}
              </Text>
            ))}
          </View>
          
          <View style={styles.calendarGrid}>
            {renderCalendar()}
          </View>
        </View>
        
        <ScrollView style={styles.eventsContainer}>
          <View style={styles.eventsHeader}>
            <Text style={styles.eventsTitle}>
              {selectedDate.toDateString() === new Date().toDateString() 
                ? "Today's Events" 
                : selectedDate.toDateString()}
            </Text>
            {lastSynced && (
              <Text style={styles.lastSynced}>
                Last synced: {new Date(lastSynced).toLocaleString()}
              </Text>
            )}
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Loading events...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity 
                style={styles.retryButton}
                onPress={fetchCalendarEvents}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : getItemsForSelectedDate(events).length > 0 ? (
            getItemsForSelectedDate(events).map((event) => (
              <TouchableOpacity 
                key={event.id} 
                style={styles.eventCard}
                onPress={() => openEventLink(event.htmlLink)}
              >
                <View style={styles.eventTimeContainer}>
                  <Text style={styles.eventTime}>{event.time}</Text>
                </View>
                <View style={styles.eventDetails}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <View style={styles.eventLocation}>
                    {event.location?<Feather name="map-pin" size={14} color="#666" />:''}
                    <Text style={styles.eventLocationText} numberOfLines={1}>
                      {event.location}
                    </Text>
                  </View>
                </View>
                <View style={styles.eventOptions}>
                  <Feather name="external-link" size={20} color="#666" />
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.noEventsContainer}>
              <Feather name="calendar" size={48} color={Colors.iconMuted} />
              <Text style={styles.noEventsText}>No events for this day</Text>
            </View>
          )}
        </ScrollView>
      </View>
      <Navbar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
 header: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingHorizontal: 16,
  paddingVertical: 12,
  backgroundColor: Colors.background,
  paddingTop:35
},
headerTitle: {
  color: Colors.text,
  fontSize: 20,
  fontWeight: 'bold',
},

  syncButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: Colors.primary,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  calendarContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    margin: 16,
    padding: 16,
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  arrowButton: {
    padding: 8,
  },
  monthText: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  // weekDaysContainer: {
  //   flexDirection: 'row',
  //   justifyContent: 'space-between',
  //   marginBottom: 12,
  // },
  // weekDayText: {
  //   color: '#666',
  //   fontSize: 14,
  //   width: 40,
  //   textAlign: 'center',
  // },
calendarGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
},
dayCell: {
  width: `${100 / 7}%`, // evenly distribute 7 columns
  aspectRatio: 1,       // keeps square shape
  justifyContent: 'center',
  alignItems: 'center',
  marginVertical: 4,
  borderRadius: 20,
},
weekDayText: {
  color: Colors.iconMuted,
  fontSize: 14,
  flex: 1,
  textAlign: 'center',
},
weekDaysContainer: {
  flexDirection: 'row',
},

  dayText: {
    color: Colors.text,
    fontSize: 14,
  },
  todayCell: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  todayText: {
    color: Colors.text,
    fontWeight: 'bold',
  },
  selectedCell: {
    backgroundColor: Colors.primary,
  },
  selectedText: {
    color: Colors.white,
    fontWeight: 'bold',
  },
  eventsContainer: {
    flex: 1,
    marginTop: 16,
    paddingHorizontal: 16,
  },
  eventsTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  eventCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventTimeContainer: {
    width: 80,
  },
  eventTime: {
    color: Colors.primary,
    fontWeight: '600',
  },
  eventDetails: {
    flex: 1,
    marginLeft: 16,
  },
  eventTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  eventLocation: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventLocationText: {
    color: Colors.iconMuted,
    fontSize: 12,
    marginLeft: 4,
  },
  eventOptions: {
    padding: 8,
  },
  lastSynced: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: Colors.text,
    marginTop: 10,
  },
  errorContainer: {
    padding: 20,
    alignItems: 'center',
  },
  errorText: {
    color: Colors.errorText,
    marginBottom: 15,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: Colors.black,
    fontWeight: '600',
  },
  noEventsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    opacity: 0.6,
  },
  noEventsText: {
    color: Colors.text,
    marginTop: 10,
    fontSize: 16,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  activeTabButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  tabText: {
    color: Colors.textMuted,
    fontWeight: '600',
  },
  activeTabText: {
    color: Colors.text,
  },
});

export default CalendarScreen;
