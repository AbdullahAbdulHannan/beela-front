import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import OnboardingTour from './OnboardingTour';

/**
 * Step shape:
 * {
 *   key?: string; // registry key registered via useOnboardingTarget(key)
 *   title?: string;
 *   text: string;
 *   radius?: number;
 *   padding?: number;
 *   navigateTo?: { route: string, params?: any }; // optional navigation before step
 * }
 */

const OnboardingCtx = createContext(null);

export function OnboardingProvider({ navigationRef, children }) {
  const registryRef = useRef(new Map()); // key -> ref
  const [visible, setVisible] = useState(false);
  const [steps, setSteps] = useState([]);
  const [index, setIndex] = useState(0);
  const [registryVersion, setRegistryVersion] = useState(0);

  const register = useCallback((key, ref) => {
    if (!key) return () => {};
    registryRef.current.set(key, ref);
    setRegistryVersion(v => v + 1);
    return () => {
      // unregister on unmount
      if (registryRef.current.get(key) === ref) {
        registryRef.current.delete(key);
        setRegistryVersion(v => v + 1);
      }
    };
  }, []);

  const getRefForKey = useCallback((key) => {
    return registryRef.current.get(key) || null;
  }, []);

  const currentStep = steps[index];

  // Start tour
  const start = useCallback(async (defs) => {
    if (!defs || defs.length === 0) return;
    setSteps(defs);
    setIndex(0);
    // If first step requires navigation, handle it then show
    const first = defs[0];
    if (first.navigateTo && navigationRef?.current) {
      navigationRef.current.navigate(first.navigateTo.route, first.navigateTo.params);
      // small delay to allow screen mount and registration
      setTimeout(() => setVisible(true), 120);
    } else {
      setVisible(true);
    }
  }, [navigationRef]);

  const stop = useCallback(() => {
    setVisible(false);
    setSteps([]);
    setIndex(0);
  }, []);

  const next = useCallback(() => {
    const isLast = index >= steps.length - 1;
    if (isLast) {
      stop();
      return;
    }
    const nextIndex = index + 1;
    const nxt = steps[nextIndex];
    // If next step needs navigation, navigate first, then advance index after a short delay
    if (nxt?.navigateTo && navigationRef?.current) {
      navigationRef.current.navigate(nxt.navigateTo.route, nxt.navigateTo.params);
      setTimeout(() => setIndex(nextIndex), 120);
    } else {
      setIndex(nextIndex);
    }
  }, [index, steps, stop, navigationRef]);

  const value = useMemo(() => ({
    start,
    stop,
    next,
    register,
    getRefForKey,
    visible,
    steps,
    index,
  }), [start, stop, next, register, getRefForKey, visible, steps, index]);

  // Convert current step to OnboardingTour-compatible step with actual ref
  const activeSteps = useMemo(() => {
    if (!visible || steps.length === 0) return [];
    return steps.map((s) => ({
      ref: s.key ? getRefForKey(s.key) : { current: null },
      title: s.title,
      text: s.text,
      radius: s.radius,
      padding: s.padding,
    }));
  }, [visible, steps, getRefForKey, registryVersion, index]);

  return (
    <OnboardingCtx.Provider value={value}>
      <View style={styles.container}>
        {children}
        <OnboardingTour
          visible={visible}
          steps={activeSteps}
          index={index}
          onNext={next}
          onClose={stop}
          onComplete={stop}
        />
      </View>
    </OnboardingCtx.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingCtx);
}

export function useOnboardingTarget(key) {
  const { register } = useOnboarding();
  const ref = useRef(null);
  useEffect(() => register?.(key, ref), [key, register]);
  return ref;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
