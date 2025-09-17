import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from './constants/colors';

import { login } from './services/api';
import useGoogleAuth from './services/authService';

export default function Login({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [remember, setRemember] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const { promptAsync } = useGoogleAuth(navigation);

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      await promptAsync();
    } catch (err) {
      setError('Failed to sign in with Google. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    setError(''); // reset errors

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

    try {
      setIsLoading(true);
      await login({ email, password, rememberMe: remember });
      navigation.navigate('Dashboard');
    } catch (err) {
      const message = typeof err === 'string' ? err : (err?.message || 'Login failed. Please try again.');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign In</Text>

      <Text style={styles.welcome}>Welcome Back!</Text>
      <Text style={styles.subtitle}>Sign in to continue</Text>

      {/* Email Field */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={Colors.textMuted}
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (error) setError('');
          }}
          autoCapitalize="none"
        />
        {email.length > 0 && (
          <Ionicons name="checkmark" size={20} color={Colors.white} style={styles.iconRight} />
        )}
      </View>

      {/* Password Field */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={Colors.textMuted}
          secureTextEntry={secure}
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (error) setError('');
          }}
        />
        <TouchableOpacity onPress={() => setSecure(!secure)} style={styles.iconRight}>
          <Ionicons name={secure ? 'eye-off' : 'eye'} size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Error Message */}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Remember & Forgot Password */}
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.checkbox, remember && styles.checkboxChecked]}
          onPress={() => setRemember(!remember)}
        >
          {remember && <Ionicons name="checkmark" size={14} color={Colors.btnText} />}
        </TouchableOpacity>
        <Text style={styles.rememberText}>Remember me</Text>

        <TouchableOpacity style={{ marginLeft: 'auto' }} onPress={() => navigation.navigate('ForgotPassword')}>
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>
      </View>

      {/* Sign In Button */}
      <TouchableOpacity
        style={[styles.signInButton, isLoading && styles.disabledButton]}
        onPress={handleLogin}
        disabled={isLoading}
      >
        <Text style={styles.signInText}>
          {isLoading ? 'Signing In...' : 'Sign In'}
        </Text>
      </TouchableOpacity>

      {/* Sign Up Link */}
      <Text style={styles.signupText}>
        Don’t have an account?{' '}
        <Text style={styles.signupLink} onPress={() => navigation.navigate('SignUp')}>
          Sign up.
        </Text>
      </Text>

      {/* Divider */}
      <View style={styles.dividerContainer}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.divider} />
      </View>

      {/* Google Sign In */}
      <View style={styles.socialRow}>
        <TouchableOpacity
          style={[styles.socialBtn, styles.googleButton]}
          onPress={handleGoogleSignIn}
          disabled={googleLoading}
        >
          {googleLoading ? (
            <ActivityIndicator color={Colors.black} />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color={Colors.black} style={styles.googleIcon} />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    paddingTop: 80,
  },
  title: {
    color: Colors.primary,
    fontSize: 26,
    marginBottom: 40,
    fontWeight: '500',
  },
  welcome: {
    color: Colors.primary,
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    color: Colors.textMuted,
    marginBottom: 66,
  },
  inputContainer: {
    width: '85%',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 25,
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    color: Colors.text,
    paddingVertical: 15,
  },
  iconRight: {
    marginLeft: 10,
  },
  errorText: {
    color: 'red',
    marginBottom: 15,
    textAlign: 'center',
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '85%',
    marginBottom: 30,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderColor: Colors.text,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 5,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  rememberText: {
    color: Colors.text,
  },
  forgotText: {
    color: Colors.linkText,
    textDecorationLine: 'underline',
  },
  signInButton: {
    backgroundColor: Colors.primary,
    width: '85%',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  disabledButton: {
    opacity: 0.7,
  },
  signInText: {
    color: Colors.btnText,
    fontSize: 16,
    fontWeight: '600',
  },
  signupText: {
    color: Colors.textMuted,
    marginBottom: 20,
  },
  signupLink: {
    color: Colors.linkText,
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderRadius: 8,
    paddingVertical: 15,
    width: '85%',
    marginBottom: 20,
  },
  googleIcon: {
    marginRight: 10,
  },
  googleButtonText: {
    color: Colors.black,
    fontWeight: '600',
    fontSize: 16,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 20,
  },
  socialBtn: {
    backgroundColor: Colors.badge,
    padding: 15,
    borderRadius: 20,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '85%',
    marginVertical: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.divider,
  },
  dividerText: {
    color: Colors.textMuted,
    paddingHorizontal: 10,
    fontSize: 12,
  },
});
