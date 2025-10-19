import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import wakeWordService from '../services/wakeWordService';

/**
 * Visual indicator showing wake word detection status
 * Can be added to any screen to show "Hey Bela" is listening
 */
const WakeWordIndicator = ({ position = 'top-right', compact = false }) => {
  const [isActive, setIsActive] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Check if wake word service is active
    const checkStatus = () => {
      setIsActive(wakeWordService.isListening);
    };

    // Check initially and set up interval
    checkStatus();
    const interval = setInterval(checkStatus, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isActive) {
      // Fade in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      // Fade out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isActive]);

  const getPositionStyle = () => {
    switch (position) {
      case 'top-right':
        return { top: 50, right: 16 };
      case 'top-left':
        return { top: 50, left: 16 };
      case 'bottom-right':
        return { bottom: 20, right: 16 };
      case 'bottom-left':
        return { bottom: 20, left: 16 };
      default:
        return { top: 50, right: 16 };
    }
  };

  if (!isActive) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        getPositionStyle(),
        { opacity: fadeAnim },
      ]}
    >
      <View style={styles.content}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <MaterialIcons name="mic" size={compact ? 16 : 20} color="#6200ee" />
        </Animated.View>
        {!compact && (
          <View style={styles.textContainer}>
            <Text style={styles.title}>Listening</Text>
            <Text style={styles.subtitle}>Say "Hey Bela"</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 1000,
    elevation: 5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(98, 0, 238, 0.2)',
  },
  textContainer: {
    marginLeft: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6200ee',
  },
  subtitle: {
    fontSize: 10,
    color: '#666',
  },
});

export default WakeWordIndicator;
