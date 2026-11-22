import { EngagementNotifications } from '@/components/EngagementNotifications';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/constants/AuthContext';
import { ThemeProvider } from '@/constants/ThemeContext';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  // Wrap with interactive iPhone frame when viewed on desktop web browsers (screens wider than 600px)
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.innerWidth > 600) {
    return (
      <View style={webStyles.outerCanvas}>
        <View style={webStyles.phoneBezel}>
          {/* Dynamic Island Pill */}
          <View style={webStyles.islandNotch}>
            <View style={webStyles.cameraDot} />
          </View>
          <View style={webStyles.screenViewport}>
            <SafeAreaProvider>
              <AuthProvider>
                <ThemeProvider>
                  <RootLayoutNav />
                </ThemeProvider>
              </AuthProvider>
            </SafeAreaProvider>
          </View>
          {/* Home indicator bar at bottom */}
          <View style={webStyles.homeIndicatorWrap}>
            <View style={webStyles.homeIndicatorBar} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>
        <ThemeProvider>
          <RootLayoutNav />
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const webStyles = StyleSheet.create({
  outerCanvas: {
    flex: 1,
    minHeight: '100vh' as any,
    backgroundColor: '#0c0d12',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  phoneBezel: {
    width: 400,
    height: 844,
    maxHeight: '94vh' as any,
    backgroundColor: '#000000',
    borderRadius: 50,
    padding: 12,
    borderWidth: 4,
    borderColor: '#27272a',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 36,
    position: 'relative',
    overflow: 'hidden',
  },
  islandNotch: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    width: 120,
    height: 32,
    backgroundColor: '#000000',
    borderRadius: 20,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 14,
  },
  cameraDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#111827',
  },
  screenViewport: {
    flex: 1,
    borderRadius: 40,
    overflow: 'hidden',
    backgroundColor: '#09090b',
  },
  homeIndicatorWrap: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    pointerEvents: 'none' as any,
  },
  homeIndicatorBar: {
    width: 135,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});

function RootLayoutNav() {
  return (
    <><EngagementNotifications /><Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="sign-in"
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'fade',
        }}
      />
      <Stack.Screen
        name="onboarding"
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
    </Stack></>
  );
}
