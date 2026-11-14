import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Native screen chrome follows measured insets, including rotation.
 * The desktop web preview also draws its own decorative phone island.
 */
export function useScreenInsets() {
  const insets = useSafeAreaInsets();
  const simulatedPhone = Platform.OS === 'web' && typeof window !== 'undefined' && window.innerWidth > 600;
  return simulatedPhone ? { ...insets, top: Math.max(insets.top, 54) } : insets;
}
