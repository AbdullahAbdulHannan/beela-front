import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { verifyResetOtp } from './services/api';
import { Colors } from './constants/colors';

const ACTIVE_COLOR = '#4668FF';
const SOFT_SHADOW = {
  ...Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
    android: { elevation: 8 },
  }),
};

export default function VerifyOtpScreen({ route, navigation }) {
  const email = route?.params?.email || '';
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const isValidOtp = useMemo(() => /^\d{6}$/.test(otp), [otp]);

  useEffect(() => {
    if (otp.length === 6 && isValidOtp) {
      handleVerify();
    }
  }, [otp]);

  const handleVerify = async () => {
    if (isLoading || !isValidOtp) return;
    setError('');
    setMessage('');
    try {
      setIsLoading(true);
      await verifyResetOtp({ email, otp });
      setMessage('OTP verified successfully.');
      setTimeout(() => navigation.replace('ResetPassword', { email }), 600);
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Invalid or expired OTP');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#F9FAFB' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{ backgroundColor: '#F9FAFB' }} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.welcomeText}>Verify OTP</Text>
          <Text style={styles.subHeaderText}>We sent a 6-digit code to {email}</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.container} bounces={false}>

        {message ? (<Text style={styles.success}>{message}</Text>) : null}
        {error ? (<Text style={styles.error}>{error}</Text>) : null}

        <View style={[styles.inputContainer, SOFT_SHADOW]}>
          <Ionicons name="key-outline" size={20} color="#777" style={styles.inputIcon} />
          <TextInput
            style={styles.inputField}
            placeholder="Enter 6-digit OTP"
            placeholderTextColor="#999"
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, ''))}
            autoFocus
          />
        </View>

        <TouchableOpacity style={[styles.primaryButton, SOFT_SHADOW, (!isValidOtp || isLoading) && styles.disabledButton]} disabled={!isValidOtp || isLoading} onPress={handleVerify}>
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Verify</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={{ marginTop: 10, alignSelf: 'center' }}>
          <Text style={{ color: ACTIVE_COLOR, fontWeight: '700' }}>Wrong email? Go back</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#F9FAFB', paddingHorizontal: 30, paddingTop: 50, paddingBottom: 40, justifyContent: 'center' },
  header: { marginBottom: 40 },
  welcomeText: { fontSize: 32, fontWeight: '900', color: ACTIVE_COLOR, marginBottom: 5 },
  subHeaderText: { fontSize: 16, color: '#777', fontWeight: '500' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 15, height: 55, marginBottom: 15, paddingHorizontal: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  inputIcon: { marginRight: 10 },
  inputField: { flex: 1, fontSize: 16, color: '#333' },
  primaryButton: { backgroundColor: ACTIVE_COLOR, padding: 18, borderRadius: 15, alignItems: 'center', marginBottom: 10 },
  disabledButton: { opacity: 0.6 },
  primaryButtonText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  error: { color: '#B91C1C', marginTop: 12, fontWeight: '600' },
  success: { color: '#065F46', marginTop: 12, fontWeight: '600' },
});
