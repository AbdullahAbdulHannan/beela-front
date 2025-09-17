import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from './constants/colors';
import { signup } from './services/api';
import useGoogleAuth from './services/authService';

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
    try {
      setGoogleLoading(true);
      await promptAsync();
    } catch (error) {
      setError('Failed to sign in with Google. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignup = async () => {
    setError(''); // reset errors

    if (!name || !email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    // Basic email syntax validation
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    try {
      setIsLoading(true);
      await signup({ fullname: name, email, password });
      navigation.navigate('Dashboard');
    } catch (err) {
      // Normalize message from API service throws
      const message = typeof err === 'string' ? err : (err?.message || 'Signup failed. Please try again.');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign Up</Text>

      <Text style={styles.welcome}>Create Account</Text>
      <Text style={styles.subtitle}>Please fill the details</Text>

      {/* Name */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Full Name"
          placeholderTextColor={Colors.textMuted}
          value={name}
          onChangeText={setName}
        />
      </View>

      {/* Email */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={Colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />
      </View>

      {/* Password */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={Colors.textMuted}
          secureTextEntry={secure}
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity onPress={() => setSecure(!secure)} style={styles.iconRight}>
          <Ionicons name={secure ? 'eye-off' : 'eye'} size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Error Message */}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* Sign Up Button */}
      <TouchableOpacity
        style={[styles.signInButton, isLoading && styles.disabledButton]}
        onPress={handleSignup}
        disabled={isLoading}
      >
        <Text style={styles.signInText}>
          {isLoading ? 'Creating Account...' : 'Sign Up'}
        </Text>
      </TouchableOpacity>

      {/* Divider */}
      <View style={styles.dividerContainer}>
        <View style={styles.divider} />
        <Text style={styles.dividerText}>OR</Text>
        <View style={styles.divider} />
      </View>

      {/* Google Sign In Button */}
      <TouchableOpacity
        style={[styles.googleButton, googleLoading && styles.disabledButton]}
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

      {/* Login Link */}
      <Text style={styles.signupText}>
        Already have an account?{' '}
        <Text style={styles.signupLink} onPress={() => navigation.navigate('Login')}>
          Login
        </Text>
      </Text>
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
  signInButton: {
    backgroundColor: Colors.primary,
    width: '85%',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 5,
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
