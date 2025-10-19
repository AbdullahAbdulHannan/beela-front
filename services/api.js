import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
import notifee from '@notifee/react-native';

// Use environment variable or default to local development URL
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://voxa-backend-three.vercel.app/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Expires': '0'
  },
  timeout: 15000,
  withCredentials: true
});

// Request interceptor
api.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem('userToken');
    console.log('Token from storage:', token);
    
    if (token) {
      // Ensure headers object exists
      config.headers = config.headers || {};
      // Set the token
      config.headers.Authorization = `Bearer ${token}`;
      console.log('Request headers:', JSON.stringify(config.headers, null, 2));
    } else {
      console.warn('No token found in AsyncStorage');
    }
    
    // Ensure we're sending proper JSON
    if (config.data && typeof config.data === 'object') {
      config.data = JSON.stringify(config.data);
    }
    
    return config;
  } catch (error) {
    console.error('Error in request interceptor:', error);
    return Promise.reject(error);
  }
}, (error) => {
  console.error('Request interceptor error:', error);
  return Promise.reject(error);
});

// Response interceptor
api.interceptors.response.use(
  (response) => {
    // Handle successful responses
    if (typeof response.data === 'string') {
      try {
        response.data = JSON.parse(response.data);
      } catch (e) {
        console.warn('Failed to parse response as JSON:', response.data);
      }
    }
    return response;
  },
  (error) => {
    // Handle errors
    if (error.response) {
      console.error('Response error:', {
        status: error.response.status,
        data: error.response.data,
        headers: error.response.headers
      });
    } else if (error.request) {
      console.error('No response received:', error.request);
    } else {
      console.error('Request setup error:', error.message);
    }
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // If error is 401 and we haven't tried to refresh the token yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Try to refresh the token
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, { refreshToken });
          const { token, user } = response.data;
          
          // Store the new tokens
          await AsyncStorage.setItem('userToken', response.data.token);
          
          // Update the Authorization header
          originalRequest.headers.Authorization = `Bearer ${token}`;
          console.log('Updated request headers:', originalRequest.headers); // Debug log
          
          // Retry the original request
          return api(originalRequest);
        }
      } catch (error) {
        console.error('Error refreshing token:', error);
        // Cancel any scheduled items for the current user (native + notifee) and clear per-user map
        try {
          const rawUser = await AsyncStorage.getItem('user');
          const user = rawUser ? JSON.parse(rawUser) : null;
          const userId = user?._id || user?.id || user?.email || '';
          if (userId) {
            try { await NativeModules?.AlarmScheduler?.cancelAllForUser?.(String(userId)); } catch {}
            try {
              const key = `scheduledReminderNotificationsMap:${String(userId)}`;
              const raw = await AsyncStorage.getItem(key);
              const map = raw ? JSON.parse(raw) : {};
              const ids = Object.values(map).map(v => v?.notifeeId).filter(Boolean);
              for (const id of ids) { try { await notifee.cancelTriggerNotification(id); } catch {} }
              await AsyncStorage.removeItem(key);
            } catch {}
          }
          try { await NativeModules?.AlarmScheduler?.setCurrentUser?.(""); } catch {}
        } catch {}
        await AsyncStorage.removeItem('userToken');
        await AsyncStorage.removeItem('user');
        // You might want to add navigation to login screen here
      }
    }
    
    // For other errors, just reject with the error
    return Promise.reject(error);
  }
);

// Auth API
export const signup = async (userData) => {
  try {
    const endpoint = '/auth/signup';
    const response = await api.post(endpoint, userData);
    if (response.data.token) {
      await AsyncStorage.setItem('userToken', response.data.token);
    }
    // Persist user info if provided by backend
    if (response.data.user) {
      await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
      const u = response.data.user;
      const userId = u?._id || u?.id || u?.email || '';
      try { await NativeModules?.AlarmScheduler?.setCurrentUser?.(String(userId)); } catch {}
    }
    return response.data;
  } catch (error) {
    console.error('Signup error:', error.response?.data || error.message);
    const msg = error?.response?.data?.message || 'Signup failed';
    throw new Error(msg);
  }
};

export const login = async (credentials) => {
  try {
    // For Google auth, we'll handle it differently
    if (credentials.isGoogleAuth) {
      // First try to log in with Google
      try {
        const response = await api.post('/auth/google', {
          accessToken: credentials.password // Using password field for Google token
        });
        if (response.data.token) {
          await AsyncStorage.setItem('userToken', response.data.token);
        }
        // Persist user info if provided by backend
        if (response.data.user) {
          await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
          const u = response.data.user;
          const userId = u?._id || u?.id || u?.email || '';
          try { await NativeModules?.AlarmScheduler?.setCurrentUser?.(String(userId)); } catch {}
        }
        return response.data;
      } catch (googleError) {
        console.error('Google login failed, trying regular login:', googleError);
        // If Google login fails, try regular login with the token as password
        const response = await api.post('/auth/login', {
          email: credentials.email,
          password: credentials.password,
          isGoogleAuth: true
        });
        if (response.data.token) {
          await AsyncStorage.setItem('userToken', response.data.token);
        }
        // Persist user info if provided by backend
        if (response.data.user) {
          await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
          const u = response.data.user;
          const userId = u?._id || u?.id || u?.email || '';
          try { await NativeModules?.AlarmScheduler?.setCurrentUser?.(String(userId)); } catch {}
        }
        return response.data;
      }
    } else {
      // Regular login flow
      const response = await api.post('/auth/login', credentials);
      if (response.data.token) {
        await AsyncStorage.setItem('userToken', response.data.token);
      }
      // Persist user info if provided by backend
      if (response.data.user) {
        await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
        const u = response.data.user;
        const userId = u?._id || u?.id || u?.email || '';
        try { await NativeModules?.AlarmScheduler?.setCurrentUser?.(String(userId)); } catch {}
      }
      return response.data;
    }
  } catch (error) {
    console.error('Login error:', error.response?.data || error.message);
    const msg = error?.response?.data?.message || 'Login failed';
    throw new Error(msg);
  }
};

