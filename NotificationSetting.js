import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, ScrollView, AppState, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons'; // Switched from Feather to Ionicons
// Removed Colors import as the new UI defines its own color constants
import Navbar from './components/Navbar';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from './services/api';

// --- Color Constants (From new UI) ---
const ACTIVE_COLOR = '#FF3D00'; // Orange/Red for urgency in notifications
const PRIMARY_COLOR = '#4668FF'; // Green for general UI elements
const ACCENT_COLOR = '#3B82F6'; // Blue for a fresh look

// Shadow style for soft, modern look
const softShadow = {
    ...Platform.select({
        ios: {
            shadowColor: '#1F2937', // Darker shadow for depth
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.15, // Thoda zyada opacity
            shadowRadius: 15,
        },
        android: {
            elevation: 12,
        },
    }),
};

// --- Utility function for Icon mapping (Adapted) ---
const getNotificationIcon = (title) => {
    switch (title) {
        case 'Task Reminder':
            return { name: 'checkmark-circle', color: PRIMARY_COLOR };
        case 'Meeting Reminder':
            return { name: 'calendar', color: ACCENT_COLOR };
        case 'Location Reminder':
            return { name: 'location-sharp', color: ACTIVE_COLOR };
        case 'System Update':
            return { name: 'information-circle', color: ACCENT_COLOR };
        case 'Reminder':
            return { name: 'time', color: ACTIVE_COLOR };
        default:
            return { name: 'notifications', color: '#6B7280' };
    }
};

// --- Utility function to determine section (RECENT/EARLIER) ---
const getCategory = (dateStr) => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'EARLIER';
    const now = new Date();
    // Reset time for comparison (midnight of today)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const notifDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (notifDate.getTime() >= today.getTime()) {
      return 'RECENT'; // Includes all notifications from today
    }
    return 'EARLIER';
  } catch {
    return 'EARLIER';
  }
};


// --- Notification Card Component (New UI structure) ---
const NotificationCard = ({ item, onMarkAsRead }) => {
    // Mapping original item props to new UI components
    const title = item.titleForType(item.type);
    const message = item.message;
    const time = item.formatRelativeTime(item.createdAt);
    const isUnread = !item.isRead;

    const { name: iconName, color: iconColor } = getNotificationIcon(title);

    return (
        <View style={[styles.cardContainer, softShadow, isUnread && styles.unreadCard]}>

            {/* 1. Icon Box */}
            <View style={styles.cardIconBox}>
                <Ionicons name={iconName} size={28} color={iconColor} style={isUnread ? styles.iconPulse : null} />
            </View>

            {/* 2. Main Content Area */}
            <View style={styles.cardContent}>

                {/* Header: Title, Time, Unread Dot */}
                <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{title}</Text>
                    <View style={styles.cardTimeAndDot}>
                        <Text style={styles.cardTime}>{time}</Text>
                        {isUnread && <View style={styles.unreadDot} />}
                    </View>
                </View>

                {/* Message */}
                <Text style={[styles.cardMessage, isUnread && { fontWeight: '600' }]} numberOfLines={2}>{message}</Text>

                {/* Action Button (Conditional) */}
                {isUnread && (
                    <TouchableOpacity
                        onPress={() => onMarkAsRead(item.id)}
                        style={styles.markAsReadButton}
                    >
                        <Text style={styles.markAsReadText}>Mark as read</Text>
                    </TouchableOpacity>
                )}
            </View>

        </View>
    );
};


