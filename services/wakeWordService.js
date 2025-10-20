import { 
  ExpoSpeechRecognitionModule,
  addSpeechRecognitionListener 
} from '@jamsch/expo-speech-recognition';
import { AppState, Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as Device from 'expo-device';

class WakeWordService {
  constructor() {
    this.isListening = false;
    this.navigationRef = null;
    this.listeners = [];
    this.appStateSubscription = null;
    this.isActive = false;
    this.retryTimeout = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.audioSessionConfigured = false;
  }

  /**
   * Initialize the wake word service
   * @param {Object} navigationRef - React Navigation ref
   */
  async initialize(navigationRef) {
    this.navigationRef = navigationRef;
    
    // Aggressively suppress all audio feedback FIRST
    await this.suppressAudioFeedback();
    
    // Check if speech recognition is available
    if (!ExpoSpeechRecognitionModule || 
        typeof ExpoSpeechRecognitionModule.start !== 'function') {
      console.warn('Speech recognition is not available on this device');
      return false;
    }

    try {
      // Request permissions
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        console.warn('Microphone permission not granted for wake word detection');
        return false;
      }

      // Set up event listeners
      this.setupListeners();

      // Monitor app state to restart listening when app becomes active
      this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange.bind(this));

      // Start listening if app is in foreground
      if (AppState.currentState === 'active') {
        await this.startListening();
      }

      return true;
    } catch (error) {
      console.error('Failed to initialize wake word service:', error);
      return false;
    }
  }

  /**
   * Set up speech recognition event listeners
   */
  setupListeners() {
    // Clean up existing listeners
    this.cleanupListeners();

    // Listen for speech recognition results
    const resultListener = addSpeechRecognitionListener('result', (event) => {
      if (event.results && event.results.length > 0) {
        const transcript = event.results[0].transcript.toLowerCase().trim();
        
        // Only log if transcript is not empty and meaningful
        if (transcript.length > 2) {
          console.log('Wake word detection - Transcript:', transcript);
        }
        
        // Check if wake phrase is detected
        if (this.detectWakePhrase(transcript)) {
          console.log('✨ Wake phrase detected! Navigating to BelaAI screen...');
          this.handleWakeWordDetected();
        }
      }
    });

    // Listen for end event to restart listening
    const endListener = addSpeechRecognitionListener('end', () => {
      // Reduce console spam - only log if debug mode needed
      // console.log('Speech recognition ended, restarting...');
      this.isListening = false;
      
      // Restart listening after a short delay if still active
      if (this.isActive && AppState.currentState === 'active') {
        setTimeout(() => {
          if (this.isActive) {
            this.startListening();
          }
        }, 300); // Reduced delay for faster restart
      }
    });

    // Listen for errors
    const errorListener = addSpeechRecognitionListener('error', (event) => {
      // Ignore "no-speech" errors as they're normal for continuous listening
      if (event.error === 'no-speech') {
        console.log('Wake word detection: no speech detected, continuing...');
        this.isListening = false;
        
        // Restart immediately for no-speech errors
        if (this.isActive && AppState.currentState === 'active') {
          setTimeout(() => {
            if (this.isActive) {
              this.startListening();
            }
          }, 100);
        }
        return;
      }
      
      // Log other errors
      console.error('Wake word detection error:', event.error, event.message);
      this.isListening = false;
      
      // Retry with exponential backoff for real errors
      if (this.isActive && this.retryCount < this.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, this.retryCount), 10000);
        this.retryCount++;
        
        console.log(`Retrying wake word detection in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`);
        
        this.retryTimeout = setTimeout(() => {
          if (this.isActive && AppState.currentState === 'active') {
            this.startListening();
          }
        }, delay);
      } else if (this.retryCount >= this.maxRetries) {
        console.warn('Max retries reached for wake word detection');
        this.retryCount = 0;
      }
    });

    // Listen for start event
    const startListener = addSpeechRecognitionListener('start', () => {
      // Only log on first start to reduce console spam
      if (!this.isListening) {
        console.log('Wake word detection started');
      }
      this.isListening = true;
      this.retryCount = 0; // Reset retry count on successful start
    });

    this.listeners = [resultListener, endListener, errorListener, startListener];
  }

  /**
   * Clean up event listeners
   */
  cleanupListeners() {
    if (this.listeners && this.listeners.length > 0) {
      this.listeners.forEach(listener => {
        if (listener && typeof listener.remove === 'function') {
          listener.remove();
        }
      });
      this.listeners = [];
    }
  }

  /**
   * Detect wake phrase in transcript
   * @param {string} transcript - The recognized text
   * @returns {boolean}
   */
  detectWakePhrase(transcript) {
    const wakeWords = [
      // "Hey Bela" variations
      'hey bela',
      'hey bella',
      'hey bila',
      'he bela',
      'he bella',
      
      // "Hi Bela" variations
      'hi bela',
      'hi bella',
      'hi bila',
      
      // "Hello Bela" variations
      'hello bela',
      'hello bella',
      'hello bila',
      
      // "OK/Okay Bela" variations
      'ok bela',
      'okay bela',
      'ok bella',
      'okay bella',
      
      // Additional common mishearings
      'hay bela',
      'hay bella',
      'a bela',
      'a bella',
    ];

    // Check for exact matches or partial matches at the start
    return wakeWords.some(phrase => 
      transcript === phrase || 
      transcript.startsWith(phrase + ' ') ||
      transcript.includes(' ' + phrase + ' ') ||
      transcript.includes(' ' + phrase)
    );
  }

  /**
   * Handle wake word detection
   */
  handleWakeWordDetected() {
    if (this.navigationRef && this.navigationRef.current) {
      try {
        // Navigate to BelaAI screen
        this.navigationRef.current.navigate('BelaAI');
        
        // Briefly pause wake word detection to avoid re-triggering
        this.pauseListening(3000);
      } catch (error) {
        console.error('Failed to navigate to BelaAI screen:', error);
      }
    } else {
      console.warn('Navigation ref not available');
    }
  }

  /**
   * Aggressively suppress all audio feedback and beep sounds
   * This is called BEFORE any speech recognition starts
   */
  async suppressAudioFeedback() {
    try {
      console.log('🔇 Suppressing all audio feedback...');
      
      // Set audio mode with ALL options to suppress sounds
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
        interruptionModeIOS: 1, // Do not mix with other audio
        interruptionModeAndroid: 1, // Do not mix
      });
      
      this.audioSessionConfigured = true;
      console.log('✅ Audio feedback suppressed successfully');
    } catch (error) {
      console.warn('⚠️ Could not suppress audio feedback:', error.message);
    }
  }

  /**
   * Configure audio session to suppress beep sounds
   * Called before each recognition start
   */
  async configureAudioSession() {
    try {
      // Skip if already configured recently
      if (this.audioSessionConfigured) {
        return;
      }
      
      // Additional audio configuration before starting recognition
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
        interruptionModeIOS: 1,
        interruptionModeAndroid: 1,
      });
      
      this.audioSessionConfigured = true;
    } catch (error) {
      // Silent fail - don't spam console
    }
  }

  /**
   * Start listening for wake word
   */
  async startListening() {
    if (this.isListening) {
      console.log('Already listening for wake word');
      return;
    }

    if (!ExpoSpeechRecognitionModule || 
        typeof ExpoSpeechRecognitionModule.start !== 'function') {
      console.warn('Speech recognition not available');
      return;
    }

    try {
      this.isActive = true;
      
      // IMPORTANT: Configure audio session IMMEDIATELY before starting to suppress beeps
      await this.configureAudioSession();
      
      // Platform-specific configuration to disable audio feedback
      const recognitionOptions = {
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: true,
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
        contextualStrings: ['Bela', 'Bella', 'Bila'],
      };

      // iOS-specific: Try to suppress audio feedback
      if (Platform.OS === 'ios') {
        recognitionOptions.iosCategory = 'playAndRecord';
        recognitionOptions.iosCategoryOptions = ['defaultToSpeaker', 'allowBluetooth', 'allowBluetoothA2DP'];
        recognitionOptions.iosTaskHint = 'dictation'; // Use dictation mode (quieter)
      }

      // Android-specific: Use search intent (no beeps)
      if (Platform.OS === 'android') {
        recognitionOptions.androidIntentLookup = 'VOICE_SEARCH'; // Search mode has no beeps
        recognitionOptions.androidRecognitionServicePackage = 'com.google.android.googlequicksearchbox';
        // These Android options may help suppress audio
        recognitionOptions.androidExtraResultsLimit = 1;
        recognitionOptions.androidExtraSpeechInputMinimumLengthMillis = 1000;
        recognitionOptions.androidExtraSpeechInputCompleteSilenceLengthMillis = 500;
        recognitionOptions.androidExtraSpeechInputPossibleCompleteSilenceLengthMillis = 500;
      }
      
      await ExpoSpeechRecognitionModule.start(recognitionOptions);
      
      // Don't log "activated" every time to reduce console spam
      // console.log('Wake word detection activated');
    } catch (error) {
      console.error('Failed to start wake word detection:', error);
      this.isListening = false;
    }
  }

  /**
   * Stop listening for wake word
   */
 async stopListening() {
  // Always mark inactive first
  this.isActive = false;

  // Clear any pending restarts immediately
  if (this.retryTimeout) {
    clearTimeout(this.retryTimeout);
    this.retryTimeout = null;
  }

  // Even if not currently listening, ensure recognition is stopped
  if (ExpoSpeechRecognitionModule && typeof ExpoSpeechRecognitionModule.stop === 'function') {
    try {
      await this.configureAudioSession();
      await ExpoSpeechRecognitionModule.stop();
      console.log('Wake word detection stopped');
    } catch (error) {
      console.error('Error stopping wake word detection:', error);
    }
  }

  this.isListening = false;
}


  /**
   * Pause listening for a specified duration
   * @param {number} duration - Pause duration in milliseconds
   */
  async pauseListening(duration = 3000) {
    await this.stopListening();
    
    setTimeout(() => {
      if (AppState.currentState === 'active') {
        this.startListening();
      }
    }, duration);
  }

  /**
   * Handle app state changes
   * @param {string} nextAppState
   */
  handleAppStateChange(nextAppState) {
    if (nextAppState === 'active') {
      // App came to foreground, start listening
      console.log('App became active, starting wake word detection');
      this.startListening();
    } else if (nextAppState === 'background' || nextAppState === 'inactive') {
      // App went to background, stop listening to save battery
      console.log('App went to background, stopping wake word detection');
      this.stopListening();
    }
  }

  /**
   * Clean up and destroy the service
   */
  async destroy() {
    console.log('Destroying wake word service');
    
    // Remove app state listener
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    // Clear retry timeout
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }

    // Clean up event listeners
    this.cleanupListeners();

    // Stop listening
    await this.stopListening();

    // Reset state
    this.navigationRef = null;
    this.isActive = false;
    this.retryCount = 0;
  }
}

// Export singleton instance
export default new WakeWordService();
