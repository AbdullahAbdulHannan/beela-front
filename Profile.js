import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Platform, NativeModules } from 'react-native';
import { Feather, Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, logout } from './services/api';
// Assuming Colors.text is a dark color, let's redefine it or use a default dark one for safety
// import { Colors } from './constants/colors'; 
import SuccessModal from './components/MessageModal';
import Navbar from './components/Navbar';

// Theme Colors
const PRIMARY_COLOR = '#4668FF';
const WHITE = '#FFFFFF';
const DARK_TEXT = '#1A1D2E';
const MUTED_TEXT = '#6B7280';
const LIGHT_GREY = '#F3F4F6';
const BORDER_COLOR = '#E5E7EB';
const PLACEHOLDER_TEXT = '#9CA3AF';

// A simple local 'Colors' object for clarity
const Colors = {
    primary: PRIMARY_COLOR,
    text: DARK_TEXT,
    background: WHITE,
    subText: MUTED_TEXT,
};

export default function ProfileScreen({ navigation }) {
    const [showEditScreen, setShowEditScreen] = useState(false);
    const [fullname, setFullname] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [batteryIgnored, setBatteryIgnored] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [modalMessage, setModalMessage] = useState('');

    // State for input focus effect
    const [focusFullname, setFocusFullname] = useState(false);
    const [focusEmail, setFocusEmail] = useState(false);
    const [focusPhone, setFocusPhone] = useState(false);

    // --- Original Logic (kept as is) ---
    useEffect(() => {
        refreshPermissions();
        fetchUserProfile();
    }, []);

    const fetchUserProfile = async () => {
        try {
            const userString = await AsyncStorage.getItem('user');
            if (userString) {
                const user = JSON.parse(userString);
                setFullname(user?.fullname || user?.name || '');
                setEmail(user?.email || '');
                setPhone(user?.phone || '');
            }

            const token = await AsyncStorage.getItem('userToken');
            if (token) {
                const res = await fetch(`${API_BASE_URL}/auth/profile`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/json',
                    },
                });
                if (res.ok) {
                    const data = await res.json();
                    const u = data?.user || data?.data || data;
                    if (u) {
                        setFullname(u.fullname || u.name || '');
                        setEmail(u.email || '');
                        setPhone(u.phone || '');
                        await AsyncStorage.setItem('user', JSON.stringify({ ...u }));
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const saveProfile = async () => {
        try {
            setSaving(true);
            const token = await AsyncStorage.getItem('userToken');
            if (!token) {
                setModalMessage('You must be logged in to update profile');
                setModalVisible(true);
                return;
            }

            const res = await fetch(`${API_BASE_URL}/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ fullname, email, phone }),
            });

            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                throw new Error(j?.message || 'Failed to update profile');
            }

            const j = await res.json();
            const u = j?.user || j?.data || j;

            if (u) {
                await AsyncStorage.setItem('user', JSON.stringify({ ...u }));
                setModalMessage('Profile updated successfully!');
                setModalVisible(true);
                setShowEditScreen(false);
            }
        } catch (e) {
            setModalMessage(e?.message || 'Failed to update profile');
            setModalVisible(true);
        } finally {
            setSaving(false);
        }
    };

    const refreshPermissions = async () => {
        try {
            if (Platform.OS !== 'android') return;
            const ignoring = await NativeModules?.AlarmScheduler?.isIgnoringBatteryOptimizations?.();
            setBatteryIgnored(Boolean(ignoring));
        } catch {
            setBatteryIgnored(false);
        }
    };

    const openBatteryOptSettings = async () => {
        try {
            await NativeModules?.AlarmScheduler?.requestIgnoreBatteryOptimizations?.();
            setTimeout(refreshPermissions, 1000);
        } catch {
            setModalMessage('Failed to open battery optimization settings');
            setModalVisible(true);
        }
    };

    const openAutoStartSettings = async () => {
        try {
            await NativeModules?.AlarmScheduler?.openOemPowerSettings?.();
        } catch {
            setModalMessage('Failed to open auto-start settings');
            setModalVisible(true);
        }
    };

    const handleLogout = async () => {
        await logout();
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    };

    const menuItems = [
        {
            iconFamily: 'Feather',
            iconName: 'lock',
            label: 'Change Password',
            hasArrow: true,
            onPress: () => navigation.navigate('ChangePassword')
        },
        {
            iconFamily: 'MaterialIcons',
            iconName: 'privacy-tip',
            label: 'Privacy Policy',
            hasArrow: true,
            onPress: () => navigation.navigate('PrivacyPolicy')
        },
    ];
    // --- End of Original Logic ---


    if (loading) {
        return (
            <View style={[styles.container, styles.centerContent]}>
                <ActivityIndicator size="large" color={PRIMARY_COLOR} />
            </View>
        );
    }

    // ===================================================================
    // EDIT PROFILE SCREEN
    // ===================================================================
    if (showEditScreen) {
        return (
            <View style={styles.container}>
                {/* Custom Header for Edit Screen */}
                <View style={styles.editHeader}>
                    <TouchableOpacity
                        onPress={() => setShowEditScreen(false)}
                        style={styles.backButton}
                    >
                        <Feather name="chevron-left" size={26} color={DARK_TEXT} />
                    </TouchableOpacity>
                    <Text style={styles.editHeaderTitle}>Edit Profile</Text>
                    <View style={styles.backButton} />
                </View>

                <ScrollView
                    style={styles.scrollView}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.editScrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Focus on Name/Title instead of Avatar */}
                    <View style={styles.editTitleContainer}>
                        <Text style={styles.editTitleName}>{fullname || 'Update Your Details'}</Text>
                        <Text style={styles.editTitleSub}>You can modify your personal information below.</Text>
                    </View>

                    {/* Form Fields */}
                    <View style={styles.formContainer}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Full name</Text>
                            <TextInput
                                style={[styles.input, focusFullname && styles.inputFocused]}
                                value={fullname}
                                onChangeText={setFullname}
                                placeholder="Enter your full name"
                                placeholderTextColor={PLACEHOLDER_TEXT}
                                onFocus={() => setFocusFullname(true)}
                                onBlur={() => setFocusFullname(false)}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Email address</Text>
                            <TextInput
                                style={[styles.input, focusEmail && styles.inputFocused]}
                                value={email}
                                onChangeText={setEmail}
                                placeholder="Enter your email"
                                placeholderTextColor={PLACEHOLDER_TEXT}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                onFocus={() => setFocusEmail(true)}
                                onBlur={() => setFocusEmail(false)}
                                // Email is often read-only, but kept editable for flexibility
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Phone number (Optional)</Text>
                            <TextInput
                                style={[styles.input, focusPhone && styles.inputFocused]}
                                value={phone}
                                onChangeText={setPhone}
                                placeholder="Enter your phone number"
                                placeholderTextColor={PLACEHOLDER_TEXT}
                                keyboardType="phone-pad"
                                onFocus={() => setFocusPhone(true)}
                                onBlur={() => setFocusPhone(false)}
                            />
                        </View>
                    </View>

                    {/* Save Button */}
                    <TouchableOpacity
                        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                        onPress={saveProfile}
                        activeOpacity={0.8}
                        disabled={saving}
                    >
                        {saving ? (
                            <ActivityIndicator color={WHITE} />
                        ) : (
                            <Text style={styles.saveButtonText}>Save Changes</Text>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            </View>
        );
    }

    // ===================================================================
    // MAIN PROFILE SCREEN
    // ===================================================================
    return (
        <View style={styles.container}>
            {/* Top Navigation/Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={styles.backButton}>
                    <Feather name="chevron-left" size={26} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Profile</Text>
                <TouchableOpacity activeOpacity={0.7} onPress={handleLogout} style={styles.logoutIcon}>
                    <Feather name="log-out" size={24} color="#DC2626" />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Profile Header (Focus on Name/Email) */}
                <View style={styles.profileHeader}>
                    <Text style={styles.userName}>{fullname || 'User Profile'}</Text>
                    <Text style={styles.userTag}>{email}</Text>

                    <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => setShowEditScreen(true)}
                        activeOpacity={0.8}
                    >
                        <Feather name="edit-3" size={16} color={PRIMARY_COLOR} style={{ marginRight: 8 }} />
                        <Text style={styles.editButtonText}>Edit Profile</Text>
                    </TouchableOpacity>
                </View>

                {/* Battery Warning (Android only) */}
                {Platform.OS === 'android' && !batteryIgnored && (
                    <View style={styles.warningCard}>
                        <View style={styles.warningHeader}>
                            <Feather name="alert-triangle" size={24} color="#F59E0B" />
                            <Text style={styles.warningTitle}>Action Required</Text>
                        </View>
                        <Text style={styles.warningText}>
                            Enable battery optimization and auto-start permissions for reliable reminders.
                        </Text>
                        <View style={styles.warningButtons}>
                            <TouchableOpacity
                                style={styles.warningButton}
                                onPress={openBatteryOptSettings}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.warningButtonText}>Battery Settings</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.warningButton}
                                onPress={openAutoStartSettings}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.warningButtonText}>Auto-start</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                            style={styles.recheckButton}
                            onPress={refreshPermissions}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.recheckButtonText}>Re-check Permissions</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Menu Items */}
                <View style={styles.menuContainer}>
                    {menuItems.map((item, index) => {
                        const IconComponent = item.iconFamily === 'Feather' ? Feather :
                            item.iconFamily === 'Ionicons' ? Ionicons : MaterialIcons;
                        return (
                            <TouchableOpacity
                                key={index}
                                style={styles.menuItem}
                                onPress={item.onPress}
                                activeOpacity={0.8}
                            >
                                <View style={styles.menuItemLeft}>
                                    <View style={styles.menuIconContainer}>
                                        <IconComponent name={item.iconName} size={22} color={PRIMARY_COLOR} />
                                    </View>
                                    <Text style={styles.menuItemText}>{item.label}</Text>
                                </View>

                                <View style={styles.menuItemRight}>
                                    {item.hasWarning && (
                                        <Feather name="alert-circle" size={20} color="#F59E0B" style={{ marginRight: 8 }} />
                                    )}
                                    {item.hasArrow && (
                                        <Feather name="chevron-right" size={22} color={MUTED_TEXT} />
                                    )}
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>

            <SuccessModal
                visible={modalVisible}
                message={modalMessage}
                onClose={() => setModalVisible(false)}
            />
            <Navbar />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: WHITE,
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 200,
        paddingHorizontal: 20,
    },
    editScrollContent: {
        paddingBottom: 200,
        paddingHorizontal: 20,
    },

    // --- Header Style ---
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 40 : 55,
        paddingBottom: 15,
        backgroundColor: WHITE,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: DARK_TEXT,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-start',
    },
    logoutIcon: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-end',
    },

    // --- Profile Header (Avatar Removed) ---
    profileHeader: {
        alignItems: 'center',
        paddingVertical: 40, // Increased padding to make up for avatar height
        marginBottom: 20,
        paddingHorizontal: 20,
        backgroundColor: WHITE,
    },
    userName: {
        fontSize: 28, // Large, dominant text
        fontWeight: '800',
        color: DARK_TEXT,
        marginBottom: 4,
    },
    userTag: {
        fontSize: 16,
        color: MUTED_TEXT,
        fontWeight: '500',
        marginBottom: 30, // Increased spacing before the button
    },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 24,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: PRIMARY_COLOR,
        backgroundColor: WHITE,
    },
    editButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: PRIMARY_COLOR,
    },

    // --- Menu Item Styles ---
    menuContainer: {
        paddingHorizontal: 0, // Keep padding from scrollContent
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: WHITE,
        borderRadius: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    menuItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    menuIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#E8ECFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    menuItemText: {
        fontSize: 16,
        fontWeight: '600',
        color: DARK_TEXT,
    },
    menuItemRight: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 12,
    },

    // --- Warning Card Styles ---
    warningCard: {
        marginHorizontal: 0, // Use scrollContent padding
        marginBottom: 20,
        padding: 18,
        backgroundColor: '#FFFBEB',
        borderRadius: 16,
        borderLeftWidth: 5,
        borderLeftColor: '#F59E0B',
        borderWidth: 1,
        borderColor: '#FEF3C7',
    },
    warningHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    warningTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#92400E',
        marginLeft: 10,
    },
    warningText: {
        fontSize: 14,
        color: '#78350F',
        marginBottom: 16,
        lineHeight: 20,
    },
    warningButtons: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 10,
    },
    warningButton: {
        flex: 1,
        backgroundColor: '#F59E0B',
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    warningButtonText: {
        color: WHITE,
        fontSize: 14,
        fontWeight: '600',
    },
    recheckButton: {
        alignSelf: 'flex-start',
        paddingVertical: 8,
    },
    recheckButtonText: {
        color: '#92400E',
        fontSize: 14,
        fontWeight: '600',
    },

    // --- Edit Profile Screen Styles ---
    editHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'android' ? 40 : 55,
        paddingBottom: 20,
        backgroundColor: WHITE,
        borderBottomWidth: 1,
        borderBottomColor: LIGHT_GREY,
    },
    editHeaderTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: DARK_TEXT,
    },
    editTitleContainer: {
        alignItems: 'flex-start',
        marginTop: 30,
        marginBottom: 40,
        // Aligned to the left for a modern, dashboard-like feel
    },
    editTitleName: {
        fontSize: 24,
        fontWeight: '800',
        color: DARK_TEXT,
        marginBottom: 4,
    },
    editTitleSub: {
        fontSize: 15,
        color: MUTED_TEXT,
        fontWeight: '500',
    },
    formContainer: {
        marginBottom: 32,
    },
    inputGroup: {
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: DARK_TEXT,
        marginBottom: 8,
    },
    input: {
        height: 56,
        borderWidth: 1,
        borderColor: BORDER_COLOR,
        borderRadius: 12,
        paddingHorizontal: 16,
        fontSize: 16,
        color: DARK_TEXT,
        backgroundColor: LIGHT_GREY,
        fontWeight: '500',
    },
    inputFocused: {
        borderColor: PRIMARY_COLOR,
        backgroundColor: WHITE,
        borderWidth: 2,
    },
    saveButton: {
        backgroundColor: PRIMARY_COLOR,
        paddingVertical: 18,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: PRIMARY_COLOR,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 10,
        marginTop: 15,
        marginBottom: 40,
    },
    saveButtonDisabled: {
        opacity: 0.7,
        shadowOpacity: 0,
        elevation: 0,
    },
    saveButtonText: {
        color: WHITE,
        fontSize: 18,
        fontWeight: '700',
    },
});