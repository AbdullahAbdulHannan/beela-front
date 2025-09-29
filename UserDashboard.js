import React, { useState, useEffect } from 'react';
import { Linking, Alert, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Platform,
  StatusBar,
  NativeModules,
} from 'react-native';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import { Colors } from './constants/colors';
import Navbar from './components/Navbar';
import { useOnboardingTarget } from './components/OnboardingProvider';

const UserDashboard = () => {
  const [activeTab, setActiveTab] = useState('Notifications');
  const [isSyncing, setIsSyncing] = useState(false);
  const [batteryIgnored, setBatteryIgnored] = useState(true);
  const navigation = useNavigation();

  // Onboarding targets
  const headerProfileRef = useOnboardingTarget('header-profile');
  const featureCreateRef = useOnboardingTarget('feature-create');
  const featureSyncRef = useOnboardingTarget('feature-sync');
  const featureMeetingsRef = useOnboardingTarget('feature-meetings');

  const features = [
    { id: '1', title: 'Create Reminder', subtitle: 'Add To-Do', icon: 'list-ul' },
    { id: '2', title: 'Sync Google Calendar', subtitle: 'Connect Calendar', icon: 'calendar-alt' },
    { id: '3', title: 'Meetings & Events', subtitle: 'Upcoming Events', icon: 'users' },
    { id: '4', title: 'Voice/Preferences', subtitle: 'Personalize Me', icon: 'microphone-alt' },
  ];

  const bottomTabs = [
    { name: 'Notifications', icon: 'bell', library: 'Feather' },
    { name: 'Voice Assistant', icon: 'mic', library: 'Feather' },
    { name: 'AI Insights', icon: 'lightbulb', library: 'FontAwesome5' },
  ];

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

  const openBatteryOptSettings = async () => {
    try {
      await NativeModules?.AlarmScheduler?.requestIgnoreBatteryOptimizations?.();
    } catch {}
  };

  // Open OEM Autostart / Background start settings without alerts
  const openAutostartSettings = async () => {
    try {
      await NativeModules?.AlarmScheduler?.openOemPowerSettings?.();
    } catch {}
  };

  const handleProfilePress = () => {
   navigation.navigate('Profile')
  };

  const handleMicPress = () => {
    // Handle mic press
    console.log('Mic pressed');  
  };

  const navigateToCalendar = () => {
    navigation.navigate('Calendar');
  };

  const handleGoogleCalendarSync = async () => {
    try {
      setIsSyncing(true);
      // Get the auth URL from the backend
      const response = await fetch('https://voxa-backend-three.vercel.app/api/auth/calendar', {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await AsyncStorage.getItem('userToken')}`
        }
      });
      const responseData = await response.json();
      if (!response.ok) {
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

      // After closing/dismissing, verify with backend before showing any success
      try {
        const verifyResp = await fetch('https://voxa-backend-three.vercel.app/api/calendar/events', {
          headers: { 'Authorization': `Bearer ${await AsyncStorage.getItem('userToken')}` }
        });
        if (verifyResp.ok) {
          Alert.alert('Success', 'Google Calendar has been successfully connected.');
        } else {
          // Do not show success if not actually synced (e.g., user canceled)
        }
      } catch {}
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to sync Google Calendar');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTabPress = (tabName) => {
    setActiveTab(tabName);
  };

  const showPermBanner = Platform.OS === 'android' && (batteryIgnored !== true);
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.backgroundStatus} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollViewContent}>
          <View style={styles.header}>
            <TouchableOpacity ref={headerProfileRef} collapsable={false} onPress={() => navigation.navigate('Profile')} >
              <Feather name="user" size={24} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity>
              <Feather name="mic" size={24} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {showPermBanner && (
            <View style={styles.permBanner}>
              <Text style={styles.permTitle}>Improve notification reliability</Text>
              {/* Autostart (Background start) recommendation for strict OEMs */}
              <View style={styles.permRow}>
                <Text style={styles.permText}>Enable Autostart / Background start</Text>
                <TouchableOpacity style={styles.permBtn} onPress={openAutostartSettings}>
                  <Text style={styles.permBtnText}>Open</Text>
                </TouchableOpacity>
              </View>
              {!batteryIgnored && (
                <View style={styles.permRow}>
                  <Text style={styles.permText}>Disable battery optimizations</Text>
                  <TouchableOpacity style={styles.permBtn} onPress={openBatteryOptSettings}>
                    <Text style={styles.permBtnText}>Open</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity style={[styles.permBtn, { alignSelf: 'flex-start', marginTop: 6 }]} onPress={refreshPermissions}>
                <Text style={styles.permBtnText}>Re-check</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.mainContent}>
            <Text style={styles.sectionTitle}>Main Features</Text>
            {/* Feature Cards Grid */}
            <View style={styles.featuresGrid}>
              {features.map((feature) => (
                <TouchableOpacity 
                  key={feature.id} 
                  style={styles.card}
                  ref={
                    feature.id === '1' ? featureCreateRef :
                    feature.id === '2' ? featureSyncRef :
                    feature.id === '3' ? featureMeetingsRef : undefined
                  }
                  collapsable={false}
                  onPress={feature.onPress || (() => {
                    if (feature.id === '1') {
                      navigation.navigate('CreateReminder');
                    } else if (feature.id === '2' && !feature.onPress) {
                      handleGoogleCalendarSync();
                    } else if (feature.id === '3') {
                      navigation.navigate('Planner');
                    }
                  })} 
                  disabled={feature.id === '2' && isSyncing}
                  >
                  <View>
                    <FontAwesome5 
                      name={feature.icon} 
                      size={24} 
                      color={Colors.primary} 
                    />
                    {feature.id === '2' && isSyncing && (
                      <ActivityIndicator style={styles.syncIndicator} color={Colors.primary} />
                    )}
                  </View>
                  <View>
                    <Text style={styles.cardTitle}>
                      {feature.title}
                    </Text>
                    <Text style={styles.cardSubtitle}>
                      {feature.id === '2' && isSyncing ? 'Syncing...' : feature.subtitle}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    
      {/* The pre-made Navbar component */}
      <Navbar />
    </View>
  );
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
  mainContent: {
    paddingHorizontal: 20,
    marginTop: 35,
  },
  sectionTitle: {
    color: Colors.primary,
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '47%',
    backgroundColor: '#57500021',
    // opacity:'70',
    borderRadius: 15,
    padding: 15,
    marginBottom: 20,
    height: 140,
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 5,
  },
  permBanner: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginHorizontal: 20,
    padding: 12,
    marginBottom: 12,
  },
  permTitle: { color: Colors.primary, fontWeight: '700', marginBottom: 6 },
  permRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  permText: { color: Colors.text, flex: 1, marginRight: 12 },
  permBtn: { backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  permBtnText: { color: Colors.btnText, fontWeight: '700' },
});

export default UserDashboard;