export default function NotificationSettings({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [weekCount, setWeekCount] = useState(0); // Kept for logic, but not displayed in the new UI stats bar
  const appState = useRef(AppState.currentState);
  const pollRef = useRef(null);

  // --- Original Logic Functions ---

  const titleForType = (type) => {
    const t = String(type || '').toLowerCase();
    if (t === 'task' || t === 'tasks') return 'Task Reminder';
    if (t === 'meeting' || t === 'meetings') return 'Meeting Reminder';
    if (t === 'location' || t === 'locations') return 'Location Reminder';
    // Mapping 'system' type to 'System Update' for icon purposes
    if (t === 'system' || t === 'update') return 'System Update';
    return 'Reminder';
  };

  const formatRelativeTime = (dateStr) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr || '';
      const now = new Date();
      const diffMs = now - d;
      const sec = Math.floor(diffMs / 1000);
      const min = Math.floor(sec / 60);
      const hr = Math.floor(min / 60);
      const day = Math.floor(hr / 24);
      if (min < 1) return 'just now';
      if (min < 60) return `${min} min ago`; // Added space for readability
      if (hr < 24) return `${hr} h ago`; // Added space for readability
      // yesterday check
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      if (d.toDateString() === yesterday.toDateString()) return 'yesterday';
      // else full date
      return d.toLocaleDateString('en-US');
    } catch {
      return dateStr || '';
    }
  };

  const refreshStats = (list) => {
    const safe = Array.isArray(list) ? list : [];
    const unread = safe.filter(n => !n?.isRead && !n?.read).length;
    setUnreadCount(unread);
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    const thisWeek = safe.filter(n => {
      const t = new Date(n?.createdAt || n?.time || n?.date);
      return !isNaN(t.getTime()) && t >= weekAgo;
    }).length;
    setWeekCount(thisWeek);
  };

  const fetchAll = async () => {
    try {
      setLoading(true);
      const res = await getNotifications();
      let raw = [];
      if (Array.isArray(res)) raw = res;
      else if (Array.isArray(res?.data)) raw = res.data;
      else if (Array.isArray(res?.notifications)) raw = res.notifications;
      else if (Array.isArray(res?.data?.notifications)) raw = res.data.notifications;

      const norm = (Array.isArray(raw) ? raw : []).map((n) => {
        const id = n?._id || n?.id || String(Math.random());
        const isRead = !!(n?.isRead || n?.read);
        const type = n?.type || n?.reminderType || 'reminder';
        const message = n?.message || n?.text || n?.body || '';
        const createdAt = n?.createdAt || n?.time || n?.date || new Date().toISOString();
        return { id, isRead, type, message, createdAt, titleForType, formatRelativeTime };
      });

      // Sort notifications by date descending (newest first)
      norm.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      setNotifications(norm);
      refreshStats(norm);
    } catch (e) {
      // fail silently for now
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // keep light polling as a backup to catch updates between screens
    pollRef.current = setInterval(fetchAll, 15000);
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        fetchAll();
      }
      appState.current = nextState;
    });
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      sub?.remove?.();
    };
  }, []);

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      const updated = notifications.map(n => n.id === id ? { ...n, isRead: true } : n);
      setNotifications(updated);
      refreshStats(updated);
    } catch {}
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead();
      const updated = notifications.map(n => ({ ...n, isRead: true }));
      setNotifications(updated);
      refreshStats(updated);
    } catch {}
  };

  const recentNotifications = notifications.filter(n => getCategory(n.createdAt) === 'RECENT');
  const earlierNotifications = notifications.filter(n => getCategory(n.createdAt) === 'EARLIER');
  const totalCount = notifications.length;

  // --- New UI Render ---
  return (
    <SafeAreaView style={styles.safeArea}>
      {/* StatusBar adjusted for light background */}
      <StatusBar barStyle="dark-content" backgroundColor="#F3F4F6" />

      <View style={styles.screenHeader}>
          {/* Back button using Ionicons */}
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 5 }}>
              <Ionicons name="arrow-back-outline" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Notifications</Text>
          {/* Unread count badge */}
          {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
          ) : (
              <View style={{ width: 38 }} />
          )}
      </View>

      {/* Stats Bar */}
      <View style={[styles.statsBar, softShadow]}>
          <View style={styles.statBox}>
              <Text style={styles.statCount}>{unreadCount}</Text>
              <Text style={styles.statLabel}>Unread</Text>
          </View>
          <View style={styles.statBox}>
              <Text style={styles.statCount}>{totalCount}</Text>
              <Text style={styles.statLabel}>Total</Text>
          </View>
          <TouchableOpacity
              style={[styles.markAllReadButtonAll, { backgroundColor: PRIMARY_COLOR }]}
              onPress={handleMarkAll}
              disabled={unreadCount === 0 || loading}
          >
              <Text style={styles.markAllReadText}>Mark All Read</Text>
          </TouchableOpacity>
      </View>

      {/* ScrollView */}
      <ScrollView
          contentContainerStyle={[styles.scrollViewContent, { paddingBottom: 200 }]}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
      >
          {loading && notifications.length === 0 && (
                <View style={styles.noNotifications}>
                   <Text style={styles.noNotificationsText}>Loading Notifications...</Text>
                </View>
          )}

          {/* RECENT Section */}
          {recentNotifications.length > 0 && (
              <>
                  <Text style={styles.sectionHeading}>RECENT</Text>
                  {recentNotifications.map(notification => (
                      <NotificationCard
                          key={String(notification.id)}
                          item={notification}
                          onMarkAsRead={handleMarkRead}
                      />
                  ))}
              </>
          )}

          {/* EARLIER Section */}
          {earlierNotifications.length > 0 && (
              <>
                  <Text style={styles.sectionHeading}>EARLIER</Text>
                  {earlierNotifications.map(notification => (
                      <NotificationCard
                          key={String(notification.id)}
                          item={notification}
                          onMarkAsRead={handleMarkRead}
                      />
                  ))}
              </>
          )}

          {!loading && notifications.length === 0 && (
              <View style={styles.noNotifications}>
                  <Ionicons name="notifications-off-outline" size={60} color="#CBD5E1" />
                  <Text style={styles.noNotificationsText}>You're all caught up! No notifications.</Text>
              </View>
          )}
      </ScrollView>

      {/* Bottom Navigation Bar is maintained */}
      <Navbar />
    </SafeAreaView>
  );
}

