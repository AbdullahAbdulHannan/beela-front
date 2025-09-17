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
import { createReminder, updateReminder as updateReminderApi, ensureReminderTTS } from './services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleReminderSpeechNotification, startGeofencingForLocationReminder } from './services/notificationService';
import { Colors } from './constants/colors';

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
  const [endDate, setEndDate] = useState(() => { 
    const date = new Date(); 
    date.setHours(date.getHours() + 1); 
    return date; 
  }); 
  const [mode, setMode] = useState('date'); 
  const [tempDate, setTempDate] = useState(new Date()); 
  const [locationName, setLocationName] = useState(''); 
  const [locationLink, setLocationLink] = useState(''); 
  const [note, setNote] = useState(''); 
  const editReminder = route?.params?.editReminder;
 
  const reminderTypes = ['Task', 'Meeting', 'Location'];

  // Prefill in edit mode
  useEffect(() => {
    try {
      if (editReminder) {
        const typeFromRoute = route.params?.type || editReminder.type;
        if (typeFromRoute) setSelectedType(typeFromRoute);
        if (editReminder.title || editReminder.description) setNote(editReminder.description || editReminder.title || '');
        if (editReminder.icon) setSelectedIcon(editReminder.icon);

        const s = editReminder.startDate || editReminder.startTime || editReminder.start?.dateTime;
        const e = editReminder.endDate || editReminder.endTime || editReminder.end?.dateTime || s;
        if (s) setStartDate(new Date(s));
        if (e) setEndDate(new Date(e));

        if (typeFromRoute === 'Location' || editReminder.type === 'Location') {
          const loc = editReminder.location || {};
          if (loc.name) setLocationName(loc.name);
          if (loc.link) setLocationLink(loc.link);
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
        return 'Add a note (optional)';
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
    setTempDate(type === 'start' ? startDate : endDate); 
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
     
    if (dateType === 'start') { 
      setStartDate(currentDate); 
      if (currentDate >= endDate) { 
        const newEndDate = new Date(currentDate); 
        newEndDate.setHours(newEndDate.getHours() + 1); 
        setEndDate(newEndDate); 
      } 
    } else { 
      setEndDate(currentDate); 
    } 
     
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
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); 
  }; 
   
  const renderDateTimeInputs = () => ( 
    <View> 
      <TouchableOpacity 
        style={styles.inputContainer} 
        onPress={() => showDateTimePicker('start')} 
      > 
        <Feather name="clock" size={20} color={Colors.btnText} /> 
        <View style={styles.dateTimeInput}> 
          <Text style={styles.dateTimeLabel}>Starts</Text> 
          <Text style={styles.dateTimeText}> 
            {formatDate(startDate)} • {formatTime(startDate)} 
          </Text> 
        </View> 
        <Feather name="chevron-right" size={20} color={Colors.btnText} /> 
      </TouchableOpacity> 
       
      <TouchableOpacity 
        style={styles.inputContainer} 
        onPress={() => showDateTimePicker('end')} 
      > 
        <Feather name="clock" size={20} color={Colors.btnText} /> 
        <View style={styles.dateTimeInput}> 
          <Text style={styles.dateTimeLabel}>Ends</Text> 
          <Text style={styles.dateTimeText}> 
            {formatDate(endDate)} • {formatTime(endDate)} 
          </Text> 
        </View> 
        <Feather name="chevron-right" size={20} color={Colors.btnText} /> 
      </TouchableOpacity> 
    </View> 
  ); 
   
  const renderLocationInputs = () => ( 
    <View> 
      <View style={styles.inputContainer}> 
        <Feather name="map-pin" size={20} color={Colors.btnText} /> 
        <TextInput 
          style={styles.input} 
          placeholder="Location name" 
          placeholderTextColor={Colors.btnText} 
          value={locationName} 
          onChangeText={setLocationName} 
          selectionColor={Colors.btnText}
        /> 
      </View> 
      <View style={styles.inputContainer}> 
        <Feather name="link" size={20} color={Colors.btnText} /> 
        <TextInput 
          style={styles.input} 
          placeholder="Google Maps link" 
          placeholderTextColor={Colors.btnText} 
          value={locationLink} 
          onChangeText={setLocationLink} 
          keyboardType="url" 
          selectionColor={Colors.btnText}
        /> 
      </View> 
    </View> 
  ); 
 
  const handleSaveReminder = async () => {
    setIsLoading(true);
    try {
      // Format dates to ISO string
      const formattedStartDate = startDate.toISOString();
      const formattedEndDate = endDate.toISOString();
      
      // Basic validation for Location reminders
      if (selectedType === 'Location' && !locationName.trim()) {
        Alert.alert('Missing info', 'Please enter a location name');
        setIsLoading(false);
        return;
      }

      const reminderData = {
        type: selectedType,
        title: note || (selectedType === 'Task' ? 'New Task' : selectedType === 'Meeting' ? 'New Meeting' : 'New Location'),
        description: note,
        icon: selectedIcon || 'bell',
        ...(selectedType !== 'Location' ? { startDate: formattedStartDate, endDate: formattedEndDate } : {}),
        ...(selectedType === 'Location' ? (() => {
          const coords = extractCoordsFromUrl(locationLink);
          return { location: { name: locationName, link: locationLink, ...(coords ? { coordinates: coords } : {}) } };
        })() : {})
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
          ...(selectedType !== 'Location' ? { startDate: formattedStartDate, endDate: formattedEndDate } : {}),
          ...(selectedType === 'Location' ? reminderData : {}),
        };
        response = await updateReminderApi(editingId, updates);
        // normalize response to success format
        response = { success: true, data: response };
      } else {
        response = await createReminder(reminderData);
      }
      
      if (response.success) {
        // Schedule time-based voice notification only for Task/Meeting
        if (selectedType !== 'Location') {
          try {
            const userString = await AsyncStorage.getItem('user');
            let username = 'there';
            if (userString) {
              const user = JSON.parse(userString);
              username = user?.fullname || 'there';
            }
            // Ensure TTS ready and get textHash
            const saved = response.data || response.reminder || {};
            const savedId = saved._id || saved.id;
            let textHash = null;
            if (savedId) {
              try {
                const ensureRes = await ensureReminderTTS(savedId);
                textHash = ensureRes?.tts?.textHash || null;
              } catch {}
            }

            await scheduleReminderSpeechNotification({
              username,
              meetingName: reminderData.title,
              startDateISO: formattedStartDate,
              reminderId: savedId,
              textHash,
            });
          } catch (e) {
            console.warn('Failed to schedule reminder speech notification', e);
          }
        }

        // If this is a Location reminder and we have coordinates from backend, start geofencing
        try {
          if (selectedType === 'Location') {
            const saved = response.data || response.reminder || {};
            if (saved?.location?.coordinates && typeof saved.location.coordinates.lat === 'number' && typeof saved.location.coordinates.lng === 'number') {
              await startGeofencingForLocationReminder({
                id: saved._id || saved.id,
                title: saved.title || locationName || 'Location Reminder',
                location: saved.location,
              });
            }
          }
        } catch (e) {
          console.warn('Failed to start geofencing for location reminder', e);
        }
        Alert.alert('Success', editingId ? 'Reminder updated successfully!' : 'Reminder saved successfully!');
        navigation.goBack();
      } else {
        Alert.alert('Error', response.message || 'Failed to save reminder');
      }
    } catch (error) {
      console.error('Error saving reminder:', error);
      const errorMessage = error.response?.data?.message || error.message || 'An error occurred while saving the reminder';
      console.error('Full error details:', error.response?.data);
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };
 
  return ( 
    <View style={styles.container}> 
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} /> 
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
                <View style={[ 
                  styles.radioOuter, 
                  selectedType === type && styles.radioOuterActive 
                ]}> 
                  {selectedType === type && <View style={styles.radioInner} />} 
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
 
          {/* Date/Time Inputs */} 
          {selectedType !== 'Location' && renderDateTimeInputs()} 
 
          {/* Location Inputs */} 
          {selectedType === 'Location' && renderLocationInputs()} 
 
          {/* Note Input */} 
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
                minimumDate={dateType === 'end' ? startDate : new Date()} 
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
}); 
 
export default CreateReminder;
