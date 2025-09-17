import React, { useState, useRef, useEffect } from 'react';
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
  Animated,
} from 'react-native';
import { Feather, AntDesign } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Navbar from './components/Navbar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, logout } from './services/api';
import { Colors } from './constants/colors';

const Profile = () => {
  const navigation = useNavigation();
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [occupation, setOccupation] = useState('');
  const [gender, setGender] = useState('');
  const [fullname, setFullname] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedPreferences, setSelectedPreferences] = useState({});
  const [focusedField, setFocusedField] = useState('');
  const profileScale = useRef(new Animated.Value(1)).current;

  const handlePreferencePress = (preference) => {
    // Handle preference selection - could navigate to specific settings
    console.log(`Selected preference: ${preference}`);
    
    // Add haptic feedback or visual feedback here
    // For now, just log the selection
  };

  const handleProfilePicturePress = () => {
    // Handle profile picture upload
    console.log('Profile picture upload pressed');
    
    // Add a subtle scale animation
    Animated.sequence([
      Animated.timing(profileScale, {
        toValue: 0.95,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(profileScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  useEffect(() => {
    (async () => {
      try {
        const userString = await AsyncStorage.getItem('user');
        if (userString) {
          const user = JSON.parse(userString);
          setFullname(user?.fullname || user?.name || '');
          setEmail(user?.email || '');
        }
        // Best-effort refresh from backend if available
        try {
          const token = await AsyncStorage.getItem('userToken');
          if (token) {
            const res = await fetch(`${API_BASE_URL}/auth/profile`, {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
              },
            });
            if (res.ok) {
              const data = await res.json();
              const u = data?.user || data?.data || data; 
              if (u) {
                setFullname(u.fullname || u.name || fullname);
                setEmail(u.email || email);
                await AsyncStorage.setItem('user', JSON.stringify({ ...u }));
              }
            }
          }
        } catch {}
      } catch {}
      setLoading(false);
    })();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollViewContent}>
          {/* Top Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7}>
              <Feather name="user" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Your Profile</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={handleLogout}>
              <Feather name="log-out" size={24} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {/* Profile Picture Section */}
          <View style={styles.profileSection}>
            <TouchableOpacity 
              style={styles.profilePictureContainer}
              onPress={handleProfilePicturePress}
              activeOpacity={0.8}
            >
              <Animated.View style={[styles.profilePicture, { transform: [{ scale: profileScale }] }]}>
                <Text style={styles.profileInitial}>{(fullname || 'A').charAt(0).toUpperCase()}</Text>
              </Animated.View>
            </TouchableOpacity>
            <Text style={styles.userName}>{fullname || 'User'}</Text>
            <Text style={{ color: Colors.textMuted, marginTop: 4 }}>{email}</Text>
            
          </View>

          {/* Basic Information Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>
            <TextInput
              style={[
                styles.inputField,
                focusedField === 'dateOfBirth' && styles.inputFieldFocused
              ]}
              placeholder="Date of Birth: DD/MM/YYYY"
              placeholderTextColor={Colors.textMuted}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              onFocus={() => setFocusedField('dateOfBirth')}
              onBlur={() => setFocusedField('')}
            />
            <TextInput
              style={[
                styles.inputField,
                focusedField === 'occupation' && styles.inputFieldFocused
              ]}
              placeholder="Your occupation"
              placeholderTextColor="#A9A9A9"
              value={occupation}
              onChangeText={setOccupation}
              onFocus={() => setFocusedField('occupation')}
              onBlur={() => setFocusedField('')}
            />
            <TextInput
              style={[
                styles.inputField,
                focusedField === 'gender' && styles.inputFieldFocused
              ]}
              placeholder="Your gender"
              placeholderTextColor="#A9A9A9"
              value={gender}
              onChangeText={setGender}
              onFocus={() => setFocusedField('gender')}
              onBlur={() => setFocusedField('')}
            />
          </View>

          {/* Notification Preferences Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notification Preferences</Text>
            <TouchableOpacity 
              style={styles.preferenceItem}
              onPress={() => navigation.navigate('NotificationSettings')}
              activeOpacity={0.7}
            >
              <View style={styles.radioButton} />
              <Text style={styles.preferenceText}>Reminder Lead Time</Text>
              <Feather name="chevron-right" size={18} color="#A9A9A9" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.preferenceItem}
              onPress={() => handlePreferencePress('Quiet Hours')}
              activeOpacity={0.7}
            >
              <View style={styles.radioButton} />
              <Text style={styles.preferenceText}>Quiet Hours</Text>
              <Feather name="chevron-right" size={18} color="#A9A9A9" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.preferenceItem}
              onPress={() => handlePreferencePress('Voice Preference')}
              activeOpacity={0.7}
            >
              <View style={styles.radioButton} />
              <Text style={styles.preferenceText}>Voice Preference</Text>
              <Feather name="chevron-right" size={18} color="#A9A9A9" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.preferenceItem}
              onPress={() => handlePreferencePress('Family Members')}
              activeOpacity={0.7}
            >
              <View style={styles.radioButton} />
              <Text style={styles.preferenceText}>Family Members</Text>
              <Feather name="chevron-right" size={18} color="#A9A9A9" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.preferenceItem}
              onPress={() => handlePreferencePress('Pets')}
              activeOpacity={0.7}
            >
              <View style={styles.radioButton} />
              <Text style={styles.preferenceText}>Pets</Text>
              <Feather name="chevron-right" size={18} color="#A9A9A9" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
      {/* Bottom Navigation Bar */}
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
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 25,
    paddingTop: 35,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  profileSection: {
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 50,
  },
  profilePictureContainer: {
    marginBottom: 15,
  },
  profilePicture: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.badge,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  profileInitial: {
    fontSize: 48,
    fontWeight: 'bold',
    color: Colors.primary,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: {
      width: 1,
      height: 1,
    },
    textShadowRadius: 2,
  },
  userName: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    letterSpacing: 0.5,
  },

  section: {
    paddingHorizontal: 20,
    marginBottom: 40,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  inputField: {
    backgroundColor: Colors.badge,
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    marginBottom: 15,
    color: Colors.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputFieldFocused: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: Colors.badge,
    backgroundColor: Colors.background,
    paddingHorizontal: 15,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.text,
    marginRight: 15,
    backgroundColor: 'transparent',
  },
  preferenceText: {
    color: Colors.text,
    fontSize: 16,
    flex: 1,
  },

});

export default Profile;