// --- New UI Styles ---
const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#F3F4F6', // Lighter background for more contrast
    },
    screenHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 15,
        backgroundColor: '#FFF',
        borderBottomWidth: 0,
        paddingTop: Platform.OS === 'android' ? 35 : 15, // Android status bar spacing
    },
    screenTitle: {
        fontSize: 22,
        fontWeight: '800', // Zyada bold
        color: '#1F2937',
    },
    unreadBadge: {
        backgroundColor: ACTIVE_COLOR,
        borderRadius: 15,
        paddingHorizontal: 8,
        paddingVertical: 3,
        minWidth: 30,
        alignItems: 'center',
        justifyContent: 'center',
    },
    unreadBadgeText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: 'bold',
    },
    scrollViewContent: {
        paddingHorizontal: 15,
        paddingBottom: 30,
    },
    statsBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#FFF',
        marginBottom: 15, // Zyada space
        marginHorizontal: 15,
        borderRadius: 20, // Full rounded
        marginTop: 10,
        // softShadow is applied inline
    },
    statBox: {
        alignItems: 'center',
    },
    statCount: {
        fontSize: 28, // Zyada bada font
        fontWeight: '900',
        color: PRIMARY_COLOR,
    },
    statLabel: {
        fontSize: 14,
        color: '#6B7280',
    },
    markAllReadButtonAll: { // Renamed for clarity (Mark All Read button)
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderRadius: 12,
        // Background color is applied inline
    },
    markAllReadText: {
        color: '#FFF',
        fontWeight: '700',
        fontSize: 14,
    },
    sectionHeading: {
        fontSize: 15,
        fontWeight: '800',
        color: '#1F2937',
        marginTop: 20,
        marginBottom: 10,
        marginLeft: 5,
    },
    cardContainer: {
        flexDirection: 'row',
        backgroundColor: '#FFF',
        padding: 15,
        borderRadius: 18,
        marginBottom: 12,
    },
    unreadCard: {
        backgroundColor: '#EBF5FF', // Light Blue shade
    },
    cardIconBox: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 15,
        backgroundColor: '#F3F4F6', // Icon background
        alignSelf: 'flex-start',
    },
    cardContent: { // Main content area (title, message, button)
        flex: 1,
    },
    cardHeader: { // Header (Title, Time, and Dot)
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    cardTimeAndDot: { // Time and Dot container
        flexDirection: 'row',
        alignItems: 'center',
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: '#1F2937',
        flexShrink: 1, // Shrink title if long
        marginRight: 10,
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: ACTIVE_COLOR,
        marginLeft: 8,
    },
    cardMessage: {
        fontSize: 14,
        color: '#4B5563',
        marginBottom: 10, // Space before button
    },
    cardTime: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    // Mark as Read Button
    markAsReadButton: {
        alignSelf: 'flex-start', // Left align
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: '#6c85f5', // Light red background for active button
    },
    markAsReadText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '700',
    },
    iconPulse: {
        opacity: 0.9,
    },
    noNotifications: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 80,
    },
    noNotificationsText: {
        marginTop: 10,
        fontSize: 16, // Slightly smaller
        color: '#9CA3AF',
        fontWeight: '600',
    }
});
