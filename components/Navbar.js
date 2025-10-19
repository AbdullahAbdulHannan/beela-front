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

// Define the base height for the visible part of the navbar
const NAVBAR_BASE_HEIGHT = 80;

export default function Navbar() {
   const navigation = useNavigation();
   const insets = useSafeAreaInsets(); // Get safe area insets

   // Onboarding targets
   const navPlannerRef = useOnboardingTarget('nav-planner');
   const navCalendarRef = useOnboardingTarget('nav-calendar');
   const navNotificationsRef = useOnboardingTarget('nav-notifications');
   const fabAddRef = useOnboardingTarget('fab-add');

   // Calculate the total height: base height + bottom safe area inset
   const totalNavbarHeight = NAVBAR_BASE_HEIGHT + insets.bottom;

   return (
     <View style={[styles.navbarWrapper, { height: totalNavbarHeight }]}>
       {/* Curved SVG background */}
       {/* Svg height is also set to cover the safe area */}
       <Svg width={width} height={totalNavbarHeight} style={styles.svgStyle}>
         <Path
           d={`M0 0
               H${width * 0.36}
               C${width * 0.39} 0, ${width * 0.42} 40, ${width * 0.5} 40
               C${width * 0.58} 40, ${width * 0.61} 0, ${width * 0.64} 0
               H${width}
               V${totalNavbarHeight} 
               H0
               Z`}
           fill={Colors.background}
         />
       </Svg>

      <View style={styles.iconRow}>
   {/* Dashboard */}
  <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Dashboard')}>
    <View style={{ alignItems: 'center' }}>
      <AntDesign name="home" size={24} color={Colors.primary} />
      <Text style={styles.navText}>Dashboard</Text>
    </View>
  </TouchableOpacity>

   {/* Notifications */}
  <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('NotificationSettings')}>
    <View ref={navNotificationsRef} collapsable={false} style={{ alignItems: 'center' }}>
      <Feather name="bell" size={24} color={Colors.primary} />
      <Text style={styles.navText}>Notifications</Text>
    </View>
  </TouchableOpacity>

   {/* Spacer for FAB */}
   <View style={styles.fabSpacer} />

   {/* Tasks */}
  <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Planner')}>
    <View ref={navPlannerRef} collapsable={false} style={{ alignItems: 'center' }}>
      <FontAwesome5 name="tasks" size={24} color={Colors.primary} />
      <Text style={styles.navText}>Planner</Text>
    </View>
  </TouchableOpacity>

   {/* Calendar */}
  <TouchableOpacity style={styles.navItem} onPress={() => navigation.navigate('Calendar')}>
    <View ref={navCalendarRef} collapsable={false} style={{ alignItems: 'center' }}>
      <AntDesign name="calendar" size={24} color={Colors.primary} />
      <Text style={styles.navText}>Calendar</Text>
    </View>
  </TouchableOpacity>
 </View>


       {/* Floating Add Button */}
      <View ref={fabAddRef} collapsable={false} style={styles.fabButton}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => navigation.navigate('CreateReminder')} activeOpacity={0.8}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <AntDesign name="plus" size={32} color={Colors.white} />
          </View>
        </TouchableOpacity>
      </View>
     </View>
   );
}

const styles = StyleSheet.create({
   navbarWrapper: {
      position: 'absolute',
      bottom: 0,
      width: width,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
      shadowColor: Colors.black,
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.1,
      shadowRadius: 5,
      elevation: 8,
      zIndex: 0,
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
      bottom: 65,
      backgroundColor: Colors.primary,
      width: 70,
      height: 70,
      borderRadius: 35,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2,
      elevation: 10,
      shadowColor: '#000',
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
   paddingBottom: 30,
   paddingTop: 20, 
   zIndex: 1,
 },
 navItem: {
    flex: 1, 
    alignItems: 'center',
 },
 fabSpacer: {
    flex: 1, 
 },

});