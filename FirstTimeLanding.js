import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, StatusBar, Image, ActivityIndicator, Text, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";
import { Buffer } from "buffer";
import { useOnboarding } from "./components/OnboardingProvider";

const ELEVENLABS_API_KEY = "sk_1bce29baca77234dd24965c62c904c1d3047c50ec7d9a839";
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

  // Play welcome TTS, show loader until audio starts or fallback timeout
  useEffect(() => {
    let mounted = true;
    const fallbackTimer = setTimeout(() => {
      if (!mounted) return;
      setIsLoading(false);
      setShowRobot(true);
    }, 6000);

    const play = async () => {
      try {
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

          await sound.playAsync();
        } else {
          // Fallback to on-device TTS
          const text = `Hey ${firstName}, welcome to Beela AI!`;
          setIsLoading(false);
          setIsSpeaking(true);
          Speech.speak(text, {
            rate: 0.95,
            pitch: 1.0,
            onDone: () => {
              setIsSpeaking(false);
              setShowRobot(true);
            },
            onStopped: () => {
              setIsSpeaking(false);
              setShowRobot(true);
            },
            onError: () => {
              setIsSpeaking(false);
              setShowRobot(true);
            },
          });
        }
      } catch (err) {
        console.log("Audio error:", err);
        // As a last resort, still attempt on-device TTS once
        try {
          const rawUser = await AsyncStorage.getItem("user");
          const user = rawUser ? JSON.parse(rawUser) : null;
          const fullName = user?.name || user?.fullname || "there";
          const firstName = String(fullName).trim().split(/\s+/)[0] || "there";
          const text = `Hey ${firstName}, welcome to Beela AI!`;
          setIsLoading(false);
          setIsSpeaking(true);
          Speech.speak(text, {
            rate: 0.95,
            pitch: 1.0,
            onDone: () => {
              setIsSpeaking(false);
              setShowRobot(true);
            },
            onStopped: () => {
              setIsSpeaking(false);
              setShowRobot(true);
            },
            onError: () => {
              setIsSpeaking(false);
              setShowRobot(true);
            },
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
      clearTimeout(fallbackTimer);
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, [navigation]);

  const startCrossScreenTour = async () => {
    try { await AsyncStorage.setItem(onboardingKey, "true"); } catch {}
    setTourCompleted(true);
    const steps = [
      { navigateTo: { route: 'Dashboard' }, key: 'feature-create', title: 'Create Reminders', text: 'Quickly add tasks and reminders from here.', radius: 16, padding: 10 },
      { key: 'feature-sync', title: 'Google Calendar', text: 'Connect your calendar to sync events automatically.' },
      { key: 'feature-meetings', title: 'Meetings & Events', text: 'See upcoming meetings and plan with AI assistance.' },
      { key: 'fab-add', title: 'Add New', text: 'Tap the plus button anytime to create a new reminder.', radius: 35, padding: 8 },
      { key: 'nav-planner', title: 'Planner', text: 'Access your planner to organize tasks by day and priority.' },
      { key: 'nav-calendar', title: 'Calendar', text: 'View your schedule at a glance in the calendar.' },
      { key: 'nav-notifications', title: 'Notifications', text: 'Manage reminders and notification settings here.' },
      { key: 'header-profile', title: 'Profile', text: 'Manage your profile and voice preferences from here.' },
    ];
    onboarding?.start?.(steps);
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {isLoading && (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loaderText}>Getting things ready...</Text>
        </View>
      )}

      {isSpeaking && (
        <Image
          source={require("./assets/beela-ai.gif")}
          style={styles.gif}
          resizeMode="contain"
        />
      )}

      {showRobot && !isSpeaking && (
        <Image
          source={require("./assets/robot.gif")}
          style={styles.gif}
          resizeMode="contain"
        />
      )}

      {!tourCompleted && !isLoading && (
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
    alignItems: "center",
    justifyContent: "center",
  },
  loaderText: {
    marginTop: 10,
    fontSize: 16,
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