import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Platform,
  StatusBar,
  TextInput,
  Image,
  Modal,
  TouchableWithoutFeedback,
  Alert,
  ActivityIndicator
} from 'react-native';
import { Feather, FontAwesome5, AntDesign, Fontisto } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Navbar from './components/Navbar';
import DateTimePicker from '@react-native-community/datetimepicker';
import { createReminder, updateReminder as updateReminderApi } from './services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleReminderSpeechNotification } from './services/notificationService';
import { Colors } from './constants/colors';
import { useOnboardingTarget } from './components/OnboardingProvider';

const starIcon = require('./assets/star_icon.png'); 

// List of available icons
const ICONS = [
  { name: 'star', component: 'Feather' },
  { name: 'calendar', component: 'Feather' },
  { name: 'map-pin', component: 'Feather' },
  { name: 'bell', component: 'Feather' },
  { name: 'phone', component: 'Feather' },
  { name: 'mail', component: 'Feather' },
  { name: 'home', component: 'Feather' },
  { name: 'briefcase', component: 'Feather' },
  { name: 'heart', component: 'Feather' },
  { name: 'shopping-bag', component: 'Feather' },
  { name: 'coffee', component: 'Feather' },
  { name: 'gift', component: 'Feather' },
];
const extractCoordsFromUrl = (url) => {
  try {
    if (!url) return null;
    const working = url;
    // @lat,lng
    let m = working.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
    // q=lat,lng
    m = working.match(/[?&]q=([^&]+)/);
    if (m) {
      const decoded = decodeURIComponent(m[1]);
      const mm = decoded.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (mm) {
        const lat = parseFloat(mm[1]);
        const lng = parseFloat(mm[2]);
        if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
      }
    }
    // ll= or sll= or destination=
    m = working.match(/[?&](ll|sll|destination)=([^&]+)/);
    if (m) {
      const decoded = decodeURIComponent(m[2]);
      const mm = decoded.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (mm) {
        const lat = parseFloat(mm[1]);
        const lng = parseFloat(mm[2]);
        if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
      }
    }
    // generic
    m = working.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (!isNaN(lat) && !isNaN(lng) && lat <= 90 && lat >= -90 && lng <= 180 && lng >= -180) return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
};
const CreateReminder = ({ route }) => {
  const navigation = useNavigation();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedType, setSelectedType] = useState(route.params?.type || 'Task');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState('star'); 
  const [dateType, setDateType] = useState('start'); 
  const [startDate, setStartDate] = useState(new Date()); 
  const [mode, setMode] = useState('date'); 
  const [tempDate, setTempDate] = useState(new Date()); 
  // Location-based fields
  const [locationTitle, setLocationTitle] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [locationDailyChecked, setLocationDailyChecked] = useState(true); // true = every day
  const [locationScheduleDays, setLocationScheduleDays] = useState([]); // [0..6] when not daily
  const [note, setNote] = useState(''); // used for Task/Meeting description/title
  // Manual scheduling state
  const [isManualSchedule, setIsManualSchedule] = useState(false);
  const [scheduleType, setScheduleType] = useState('one-day'); // 'one-day' | 'routine'
  const [fixedTime, setFixedTime] = useState('09:00'); // HH:mm for routine
  const [scheduleDays, setScheduleDays] = useState([]); // [] means daily
  const [dailyChecked, setDailyChecked] = useState(true); // UI helper for routine: [] means daily
  const [notificationMinutes, setNotificationMinutes] = useState(''); // per-item minutes for Meeting and one-day Task
  const [minutesBeforeStart, setMinutesBeforeStart] = useState(''); // for one-day Tasks
  const editReminder = route?.params?.editReminder;

  // Types for the top radio group
  const reminderTypes = ['Task', 'Meeting', 'Location'];

  // Routine time picker state
  const [showRoutineTimePicker, setShowRoutineTimePicker] = useState(false);
  const [routineTempDate, setRoutineTempDate] = useState(new Date());

  // Onboarding targets for radios
  const taskRadioRef = useOnboardingTarget('cr-task');
  const meetingRadioRef = useOnboardingTarget('cr-meeting');
  const locationRadioRef = useOnboardingTarget('cr-location');

  // Prefill in edit mode
  useEffect(() => {
    try {
      if (editReminder) {
        const typeFromRoute = route.params?.type || editReminder.type;
        if (typeFromRoute) setSelectedType(typeFromRoute);
        if (editReminder.title || editReminder.description) setNote(editReminder.description || editReminder.title || '');
        if (editReminder.icon) setSelectedIcon(editReminder.icon);

        const s = editReminder.startDate || editReminder.startTime || editReminder.start?.dateTime;
        if (s) setStartDate(new Date(s));

        // Prefill per-item notification minutes where applicable
        const pref = (editReminder.notificationPreferenceMinutes != null)
          ? editReminder.notificationPreferenceMinutes
          : (editReminder.scheduleTime?.minutesBeforeStart != null ? editReminder.scheduleTime.minutesBeforeStart : 10);
        setNotificationMinutes(typeof pref === 'number' && !isNaN(pref) ? pref : 10);

        if (typeFromRoute === 'Location' || editReminder.type === 'Location') {
          const days = Array.isArray(editReminder.scheduleDays) ? editReminder.scheduleDays : [];
          setLocationDailyChecked(days.length === 0);
          setLocationScheduleDays(days);
          if (editReminder.title) setLocationTitle(editReminder.title);
          if (editReminder.description) setLocationDescription(editReminder.description);
        }

        // Prefill manual schedule for Task/Meeting when present
        if (typeFromRoute !== 'Location') {
          const isManual = !!editReminder.isManualSchedule;
          const schType = editReminder.scheduleType || 'one-day';
          const mins = editReminder.scheduleTime?.minutesBeforeStart;
          const fx = editReminder.scheduleTime?.fixedTime || fixedTime;
          const days = Array.isArray(editReminder.scheduleDays) ? editReminder.scheduleDays : [];
          setIsManualSchedule(isManual);
          setScheduleType(schType);
          if (typeof mins === 'number' && !isNaN(mins)) setMinutesBeforeStart(mins);
          if (fx) setFixedTime(fx);
          setScheduleDays(days);
          setDailyChecked(days.length === 0);
        }
      }
    } catch (e) {
      // ignore bad prefill
    }
  }, [editReminder]);
  
  const getPlaceholderText = () => {
    switch(selectedType) {
      case 'Meeting':
        return 'Meeting Title';
      case 'Location':
        return 'Title (e.g., Gift, Bulb)';
      default:
        return 'What do you want to be reminded about?';
    }
  };

  const renderIcon = (icon) => {
    if (!icon || typeof icon !== 'object') return null;
    
    const { name, component } = icon;
    const isSelected = selectedIcon === name;
    const iconProps = {
      name,
      size: 24,
      color: isSelected ? Colors.primary : Colors.textMuted,
    };

    try {
      switch (component) {
        case 'FontAwesome5':
          return <FontAwesome5 {...iconProps} />;
        case 'AntDesign':
          return <AntDesign {...iconProps} />;
        case 'Fontisto':
          return <Fontisto {...iconProps} />;
        default:
          return <Feather {...iconProps} />;
      }
    } catch (error) {
      console.error('Error rendering icon:', error);
      return null;
    }
  }; 
 
  const showDateTimePicker = (type) => { 
    setDateType(type); 
    setTempDate(startDate); 
    setMode('date'); 
    setShowDatePicker(true); 
  }; 
 
  const onChange = (event, selectedDate) => { 
    const currentDate = selectedDate || tempDate; 
     
    if (event.type === 'dismissed') { 
      setShowDatePicker(false); 
      return; 
    } 
     
    if (mode === 'date') { 
      setTempDate(currentDate); 
      setMode('time'); 
      return; 
    } 
     
    setStartDate(currentDate); 
     
    setShowDatePicker(false); 
  }; 
 
  const formatDate = (date) => { 
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric', 
    }); 
  }; 

  const formatTime = (date) => {
    try {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const DayChip = ({ label, index }) => {
    const isSelected = (scheduleType === 'routine' && dailyChecked) || (Array.isArray(scheduleDays) && scheduleDays.includes(index));
    const toggle = () => {
      if (scheduleType === 'routine' && dailyChecked) {
        // Daily currently on -> uncheck daily and select all days except the one toggled off
        const all = [0,1,2,3,4,5,6];
        const arr = all.filter(d => d !== index);
        setDailyChecked(false);
        setScheduleDays(arr);
        return;
      }
      setScheduleDays((prev) => {
        const arr = Array.isArray(prev) ? [...prev] : [];
        const i = arr.indexOf(index);
        if (i >= 0) arr.splice(i, 1); else arr.push(index);
        // If all days selected, turn daily back on and clear list
        if (arr.length === 7) {
          setDailyChecked(true);
          return [];
        }
        return arr.sort();
      });
    };
    return (
      <TouchableOpacity
        onPress={toggle}
        style={{
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderRadius: 16,
          backgroundColor: isSelected ? Colors.primary : Colors.background,
          borderWidth: isSelected ? 0 : 1,
          borderColor: Colors.textMuted,
          minWidth: 32,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: isSelected ? Colors.black : Colors.text }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const renderDateTimeInputs = () => (
    <View>
      <TouchableOpacity style={styles.inputContainer} onPress={() => showDateTimePicker('start')}>
        <Feather name="clock" size={20} color={Colors.btnText} />
        <View style={styles.dateTimeInput}>
          <Text style={styles.dateTimeLabel}>Starts</Text>
          <Text style={styles.dateTimeText}>
            {formatDate(startDate)} • {formatTime(startDate)}
          </Text>
        </View>
        <Feather name="chevron-right" size={20} color={Colors.btnText} />
      </TouchableOpacity>
    </View>
  );
   
  const renderLocationInputs = () => (
    <View>
      {/* Title */}
      <View style={styles.inputContainer}>
        <Feather name="edit-2" size={20} color={Colors.btnText} />
        <TextInput
          style={styles.input}
          placeholder="Title (e.g., Gift, Bulb)"
          placeholderTextColor={Colors.btnText}
          value={locationTitle}
          onChangeText={setLocationTitle}
          selectionColor={Colors.btnText}
        />
      </View>
      {/* Description */}
      <View style={styles.inputContainer}>
        <Feather name="file-text" size={20} color={Colors.btnText} />
        <TextInput
          style={[styles.input, { minHeight: 50 }]}
          placeholder="Description (optional)"
          placeholderTextColor={Colors.btnText}
          multiline
          value={locationDescription}
          onChangeText={setLocationDescription}
          selectionColor={Colors.btnText}
        />
      </View>
      {/* Days (like Tasks): Daily + S M T W T F S */}
      <View style={{ marginTop: 6 }}>
        <View style={styles.inputContainer}>
          <Feather name="calendar" size={20} color={Colors.btnText} />
          <Text style={[styles.input, { color: Colors.btnText }]}>Days</Text>
        </View>
        <TouchableOpacity style={styles.checkboxRow} onPress={() => {
          const next = !locationDailyChecked; setLocationDailyChecked(next); if (next) setLocationScheduleDays([]);
        }}>
          <View style={[styles.checkbox, locationDailyChecked && styles.checkboxChecked]}>
            {locationDailyChecked && <Feather name="check" size={16} color={Colors.black} />}
          </View>
          <Text style={styles.checkboxLabel}>Daily</Text>
        </TouchableOpacity>
        <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:10 }}>
          {['S','M','T','W','T','F','S'].map((d,i)=> (
            <TouchableOpacity
              key={i}
              onPress={() => {
                if (locationDailyChecked) { setLocationDailyChecked(false); setLocationScheduleDays([i===0?0:i]); return; }
                setLocationScheduleDays(prev => {
                  const arr = Array.isArray(prev) ? [...prev] : [];
                  const idx = arr.indexOf(i===0?0:i);
                  if (idx>=0) arr.splice(idx,1); else arr.push(i===0?0:i);
                  if (arr.length===7) { setLocationDailyChecked(true); return []; }
                  return arr.sort();
                });
              }}
              style={{ paddingHorizontal:10, paddingVertical:8, borderRadius:16, backgroundColor: (!locationDailyChecked && locationScheduleDays.includes(i===0?0:i)) ? Colors.primary : Colors.background, borderWidth: (!locationDailyChecked && locationScheduleDays.includes(i===0?0:i)) ? 0 : 1, borderColor: Colors.textMuted, minWidth:32, alignItems:'center' }}
            >
              <Text style={{ color: (!locationDailyChecked && locationScheduleDays.includes(i===0?0:i)) ? Colors.black : Colors.text }}>{d}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={{ color: Colors.textMuted, fontSize:12 }}>* Daily checked = every day. Unselect any day to customize.</Text>
      </View>
    </View>
  );
 
  const handleSaveReminder = async () => {
    // Minimal loading only for validation/build, not for network/AI
    setIsLoading(true);
    try {
      // Validate Task title required
      if (selectedType === 'Task' || selectedType === 'Meeting') {
        const titleText = (note || '').trim();
        if (!titleText) {
          Alert.alert('Missing Title', `${selectedType} title is required.`);
          setIsLoading(false);
          return;
        }
      }
      // Validate Meeting start date
      if (selectedType === 'Meeting' && !(startDate instanceof Date)) {
        Alert.alert('Missing Start', 'Meeting start date/time is required.');
        setIsLoading(false);
        return;
      }
      // Format start date to ISO string
      const formattedStartDate = startDate.toISOString();
      
      // Basic validation for Location reminders
      if (selectedType === 'Location' && !String(locationTitle).trim()) {
        Alert.alert('Missing Title', 'Please enter a title for the location reminder');
        setIsLoading(false);
        return;
      }

      // Parse minutes only if provided
      const minutesBeforeStartNum = minutesBeforeStart === '' ? null : parseInt(String(minutesBeforeStart), 10);
      const notificationMinutesNum = notificationMinutes === '' ? null : parseInt(String(notificationMinutes), 10);

      const reminderData = {
        type: selectedType,
        title: selectedType === 'Location' ? String(locationTitle).trim() : ((note || '').trim() || (selectedType === 'Meeting' ? 'New Meeting' : 'Task')),
        description: selectedType === 'Location' ? String(locationDescription || '') : note,
        icon: selectedIcon || 'bell',
        ...(selectedType === 'Meeting' ? {
          // Meetings are always manual: one-day with per-item minutes
          isManualSchedule: true,
          scheduleType: 'one-day',
          startDate: startDate.toISOString(),
          ...(notificationMinutesNum != null ? { scheduleTime: { minutesBeforeStart: notificationMinutesNum } } : {}),
          scheduleDays: [],
          ...(notificationMinutesNum != null ? { notificationPreferenceMinutes: notificationMinutesNum } : {}),
        } : (selectedType !== 'Location' ? (() => {
          if (isManualSchedule) {
            if (scheduleType === 'one-day') {
              return {
                isManualSchedule: true,
                scheduleType: 'one-day',
                startDate: formattedStartDate,
                ...(minutesBeforeStartNum != null ? { scheduleTime: { minutesBeforeStart: minutesBeforeStartNum } } : {}),
                scheduleDays: [],
                ...(minutesBeforeStartNum != null ? { notificationPreferenceMinutes: minutesBeforeStartNum } : {}),
              };
            } else {
              return {
                isManualSchedule: true,
                scheduleType: 'routine',
                scheduleTime: { fixedTime },
                scheduleDays,
              };
            }
          }
          // Unscheduled: Gemini will fill
          return { isManualSchedule: false };
        })() : {})),
        ...(selectedType === 'Location' ? { status: 'active', ...(locationDailyChecked ? {} : { scheduleDays: locationScheduleDays }) } : {})
      };
      
      console.log('Sending reminder data:', JSON.stringify(reminderData, null, 2));
      
      let response;
      const editingId = editReminder?._id || editReminder?.id;
      if (editingId) {
        // Build updates object minimal
        const updates = {
          type: selectedType,
          title: reminderData.title,
          description: reminderData.description,
          icon: reminderData.icon,
          ...(selectedType === 'Meeting' ? {
            startDate: formattedStartDate,
            isManualSchedule: true,
            scheduleType: 'one-day',
            scheduleTime: { minutesBeforeStart: notificationMinutes },
            scheduleDays: [],
            notificationPreferenceMinutes: notificationMinutes,
          } : (selectedType !== 'Location' ? (() => {
            if (scheduleType === 'one-day') {
              return { startDate: formattedStartDate, scheduleType: 'one-day', scheduleTime: { minutesBeforeStart }, scheduleDays: [], notificationPreferenceMinutes: minutesBeforeStart, isManualSchedule: !!isManualSchedule };
            }
            if (isManualSchedule && scheduleType === 'routine') {
              return { isManualSchedule: true, scheduleType: 'routine', scheduleTime: { fixedTime }, scheduleDays: dailyChecked ? [] : scheduleDays };
            }
            return { isManualSchedule: false };
          })() : {})),
          ...(selectedType === 'Location' ? { status: 'active', ...(locationDailyChecked ? {} : { scheduleDays: locationScheduleDays }) } : {}),
        };
        // Fire-and-forget update; but we still await to ensure user changes are applied immediately on edit
        response = await updateReminderApi(editingId, updates);
        response = { success: true, data: response };
      } else {
        // Build creation payload
        const payload = {
          type: selectedType,
          title: reminderData.title,
          description: reminderData.description,
          icon: reminderData.icon,
          ...(selectedType === 'Meeting' ? {
            isManualSchedule: true,
            scheduleType: 'one-day',
            startDate: formattedStartDate,
            ...(notificationMinutesNum != null ? { scheduleTime: { minutesBeforeStart: notificationMinutesNum } } : {}),
            scheduleDays: [],
            ...(notificationMinutesNum != null ? { notificationPreferenceMinutes: notificationMinutesNum } : {}),
          } : (selectedType !== 'Location' ? (() => {
            if (isManualSchedule) {
              if (scheduleType === 'one-day') {
                return { isManualSchedule: true, scheduleType: 'one-day', startDate: formattedStartDate, ...(minutesBeforeStartNum != null ? { scheduleTime: { minutesBeforeStart: minutesBeforeStartNum }, notificationPreferenceMinutes: minutesBeforeStartNum } : {}), scheduleDays: [] };
              }
              return { isManualSchedule: true, scheduleType: 'routine', scheduleTime: { fixedTime }, scheduleDays: dailyChecked ? [] : scheduleDays };
            }
            return { isManualSchedule: false };
          })() : {})),
          ...(selectedType === 'Location' ? { status: 'active', ...(locationDailyChecked ? {} : { scheduleDays: locationScheduleDays }) } : {})
        };
        // Non-blocking create for all cases: fire-and-forget, schedule after ID arrives
        (async () => {
          try {
            const saved = await createReminder(payload);
            const savedData = saved?.data || saved?.reminder || null;
            if (savedData && ((selectedType === 'Meeting') || (selectedType === 'Task' && isManualSchedule && scheduleType === 'one-day'))) {
              const savedId = savedData._id || savedData.id;
              const nm = selectedType === 'Meeting' ? notificationMinutesNum : minutesBeforeStartNum;
              await scheduleReminderSpeechNotification({
                username: 'there',
                meetingName: payload.title,
                startDateISO: payload.startDate || formattedStartDate,
                reminderId: savedId,
                textHash: null,
                replaceExisting: true,
                leadMinutes: nm != null ? nm : undefined,
              });
            }
          } catch (e) {
            console.warn('Background create failed', e?.message);
          }
        })();
        Alert.alert('Success', 'Reminder saved!');
        navigation.goBack();
        setIsLoading(false);
        return; // exit early
      }
      
      if (response.success) {
        // For Location type, no geofencing; background scanning will handle triggers
        // Success; Gemini and TTS continue in background
        Alert.alert('Success', editingId ? 'Reminder updated successfully!' : 'Reminder saved!');
        navigation.goBack();
      } else {
        Alert.alert('Error', response.message || 'Failed to save reminder');
      }
    } catch (error) {
      console.error('Error saving reminder:', error);
      const errorMessage = error.response?.data?.message || error.message || 'An error occurred while saving the reminder';
      console.error('Full error details:', error.response?.data);
      // On create we already returned; this path is mainly for edit
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
 
  return ( 
    <View style={styles.container}> 
      <StatusBar barStyle="light-content" backgroundColor={Colors.backgroundStatus} /> 
      <SafeAreaView style={styles.safeArea}> 
        <ScrollView contentContainerStyle={styles.scrollViewContent}> 
          {/* Header */} 
          <View style={styles.header}> 
            <TouchableOpacity onPress={() => navigation.goBack()}> 
              <Feather name="chevron-left" size={24} color={Colors.primary} /> 
            </TouchableOpacity> 
            <Text style={styles.headerTitle}>Create New Reminder</Text> 
            <View style={{ width: 24 }} /> 
          </View> 
 
          {/* Reminder Type */} 
          <View style={styles.reminderTypeContainer}> 
            {reminderTypes.map((type) => ( 
              <TouchableOpacity 
                key={type} 
                style={styles.typeButton} 
                onPress={() => setSelectedType(type)} 
              > 
                <View
                  ref={
                    type === 'Task' ? taskRadioRef :
                    type === 'Meeting' ? meetingRadioRef :
                    type === 'Location' ? locationRadioRef : undefined
                  }
                  collapsable={false}
                >
                  <View style={[ 
                    styles.radioOuter, 
                    selectedType === type && styles.radioOuterActive 
                  ]}> 
                    {selectedType === type && <View style={styles.radioInner} />} 
                  </View> 
                </View>
                <Text style={[ 
                  styles.typeText, 
                  selectedType === type && styles.activeTypeText 
                ]}> 
                  {type} 
                </Text> 
              </TouchableOpacity> 
            ))} 
          </View> 
 
          {/* Manual Schedule (Tasks only) */}
          {selectedType === 'Task' && (
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.sectionTitle}>Manual Schedule</Text>
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => setIsManualSchedule((v)=>!v)}
              >
                <View style={[styles.checkbox, isManualSchedule && styles.checkboxChecked]}>
                  {isManualSchedule && <Feather name="check" size={16} color={Colors.black} />}
                </View>
                <Text style={styles.checkboxLabel}>Enable manual schedule</Text>
              </TouchableOpacity>
              {isManualSchedule && (
                <View>
                  {/* Tab-style toggle for One-day vs Routine (consistent with Planner tabs) */}
                  <View style={styles.smallTabsContainer}>
                    {['one-day','routine'].map((tab) => (
                      <TouchableOpacity
                        key={tab}
                        style={[styles.smallTabButton, scheduleType === tab && styles.smallActiveTabButton]}
                        onPress={() => {
                          if (tab === 'one-day') setScheduleType('one-day');
                          else { setScheduleType('routine'); setDailyChecked(true); setScheduleDays([]); }
                        }}
                      >
                        <Text style={[styles.smallTabText, scheduleType === tab && styles.smallActiveTabText]}>
                          {tab === 'one-day' ? 'One-day' : 'Routine'}
                        </Text>
                        <View style={[styles.smallTabUnderline, scheduleType === tab && styles.smallTabUnderlineActive]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                  {scheduleType === 'one-day' && (
                    <View>
                      {renderDateTimeInputs()}
                      <View style={styles.inputContainer}>
                        <Feather name="bell" size={20} color={Colors.btnText} />
                        <TextInput
                          style={styles.input}
                          keyboardType="numeric"
                          value={String(minutesBeforeStart)}
                          onChangeText={(t)=>{
                            const n = parseInt(t||'10',10); setMinutesBeforeStart(isNaN(n)?10:n);
                          }}
                          placeholder="Remind me minutes before start"
                          placeholderTextColor={Colors.btnText}
                        />
                        
                      </View>
                      {/* Routine day selection moved to routine section below */}
                    </View>
                  )}
                  {scheduleType === 'routine' && (
                    <View>
                      <TouchableOpacity
                        style={styles.inputContainer}
                        onPress={() => {
                          // Parse current fixedTime to a Date for the picker
                          try {
                            const [hh, mm] = String(fixedTime || '09:00').split(':').map(x => parseInt(x, 10));
                            const d = new Date();
                            d.setHours(isNaN(hh) ? 9 : hh, isNaN(mm) ? 0 : mm, 0, 0);
                            setRoutineTempDate(d);
                          } catch { setRoutineTempDate(new Date()); }
                          setShowRoutineTimePicker(true);
                        }}
                      >
                        <Feather name="clock" size={20} color={Colors.btnText} />
                        <Text style={styles.input}>
                          {fixedTime || 'Fixed time (tap to select)'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.checkboxRow} onPress={()=>{
                        const next = !dailyChecked; setDailyChecked(next); if (next) setScheduleDays([]);
                      }}>
                        <View style={[styles.checkbox, dailyChecked && styles.checkboxChecked]}>
                          {dailyChecked && <Feather name="check" size={16} color={Colors.black} />}
                        </View>
                        <Text style={styles.checkboxLabel}>Daily</Text>
                      </TouchableOpacity>
                      <View style={{ flexDirection:'row', justifyContent:'space-between', marginBottom:10 }}>
                        {['S','M','T','W','T','F','S'].map((d,i)=> (
                          <DayChip key={i} label={d} index={i===0?0:i} />
                        ))}
                      </View>
                      <Text style={{ color: Colors.textMuted, fontSize:12 }}>* Daily checked = every day. Unselect any day to customize.</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Meeting Inputs */}
          {selectedType === 'Meeting' && (
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.sectionTitle}>Meeting Details</Text>
              {renderDateTimeInputs()}
              <View style={styles.inputContainer}>
                <Feather name="bell" size={20} color={Colors.btnText} />
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={String(notificationMinutes)}
                  onChangeText={(t)=> setNotificationMinutes(t.replace(/[^0-9]/g, ''))}
                  placeholder="Notification minutes before start (default 10)"
                  placeholderTextColor={Colors.btnText}
                />
              </View>
              {notificationMinutes !== '' && (
                <Text style={{ color: Colors.textMuted, fontSize: 12, marginLeft: 6 }}>
                  You'll be notified {Number(notificationMinutes)} minutes before the meeting.
                </Text>
              )}
            </View>
          )}

          {/* Location Inputs */} 
          {selectedType === 'Location' && renderLocationInputs()} 
 
          {/* Note Input (only for Task/Meeting) */}
          {selectedType !== 'Location' && (
            <View style={styles.inputContainer}>
              <Feather name="edit-2" size={20} color={Colors.btnText} />
              <TextInput
                style={[styles.input, {minHeight: 50}]}
                placeholder={getPlaceholderText()}
                placeholderTextColor={Colors.btnText}
                multiline
                value={note}
                onChangeText={setNote}
                selectionColor={Colors.btnText}
              />
            </View>
          )}
 
          {/* Icon Grid */}
          <View style={styles.iconContainer}>
            <Text style={styles.sectionTitle}>Select an icon</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.iconScrollView}
            >
              {ICONS.map((icon, index) => (
                <TouchableOpacity 
                  key={index}
                  style={[
                    styles.iconButton, 
                    selectedIcon === icon.name && styles.selectedIconButton
                  ]}
                  onPress={() => setSelectedIcon(icon.name)}
                >
                  {renderIcon(icon)}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          {/* Date/Time Picker Modal */} 
          <Modal 
            visible={showDatePicker} 
            transparent={true} 
            animationType="slide" 
            onRequestClose={() => setShowDatePicker(false)} 
          > 
            <TouchableWithoutFeedback onPress={() => setShowDatePicker(false)}> 
              <View style={styles.modalOverlay} /> 
            </TouchableWithoutFeedback> 
            <View style={styles.modalContent}> 
             
              <DateTimePicker 
                value={tempDate} 
                mode={mode} 
                display={Platform.OS === 'ios' ? 'spinner' : 'default'} 
                onChange={onChange} 
                minimumDate={new Date()} 
                {...(Platform.OS === 'ios' ? { themeVariant: 'dark' } : {})} 
              /> 
          
            </View> 
          </Modal> 

          {/* Routine Fixed Time Picker Modal */}
          <Modal
            visible={showRoutineTimePicker}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setShowRoutineTimePicker(false)}
          >
            <TouchableWithoutFeedback onPress={() => setShowRoutineTimePicker(false)}>
              <View style={styles.modalOverlay} />
            </TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              <DateTimePicker
                value={routineTempDate}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selected) => {
                  const current = selected || routineTempDate;
                  if (event.type === 'dismissed') { setShowRoutineTimePicker(false); return; }
                  try {
                    const hh = String(current.getHours()).padStart(2,'0');
                    const mm = String(current.getMinutes()).padStart(2,'0');
                    setFixedTime(`${hh}:${mm}`);
                  } catch {}
                  setShowRoutineTimePicker(false);
                }}
                {...(Platform.OS === 'ios' ? { themeVariant: 'dark' } : {})}
              />
            </View>
          </Modal>
          {/* Save Button */} 
          <TouchableOpacity 
            style={[styles.saveButton, isLoading && styles.saveButtonDisabled]}
            onPress={handleSaveReminder}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={Colors.black} />
            ) : (
              <Text style={styles.saveButtonText}>+ Save</Text>
            )}
          </TouchableOpacity> 
        </ScrollView> 
      </SafeAreaView> 
 
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
  safeArea: { flex: 1 }, 
  scrollViewContent: { paddingBottom: 220, paddingHorizontal: 20 }, 
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 25, 
    paddingTop: 35, 

  }, 
  headerTitle: { color: Colors.text, fontSize: 18, fontWeight: 'bold' }, 
  reminderTypeContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    alignItems: 'center', 
    marginBottom: 20, 
  }, 
  typeButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 }, 
  radioOuter: { 
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.primary, 
    justifyContent: 'center', alignItems: 'center', marginRight: 8, 
  }, 
  radioOuterActive: { borderColor: Colors.primary }, 
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary }, 
  typeText: { color: Colors.text, opacity: 0.7, fontSize: 14 }, 
  activeTypeText: { fontWeight: 'bold', color: Colors.text }, 
 
  inputContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: Colors.primary, 
    borderRadius: 12, 
    paddingHorizontal: 15, 
    paddingVertical: 12, 
    marginBottom: 15, 
  }, 
  input: { 
    color: Colors.btnText, 
    flex: 1, 
    fontSize: 15, 
    paddingLeft: 10, 
  }, 
 
  dateTimeInput: { flex: 1, marginLeft: 10 }, 
  dateTimeLabel: { color: Colors.btnText, fontSize: 12, marginBottom: 2 }, 
  dateTimeText: { color: Colors.btnText, fontSize: 16 }, 
 
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' }, 
  modalContent: { 
    backgroundColor: '#1C1C1C', 
    borderTopLeftRadius: 20, 
    borderTopRightRadius: 20, 
    padding: 20, 
    position: 'absolute', 
    bottom: 0, 
    left: 0, 
    right: 0, 
  }, 
  pickerHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 15, 
  }, 
  pickerTitle: { color: Colors.text, fontSize: 18, fontWeight: 'bold' }, 
  closeButton: { padding: 5 }, 
  continueButton: { 
    backgroundColor: Colors.primary, 
    padding: 15, 
    borderRadius: 10, 
    alignItems: 'center', 
    marginTop: 10, 
  }, 
  continueButtonText: { color: Colors.black, fontWeight: 'bold', fontSize: 16 }, 
   iconContainer: {
    marginBottom: 25,
    width: '100%',
  },
  iconScrollView: {
    paddingHorizontal: 10,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingLeft: 5,
  },
  iconButton: {
    backgroundColor: Colors.background,
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 5,
  },
  selectedIconButton: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  iconImage: {
    width: 30,
    height: 30,
    // tintColor: '#D4AF37',
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 15,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 20,
  },
  saveButtonDisabled: {
    backgroundColor: Colors.textMuted,
  },
  saveButtonText: { color: Colors.btnText, fontSize: 16, fontWeight: 'bold' }, 
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: Colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', marginRight: 8 },
  checkboxChecked: { backgroundColor: Colors.primary },
  checkboxLabel: { color: Colors.text, fontSize: 14 },
  // Small tabs (One-day vs Routine)
  smallTabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  smallTabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  smallActiveTabButton: { backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent' },
  smallTabText: { color: Colors.textMuted, fontWeight: '600' },
  smallActiveTabText: { color: Colors.text },
  smallTabUnderline: { height: 2, width: '60%', backgroundColor: 'transparent', marginTop: 6, borderRadius: 1 },
  smallTabUnderlineActive: { backgroundColor: Colors.primary },
}); 

export default CreateReminder;
