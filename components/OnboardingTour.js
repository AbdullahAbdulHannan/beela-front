import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable, Animated, findNodeHandle, UIManager } from 'react-native';
import Svg, { Rect, Mask } from 'react-native-svg';

/**
 * OnboardingTour with spotlight cutout
 */
export default function OnboardingTour({
  visible,
  steps = [],
  index = 0,
  onNext,
  onClose,
  onComplete,
  nextLabel = 'Next',
  skipLabel = 'Skip',
  backdropOpacity = 0.6,
  rootRef,
}) {
  const [target, setTarget] = useState({ x: 0, y: 0, width: 0, height: 0, radius: 12 });
  const [ready, setReady] = useState(false);
  const [layoutTick, setLayoutTick] = useState(0);

  const opacityAnim = useRef(new Animated.Value(0)).current;
  const xAnim = useRef(new Animated.Value(0)).current;
  const yAnim = useRef(new Animated.Value(0)).current;
  const wAnim = useRef(new Animated.Value(0)).current;
  const hAnim = useRef(new Animated.Value(0)).current;

  const screen = Dimensions.get('window');
  const step = steps[index];

  const measureWithRetry = (node, attempt = 0) =>
    new Promise((resolve) => {
      if (!node) return resolve(null);
      const doResolve = (res) => resolve(res);

      const measureRelative = () => {
        try {
          const rootNode = rootRef?.current;
          const rootHandle = rootNode ? findNodeHandle(rootNode) : null;
          const targetHandle = findNodeHandle(node);
          if (targetHandle && rootHandle && UIManager?.measureLayout) {
            UIManager.measureLayout(
              targetHandle,
              rootHandle,
              () => doResolve(null),
              (x, y, width, height) => doResolve({ x, y, width, height })
            );
            return;
          }
        } catch {}
        // Fallback: measure in window and translate to root
        if (node.measureInWindow) {
          node.measureInWindow(async (x, y, width, height) => {
            let rx = 0, ry = 0;
            try {
              const rnode = rootRef?.current;
              if (rnode && rnode.measureInWindow) {
                await new Promise((r) => rnode.measureInWindow((rx0, ry0) => { rx = rx0 || 0; ry = ry0 || 0; r(); }));
              }
            } catch {}
            doResolve({ x: x - rx, y: y - ry, width, height });
          });
          return;
        }
        doResolve(null);
      };

      measureRelative();
    }).then((result) => {
      const valid = result && result.width > 1 && result.height > 1;
      if (valid) return result;
      if (attempt < 8) {
        return new Promise((res) => setTimeout(res, 60)).then(() => measureWithRetry(node, attempt + 1));
      }
      return result;
    });

  // Measure target
  useEffect(() => {
    if (!visible || !step) return;
    let cancelled = false;

    const run = async () => {
      const node = step.ref?.current;
      const result = await measureWithRetry(node);
      if (cancelled) return;

      // If still invalid, retry later without showing tooltip to avoid mismatch
      if (!result || !(result.width > 1 && result.height > 1)) {
        const retryId = setTimeout(run, 120);
        return () => clearTimeout(retryId);
      }

      const padding = step?.padding ?? 8;
      const radius = step?.radius ?? 12;
      const x = Math.max(result.x - padding, 0);
      const y = Math.max(result.y - padding, 0);
      const width = Math.min(result.width + padding * 2, screen.width - x);
      const height = Math.min(result.height + padding * 2, screen.height - y);

      setTarget({ x, y, width, height, radius });
      setReady(true);

      Animated.parallel([
        Animated.timing(opacityAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(xAnim, { toValue: x, duration: 260, useNativeDriver: false }),
        Animated.timing(yAnim, { toValue: y, duration: 260, useNativeDriver: false }),
        Animated.timing(wAnim, { toValue: width, duration: 260, useNativeDriver: false }),
        Animated.timing(hAnim, { toValue: height, duration: 260, useNativeDriver: false }),
      ]).start();
    };

    const id = setTimeout(run, 100);
    return () => {
      clearTimeout(id);
      cancelled = true;
    };
  }, [visible, index, steps, layoutTick]);

  useEffect(() => {
    if (!visible) {
      opacityAnim.setValue(0);
      setReady(false);
    }
  }, [visible]);

  // Re-measure on orientation/size changes to keep spotlight aligned
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', () => setLayoutTick((t) => t + 1));
    return () => {
      // RN >= 0.65: sub.remove exists; older returns function
      try { sub?.remove?.(); } catch {}
    };
  }, []);

  const isLast = index === steps.length - 1;

  const handleSkip = () => {
    Animated.timing(opacityAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
      onClose && onClose();
    });
  };

  const handleNext = () => {
    if (isLast) {
      Animated.timing(opacityAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        onComplete && onComplete();
      });
    } else {
      setReady(false);
      // Delegate step advancement (and any navigation) to provider
      onNext && onNext();
    }
  };

  if (!visible || !step) return null;

  // Tooltip placement
  const tooltipMaxWidth = Math.min(320, screen.width - 24);
  const belowY = target.y + target.height + 12;
  const placeBelow = belowY + 140 < screen.height;
  const tipY = placeBelow ? belowY : Math.max((target.y || 0) - 12 - 140, 24);
  const tipX = Math.min(
    Math.max((target.x || 0) + (target.width || 0) / 2 - tooltipMaxWidth / 2, 12),
    screen.width - tooltipMaxWidth - 12
  );

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacityAnim, zIndex: 9999 }]} pointerEvents="box-none">
      {/* Spotlight backdrop */}
      {ready && (
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
          <Mask id="mask">
            {/* Show full screen */}
            <Rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Cutout area (use immediate numeric values to avoid one-step lag) */}
            <Rect
              x={target.x}
              y={target.y}
              width={target.width}
              height={target.height}
              rx={target.radius}
              fill="black"
            />
          </Mask>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`rgba(0,0,0,${backdropOpacity})`}
            mask="url(#mask)"
          />
        </Svg>
      )}

      {/* Tooltip */}
      {ready && (
        <View style={[styles.tooltip, { top: tipY, left: tipX, maxWidth: tooltipMaxWidth }]} pointerEvents="auto">
          {step?.title ? <Text style={styles.tooltipTitle}>{step.title}</Text> : null}
          <Text style={styles.tooltipText}>{step?.text}</Text>
          <View style={styles.row}>
            <Pressable onPress={handleSkip} style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}>
              <Text style={styles.btnGhostText}>{skipLabel}</Text>
            </Pressable>
            <View style={{ width: 8 }} />
            <Pressable onPress={handleNext} style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}>
              <Text style={styles.btnPrimaryText}>{isLast ? 'Done' : nextLabel}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  tooltipTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  tooltipText: {
    color: 'white',
    fontSize: 14,
    opacity: 0.9,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  btn: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  btnPrimary: {
    backgroundColor: '#2563EB',
  },
  btnPrimaryText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  btnGhost: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  btnGhostText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.8,
  },
});
