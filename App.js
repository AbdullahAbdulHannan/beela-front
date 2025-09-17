import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Alert, Linking, Platform,StatusBar,View, NativeModules } from 'react-native';
import notifee from '@notifee/react-native';
import * as WebBrowser from 'expo-web-browser';

import Login from './Login';
import SignUp from './SignUp';
import ForgotPassword from './ForgotPassword';
import UserDashboard from './UserDashboard';
import PlannerScreen from './PlannerScreen';
import MeetingsReminder from './MeetingsReminder';
import CreateReminder from './CreateReminder';
import SplashScreen from './SplashScreen';
import CalendarScreen from './CalendarScreen';
import NotificationSettings from './NotificationSetting';
import { configureNotifications, initLocationServices, rescheduleAllTimeBasedReminders } from './services/notificationService';
import Profile from './Profile'
// For OAuth with WebBrowser
WebBrowser.maybeCompleteAuthSession();

// Deep linking configuration
const linking = {
  prefixes: ['voxaai://', 'https://voxaai.com'],
  config: {
    screens: {
      Dashboard: {
        path: 'oauth-callback',
        parse: {
          status: (status) => status,
          message: (message) => message,
        },
      },
    },
  },
};

const Stack = createStackNavigator();

export default function App() {
  // Handle deep linking for OAuth callback
  const navigationRef = useRef();
  const routeNameRef = useRef();

  useEffect(() => {
    // Ensure Android permissions and reschedule once
    (async () => {
      try {
        if (Platform.OS === 'android') {
          // 1) Notifications (Android 13+)
          await notifee.requestPermission();

          // 2) Exact alarms (Android 12+)
          try {
            const canExact = await NativeModules?.AlarmScheduler?.canScheduleExactAlarms?.();
            if (canExact === false) {
              await NativeModules?.AlarmScheduler?.requestScheduleExactAlarms?.();
            }
          } catch {}

          // 3) Battery optimization (optional but recommended on strict OEMs)
          try {
            const ignoring = await NativeModules?.AlarmScheduler?.isIgnoringBatteryOptimizations?.();
            if (ignoring === false) {
              await NativeModules?.AlarmScheduler?.requestIgnoreBatteryOptimizations?.();
            }
          } catch {}
        }
      } catch {}

      // Configure notification channel/listeners and geofencing
      await configureNotifications();
      await initLocationServices();

      // After permissions setup, reschedule to ensure precise alarms are set
      try { await rescheduleAllTimeBasedReminders(); } catch {}
    })();

    // Handle deep linking
    const handleDeepLink = (event) => {
      const url = event?.url || event;
      if (!url) return;

      // Parse the URL
      const parsedUrl = new URL(url);
      const status = parsedUrl.searchParams.get('status');
      const message = parsedUrl.searchParams.get('message');

      if (status === 'success') {
        Alert.alert('Success', decodeURIComponent(message || 'Google Calendar connected successfully'));
      } else if (status === 'error') {
        Alert.alert('Error', decodeURIComponent(message || 'Failed to connect Google Calendar'));
      }
    };

    // Add event listener for deep linking
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if the app was opened from a deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    // Cleanup
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  return (
 
    <NavigationContainer 
      ref={navigationRef}
      linking={linking}
      
      onReady={() => {
        routeNameRef.current = navigationRef.current.getCurrentRoute().name;
      }}
      onStateChange={async () => {
        const previousRouteName = routeNameRef.current;
        const currentRouteName = navigationRef.current.getCurrentRoute().name;
        routeNameRef.current = currentRouteName;
      }}
    >
      <Stack.Navigator screenOptions={{
      headerShown: false,
      statusBarStyle: 'light',       // white icons/text
      statusBarColor: '#4668FF',     // Android background
    }}>
        <Stack.Screen name="SplashScreen" component={SplashScreen} />
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="SignUp" component={SignUp} />
        <Stack.Screen name="ForgotPassword" component={ForgotPassword} />
        <Stack.Screen name="Dashboard" component={UserDashboard} />
        <Stack.Screen name="TasksScreen" component={MeetingsReminder} />
        <Stack.Screen name="Profile" component={Profile} />
        <Stack.Screen name="CreateReminder" component={CreateReminder} />
        <Stack.Screen name="Calendar" component={CalendarScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Planner" component={PlannerScreen} options={{ headerShown: false }} />
        <Stack.Screen name="NotificationSettings" component={NotificationSettings} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
    
  );
}
