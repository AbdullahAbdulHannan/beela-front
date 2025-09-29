import React from 'react';
import {SafeAreaView, View, TouchableOpacity, Dimensions, StyleSheet, Text, Image } from 'react-native';
import { AntDesign,Feather,FontAwesome5 } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { useOnboardingTarget } from './OnboardingProvider';
const { width } = Dimensions.get('window');
const taskIcon = require('../assets/task_icon.png');

export default function Navbar() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Onboarding targets
  const navPlannerRef = useOnboardingTarget('nav-planner');
  const navCalendarRef = useOnboardingTarget('nav-calendar');
  const navNotificationsRef = useOnboardingTarget('nav-notifications');
  const fabAddRef = useOnboardingTarget('fab-add');

  return (
    <View style={[styles.navbarWrapper, { paddingBottom: insets.bottom }]}>
      {/* Curved SVG background */}
      <Svg width={width} height={100} style={styles.svgStyle}>
        <Path
          d={`M0 0 
            H${width * 0.36} 
            C${width * 0.39} 0, ${width * 0.42} 40, ${width * 0.5} 40 
            C${width * 0.58} 40, ${width * 0.61} 0, ${width * 0.64} 0 
            H${width} 
            V80 
            H0 
            Z`}
          fill={Colors.background}
        />
      </Svg>

     <View style={styles.iconRow}>
  {/* Dashboard */}
  <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Dashboard')}>
    <AntDesign name="home" size={24} color={Colors.primary} />
    <Text style={styles.navText}>Dashboard</Text>
  </TouchableOpacity>

  {/* Notifications */}
  <TouchableOpacity ref={navNotificationsRef} collapsable={false} style={styles.navItem} onPress={() => navigation.navigate('NotificationSettings')}>
    <Feather name="bell" size={24} color={Colors.primary} />
    <Text style={styles.navText}>Notifications</Text>
  </TouchableOpacity>

  {/* Spacer for FAB */}
  <View style={styles.fabSpacer} />

  {/* Tasks */}
  <TouchableOpacity ref={navPlannerRef} collapsable={false} style={styles.navItem} onPress={() => navigation.navigate('Planner')}>
    <FontAwesome5 name="tasks" size={24} color={Colors.primary} />
    <Text style={styles.navText}>Planner</Text>
  </TouchableOpacity>

  {/* Calendar */}
  <TouchableOpacity ref={navCalendarRef} collapsable={false} style={styles.navItem} onPress={() => navigation.navigate('Calendar')}>
    <AntDesign name="calendar" size={24} color={Colors.primary} />
    <Text style={styles.navText}>Calendar</Text>
  </TouchableOpacity>
</View>


      {/* Floating Add Button */}
      <TouchableOpacity ref={fabAddRef} collapsable={false} style={styles.fabButton} onPress={() => navigation.navigate('CreateReminder')}>
        <AntDesign name="plus" size={32} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  navbarWrapper: {
    position: 'absolute',
    bottom: 0,
    width: width,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  svgStyle: {
    position: 'absolute',
    bottom: 0,
  },
  
  navText: {
    color: Colors.primary,
    fontSize: 9,
    marginTop: 5,
  },
  taskIcon: {
    width: 24,
    height: 24,
    tintColor: Colors.white,
  },
  fabButton: {
    position: 'absolute',
    bottom: 45,
    backgroundColor: Colors.primary,
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    elevation: 10,
    shadowColor: Colors.black,
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 5,
    left: width / 2 - 35,
    borderWidth: 5,
    borderColor: Colors.primary,
  },
  iconRow: {
  flexDirection: 'row',
  width: '100%',
  alignItems: 'center',
  paddingHorizontal: 20,
  paddingTop: 20,
  zIndex: 1,
},
navItem: {
  flex: 1, 
  alignItems: 'center',
},
fabSpacer: {
  flex: 1, // <-- takes same space as nav items
},

});
