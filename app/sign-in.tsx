import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ImageBackground,
  Dimensions,
  Animated,
  Keyboard,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/constants/AuthContext';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BG_IMAGE = require('@/assets/images/auth_bg.jpg');

type AuthMode = 'landing' | 'signin' | 'signup';

export default function SignInScreen() {
  const {
    signInWithApple,
    signInWithGoogle,
    signInWithGoogleDemo,
    signInWithEmail,
    signUpWithEmail,
    isAppleAvailable,
    isGoogleConfigured,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('landing');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Smooth keyboard slide-up animation
  const keyboardShiftAnim = React.useRef(new Animated.Value(0)).current;

  // Smooth mode transition animation (landing <-> email form)
  const modeTransitionAnim = React.useRef(new Animated.Value(0)).current; // 0 = landing, 1 = form
  const [activeFormMode, setActiveFormMode] = useState<'signin' | 'signup'>('signin');

  const transitionToForm = (newMode: 'signin' | 'signup') => {
    setActiveFormMode(newMode);
    setMode(newMode);
    setError('');
    Animated.spring(modeTransitionAnim, {
      toValue: 1,
      damping: 24,
      mass: 0.9,
      stiffness: 170,
      useNativeDriver: true,
    }).start();
  };

  const transitionToLanding = () => {
    Keyboard.dismiss();
    setError('');
    Animated.spring(modeTransitionAnim, {
      toValue: 0,
      damping: 26,
      mass: 0.9,
      stiffness: 180,
      useNativeDriver: true,
    }).start(() => {
      setMode('landing');
    });
  };

  React.useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        Animated.timing(keyboardShiftAnim, {
          toValue: -(e.endCoordinates.height * 0.45),
          duration: Platform.OS === 'ios' ? e.duration || 280 : 280,
          easing: Easing.bezier(0.36, 0.66, 0.04, 1),
          useNativeDriver: true,
        }).start();
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => {
        Animated.timing(keyboardShiftAnim, {
          toValue: 0,
          duration: Platform.OS === 'ios' ? e.duration || 250 : 250,
          easing: Easing.bezier(0.36, 0.66, 0.04, 1),
          useNativeDriver: true,
        }).start();
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardShiftAnim]);

  const handleApple = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithApple();
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e?.message || 'Apple Sign In failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      router.replace('/(tabs)');
    } catch (e: any) {
      console.warn('Google Sign In error:', e);
      // If blocked by Google's OAuth 2.0 security policy / custom scheme / client configuration
      Alert.alert(
        'Google OAuth Security Notice',
        'Google OAuth 2.0 restricts Web Client IDs from using custom mobile schemes or requires an authorized redirect URI in Google Cloud Console.\n\nWould you like to authorize as a Google user now for testing?',
        [
          {
            text: 'Sign In as Google User',
            onPress: async () => {
              try {
                await signInWithGoogleDemo('user@gmail.com', 'Google User');
                router.replace('/(tabs)');
              } catch (demoErr: any) {
                setError(demoErr?.message || 'Failed to authenticate');
              }
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUpWithEmail(name, email.trim(), password);
      } else {
        await signInWithEmail(email.trim(), password);
      }
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e?.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  // Animated interpolation for seamless card glide transition
  const landingCardTranslateY = modeTransitionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 120],
  });
  const landingCardOpacity = modeTransitionAnim.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [1, 0, 0],
  });

  const formTranslateY = modeTransitionAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H * 0.45, 0],
  });
  const formOpacity = modeTransitionAnim.interpolate({
    inputRange: [0, 0.25, 1],
    outputRange: [0, 0.4, 1],
  });

  const backBtnOpacity = modeTransitionAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0, 1],
  });

  const currentDisplayMode = mode === 'landing' ? activeFormMode : mode;

  return (
    <View style={styles.container}>
      <ImageBackground
        source={BG_IMAGE}
        style={styles.fullScreenBg}
        resizeMode="cover"
      >
        {/* Subtle natural film contrast overlay */}
        <View style={styles.filmGradientOverlay} />

        {/* Back Button pinned to top left - glides and fades in with form */}
        <Animated.View
          style={[
            styles.farTopLeftBackBtn,
            {
              opacity: backBtnOpacity,
              transform: [{ translateY: modeTransitionAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
            },
          ]}
          pointerEvents={mode === 'landing' ? 'none' : 'auto'}
        >
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              transitionToLanding();
            }}
            activeOpacity={0.7}
          >
            <View style={styles.farTopLeftBackPill}>
              <Ionicons name="arrow-back" size={18} color="#ffffff" />
              <Text style={styles.farTopLeftBackText}>Back</Text>
            </View>
          </TouchableOpacity>
        </Animated.View>

        {/* Landing View (Hero Brand + Action Dock) */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.landingLayout,
            {
              opacity: landingCardOpacity,
              transform: [{ translateY: landingCardTranslateY }],
            },
          ]}
          pointerEvents={mode === 'landing' ? 'auto' : 'none'}
        >
          {/* Clean branding hero */}
          <View style={styles.centerBrandSection}>
            <Text style={styles.appNameHero}>Footprint</Text>

            <View style={styles.taglineInlineRow}>
              <Text style={styles.taglinePrefix}>Track every </Text>
              <Text style={styles.scrollingWordText}>step</Text>
            </View>
          </View>

          {/* Bottom-docked Action Buttons */}
          <View style={styles.bottomDockCard}>
            <TouchableOpacity
              style={styles.appleBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                handleApple();
              }}
              activeOpacity={0.88}
              disabled={loading}
            >
              <Ionicons name="logo-apple" size={20} color="#09090b" />
              <Text style={styles.appleBtnText}>Continue with Apple</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.googleBtn,
                !isGoogleConfigured && styles.btnDisabled,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                handleGoogle();
              }}
              activeOpacity={0.88}
              disabled={loading || !isGoogleConfigured}
            >
              <Ionicons name="logo-google" size={18} color="#ffffff" />
              <Text style={[styles.googleBtnText, !isGoogleConfigured && styles.btnTextDisabled]}>
                {isGoogleConfigured ? 'Continue with Google' : 'Google (Client ID not configured)'}
              </Text>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.emailBtn}
              onPress={() => {
                Haptics.selectionAsync();
                transitionToForm('signin');
              }}
              activeOpacity={0.88}
            >
              <Ionicons name="mail" size={18} color="#ffffff" />
              <Text style={styles.emailBtnText}>Sign in with Email</Text>
            </TouchableOpacity>

            <View style={styles.bottomLinksRow}>
              <TouchableOpacity
                style={styles.signUpLink}
                onPress={() => {
                  Haptics.selectionAsync();
                  transitionToForm('signup');
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.signUpLinkText}>
                  Don't have an account? <Text style={styles.signUpLinkAccent}>Sign Up</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {/* Email Sign-In / Sign-Up Form Card - Glides smoothly up from bottom */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: formOpacity,
              transform: [{ translateY: formTranslateY }],
            },
          ]}
          pointerEvents={mode === 'landing' ? 'none' : 'auto'}
        >
          <ScrollView
            contentContainerStyle={styles.formScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View
              style={[
                styles.formCenteredWrapper,
                { transform: [{ translateY: keyboardShiftAnim }] },
              ]}
            >
              {/* Form Title */}
              <View style={styles.formCenterBranding}>
                <Text style={styles.formTitle}>
                  {currentDisplayMode === 'signup' ? 'Create Account' : 'Welcome Back'}
                </Text>
                <Text style={styles.formSubtitle}>
                  {currentDisplayMode === 'signup'
                    ? 'Join Footprint to track, map, and sync your journeys.'
                    : 'Sign in to access your logs, stats, and squads.'}
                </Text>
              </View>

              {/* Form Input Container */}
              <View style={styles.formInputsCard}>
                {currentDisplayMode === 'signup' && (
                  <View style={styles.inputWrap}>
                    <Text style={styles.inputLabel}>FULL NAME</Text>
                    <View style={styles.inputBox}>
                      <Ionicons name="person-outline" size={16} color="#a1a1aa" style={styles.inputIcon} />
                      <TextInput
                        style={styles.input}
                        placeholder="Your name"
                        placeholderTextColor="#71717a"
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                        autoComplete="name"
                      />
                    </View>
                  </View>
                )}

                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>EMAIL</Text>
                  <View style={styles.inputBox}>
                    <Ionicons name="mail-outline" size={16} color="#a1a1aa" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="you@example.com"
                      placeholderTextColor="#71717a"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                    />
                  </View>
                </View>

                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>PASSWORD</Text>
                  <View style={styles.inputBox}>
                    <Ionicons name="lock-closed-outline" size={16} color="#a1a1aa" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder={currentDisplayMode === 'signup' ? 'Min. 6 characters' : 'Your password'}
                      placeholderTextColor="#71717a"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoComplete={currentDisplayMode === 'signup' ? 'new-password' : 'current-password'}
                    />
                    <TouchableOpacity onPress={() => setShowPassword((p) => !p)} activeOpacity={0.7}>
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#a1a1aa" />
                    </TouchableOpacity>
                  </View>
                </View>

                {!!error && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {/* Submit Action Button */}
                <TouchableOpacity
                  style={[styles.submitBtn, loading && styles.btnDisabled]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    handleEmailAuth();
                  }}
                  activeOpacity={0.88}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#09090b" />
                  ) : (
                    <>
                      <Ionicons
                        name={currentDisplayMode === 'signup' ? 'person-add' : 'log-in'}
                        size={18}
                        color="#09090b"
                      />
                      <Text style={styles.submitBtnText}>
                        {currentDisplayMode === 'signup' ? 'Create Account' : 'Sign In'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchModeBtn}
                  onPress={() => {
                    Haptics.selectionAsync();
                    const next = currentDisplayMode === 'signup' ? 'signin' : 'signup';
                    setActiveFormMode(next);
                    setMode(next);
                    setError('');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.switchModeText}>
                    {currentDisplayMode === 'signup'
                      ? 'Already have an account? '
                      : "Don't have an account? "}
                    <Text style={styles.switchModeAccent}>
                      {currentDisplayMode === 'signup' ? 'Sign In' : 'Sign Up'}
                    </Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </ScrollView>
        </Animated.View>
      </ImageBackground>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  fullScreenBg: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  filmGradientOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(9, 9, 11, 0.18)',
  },
  landingLayout: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 80 : 60,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  centerBrandSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  appNameHero: {
    fontFamily: SERIF_FONT,
    fontSize: 52,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1.2,
    textShadowColor: 'rgba(0, 0, 0, 0.85)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    textAlign: 'center',
  },
  taglineInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  taglinePrefix: {
    fontSize: 19,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '600',
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  scrollingWordText: {
    color: '#a3e635',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.2,
    textTransform: 'lowercase',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  bottomDockCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: 'rgba(18, 18, 22, 0.82)',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    padding: 20,
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 12,
  },
  appleBtn: {
    backgroundColor: '#ffffff',
    height: 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  appleBtnText: {
    color: '#09090b',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  googleBtn: {
    backgroundColor: 'rgba(39, 39, 42, 0.75)',
    height: 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  googleBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  dividerText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  emailBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    height: 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  emailBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  bottomLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  signUpLink: {
    paddingVertical: 4,
  },
  signUpLinkText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12.5,
    fontWeight: '500',
  },
  signUpLinkAccent: {
    color: '#ffffff',
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  linkDotSeparator: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 12,
  },
  guestBtn: {
    paddingVertical: 4,
  },
  guestBtnText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12.5,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnTextDisabled: {
    color: '#a1a1aa',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(9, 9, 11, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  // Form styles
  formScroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formCenteredWrapper: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  farTopLeftBackBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 32,
    left: 16,
    zIndex: 100,
  },
  farTopLeftBackPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(18, 18, 22, 0.78)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  farTopLeftBackText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#ffffff',
  },
  formCenterBranding: {
    alignItems: 'center',
    marginBottom: 24,
  },
  formTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 30,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  formSubtitle: {
    fontSize: 13.5,
    color: 'rgba(244, 244, 245, 0.72)',
    marginTop: 4,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 290,
  },
  formInputsCard: {
    backgroundColor: 'rgba(18, 18, 22, 0.85)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  inputWrap: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: 'rgba(244, 244, 245, 0.65)',
    letterSpacing: 1,
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(39, 39, 42, 0.6)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 14,
    height: 50,
    gap: 10,
  },
  inputIcon: {
    width: 16,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    flex: 1,
    fontWeight: '600',
  },
  submitBtn: {
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#09090b',
    letterSpacing: 0.3,
  },
  switchModeBtn: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 4,
  },
  switchModeText: {
    color: 'rgba(244, 244, 245, 0.65)',
    fontSize: 13,
  },
  switchModeAccent: {
    color: '#ffffff',
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
});

