import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
  PermissionsAndroid,
  Image,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import { 
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent 
} from '@jamsch/expo-speech-recognition';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from './services/api';
import wakeWordService from './services/wakeWordService';

const BelaAIScreen = () => {
  const [isListening, setIsListening] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef();

  // Handle speech recognition events
  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (event.results && event.results[0]) {
      setTranscript(event.results[0].transcript);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.error('Speech recognition error:', event.error, event.message);
    setError(`Speech recognition error: ${event.message}`);
    setIsListening(false);
  });

  const startListening = async () => {
    if (!isSpeechAvailable) {
      setError('Speech recognition is not available on this device');
      return;
    }

    try {
      // Pause global wake word detection while user is actively speaking
      await wakeWordService.pauseListening(30000); // Pause for 30 seconds
      
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        setError('Microphone permission is required for voice input');
        return;
      }

      setTranscript('');
      setError(null);
      
      // Start speech recognition
      await ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        requiresOnDeviceRecognition: false,
        addsPunctuation: true,
      });
      
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setError('Failed to start voice input. Please try again.');
      setIsListening(false);
    }
  };

  const stopListening = async () => {
    if (!isSpeechAvailable) {
      setIsListening(false);
      return;
    }

    try {
      if (ExpoSpeechRecognitionModule && typeof ExpoSpeechRecognitionModule.stop === 'function') {
        await ExpoSpeechRecognitionModule.stop();
      }
      
      if (transcript && transcript.trim()) {
        const userMessage = { role: 'user', content: transcript };
        setConversation(prev => [...prev, userMessage]);
        await processUserMessage(transcript);
      }
      
      setTranscript('');
    } catch (err) {
      console.error('Error during stop listening:', err);
      setError('Error processing voice input');
    } finally {
      setIsListening(false);
    }
  };

  const confirmAndCreateTask = async (taskData) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const response = await fetch(`${API_BASE_URL}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(taskData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create task');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  };

  const confirmAndCreateMeeting = async (meetingData) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const response = await fetch(`${API_BASE_URL}/meetings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(meetingData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to schedule meeting');
      }

      return await response.json();
    } catch (error) {
      console.error('Error scheduling meeting:', error);
      throw error;
    }
  };

  const showConfirmation = (title, message, onConfirm) => {
    Alert.alert(
      title,
      message,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Confirm',
          onPress: onConfirm,
          style: 'default',
        },
      ],
      { cancelable: true }
    );
  };

  const processUserMessage = async (message) => {
    try {
      setIsProcessing(true);
      
      const API_URL = `${API_BASE_URL}/assistant/chat`;
      const token = await AsyncStorage.getItem('userToken');
      
      if (!token) {
        throw new Error('Not authenticated. Please log in again.');
      }

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Server error: ${response.status}`);
      }

      const result = await response.json();

      if (result.response) {
        const assistantMessage = { role: 'assistant', content: result.response };
        setConversation(prev => [...prev, assistantMessage]);
      }

      // Check if the assistant detected a task or meeting
      if (result.action === 'create_task') {
        showConfirmation(
          'Create Task',
          `Would you like to create a task: ${result.taskData.title}?`,
          async () => {
            try {
              const createdTask = await confirmAndCreateTask(result.taskData);
              const confirmationMessage = { 
                role: 'assistant', 
                content: `Task "${createdTask.title}" has been created successfully!` 
              };
              setConversation(prev => [...prev, confirmationMessage]);
            } catch (error) {
              const errorMessage = { 
                role: 'assistant', 
                content: `Failed to create task: ${error.message}` 
              };
              setConversation(prev => [...prev, errorMessage]);
            }
          }
        );
      } else if (result.action === 'schedule_meeting') {
        showConfirmation(
          'Schedule Meeting',
          `Would you like to schedule a meeting: ${result.meetingData.title} on ${new Date(result.meetingData.startTime).toLocaleString()}?`,
          async () => {
            try {
              const createdMeeting = await confirmAndCreateMeeting(result.meetingData);
              const confirmationMessage = { 
                role: 'assistant', 
                content: `Meeting "${createdMeeting.title}" has been scheduled for ${new Date(createdMeeting.startTime).toLocaleString()}!` 
              };
              setConversation(prev => [...prev, confirmationMessage]);
            } catch (error) {
              const errorMessage = { 
                role: 'assistant', 
                content: `Failed to schedule meeting: ${error.message}` 
              };
              setConversation(prev => [...prev, errorMessage]);
            }
          }
        );
      }
    } catch (err) {
      console.error('Error processing message:', err);
      setError(err.message || 'Error processing your message');
    } finally {
      setIsProcessing(false);
    }
  };

  // Clean up speech recognition on unmount
  useEffect(() => {
    // When screen is mounted, pause wake word detection briefly
    wakeWordService.pauseListening(5000);
    
    return () => {
      try {
        // Safely stop any ongoing speech recognition
        if (ExpoSpeechRecognitionModule && 
            typeof ExpoSpeechRecognitionModule.stop === 'function') {
          const stopPromise = ExpoSpeechRecognitionModule.stop();
          if (stopPromise && typeof stopPromise.catch === 'function') {
            stopPromise.catch(err => {
              console.warn('Error stopping speech recognition:', err);
            });
          }
        }
        
        // Clean up any resources if needed
        if (ExpoSpeechRecognitionModule && 
            typeof ExpoSpeechRecognitionModule.destroy === 'function') {
          const destroyPromise = ExpoSpeechRecognitionModule.destroy();
          if (destroyPromise && typeof destroyPromise.catch === 'function') {
            destroyPromise.catch(err => {
              console.warn('Error destroying speech recognition:', err);
            });
          }
        }
      } catch (err) {
        console.warn('Error during cleanup:', err);
      }
    };
  }, []);

  // Add a check for module availability
  const isSpeechAvailable = ExpoSpeechRecognitionModule && 
    typeof ExpoSpeechRecognitionModule.start === 'function' &&
    typeof ExpoSpeechRecognitionModule.stop === 'function';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Bela AI Assistant</Text>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.conversationContainer}
        contentContainerStyle={styles.conversationContent}
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }
      >
          <View style={styles.welcomeContainer}>
            {/* <View style={styles.avatarContainer}>
              <MaterialIcons name="android" size={80} color="#6200ee" />
            </View> */}
            {/* <Text style={styles.welcomeTitle}>Hi there! I'm Bela AI</Text>
            <Text style={styles.welcomeSubtitle}>
              Tap the mic and tell me what you need help with today. I can help
              you create tasks, schedule meetings, or answer questions.
            </Text> */}
            <Image
              source={require('./assets/robot.gif')}
              style={{ width: 200, height: 200, marginBottom: 20 }}
              resizeMode="contain"
            />
          </View>
      </ScrollView>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.inputContainer}>
        <Animated.View
          style={[
            styles.micButton,
            isListening && styles.micButtonActive,
            { transform: [{ scale: pulseAnim }] },
          ]}
        >
          <TouchableOpacity
            onPressIn={startListening}
            onPressOut={stopListening}
            activeOpacity={0.7}
            disabled={isProcessing}
          >
            <MaterialIcons
              name={isListening ? 'mic' : 'mic-none'}
              size={32}
              color="white"
            />
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.helperText}>
          {isListening ? 'Listening...' : 'Hold to speak'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    paddingTop: 50,
    paddingBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold'},
  conversationContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  conversationContent: { paddingBottom: 20 },
  welcomeContainer: { alignItems: 'center', justifyContent: 'center', padding: 20, marginTop: 40 },
  avatarContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e3f2fd',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#bbdefb',
  },
  welcomeTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 12, color: '#333', textAlign: 'center' },
  welcomeSubtitle: { fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 24 },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 18, marginBottom: 12 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#6200ee', borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: 'white', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#e0e0e0' },
  userText: { color: 'white', fontSize: 16 },
  assistantText: { color: '#333', fontSize: 16 },
  inputContainer: { padding: 20, alignItems: 'center', backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#eee' },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#6200ee',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  micButtonActive: { backgroundColor: '#3700b3' },
  helperText: { marginTop: 8, color: '#666', fontSize: 14 },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorText: { color: '#d32f2f', fontSize: 14 },
  typingIndicator: { flexDirection: 'row', padding: 8 },
  typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#666' },
});

export default BelaAIScreen;