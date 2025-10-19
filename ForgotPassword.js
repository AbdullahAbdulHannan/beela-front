import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ScrollView,
  Platform,
  Dimensions,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from './constants/colors';
import { sendResetOtp } from './services/api';

const { width } = Dimensions.get('window');
// Primary color updated to #4668FF for consistency
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
// Reusing the sleek input style for consistency
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
            autoCapitalize="none"
        />
    </View>
);

export default function ForgotPassword({ navigation }) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handlePasswordReset = async () => {
    if (isLoading) return;
    setError('');
    setMessage('');
    
    if (!email) {
      setError('Please enter your email address.');
      return;
    }
    try {
      setIsLoading(true);
      await sendResetOtp(email.trim().toLowerCase());
      setMessage('OTP sent if email exists.');
      // Navigate to OTP verification
      setTimeout(() => {
        navigation.navigate('VerifyOtp', { email: email.trim().toLowerCase() });
      }, 600);
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Failed to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} bounces={false}>
        <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
        <View style={styles.header}>
            <Text style={styles.welcomeText}>Forgot Password?</Text>
            <Text style={styles.subHeaderText}>Enter your email to receive a 6-digit OTP.</Text>
        </View>

        {/* Status Message Display */}
        {message ? (
            <View style={styles.messageContainer}>
                <Text style={styles.messageText}>{message}</Text>
            </View>
        ) : null}

        {/* Error Display */}
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Email Input Field */}
        <View style={styles.formArea}>
            <ModernInput
                iconName="mail-outline"
                placeholder="Email Address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
            />
        </View>

        {/* Reset Button */}
        <TouchableOpacity 
            style={[styles.resetButton, SOFT_SHADOW, isLoading && styles.disabledButton]} 
            onPress={handlePasswordReset}
            disabled={isLoading}
        >
            {isLoading ? (
                <ActivityIndicator color="#FFF" />
            ) : (
                <Text style={styles.buttonText}>Send OTP</Text>
            )}
        </TouchableOpacity>

        {/* Back to Login */}
        <View style={styles.backToLoginPrompt}>
            <Text style={styles.loginText}>Remembered your password?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginLink}>Sign In.</Text>
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
    resetButton: {
        backgroundColor: ACTIVE_COLOR, // Using new color
        padding: 18,
        borderRadius: 15,
        alignItems: 'center',
        marginBottom: 25,
    },
    disabledButton: {
      opacity: 0.6,
    },
    buttonText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: '700',
    },
    backToLoginPrompt: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 30,
    },
    loginText: {
        color: '#777',
        fontSize: 14,
        marginRight: 5,
    },
    loginLink: {
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
    },
    messageContainer: {
        backgroundColor: '#D1FAE5', // Light green background for success
        padding: 10,
        borderRadius: 8,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#34D399',
    },
    messageText: {
        color: '#065F46', // Dark green text
        textAlign: 'center',
        fontWeight: '600',
    }
});
