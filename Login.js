import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  StatusBar,
  ScrollView, // Added ScrollView for better responsiveness
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from './constants/colors';

import { login } from './services/api';
import useGoogleAuth from './services/authService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { rescheduleAllTimeBasedReminders, cancelAllLocalSchedulesAllUsers } from './services/notificationService';
import { NativeModules } from 'react-native';

const { width } = Dimensions.get('window');
// Updated primary color to #4668FF as requested
const ACTIVE_COLOR = '#4668FF'; 

// Shadow style for soft, modern look
const SOFT_SHADOW = {
    ...Platform.select({
        ios: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.08,
            shadowRadius: 10,
        },
        android: {
            elevation: 8,
        },
    }),
};

// --- Custom Input Component (ModernInput) ---
const ModernInput = ({ iconName, placeholder, secureTextEntry, value, onChangeText, onFocus, keyboardType = 'default' }) => (
    <View style={[styles.inputContainer, SOFT_SHADOW]}>
        <Ionicons name={iconName} size={20} color="#777" style={styles.inputIcon} />
        <TextInput
            style={styles.inputField}
            placeholder={placeholder}
            placeholderTextColor="#999"
            secureTextEntry={secureTextEntry}
            value={value}
            onChangeText={onChangeText}
            onFocus={onFocus}
            keyboardType={keyboardType}
            autoCapitalize="none"
        />
    </View>
);