// Google Auth
export const googleSignIn = async (accessToken) => {
  try {
    const response = await api.post('/auth/google', { accessToken });
    if (response.data.token) {
      await AsyncStorage.setItem('userToken', response.data.token);
    }
    // Persist user info if provided by backend
    if (response.data.user) {
      await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
      const u = response.data.user;
      const userId = u?._id || u?.id || u?.email || '';
      try { await NativeModules?.AlarmScheduler?.setCurrentUser?.(String(userId)); } catch {}
    }
    return response.data;
  } catch (error) {
    console.error('Google sign-in error:', error.response?.data || error.message);
    throw error.response?.data?.message || 'Google sign-in failed';
  }
};

export const logout = async () => {
  try {
    // Cancel native alarms for the current user on this device before clearing storage
    const rawUser = await AsyncStorage.getItem('user');
    const user = rawUser ? JSON.parse(rawUser) : null;
    const userId = user?._id || user?.id || user?.email || '';
    if (userId) {
      try { await NativeModules?.AlarmScheduler?.cancelAllForUser?.(String(userId)); } catch {}
      // Cancel Notifee triggers and clear per-user scheduled map
      try {
        const key = `scheduledReminderNotificationsMap:${String(userId)}`;
        const raw = await AsyncStorage.getItem(key);
        const map = raw ? JSON.parse(raw) : {};
        const ids = Object.values(map).map(v => v?.notifeeId).filter(Boolean);
        for (const id of ids) { try { await notifee.cancelTriggerNotification(id); } catch {} }
        await AsyncStorage.removeItem(key);
      } catch {}
    }
    try { await NativeModules?.AlarmScheduler?.setCurrentUser?.(""); } catch {}
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('user');
  } catch (error) {
    console.error('Error during logout:', error);
  }
};

export const getCurrentUser = async () => {
  try {
    const user = await AsyncStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
};

// Password & OTP APIs
export const sendResetOtp = async (email) => {
  try {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'Failed to send OTP';
  }
};

export const verifyResetOtp = async ({ email, otp }) => {
  try {
    const response = await api.post('/auth/verify-otp', { email, otp });
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'OTP verification failed';
  }
};

export const resetPasswordWithOtp = async ({ email, newPassword }) => {
  try {
    const response = await api.post('/auth/reset-password', { email, newPassword });
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'Password reset failed';
  }
};

export const changePassword = async ({ currentPassword, newPassword }) => {
  try {
    const response = await api.put('/auth/change-password', { currentPassword, newPassword });
    return response.data;
  } catch (error) {
    throw error.response?.data?.message || 'Change password failed';
  }
};

// Reminders API
export const createReminder = async (reminderData) => {
  try {
    // Add these debug logs
    console.log('=== DEBUGGING REMINDER CREATION ===');
    console.log('API Base URL:', API_BASE_URL);
    console.log('Current token:', await AsyncStorage.getItem('userToken'));
    console.log('Sending data:', JSON.stringify(reminderData, null, 2));

    const response = await api.post('/reminders', reminderData);
    
    console.log('=== RESPONSE RECEIVED ===');
    console.log('Status:', response.status);
    console.log('Response data:', response.data);
    
    return response.data;
  } catch (error) {
    console.error('=== ERROR DETAILS ===');
    console.error('Error message:', error.message);
    console.error('Error response:', {
      status: error.response?.status,
      data: error.response?.data,
      headers: error.response?.headers
    });
    throw error;
  }
};
export const getReminders = async () => {
  const response = await api.get('/reminders');
  return response.data;
};

export const updateReminder = async (id, updates) => {
  const response = await api.put(`/reminders/${id}`, updates);
  return response.data;
};

export const deleteReminder = async (id) => {
  const response = await api.delete(`/reminders/${id}`);
  return response.data;
};

export const getReminder = async (id) => {
  const response = await api.get(`/reminders/${id}`);
  return response.data;
};

// Ensure TTS exists and get current status + textHash for a reminder
export const ensureReminderTTS = async (id, opts = {}) => {
  const body = {};
  if (typeof opts.fixedMinutes === 'number') body.fixedMinutes = opts.fixedMinutes;
  const response = await api.post(`/reminders/${id}/tts/ensure`, body);
  return response.data;
};

// Calendar API
export const getCalendarEvents = async () => {
  const response = await api.get('/calendar/events');
  return response.data;
};

// Location API
export const getCoordinatesFromAddress = async (address) => {
  const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
    params: {
      address: address,
      key: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    },
  });
  return response.data;
};

// Location backend APIs
export const setLocationPermission = async (backgroundGranted) => {
  const response = await api.post('/location/permission', { backgroundGranted });
  return response.data;
};

export const scanNearbyForLocationReminders = async ({ lat, lng, radius = 500 }) => {
  const response = await api.post('/location/scan', { lat, lng, radius });
  return response.data;
};

// Notifications API
export const getNotifications = async () => {
  const response = await api.get('/notifications');
  return response.data;
};

export const markNotificationRead = async (id) => {
  const response = await api.post(`/notifications/${id}/mark-read`, {});
  return response.data;
};

export const markAllNotificationsRead = async () => {
  const response = await api.post('/notifications/mark-all-read', {});
  return response.data;
};

export default api;