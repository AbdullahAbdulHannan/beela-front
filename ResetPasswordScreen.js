import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { resetPasswordWithOtp } from './services/api';
import { Colors } from './constants/colors';

const ACTIVE_COLOR = '#4668FF';
const SOFT_SHADOW = {
  ...Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
    android: { elevation: 8 },
  }),
};

const rules = {
  length: (s) => s.length >= 8,
  upper: (s) => /[A-Z]/.test(s),
  lower: (s) => /[a-z]/.test(s),
  number: (s) => /[0-9]/.test(s),
  special: (s) => /[^A-Za-z0-9]/.test(s),
};

export default function ResetPasswordScreen({ route, navigation }) {
  const email = route?.params?.email || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const checks = useMemo(() => ({
    length: rules.length(password),
    upper: rules.upper(password),
    lower: rules.lower(password),
    number: rules.number(password),
    special: rules.special(password),
    match: confirm.length > 0 && password === confirm,
  }), [password, confirm]);

  const allValid = checks.length && checks.upper && checks.lower && checks.number && checks.special && checks.match;

  const handleSubmit = async () => {
    if (isLoading || !allValid) return;
    setError('');
    setMessage('');
    try {
      setIsLoading(true);
      await resetPasswordWithOtp({ email, newPassword: password });
      setMessage('Password updated successfully.');
      setTimeout(() => navigation.replace('Login'), 800);
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Failed to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  const Rule = ({ ok, label }) => (
    <View style={styles.ruleRow}>
      <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={18} color={ok ? '#10B981' : '#EF4444'} />
      <Text style={[styles.ruleText, ok && { color: '#10B981' }]}>{label}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#F9FAFB' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{ backgroundColor: '#F9FAFB' }} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.welcomeText}>Set New Password</Text>
          <Text style={styles.subHeaderText}>Create a strong password for {email}</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.container} bounces={false}>

        {message ? (<Text style={styles.success}>{message}</Text>) : null}
        {error ? (<Text style={styles.error}>{error}</Text>) : null}

        <View style={[styles.inputContainer, SOFT_SHADOW]}>
          <Ionicons name="lock-closed-outline" size={20} color="#777" style={styles.inputIcon} />
          <TextInput
            style={styles.inputField}
            placeholder="New password"
            placeholderTextColor="#999"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <View style={[styles.inputContainer, SOFT_SHADOW]}>
          <Ionicons name="lock-closed" size={20} color="#777" style={styles.inputIcon} />
          <TextInput
            style={styles.inputField}
            placeholder="Confirm new password"
            placeholderTextColor="#999"
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
          />
        </View>

        <View style={styles.rulesBox}>
          <Rule ok={checks.length} label={"At least 8 characters"} />
          <Rule ok={checks.upper} label={"1 uppercase letter"} />
          <Rule ok={checks.lower} label={"1 lowercase letter"} />
          <Rule ok={checks.number} label={"1 number"} />
          <Rule ok={checks.special} label={"1 special character"} />
          <Rule ok={checks.match} label={"Passwords match"} />
        </View>

        <TouchableOpacity style={[styles.primaryButton, SOFT_SHADOW, (!allValid || isLoading) && styles.disabledButton]} disabled={!allValid || isLoading} onPress={handleSubmit}>
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Update Password</Text>}
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
  rulesBox: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, marginTop: 4 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 3 },
  ruleText: { marginLeft: 8, color: '#6B7280' },
  primaryButton: { backgroundColor: ACTIVE_COLOR, padding: 18, borderRadius: 15, alignItems: 'center', marginTop: 16 },
  disabledButton: { opacity: 0.6 },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  error: { color: '#B91C1C', marginTop: 8, fontWeight: '600' },
  success: { color: '#065F46', marginTop: 8, fontWeight: '600' },
});
