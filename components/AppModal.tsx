import React from 'react';
import { Modal as NativeModal, ModalProps, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/constants/ThemeContext';

type Props = ModalProps & { children?: React.ReactNode; edgeToEdge?: boolean };

/** Each native modal is a separate presentation surface, with its own safe area.
 * Camera previews and custom bottom sheets opt out and protect their controls.
 */
export function AppModal({ children, edgeToEdge = false, ...props }: Props) {
  const { colors } = useTheme();
  const firstChild = React.Children.toArray(children).find(React.isValidElement);
  const childStyle = firstChild?.props as { style?: StyleProp<ViewStyle> } | undefined;
  const background = props.transparent ? 'transparent' : StyleSheet.flatten(childStyle?.style)?.backgroundColor || colors.background;
  return <NativeModal {...props}>
    <SafeAreaProvider style={styles.fill}>
      {edgeToEdge ? children : <SafeAreaView style={[styles.fill, { backgroundColor: background }]} edges={['top', 'right', 'bottom', 'left']}>
        <View style={styles.fill}>{children}</View>
      </SafeAreaView>}
    </SafeAreaProvider>
  </NativeModal>;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
