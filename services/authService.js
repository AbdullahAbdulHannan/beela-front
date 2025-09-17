import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { login, signup, googleSignIn } from './api';
import { Alert, Platform } from 'react-native';
import React from 'react'
// For web, you need to configure the redirect URL
WebBrowser.maybeCompleteAuthSession();
// Google OAuth configuration
const config = {
  expoClientId: '858276377004-gu37c7emcsebve7eb7jp2fskibmdne17.apps.googleusercontent.com',
  iosClientId: process.env.GOOGLE_IOS_CLIENT_ID || '858276377004-gu37c7emcsebve7eb7jp2fskibmdne17.apps.googleusercontent.com',
  androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || '858276377004-gu37c7emcsebve7eb7jp2fskibmdne17.apps.googleusercontent.com',
  webClientId: process.env.GOOGLE_WEB_CLIENT_ID || '858276377004-gu37c7emcsebve7eb7jp2fskibmdne17.apps.googleusercontent.com',
  // Use the correct redirect URI for your Expo development environment
  expoRedirectUri: 'exp://u.expo.dev/933fd9c0-1666-11e7-afca-d980795c5824?runtime-version=exposdk%3A53.0.0&channel-name=production&snack-channel=2Y29TDGdBq',
  // For local development
  localRedirectUri: 'http://localhost:19006',
};

// Use the appropriate client ID based on the platform
const getClientId = () => {
  if (__DEV__) {
    // In development, use the web client ID for all platforms
    return config.webClientId;
  }
  if (Platform.OS === 'ios') return config.iosClientId;
  if (Platform.OS === 'android') return config.androidClientId;
  return config.webClientId;
};

const useGoogleAuth = (navigation) => {
  const [request, response, promptAsync] = Google.useAuthRequest({
    expoClientId: config.expoClientId,
    clientId: getClientId(),
    scopes: ['profile', 'email', 'openid'],
    redirectUri: config.expoRedirectUri,
    // Enable proxy for Expo Go
    useProxy: true,
    // Request ID token for backend verification
    responseType: 'id_token',
    extraParams: {
      prompt: 'consent',
      access_type: 'offline',
    },
  });

  React.useEffect(() => {
    if (response?.type === 'success') {
      // expo-auth-session returns id_token in params when responseType is 'id_token'
      const idToken = response.params?.id_token;
      if (idToken) {
        handleGoogleSignIn(idToken);
      } else {
        console.error('Google auth missing id_token');
        Alert.alert('Error', 'Failed to retrieve Google ID token');
      }
    } else if (response?.type === 'error') {
      console.error('Google auth error:', response.error);
      Alert.alert('Error', 'Failed to sign in with Google');
    }
  }, [response]);

  const handleGoogleSignIn = async (idToken) => {
    try {
      // Directly authenticate with backend using ID token
      await googleSignIn(idToken);
      navigation.navigate('Dashboard');
    } catch (error) {
      console.error('Google sign-in error:', error);
      Alert.alert('Error', 'Failed to sign in with Google');
    }
  };

  return { promptAsync };
};

export default useGoogleAuth;