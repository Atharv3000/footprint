import React, { useRef } from 'react';
import {
  View,
  PanResponder,
  StyleSheet,
  StyleProp,
  ViewStyle,
  Animated,
} from 'react-native';

interface DraggableSheetHandleProps {
  onDismiss: () => void;
  color?: string;
  style?: StyleProp<ViewStyle>;
  handleStyle?: StyleProp<ViewStyle>;
  /** Optional Animated.Value to drive card translation in real-time as user holds and drags */
  translateY?: Animated.Value;
  /** Optional callback triggered when user initiates drag */
  onDragStart?: () => void;
  /** Optional callback triggered when drag ends and card resets without closing */
  onDragReset?: () => void;
}

/**
 * An interactive drag-to-dismiss handle bar component for bottom sheet modals.
 * Allows users to hold and drag the handle bar downward interactively to close the sheet.
 */
export const DraggableSheetHandle: React.FC<DraggableSheetHandleProps> = ({
  onDismiss,
  color = 'rgba(150, 150, 150, 0.4)',
  style,
  handleStyle,
  translateY,
  onDragStart,
  onDragReset,
}) => {
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 3;
      },
      onPanResponderGrant: () => {
        onDragStart?.();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          if (translateY) {
            translateY.setValue(gestureState.dy);
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        // If dragged downward by > 45px or flicked down with velocity, dismiss
        if (gestureState.dy > 45 || gestureState.vy > 0.45) {
          onDismiss();
        } else {
          if (translateY) {
            Animated.spring(translateY, {
              toValue: 0,
              tension: 65,
              friction: 9,
              useNativeDriver: true,
            }).start();
          }
          onDragReset?.();
        }
      },
    })
  ).current;

  return (
    <View {...panResponder.panHandlers} style={[styles.touchZone, style]}>
      <View style={[styles.handleBar, { backgroundColor: color }, handleStyle]} />
    </View>
  );
};

const styles = StyleSheet.create({
  touchZone: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleBar: {
    width: 44,
    height: 5,
    borderRadius: 3,
  },
});
