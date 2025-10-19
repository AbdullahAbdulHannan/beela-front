import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, StatusBar, Image, Text, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import { Buffer } from "buffer";
import { useOnboarding } from "./components/OnboardingProvider";
import { Asset } from "expo-asset";

const ELEVENLABS_API_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY || "sk_9445fc2abf247b5ce06e575ec327225ea0cf46a42017ba88";
const ELEVENLABS_VOICE_ID =
  process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

// Generate or load cached TTS
async function getWelcomeTTS(firstName) {
  try {
    const cacheFile = FileSystem.cacheDirectory + `welcome_${firstName}.mp3`;

    // If cached file exists → reuse it
    const fileInfo = await FileSystem.getInfoAsync(cacheFile);
    if (fileInfo.exists) return cacheFile;

    // Otherwise → fetch new audio
    const text = `Hey ${firstName}, welcome to Beela AI!`;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?optimize_streaming_latency=0`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.5, similarity_boost: 0.5 },
      }),
    });

    if (!res.ok) return null;

    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    await FileSystem.writeAsStringAsync(cacheFile, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return cacheFile;
  } catch (err) {
    console.log("TTS error:", err);
    return null;
  }
}

export default function FirstTimeLanding() {
  const navigation = useNavigation();
  const onboarding = useOnboarding();
  const soundRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showRobot, setShowRobot] = useState(false); // after voice ends
  const [tourCompleted, setTourCompleted] = useState(false);
  const [onboardingKey, setOnboardingKey] = useState("onboardingCompleted");

  // Refs
  const ctaRef = useRef(null); // Next button

  // Load onboarding completion state per user
  useEffect(() => {
    (async () => {
      try {
        const rawUser = await AsyncStorage.getItem("user");
        const user = rawUser ? JSON.parse(rawUser) : null;
        const userKeyPart = user?.id || user?.email || user?.name || "guest";
        const key = `onboardingCompleted:${String(userKeyPart)}`;
        setOnboardingKey(key);
        const done = await AsyncStorage.getItem(key);
        setTourCompleted(done === "true");
      } catch (e) {
        const done = await AsyncStorage.getItem("onboardingCompleted");
        setTourCompleted(done === "true");
      }
    })();
  }, []);

  // Play welcome TTS, show loader until audio starts; no Speech fallback
  useEffect(() => {
    let mounted = true;

    const play = async () => {
      try {
        // Preload local GIFs to avoid any flicker/white gap
        try {
          await Promise.all([
            Asset.fromModule(require("./assets/beela-ai.gif")).downloadAsync(),
            Asset.fromModule(require("./assets/robot.gif")).downloadAsync(),
          ]);
        } catch {}

        const rawUser = await AsyncStorage.getItem("user");
        const user = rawUser ? JSON.parse(rawUser) : null;
        const fullName = user?.name || user?.fullname || "there";
        const firstName = String(fullName).trim().split(/\s+/)[0] || "there";
 
        const ttsUri = await getWelcomeTTS(firstName);
        if (mounted && ttsUri) {
          const { sound } = await Audio.Sound.createAsync(
            { uri: ttsUri },
            { shouldPlay: true, volume: 1.0 }
          );
          soundRef.current = sound;
          await sound.setRateAsync(0.85, true);

          sound.setOnPlaybackStatusUpdate((status) => {
            if (!status.isLoaded) return;
            if (status.isPlaying && status.positionMillis > 0) {
              if (!isSpeaking) setIsSpeaking(true);
              setIsLoading(false);
            } else {
              if (isSpeaking) setIsSpeaking(false);
            }
            if (status.didJustFinish) {
              setIsSpeaking(false);
              setShowRobot(true);
            }
          });

          // Start playback and immediately show speaking animation to avoid white gap
          await sound.playAsync();
          if (mounted) {
            setIsSpeaking(true);
            setIsLoading(false);
          }
        } else {
          // Fallback to OS TTS if ElevenLabs audio is unavailable
          const rawUser = await AsyncStorage.getItem("user");
          const user = rawUser ? JSON.parse(rawUser) : null;
          const fullName = user?.name || user?.fullname || "there";
          const firstName = String(fullName).trim().split(/\s+/)[0] || "there";
          const text = `Hey ${firstName}, welcome to Beela AI!`;

          // Pre-set speaking state to force GIF switch immediately
          setIsLoading(false);
          setShowRobot(false);
          setIsSpeaking(true);

          Speech.speak(text, {
            language: 'en-US',
            pitch: 1.0,
            rate: 0.9,
            onStart: () => {
              if (!mounted) return;
              // already set above; keep for platforms that rely on callback
              setIsSpeaking(true);
              setIsLoading(false);
            },
            onDone: () => {
              if (!mounted) return;
              setIsSpeaking(false);
              setShowRobot(true);
            },
            onStopped: () => {
              if (!mounted) return;
              setIsSpeaking(false);
              setShowRobot(true);
            }
          });
        }
      } catch (err) {
        console.log("Audio error:", err);
        // On error, fallback to OS TTS
        try {
          const rawUser = await AsyncStorage.getItem("user");
          const user = rawUser ? JSON.parse(rawUser) : null;
          const fullName = user?.name || user?.fullname || "there";
          const firstName = String(fullName).trim().split(/\s+/)[0] || "there";
          const text = `Hey ${firstName}, welcome to Beela AI!`;
          // Pre-set speaking state to force GIF switch immediately
          setIsLoading(false);
          setShowRobot(false);
          setIsSpeaking(true);

          Speech.speak(text, {
            language: 'en-US',
            pitch: 1.0,
            rate: 0.9,
            onStart: () => { setIsSpeaking(true); setIsLoading(false); },
            onDone: () => { setIsSpeaking(false); setShowRobot(true); },
            onStopped: () => { setIsSpeaking(false); setShowRobot(true); }
          });
        } catch {
          setIsLoading(false);
          setShowRobot(true);
        }
      }
    };

    Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    }).catch(() => {});

    play();

    return () => {
      mounted = false;
      try { Speech.stop(); } catch {}
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, [navigation]);

  const startCrossScreenTour = async () => {
    const steps = [
      // Dashboard highlights: Profile + Navbar only
      { navigateTo: { route: 'Dashboard' }, key: 'header-profile', title: 'Profile', text: 'Manage your profile and voice preferences from here.' },
      { key: 'fab-add', title: 'Quick Add', text: 'Use the plus button to quickly create a new reminder.', radius: 35, padding: 8 },
      { key: 'nav-planner', title: 'Planner', text: 'Organize your tasks by day and priority.' },
      { key: 'nav-calendar', title: 'Calendar', text: 'See your schedule at a glance.' },
      { key: 'nav-notifications', title: 'Notifications', text: 'Manage reminder and notification settings.' },

      // Create Reminder: highlight radios
      { navigateTo: { route: 'CreateReminder' }, key: 'cr-task', title: 'Task', text: 'Create a Task reminder you can schedule or let AI handle.' },
      { key: 'cr-meeting', title: 'Meeting', text: 'Set a Meeting with a start time and get notified beforehand.' },
      { key: 'cr-location', title: 'Location', text: 'Trigger reminders when you arrive near a saved place.' },

      // Calendar: sync button is the final step
      { navigateTo: { route: 'Calendar' }, key: 'cal-sync', title: 'Sync Calendar', text: 'Connect Google Calendar to import your events automatically.' },
    ];
    // Start the tour immediately
    onboarding?.start?.(steps);
    // Non-blocking persistence (if you still want to keep it)
    try { AsyncStorage.setItem(onboardingKey, "true"); } catch {}
    setTourCompleted(true);
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {isLoading && (
        <View style={styles.loaderContainer}>
          <Text style={styles.loaderText}>Getting things ready...</Text>
          <Image source={require('./assets/robot.gif')} style={styles.gif} resizeMode="contain"/>
        </View>
      )}

      {/* Single image element to prevent any flicker between states */}
      {!isLoading && (
        <Image
          key={isSpeaking ? 'speaking' : (showRobot ? 'robot' : 'idle')}
          source={
            isSpeaking
              ? require("./assets/beela-ai.gif")
              : showRobot
              ? require("./assets/robot.gif")
              : require("./assets/beela-ai.gif")
          }
          style={styles.gif}
          resizeMode="contain"
        />
      )}

      {!isSpeaking && !isLoading && (
        <View style={styles.ctaWrap}>
          <Pressable ref={ctaRef} onPress={startCrossScreenTour} style={({ pressed }) => [styles.nextBtn, pressed && { opacity: 0.85 }]}>
            <Text style={styles.nextBtnText}>Next</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFA",
    justifyContent: "center",
    alignItems: "center",
  },
  loaderContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    width: '100%',
  },
  loaderText: {
    marginTop: 30,
    fontSize: 25,
    color: "#555",
  },
  gif: {
    flex: 1,
    width: "100%",
    height: "100%",
    alignSelf: "center",
  },
  ctaWrap: {
    position: "absolute",
    bottom: 24,
    left: 24,
    right: 24,
    alignItems: "flex-end",
  },
  nextBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  nextBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
    letterSpacing: 0.2,
  },
});