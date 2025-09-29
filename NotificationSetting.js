import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, StatusBar, TextInput, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { Colors } from './constants/colors';
import Navbar from './components/Navbar';
import { rescheduleAllTimeBasedReminders, clearAllSchedulingCaches } from './services/notificationService';

const TIME_OPTIONS = [
  { label: '5 minutes before', value: 5 },
  { label: '10 minutes before', value: 10 },
  { label: '30 minutes before', value: 30 },
  { label: 'Custom', value: -1 },
];

const LOCATION_OPTIONS = [
  { label: '20 meters away', value: 20 },
  { label: '50 meters away', value: 50 },
  { label: '100 meters away', value: 100 },
  { label: 'Custom', value: -1 },
];

export default function NotificationSettings({ navigation }) {
  const [tab, setTab] = useState('time'); // 'time' | 'location'
  // time settings
  const [selected, setSelected] = useState(5);
  const [customMinutes, setCustomMinutes] = useState('');
  // location settings
  const [distanceSelected, setDistanceSelected] = useState(20);
  const [customMeters, setCustomMeters] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // time
        const stored = await AsyncStorage.getItem('notificationLeadMinutes');
        const custom = await AsyncStorage.getItem('notificationCustomMinutes');
        if (stored) {
          const m = parseInt(stored, 10);
          setSelected(isNaN(m) ? 5 : m);
        }
        if (custom) setCustomMinutes(custom);
        // location
        const dStored = await AsyncStorage.getItem('locationProximityMeters');
        const dCustom = await AsyncStorage.getItem('locationProximityCustom');
        if (dStored) {
          const dm = parseInt(dStored, 10);
          setDistanceSelected(isNaN(dm) ? 20 : dm);
        }
        if (dCustom) setCustomMeters(dCustom);
      } catch (e) {}
    })();
  }, []);

  const save = async () => {
    try {
      setLoading(true);
      // time
      if (selected === -1) {
        const cm = parseInt(customMinutes, 10);
        if (isNaN(cm) || cm <= 0) {
          Alert.alert('Invalid', 'Please enter a valid number of minutes');
          return;
        }
        await AsyncStorage.setItem('notificationLeadMinutes', String(-1));
        await AsyncStorage.setItem('notificationCustomMinutes', String(cm));
      } else {
        await AsyncStorage.setItem('notificationLeadMinutes', String(selected));
      }
      // location
      if (distanceSelected === -1) {
        const c = parseInt(customMeters, 10);
        if (isNaN(c) || c <= 0) {
          Alert.alert('Invalid', 'Please enter a valid distance in meters');
          return;
        }
        await AsyncStorage.setItem('locationProximityMeters', String(-1));
        await AsyncStorage.setItem('locationProximityCustom', String(c));
      } else {
        await AsyncStorage.setItem('locationProximityMeters', String(distanceSelected));
      }
      // Clear caches and reschedule all upcoming time-based reminders to apply new lead minutes
      try {
        await clearAllSchedulingCaches();
        await rescheduleAllTimeBasedReminders();
      } catch {}
      Alert.alert('Saved', 'Notification preferences updated');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setLoading(false);
    }
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
          <Text style={styles.headerTitle}>Notification Settings</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity onPress={() => setTab('time')} style={[styles.tabBtn, tab === 'time' && styles.tabBtnActive]}>
            <Text style={[styles.tabText, tab === 'time' && styles.tabTextActive]}>Preference</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTab('location')} style={[styles.tabBtn, tab === 'location' && styles.tabBtnActive]}>
            <Text style={[styles.tabText, tab === 'location' && styles.tabTextActive]}>Location</Text>
          </TouchableOpacity>
        </View>

        {/* Options */}
        {tab === 'time' ? (
          <View style={{ paddingHorizontal: 20 }}>
            {TIME_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.option}
                onPress={() => setSelected(opt.value)}
              >
                <View style={[styles.radioOuter, selected === opt.value && styles.radioOuterActive]}>
                  {selected === opt.value && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.optionText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}

            {selected === -1 && (
              <View style={styles.customRow}>
                <Feather name="clock" size={20} color={Colors.primary} />
                <TextInput
                  style={styles.customInput}
                  placeholder="Enter minutes"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  value={customMinutes}
                  onChangeText={setCustomMinutes}
                />
                <Text style={styles.customSuffix}>minutes</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20 }}>
            {LOCATION_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.option}
                onPress={() => setDistanceSelected(opt.value)}
              >
                <View style={[styles.radioOuter, distanceSelected === opt.value && styles.radioOuterActive]}>
                  {distanceSelected === opt.value && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.optionText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}

            {distanceSelected === -1 && (
              <View style={styles.customRow}>
                <Feather name="map-pin" size={20} color={Colors.primary} />
                <TextInput
                  style={styles.customInput}
                  placeholder="Enter meters"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  value={customMeters}
                  onChangeText={setCustomMeters}
                />
                <Text style={styles.customSuffix}>meters</Text>
              </View>
            )}
          </View>
        )}

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={save}
          disabled={loading}
        >
          <Text style={styles.saveButtonText}>{loading ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
      <Navbar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.background, paddingBottom: 140 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20,paddingTop: 35 },
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: 'bold' },
  tabsRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12 },
  tabBtn: { flex: 1, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: Colors.badge, alignItems: 'center' },
  tabBtnActive: { borderBottomColor: Colors.primary },
  tabText: { color: Colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: Colors.text },
  option: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, padding: 15, marginBottom: 12,
  },
  optionText: { color: Colors.text, fontSize: 15, marginLeft: 8 },
  radioOuter: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.textMuted, justifyContent: 'center', alignItems: 'center' },
  radioOuterActive: { borderColor: Colors.primary },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary },
  customRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, padding: 15, marginBottom: 12 },
  customInput: { color: Colors.text, marginLeft: 10, flex: 1, fontSize: 15 },
  customSuffix: { color: Colors.textMuted },
  saveButton: { backgroundColor: Colors.primary, paddingVertical: 15, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginHorizontal: 20, marginTop: 20 },
  saveButtonDisabled: { backgroundColor: Colors.textMuted },
  saveButtonText: { color: Colors.btnText, fontSize: 16, fontWeight: 'bold' },
});
