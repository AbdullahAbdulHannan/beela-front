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
  const isMicPressedRef = useRef(false);
  const speechRecognitionActiveRef = useRef(false);

  // Handle speech recognition events
  useSpeechRecognitionEvent('start', () => {
    console.log('Speech recognition started');
    speechRecognitionActiveRef.current = true;
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent('end', () => {
    console.log('Speech recognition ended');
    speechRecognitionActiveRef.current = false;
    setIsListening(false);
    
    // If mic is still pressed but recognition ended, restart it
    if (isMicPressedRef.current) {
      setTimeout(() => {
        if (isMicPressedRef.current) {
          console.log('Restarting recognition as mic is still pressed');
          startListening();
        }
      }, 100);
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (event.results && event.results[0]) {
      const newTranscript = event.results[0].transcript;
      console.log('Transcript received:', newTranscript);
      setTranscript(newTranscript);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.error('Speech recognition error:', event.error, event.message);
    // Ignore "no-speech" errors as they're normal
    if (event.error !== 'no-speech') {
      setError(`Speech recognition error: ${event.message}`);
    }
    speechRecognitionActiveRef.current = false;
    setIsListening(false);
  });

  const startListening = async () => {
    if (!isSpeechAvailable) {
      setError('Speech recognition is not available on this device');
      return;
    }

    // Don't start if already listening
    if (speechRecognitionActiveRef.current) {
      console.log('Already listening, skipping start');
      return;
    }

    try {
      console.log('Starting speech recognition...');
      
      // CRITICAL: Ensure wake word is stopped before starting user speech recognition
      try {
        await wakeWordService.stopListening();
      } catch (err) {
        console.warn('Could not stop wake word service:', err);
      }
      
      // Mark that mic is pressed
      isMicPressedRef.current = true;
      
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        setError('Microphone permission is required for voice input');
        isMicPressedRef.current = false;
        return;
      }

      setTranscript('');
      setError(null);
      
      // Start speech recognition with continuous mode
      await ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: true, // Keep listening while mic is pressed
        requiresOnDeviceRecognition: false,
        addsPunctuation: true,
      });
      
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setError('Failed to start voice input. Please try again.');
      setIsListening(false);
      speechRecognitionActiveRef.current = false;
      isMicPressedRef.current = false;
    }
  };

  const stopListening = async () => {
    if (!isSpeechAvailable) {
      setIsListening(false);
      isMicPressedRef.current = false;
      return;
    }

    console.log('Stopping speech recognition...');
    
    // Mark that mic is released
    isMicPressedRef.current = false;

    try {
      if (ExpoSpeechRecognitionModule && typeof ExpoSpeechRecognitionModule.stop === 'function') {
        await ExpoSpeechRecognitionModule.stop();
      }
      
      speechRecognitionActiveRef.current = false;
      
      // Process the transcript if we have one
      if (transcript && transcript.trim()) {
        console.log('Processing transcript:', transcript);
        const finalTranscript = transcript.trim();
        
        // Clear transcript immediately before processing
        setTranscript('');
        
        // Add user message to conversation
        const userMessage = { role: 'user', content: finalTranscript };
        setConversation(prev => [...prev, userMessage]);
        
        // Process the message asynchronously
        processUserMessage(finalTranscript);
      } else {
        setTranscript('');
      }
      
    } catch (err) {
      console.error('Error during stop listening:', err);
      setError('Error processing voice input');
      setTranscript('');
    } finally {
      setIsListening(false);
      speechRecognitionActiveRef.current = false;
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
    }
    catch (error) {
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

      console.log('Sending message to assistant:', message);

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
      console.log('Assistant response:', result);

      // Add assistant's response to conversation
      if (result.response) {
        const assistantMessage = { role: 'assistant', content: result.response };
        setConversation(prev => [...prev, assistantMessage]);
        
        // Speak the response using text-to-speech (non-blocking)
        Speech.speak(result.response, {
          language: 'en-US',
          pitch: 1.0,
          rate: 0.9,
          onDone: () => {
            console.log('Finished speaking response');
          },
          onError: (error) => {
            console.warn('Failed to speak response:', error);
          }
        });
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
              
              // Speak confirmation (non-blocking)
              Speech.speak(confirmationMessage.content, {
                language: 'en-US',
                pitch: 1.0,
                rate: 0.9,
              });
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
              
              // Speak confirmation (non-blocking)
              Speech.speak(confirmationMessage.content, {
                language: 'en-US',
                pitch: 1.0,
                rate: 0.9,
              });
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
      const errorMsg = err.message || 'Error processing your message';
      setError(errorMsg);
      
      // Add error to conversation
      const errorMessage = { 
        role: 'assistant', 
        content: `Sorry, I encountered an error: ${errorMsg}` 
      };
      setConversation(prev => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };
  // Clean up speech recognition on unmount
  useEffect(() => {
    // Stop any ongoing TTS when mounting
    Speech.stop();
    
    // CRITICAL: Stop wake word detection when entering BelaAI screen
    const stopWakeWord = async () => {
      try {
        await wakeWordService.stopListening();
        console.log('🔇 Wake word detection STOPPED while in BelaAI screen');
      } catch (err) {
        console.warn('Error stopping wake word detection:', err);
      }
    };
    
    stopWakeWord();
    
    return () => {
      try {
        // Stop TTS
        Speech.stop();
        
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
        
        // Reset refs
        isMicPressedRef.current = false;
        speechRecognitionActiveRef.current = false;
        
        // CRITICAL: Restart wake word detection when leaving BelaAI screen
        setTimeout(() => {
          wakeWordService.startListening().then(() => {
            console.log('🔊 Wake word detection RESTARTED after leaving BelaAI screen');
          }).catch(err => {
            console.warn('Error restarting wake word detection:', err);
          });
        }, 1000); // Wait 1 second to ensure speech recognition is fully stopped
        
      } catch (err) {
        console.warn('Error during cleanup:', err);
      }
    };
  }, []);

  // Add a check for module availability
  const isSpeechAvailable = ExpoSpeechRecognitionModule && 
    typeof ExpoSpeechRecognitionModule.start === 'function' &&
    typeof ExpoSpeechRecognitionModule.stop === 'function';

  // Pulse animation for mic button when listening
  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}></Text>
      </View>

      <View style={styles.mainContent}>
        <View style={styles.welcomeContainer}>
          <Image
            source={require('./assets/robot.gif')}
            style={{ width: 450, height: 450, marginBottom: 30 }}
            resizeMode="contain"
          />
          <Text style={styles.welcomeTitle}>Hi! I'm Bela AI</Text>
          <Text style={styles.welcomeSubtitle}>
            Hold the mic button and speak. I'll respond with voice.
          </Text>
          
          {isProcessing && (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color="#6200ee" />
              <Text style={styles.processingText}>Processing your request...</Text>
            </View>
          )}
        </View>
      </View>

      {transcript && isListening && (
        <View style={styles.transcriptContainer}>
          <MaterialIcons name="mic" size={16} color="#2196f3" style={{ marginRight: 8 }} />
          <Text style={styles.transcriptText}>{transcript}</Text>
        </View>
      )}

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
          {isListening 
            ? 'Listening... (Release to send)' 
            : isProcessing 
              ? 'Processing...' 
              : 'Hold to speak'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  
  header: {
    paddingTop: 50,
    paddingBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold'},
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeContainer: { 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 20,
  },
  welcomeTitle: { 
    fontSize: 28, 
    fontWeight: 'bold', 
    marginBottom: 16, 
    color: '#333', 
    textAlign: 'center' 
  },
  welcomeSubtitle: { 
    fontSize: 18, 
    color: '#666', 
    textAlign: 'center', 
    lineHeight: 26,
    marginBottom: 20,
  },
  processingContainer: {
    marginTop: 30,
    alignItems: 'center',
  },
  processingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6200ee',
    fontWeight: '500',
  },
  inputContainer: { 
    padding: 20, 
    alignItems: 'center', 
    backgroundColor: 'white', 
    borderTopWidth: 1, 
    borderTopColor: '#eee' 
  },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#6200ee',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  micButtonActive: { backgroundColor: '#3700b3' },
  helperText: { 
    marginTop: 12, 
    color: '#666', 
    fontSize: 15,
    fontWeight: '500',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorText: { color: '#d32f2f', fontSize: 14 },
  transcriptContainer: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3',
    flexDirection: 'row',
    alignItems: 'center',
  },
  transcriptText: { 
    color: '#1565c0', 
    fontSize: 15, 
    fontStyle: 'italic',
    flex: 1,
  },
});
export default BelaAIScreen;