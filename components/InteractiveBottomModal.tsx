import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  StyleProp,
  ViewStyle,
  Dimensions,
  DimensionValue,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface InteractiveBottomModalProps {
  visible: boolean;
  onDismiss: () => void;
  onDismissComplete?: () => void;
  children: React.ReactNode;
  backdropStyle?: StyleProp<ViewStyle>;
  cardStyle?: StyleProp<ViewStyle>;
  handleColor?: string;
  maxHeight?: DimensionValue;
  disableInternalPadding?: boolean;
}

/**
 * Premium bottom sheet modal component:
 * 1. Fades backdrop smoothly in & out
 * 2. Slides up when opening and slides DOWN smoothly when closing (no sudden flashing/disappearing)
 * 3. Supports tapping the dark backdrop above the card to trigger slide-down dismissal
 * 4. Supports holding or dragging the handle bar downward interactively in real time to dismiss
 */
export const InteractiveBottomModal: React.FC<InteractiveBottomModalProps> = ({
  visible,
  onDismiss,
  onDismissComplete,
  children,
  backdropStyle,
  cardStyle,
  handleColor,
  maxHeight,
  disableInternalPadding = false,
}) => {
  const [modalVisible, setModalVisible] = React.useState(visible);

  // translateY for the sliding card: 0 is open, SCREEN_HEIGHT is fully off-screen
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  // backdropOpacity for gradual fade in of backdrop (prevents harsh lines)
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Track closing animation state
  const isClosingRef = useRef(false);

  const startCloseAnimation = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isClosingRef.current = false;
      setModalVisible(false);
      onDismiss();
      if (onDismissComplete) {
        onDismissComplete();
      }
    });
  };

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      isClosingRef.current = false;
      translateY.setValue(SCREEN_HEIGHT);
      backdropOpacity.setValue(0);

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (modalVisible && !isClosingRef.current) {
      startCloseAnimation();
    }
  }, [visible]);

  // PanResponder on the top drag handle to follow user's finger while holding/dragging
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 3;
      },
      onPanResponderGrant: () => {
        // User touched / held the handle
      },
      onPanResponderMove: (_, gestureState) => {
        // Drag downwards
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
          // Gently fade backdrop as card is dragged down
          const progress = Math.max(0, 1 - gestureState.dy / 300);
          backdropOpacity.setValue(progress);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // If dragged down by > 50px or downward flick with velocity, slide down & close
        if (gestureState.dy > 50 || gestureState.vy > 0.45) {
          startCloseAnimation();
        } else {
          // Snap back to open position
          Animated.parallel([
            Animated.spring(translateY, {
              toValue: 0,
              tension: 70,
              friction: 9,
              useNativeDriver: true,
            }),
            Animated.timing(backdropOpacity, {
              toValue: 1,
              duration: 150,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    })
  ).current;

  if (!modalVisible) return null;

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={startCloseAnimation}
    >
      <View style={styles.rootContainer} pointerEvents="box-none">
        {/* Animated fading backdrop (tap outside to slide down & close) */}
        <Animated.View
          style={[
            styles.backdrop,
            backdropStyle,
            { opacity: backdropOpacity },
          ]}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={startCloseAnimation}
          />
        </Animated.View>

        {/* Sliding Sheet Card */}
        <Animated.View
          style={[
            styles.sheetCard,
            cardStyle,
            (maxHeight !== undefined ? { maxHeight } : undefined) as any,
            disableInternalPadding && { paddingHorizontal: 0, paddingBottom: 0 },
            {
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Draggable handle bar area */}
          <View {...panResponder.panHandlers} style={styles.handleContainer}>
            <View style={[styles.handleBar, handleColor ? { backgroundColor: handleColor } : undefined]} />
          </View>

          {children}
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill as any,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  sheetCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 24,
  },
  handleContainer: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(150, 150, 150, 0.4)',
  },
});
