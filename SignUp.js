import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  StatusBar,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from './constants/colors';
import { signup } from './services/api';
import useGoogleAuth from './services/authService';

const { width } = Dimensions.get('window');
// Updated primary color to #4668FF
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
const ModernInput = ({ iconName, placeholder, secureTextEntry, value, onChangeText, keyboardType = 'default' }) => (
    <View style={[styles.inputContainer, SOFT_SHADOW]}>
        <Ionicons name={iconName} size={20} color="#777" style={styles.inputIcon} />
        <TextInput
            style={styles.inputField}
            placeholder={placeholder}
            placeholderTextColor="#999"
            secureTextEntry={secureTextEntry}
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType}
            autoCapitalize={iconName === 'mail-outline' ? 'none' : 'words'}
        />
    </View>
);

export default function SignUp({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const { promptAsync } = useGoogleAuth(navigation);

  const handleGoogleSignIn = async () => {
    if (isLoading) return;
    setGoogleLoading(true);
    setError('');
    try {
      await promptAsync();
      // Navigation happens inside useGoogleAuth if successful
    } catch (error) {
      setError('Failed to sign up with Google. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignup = async () => {
    if (isLoading || googleLoading) return;
    
    setError(''); // reset errors

    // Trim values and validate with helpful messages
    const trimmedName = String(name || '').trim();
    const trimmedEmail = String(email || '').trim();
    const trimmedPassword = String(password || '');

    if (!trimmedName && !trimmedEmail && !trimmedPassword) {
      setError('Please fill in your name, email, and password.');
      return;
    }
    if (!trimmedName) {
      setError('Please enter your full name.');
      return;
    }
    if (trimmedName.length < 2) {
      setError('Full name must be at least 2 characters long.');
      return;
    }
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }
    const emailRegex = /^\S+@\S+\.[\w-]{2,}$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Enter a valid email address (e.g., name@example.com).');
      return;
    }
    if (!trimmedPassword) {
      setError('Please create a password.');
      return;
    }
    if (trimmedPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await signup({ fullname: trimmedName, email: trimmedEmail, password: trimmedPassword });
      if (response && response.token) {
        // Successful signup, token received
        // Note: For a complete app, you'd save the token here and navigate to Dashboard
        // For now, we navigate to Login as the backend setup might require a login step after signup.
        navigation.navigate('Login'); 
      } else {
        setError('Signup failed. Please try a different email.');
      }
    } catch (e) {
      // Handle signup specific errors from the API
      const errorMessage = e?.message || 'Error creating account. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to navigate back to Login screen
  const handleSignInNavigation = () => {
    navigation.navigate('Login');
  };

  return (
    <ScrollView contentContainerStyle={styles.container} bounces={false}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      <View style={styles.header}>
        <Text style={styles.welcomeText}>Create Account</Text>
        <Text style={styles.subHeaderText}>Sign up to start your journey.</Text>
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
          iconName="person-outline"
          placeholder="Full Name"
          value={name}
          onChangeText={setName}
        />
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
      </View>

      {/* Sign Up Button */}
      <TouchableOpacity 
        style={[styles.signInButton, SOFT_SHADOW, (isLoading || googleLoading) && styles.disabledButton]} 
        onPress={handleSignup}
        disabled={isLoading || googleLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.signInButtonText}>Sign Up</Text>
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
          <Text style={styles.signUpText}>Already have an account?</Text>
          <TouchableOpacity onPress={handleSignInNavigation}>
              <Text style={styles.signUpLink}>Sign in.</Text>
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
    // The Signup screen does not have a forgot password link, but including styles for completeness/consistency if needed.
    // forgotPassword: {
    //     alignSelf: 'flex-end',
    //     marginTop: 5,
    // },
    // forgotPasswordText: {
    //     color: ACTIVE_COLOR, 
    //     fontSize: 14,
    //     fontWeight: '600',
    // },
    signInButton: { // Used for the main Signup button now
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
    signUpLink: { // Used for the 'Sign in' link
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
