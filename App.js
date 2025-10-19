import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Linking, Platform,StatusBar,View, NativeModules, AppState } from 'react-native';
import notifee from '@notifee/react-native';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

import Login from './Login';
import SignUp from './SignUp';
import ForgotPassword from './ForgotPassword';
import VerifyOtpScreen from './VerifyOtpScreen';
import ResetPasswordScreen from './ResetPasswordScreen';
import ChangePasswordScreen from './ChangePasswordScreen';
import UserDashboard from './UserDashboard';
import PlannerScreen from './PlannerScreen';
import MeetingsReminder from './MeetingsReminder';
import CreateReminder from './CreateReminder';
import SplashScreen from './SplashScreen';
import CalendarScreen from './CalendarScreen';
import NotificationSettings from './NotificationSetting';
import MapDirections from './MapDirections';
import { configureNotifications, initLocationServices, rescheduleAllTimeBasedReminders } from './services/notificationService';
import Profile from './Profile'
import FirstTimeLanding from './FirstTimeLanding';
import { OnboardingProvider } from './components/OnboardingProvider';
import SuccessModal from './components/MessageModal';
import BelaAIScreen from './BelaAIScreen';
import wakeWordService from './services/wakeWordService';

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
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  useEffect(() => {
    // Initialize wake word service for "Hey Bela" global navigation
    let wakeWordInitialized = false;
    
    const initWakeWord = async () => {
      try {
        // Wait a bit to ensure navigation is ready
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (navigationRef.current) {
          const initialized = await wakeWordService.initialize(navigationRef);
          wakeWordInitialized = initialized;
          
          if (initialized) {
            console.log('Wake word service "Hey Bela" is now active');
          } else {
            console.log('Wake word service could not be initialized');
          }
        }
      } catch (error) {
        console.error('Error initializing wake word service:', error);
      }
    };
    
    initWakeWord();
    
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

    // Reschedule whenever app comes to foreground (ensures cross-device sync)
    const handleAppState = async (state) => {
      if (state === 'active') {
        // Only reschedule if logged in
        try {
          const token = await AsyncStorage.getItem('userToken');
          if (token) {
            await rescheduleAllTimeBasedReminders();
          }
        } catch {}
      }
    };
    const appStateSub = AppState.addEventListener('change', handleAppState);

    // Lightweight periodic reschedule (every 2 minutes) while logged in
    let intervalId;
    (async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (token) {
          intervalId = setInterval(async () => {
            try {
              const t = await AsyncStorage.getItem('userToken');
              if (t) await rescheduleAllTimeBasedReminders();
            } catch {}
          }, 2 * 60 * 1000);
        }
      } catch {}
    })();

    // Handle navigation from notifications (cold start)
    (async () => {
      try {
        const init = await notifee.getInitialNotification();
        const data = init?.notification?.data || {};
        if (data?.type === 'location_reminder' && data?.reminderId && navigationRef.current) {
          navigationRef.current.navigate('MapDirections', { reminderId: data.reminderId });
        }
      } catch {}
    })();

    // Helper to handle any pending navigation stored by notificationService
    const navigateIfPending = async () => {
      try {
        const raw = await AsyncStorage.getItem('pendingNav');
        if (!raw) return;
        await AsyncStorage.removeItem('pendingNav');
        const payload = JSON.parse(raw);
        if (payload?.screen && navigationRef.current) {
          navigationRef.current.navigate(payload.screen, payload.params || {});
        }
      } catch {}
    };

    navigateIfPending();

    // Handle deep linking
    const handleDeepLink = (event) => {
      const url = event?.url || event;
      if (!url) return;

      // Parse the URL
      const parsedUrl = new URL(url);
      const status = parsedUrl.searchParams.get('status');
      const message = parsedUrl.searchParams.get('message');

      if (status === 'success') {
        setModalMessage(decodeURIComponent(message || 'Google Calendar connected successfully'));
        setModalVisible(true);
      } else if (status === 'error') {
        setModalMessage(decodeURIComponent(message || 'Failed to connect Google Calendar'));
        setModalVisible(true);
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

    // Also navigate pending intents when app becomes active
    const handleActive = async (state) => { if (state === 'active') { await navigateIfPending(); } };
    const subActive = AppState.addEventListener('change', handleActive);

    // Cleanup
    return () => {
      // Destroy wake word service
      if (wakeWordInitialized) {
        wakeWordService.destroy().catch(err => {
          console.error('Error destroying wake word service:', err);
        });
      }
      
      if (subscription) {
        subscription.remove();
      }
      try { if (appStateSub) appStateSub.remove(); } catch {}
      try { if (subActive) subActive.remove(); } catch {}
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return (
    <OnboardingProvider navigationRef={navigationRef}>
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
          <Stack.Screen name="VerifyOtp" component={VerifyOtpScreen} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
          <Stack.Screen name="FirstTimeLanding" component={FirstTimeLanding} options={{ headerShown: false }} />
          <Stack.Screen name="Dashboard" component={UserDashboard} />
          <Stack.Screen name="TasksScreen" component={MeetingsReminder} />
          <Stack.Screen name="Profile" component={Profile} />
          <Stack.Screen name="CreateReminder" component={CreateReminder} />
          <Stack.Screen name="Calendar" component={CalendarScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Planner" component={PlannerScreen} options={{ headerShown: false }} />
          <Stack.Screen name="NotificationSettings" component={NotificationSettings} options={{ headerShown: false }} />
          <Stack.Screen name="MapDirections" component={MapDirections} options={{ headerShown: false }} />
          <Stack.Screen 
            name="BelaAI" 
            component={BelaAIScreen} 
            options={{ 
              headerShown: true,
              title: 'Bela AI Assistant',
              headerStyle: {
                backgroundColor: '#6200ee',
              },
              headerTintColor: '#fff',
            }} 
          />
        </Stack.Navigator>
      </NavigationContainer>
      <SuccessModal
        visible={modalVisible}
        message={modalMessage}
        onClose={() => setModalVisible(false)}
      />
    </OnboardingProvider>
  );
}