export default function Login({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const { promptAsync } = useGoogleAuth(navigation);

  const afterAuthReschedule = async () => {
    // 1) Clear device state (native + Notifee) to avoid stale schedules from any previous user
    try { await NativeModules?.AlarmScheduler?.cancelAll?.(); } catch {}
    try { await cancelAllLocalSchedulesAllUsers(); } catch {}
    // 2) Reschedule for the now-logged-in user
    try { await rescheduleAllTimeBasedReminders(); } catch {}
  };

  const handleGoogleSignIn = async () => {
    if (isLoading) return;
    setGoogleLoading(true);
    setError('');
    try {
      const result = await promptAsync();
      if (result.type === 'success' || (result.params && result.params.access_token)) {
        // Navigation is handled inside useGoogleAuth hook based on first-time flag.
        // We only reschedule here to keep alarms consistent post-auth.
        await afterAuthReschedule();
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        // User cancelled the flow, no error needed
      } else {
        setError('Google sign-in failed. Please try again.');
      }
    } catch (e) {
      console.error('Google Sign In Error:', e);
      setError('An unexpected error occurred during Google sign-in.');
    } finally {
      setGoogleLoading(false);
    }
  };


  const handleSignIn = async () => {
    if (isLoading || googleLoading) return;

    // Trim and validate inputs for clearer, actionable errors
    const trimmedEmail = String(email || '').trim();
    const trimmedPassword = String(password || '');
    const emailRegex = /^\S+@\S+\.[\w-]{2,}$/;

    if (!trimmedEmail && !trimmedPassword) {
      setError('Please enter both email and password.');
      return;
    }
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!emailRegex.test(trimmedEmail)) {
      setError('Enter a valid email address (e.g., name@example.com).');
      return;
    }
    if (!trimmedPassword) {
      setError('Please enter your password.');
      return;
    }
    if (trimmedPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    
    setIsLoading(true);
    setError('');

    try {
      const response = await login({email: trimmedEmail, password: trimmedPassword});
      if (response && response.token) {
        await AsyncStorage.setItem('userToken', response.token);
        await afterAuthReschedule();
        // Decide destination based on per-user onboarding completion
        try {
          const rawUser = await AsyncStorage.getItem('user');
          const user = rawUser ? JSON.parse(rawUser) : null;
          const userKeyPart = user?._id || user?.id || user?.email || user?.name || 'guest';
          const onboardKey = `onboardingCompleted:${String(userKeyPart)}`;
          const done = await AsyncStorage.getItem(onboardKey);
          if (done === 'true') {
            navigation.navigate('Dashboard');
          } else {
            navigation.navigate('FirstTimeLanding');
          }
        } catch {
          // If anything fails, fall back to Dashboard to avoid blocking
          navigation.navigate('Dashboard');
        }
      } else {
        // Fallback for API response without specific error message
        setError('Sign in failed. Please check your credentials.');
      }
    } catch (e) {
      // Show precise backend message (e.message set by api.js) or a sensible fallback
      const errorMessage = e?.message || 'Invalid email or password. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to navigate to Forgot Password screen
  const handleForgotPassword = () => {
    // Assuming a 'Forgot_Password_Screen' exists in your navigation stack
    navigation.navigate('ForgotPassword');
  };

  // Function to navigate to Sign Up screen
  const handleSignUp = () => {
    navigation.navigate('SignUp');
  };


  return (
    <ScrollView contentContainerStyle={styles.container} bounces={false}>
        <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
        <View style={styles.header}>
            <Text style={styles.welcomeText}>Welcome Back!</Text>
            <Text style={styles.subHeaderText}>Sign in to continue your planning.</Text>
        </View>

        {/* Error Display */}
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Input Fields */}
        <View style={styles.formArea}>
            <ModernInput
                iconName="mail-outline"
                placeholder="Email Address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
            />
            <View style={[styles.inputContainer, SOFT_SHADOW]}>
                <Ionicons name="lock-closed-outline" size={20} color="#777" style={styles.inputIcon} />
                <TextInput
                    style={styles.inputField}
                    placeholder="Password"
                    placeholderTextColor="#999"
                    secureTextEntry={secure}
                    value={password}
                    onChangeText={setPassword}
                    autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setSecure(!secure)} style={{padding: 5}}>
                  <Ionicons name={secure ? "eye-off-outline" : "eye-outline"} size={20} color="#777" />
                </TouchableOpacity>
            </View>
            
            <TouchableOpacity 
              style={styles.forgotPassword} 
              onPress={handleForgotPassword} // Updated to navigate
            >
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>
        </View>

        {/* Sign In Button */}
        <TouchableOpacity 
          style={[styles.signInButton, SOFT_SHADOW, (isLoading || googleLoading) && styles.disabledButton]} 
          onPress={handleSignIn}
          disabled={isLoading || googleLoading}
        >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.signInButtonText}>Sign In</Text>
            )}
        </TouchableOpacity>

        <Text style={styles.orText}>OR</Text>

        {/* Google Button */}
        <TouchableOpacity 
          style={[styles.googleButton, SOFT_SHADOW, (isLoading || googleLoading) && styles.disabledButton]} 
          onPress={handleGoogleSignIn}
          disabled={isLoading || googleLoading}
        >
            {googleLoading ? (
               <ActivityIndicator color="#333" />
            ) : (
              <>
                <Ionicons name="logo-google" size={24} color="#333" />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
        </TouchableOpacity>
        
        <View style={styles.signUpPrompt}>
            <Text style={styles.signUpText}>Don't have an account?</Text>
            <TouchableOpacity onPress={handleSignUp}> {/* Updated to use handleSignUp */}
                <Text style={styles.signUpLink}>Sign up.</Text>
            </TouchableOpacity>
        </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        backgroundColor: '#F9FAFB',
        paddingHorizontal: 30,
        paddingTop: 50,
        paddingBottom: 40,
        justifyContent: 'center',
    },
    header: {
        marginBottom: 40,
    },
    welcomeText: {
        fontSize: 32,
        fontWeight: '900',
        color: ACTIVE_COLOR, // Using new color
        marginBottom: 5,
    },
    subHeaderText: {
        fontSize: 16,
        color: '#777',
        fontWeight: '500',
    },
    formArea: {
        marginBottom: 30,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFF',
        borderRadius: 15,
        height: 55,
        marginBottom: 15,
        paddingHorizontal: 15,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    inputIcon: {
        marginRight: 10,
    },
    inputField: {
        flex: 1,
        fontSize: 16,
        color: '#333',
        outlineStyle: 'none', // For web compatibility
    },
    forgotPassword: {
        alignSelf: 'flex-end',
        marginTop: 5,
    },
    forgotPasswordText: {
        color: ACTIVE_COLOR, // Using new color
        fontSize: 14,
        fontWeight: '600',
    },
    signInButton: {
        backgroundColor: ACTIVE_COLOR, // Using new color
        padding: 18,
        borderRadius: 15,
        alignItems: 'center',
        marginBottom: 25,
    },
    disabledButton: {
      opacity: 0.6,
    },
    signInButtonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '700',
    },
    orText: {
        textAlign: 'center',
        color: '#A0AEC0',
        marginBottom: 25,
        fontWeight: '500',
    },
    googleButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FFF',
        padding: 15,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    googleButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginLeft: 10,
    },
    signUpPrompt: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 30,
    },
    signUpText: {
        color: '#777',
        fontSize: 14,
        marginRight: 5,
    },
    signUpLink: {
        color: ACTIVE_COLOR, // Using new color
        fontSize: 14,
        fontWeight: '700',
    },
    errorContainer: {
      backgroundColor: '#FEE2E2', // Light red background
      padding: 10,
      borderRadius: 8,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: '#F87171',
    },
    errorText: {
      color: '#B91C1C', // Dark red text
      textAlign: 'center',
      fontWeight: '600',
    }
});
