import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from './constants/colors';

export default function ForgotPassword({ navigation }) {
  const [email, setEmail] = useState('');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Forgot Password</Text>

      <Text style={styles.welcome}>Reset Your Password</Text>
      <Text style={styles.subtitle}>Enter your registered email</Text>

      {/* Email */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={Colors.textMuted}
          value={email}
          onChangeText={setEmail}
        />
      </View>

      {/* Reset Button */}
      <TouchableOpacity style={styles.signInButton}>
        <Text style={styles.signInText}>Send Reset Link</Text>
      </TouchableOpacity>

      {/* Back to Login */}
      <Text style={styles.signupText} onPress={() => navigation.navigate('Login')}>
        Back to Login
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
  signInButton: {
    backgroundColor: Colors.primary,
    width: '85%',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  signInText: {
    color: Colors.btnText,
    fontSize: 16,
    fontWeight: '600',
  },
  signupText: {
    color: Colors.textMuted,
    marginTop: 10,
    textDecorationLine: 'underline',
  },
});
