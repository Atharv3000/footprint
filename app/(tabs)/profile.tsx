import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  Image,
  Modal,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/constants/AuthContext';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import {
  UnitSystem,
  GenderOption,
  kgToLbs,
  lbsToKg,
  cmToInches,
  inchesToCm,
  calculateScientificCaloriesBurned,
} from '@/constants/userProfile';
import { ensureMockDataSeeded } from '@/constants/stepsStorage';
import { StepsCharts } from '@/components/StepsCharts';
import { FlipNumberPicker } from '@/components/FlipNumberPicker';
import { getOrCreateMyUsername, setMyUsername } from '@/constants/socialEngine';
import {
  getUserBadgeStats,
  computeBadges,
  BadgeDefinition,
  TIER_METALLIC,
} from '@/constants/badgesEngine';
import { CircularProgressRing } from '@/components/CircularProgressRing';
import { InteractiveBadge, SpinnableCoinHero } from '@/components/InteractiveBadge';
import { DraggableSheetHandle } from '@/components/DraggableSheetHandle';
import { InteractiveBottomModal } from '@/components/InteractiveBottomModal';
import { WalkHistorySection } from '@/components/WalkHistorySection';
import { ActivityStreakCalendar } from '@/components/ActivityStreakCalendar';
import { recordWeightLog } from '@/constants/workoutStorage';
import { AppleHealthSyncModal } from '@/components/AppleHealthSyncModal';

import { InsightsSection } from '@/components/InsightsSection';
import { ProfileActivitySection } from '@/components/ProfileActivitySection';

export default function ProfileScreen() {
  const { user, profile, signOut, updateProfile, isAppleAvailable, isGoogleConfigured } = useAuth();
  const { colors, theme, setTheme, isDark } = useTheme();

  const [unitSystem, setUnitSystem] = useState<UnitSystem>(profile.unitSystem);
  const [weightVal, setWeightVal] = useState<number>(154);
  const [heightVal, setHeightVal] = useState<number>(69); // for metric cm or US inches
  const [heightFeet, setHeightFeet] = useState<number>(5);
  const [heightInches, setHeightInches] = useState<number>(9);
  const [ageVal, setAgeVal] = useState<number>(28);
  const [gender, setGender] = useState<GenderOption>(profile.gender);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  // Edit Profile Popup Modal
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showAppleHealthModal, setShowAppleHealthModal] = useState<boolean>(false);
  const [, setProfileRefreshKey] = useState<number>(0);
  // Options 3-dots dropdown menu (with Sign Out + Set Steps Goal)
  const [showOptionsMenu, setShowOptionsMenu] = useState<boolean>(false);
  // Steps & Distance Goal Modal
  const [showGoalModal, setShowGoalModal] = useState<boolean>(false);
  const [goalType, setGoalType] = useState<'steps' | 'distance'>('steps');
  const [goalInput, setGoalInput] = useState<string>(String(profile.stepsGoal ?? 8000));
  const [distanceGoalInput, setDistanceGoalInput] = useState<string>(String(profile.distanceGoalKm ?? 5));
  const [stepsGoal, setStepsGoal] = useState<number>(profile.stepsGoal ?? 8000);
  const [distanceGoalKm, setDistanceGoalKm] = useState<number>(profile.distanceGoalKm ?? 5);
  const [goalSaving, setGoalSaving] = useState<boolean>(false);

  // Selected date from calendar to filter or focus charts
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | undefined>(undefined);

  // Username & Name in settings / modal
  const [username, setUsername] = useState<string>('');
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [nameInput, setNameInput] = useState<string>('');
  const [usernameLoading, setUsernameLoading] = useState<boolean>(false);

  // Active Profile Sub-tab: 'activity' | 'insights' | 'badges' with animated indicator
  const [activeSubTab, setActiveSubTab] = useState<'activity' | 'insights' | 'badges'>('activity');
  const tabAnim = useRef(new Animated.Value(0)).current; // 0 = activity, 1 = insights, 2 = badges
  const [badges, setBadges] = useState<BadgeDefinition[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<BadgeDefinition | null>(null);

  const switchTab = (tab: 'activity' | 'insights' | 'badges') => {
    if (tab === activeSubTab) return;
    Haptics.selectionAsync().catch(() => {});
    setActiveSubTab(tab);
    const targetVal = tab === 'activity' ? 0 : tab === 'insights' ? 1 : 2;
    Animated.timing(tabAnim, {
      toValue: targetVal,
      duration: 220,
      useNativeDriver: false,
    }).start();
  };

  const effectiveUserId = user?.id || 'guest_user';

  useEffect(() => {
    setNameInput(user?.name || 'Walker');
    getOrCreateMyUsername(effectiveUserId, user?.name || 'Walker')
      .then((u) => {
        setUsername(u);
        setUsernameInput(u);
      })
      .catch(() => {});
    // Seed demo step data for charts
    ensureMockDataSeeded(effectiveUserId, profile.stepsGoal ?? 8000).catch(() => {});
    // Compute user badges
    getUserBadgeStats(effectiveUserId)
      .then((stats) => {
        const computed = computeBadges(stats);
        setBadges(computed);
      })
      .catch(() => {});
  }, [user?.id, effectiveUserId]);

  // Re-compute badges and fresh data whenever Profile tab is focused
  useFocusEffect(
    useCallback(() => {
      getUserBadgeStats(effectiveUserId)
        .then((stats) => {
          const computed = computeBadges(stats);
          setBadges(computed);
        })
        .catch(() => {});
    }, [effectiveUserId])
  );

  // Sync stepsGoal and distanceGoalKm when profile changes (e.g. after save)
  useEffect(() => {
    setStepsGoal(profile.stepsGoal ?? 8000);
    setGoalInput(String(profile.stepsGoal ?? 8000));
    setDistanceGoalKm(profile.distanceGoalKm ?? 5);
    setDistanceGoalInput(String(profile.distanceGoalKm ?? 5));
  }, [profile.stepsGoal, profile.distanceGoalKm]);

  const handleSaveAllProfileSettings = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // If username changed, update it
    if (user?.id && usernameInput.trim() && usernameInput.trim().toLowerCase() !== username.toLowerCase()) {
      setUsernameLoading(true);
      try {
        const newU = await setMyUsername(user.id, usernameInput);
        setUsername(newU);
      } catch (e: any) {
        Alert.alert('Username Error', e.message || 'Could not update username');
        setUsernameLoading(false);
        return;
      }
      setUsernameLoading(false);
    }

    let canonicalKg = weightVal;
    let canonicalCm = heightVal;
    let feetToSave = heightFeet;
    let inchesToSave = heightInches;
    if (unitSystem === 'us_customary') {
      canonicalKg = lbsToKg(weightVal);
      const totalInches = heightFeet * 12 + heightInches;
      canonicalCm = inchesToCm(totalInches);
    } else {
      const totalInches = Math.round(cmToInches(heightVal));
      feetToSave = Math.floor(totalInches / 12);
      inchesToSave = totalInches % 12;
    }
    await updateProfile({
      name: nameInput.trim() || user?.name || 'Walker',
      weightKg: canonicalKg,
      heightCm: canonicalCm,
      heightFeet: feetToSave,
      heightInches: inchesToSave,
      age: ageVal,
      gender,
      unitSystem,
      hasCompletedSetup: true,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
    setShowEditModal(false);
  };

  // Sync inputs when profile loads — only run on mount (or when unit system changes externally)
  const profileInitialized = React.useRef(false);
  useEffect(() => {
    // Skip re-sync after our own save (profile will update but we don't want to reset UI)
    if (profileInitialized.current) return;
    profileInitialized.current = true;
    setUnitSystem(profile.unitSystem);
    setGender(profile.gender);
    setAgeVal(profile.age || 28);
    if (profile.unitSystem === 'us_customary') {
      const lbs = Math.round(kgToLbs(profile.weightKg));
      setWeightVal(lbs || 154);
      if (profile.heightFeet !== undefined && profile.heightInches !== undefined) {
        setHeightFeet(profile.heightFeet);
        setHeightInches(profile.heightInches);
        setHeightVal(profile.heightFeet * 12 + profile.heightInches);
      } else {
        const totalInches = Math.round(cmToInches(profile.heightCm));
        const ft = Math.floor(totalInches / 12);
        const inc = totalInches % 12;
        setHeightFeet(ft || 5);
        setHeightInches(inc ?? 9);
        setHeightVal(totalInches || 69);
      }
    } else {
      setWeightVal(Math.round(profile.weightKg) || 70);
      setHeightVal(Math.round(profile.heightCm) || 175);
    }
  }, [profile.unitSystem]);

  const handleToggleUnits = (newSystem: UnitSystem) => {
    if (newSystem === unitSystem) return;
    Haptics.selectionAsync().catch(() => {});
    if (newSystem === 'us_customary') {
      const lbs = Math.round(kgToLbs(weightVal));
      setWeightVal(lbs);
      const totalInches = Math.round(cmToInches(heightVal));
      const ft = Math.floor(totalInches / 12);
      const inc = totalInches % 12;
      setHeightFeet(ft);
      setHeightInches(inc);
      setHeightVal(totalInches);
    } else {
      const kg = Math.round(lbsToKg(weightVal));
      setWeightVal(kg);
      const totalInches = heightFeet * 12 + heightInches;
      const cm = Math.round(inchesToCm(totalInches));
      setHeightVal(cm);
    }
    setUnitSystem(newSystem);
  };

  const handleSaveMeasurements = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    let canonicalKg = weightVal;
    let canonicalCm = heightVal;
    let feetToSave = heightFeet;
    let inchesToSave = heightInches;
    if (unitSystem === 'us_customary') {
      canonicalKg = lbsToKg(weightVal);
      const totalInches = heightFeet * 12 + heightInches;
      canonicalCm = inchesToCm(totalInches);
    } else {
      const totalInches = Math.round(cmToInches(heightVal));
      feetToSave = Math.floor(totalInches / 12);
      inchesToSave = totalInches % 12;
    }
    await updateProfile({
      weightKg: canonicalKg,
      heightCm: canonicalCm,
      heightFeet: feetToSave,
      heightInches: inchesToSave,
      age: ageVal,
      gender,
      unitSystem,
      hasCompletedSetup: true,
    });
    if (user?.id) {
      await recordWeightLog(user.id, canonicalKg);
    }
    setSavedSuccess(true);

    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/sign-in');
        },
      },
    ]);
  };

  const handleSaveGoal = async () => {
    setGoalSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (goalType === 'steps') {
      const parsed = parseInt(goalInput.replace(/\D/g, '')) || stepsGoal;
      const clamped = Math.max(1000, Math.min(50000, parsed));
      await updateProfile({ stepsGoal: clamped });
      setStepsGoal(clamped);
      setGoalInput(String(clamped));
    } else {
      // Distance goal in active unit converted to canonical km if needed
      const rawVal = parseFloat(distanceGoalInput.replace(/[^0-9.]/g, '')) || distanceGoalKm;
      const isUS = unitSystem === 'us_customary';
      const canonicalKm = isUS ? +(rawVal / 0.621371).toFixed(1) : +rawVal.toFixed(1);
      const clampedKm = Math.max(0.5, Math.min(50, canonicalKm));
      await updateProfile({ distanceGoalKm: clampedKm });
      setDistanceGoalKm(clampedKm);
      setDistanceGoalInput(String(isUS ? +(clampedKm * 0.621371).toFixed(1) : clampedKm));
    }
    setGoalSaving(false);
    setShowGoalModal(false);
  };

  const pickAvatarFromCameraRoll = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert(
          'Photo Permission Needed',
          'Footprint needs access to your photos to set your profile picture.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedUri = result.assets[0].uri;
        await updateProfile({ avatarUrl: selectedUri });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (e) {
      console.warn('Failed to pick profile picture:', e);
      Alert.alert('Error', 'Could not open photo library.');
    }
  };

  const currentWeightKg =
    unitSystem === 'us_customary' ? lbsToKg(weightVal) : weightVal;
  const currentHeightCm =
    unitSystem === 'us_customary' ? inchesToCm(heightFeet * 12 + heightInches) : heightVal;
  const sampleBurn30Min = calculateScientificCaloriesBurned(
    currentWeightKg, currentHeightCm, ageVal, gender, 30, 2400
  );

  const providerIcon = user?.provider === 'apple' ? 'logo-apple' : user?.provider === 'google' ? 'logo-google' : 'mail';
  const providerLabel = user?.provider === 'apple' ? 'Apple ID' : user?.provider === 'google' ? 'Google' : 'Email';
  const [scrollEnabled, setScrollEnabled] = useState(true);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.scrollContent}
      scrollEnabled={scrollEnabled}
    >
      {/* ── Retro Profile Header ── */}
      <View style={styles.retroProfileHeader}>
        <View style={styles.retroProfileMainRow}>
          {/* Round Circular Avatar on Left - tap to upload photo from camera roll */}
          <TouchableOpacity
            style={[styles.retroProfileAvatar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            onPress={pickAvatarFromCameraRoll}
            activeOpacity={0.8}
          >
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Ionicons name={providerIcon as any} size={28} color={colors.text} />
            )}
            <View style={[styles.avatarCameraBadge, { backgroundColor: colors.primary, borderColor: colors.background }]}>
              <Ionicons name="camera" size={11} color={!isDark ? '#ffffff' : '#09090b'} />
            </View>
          </TouchableOpacity>

          <View style={[styles.retroProfileInfo, { marginLeft: 16 }]}>
            <Text style={[styles.retroProfileName, { color: colors.text }]}>
              {user?.name ? user.name.toLowerCase() : 'walker'}
            </Text>
            <Text style={[styles.retroProfileHandle, { color: colors.textMuted }]}>
              @{username || 'walker'}
            </Text>
          </View>
        </View>

        {/* Retro Metadata Rows with Clean Icons */}
        <View style={styles.retroMetaList}>
          <View style={styles.retroMetaRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} style={styles.retroMetaIcon} />
            <Text style={[styles.retroMetaText, { color: colors.text }]}>
              Account: <Text style={{ color: colors.textSecondary }}>{providerLabel} ({user?.email || 'authenticated'})</Text>
            </Text>
          </View>
          <View style={styles.retroMetaRow}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} style={styles.retroMetaIcon} />
            <Text style={[styles.retroMetaText, { color: colors.text }]}>
              Joined: <Text style={{ color: colors.textSecondary }}>{profile.joinedAt || 'September 2026'}</Text>
            </Text>
          </View>
          <View style={styles.retroMetaRow}>
            <Ionicons name="flame-outline" size={14} color={colors.textMuted} style={styles.retroMetaIcon} />
            <Text style={[styles.retroMetaText, { color: colors.text }]}>
              Est. Burn: <Text style={{ color: colors.textSecondary }}>~{sampleBurn30Min} kcal for 30 min</Text>
            </Text>
          </View>
        </View>

        {/* Retro Action Buttons: Edit Profile Bubble, Sun/Moon Pill, and 3-Dots Menu */}
        <View style={styles.retroActionButtonsRow}>
          {/* Edit Profile in a bubble with pencil icon */}
          <TouchableOpacity
            style={[
              styles.retroPillBtn,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setUsernameInput(username);
              setNameInput(user?.name || '');
              setShowEditModal(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.retroPillBtnText, { color: colors.text }]}>Edit Profile</Text>
          </TouchableOpacity>

          {/* Sun and Moon to switch between light and dark mode in another pill */}
          <TouchableOpacity
            style={[styles.retroThemePill, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              setTheme(theme === 'dark' ? 'light' : 'dark');
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.themePillSegment, theme === 'light' && [styles.themePillSegmentActive, { backgroundColor: colors.surfaceElevated }]]}>
              <Ionicons
                name="sunny"
                size={16}
                color={theme === 'light' ? '#f59e0b' : colors.textMuted}
              />
            </View>
            <View style={[styles.themePillSegment, theme === 'dark' && [styles.themePillSegmentActive, { backgroundColor: colors.surfaceElevated }]]}>
              <Ionicons
                name="moon"
                size={15}
                color={theme === 'dark' ? '#818cf8' : colors.textMuted}
              />
            </View>
          </TouchableOpacity>

          {/* 3-Dots Button with Dropdown Menu for Sign Out */}
          <View style={styles.dotsMenuWrapper}>
            <TouchableOpacity
              style={[
                styles.retroPillBtnIconOnly,
                { borderColor: colors.border, backgroundColor: colors.surface },
                showOptionsMenu && { backgroundColor: colors.surfaceElevated },
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setShowOptionsMenu(!showOptionsMenu);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />
            </TouchableOpacity>

            {/* Dropdown Menu */}
            {showOptionsMenu && (
              <View style={[styles.dotsDropdownCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={styles.dropdownMenuItem}
                  onPress={() => {
                    setShowOptionsMenu(false);
                    setGoalType('steps');
                    setTimeout(() => setShowGoalModal(true), 150);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="footsteps-outline" size={16} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={[styles.dropdownMenuItemText, { color: colors.text }]}>Set Steps Goal</Text>
                </TouchableOpacity>
                <View style={[styles.dropdownDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.dropdownMenuItem}
                  onPress={() => {
                    setShowOptionsMenu(false);
                    setGoalType('distance');
                    setTimeout(() => setShowGoalModal(true), 150);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="navigate-outline" size={16} color={colors.primary} style={{ marginRight: 8 }} />
                  <Text style={[styles.dropdownMenuItemText, { color: colors.text }]}>
                    Set Distance Goal ({unitSystem === 'us_customary' ? 'mi' : 'km'})
                  </Text>
                </TouchableOpacity>
                <View style={[styles.dropdownDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.dropdownMenuItem}
                  onPress={() => {
                    setShowOptionsMenu(false);
                    setTimeout(() => setShowAppleHealthModal(true), 150);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="heart-outline" size={16} color="#ef4444" style={{ marginRight: 8 }} />
                  <Text style={[styles.dropdownMenuItemText, { color: colors.text }]}>Apple Health Sync</Text>
                </TouchableOpacity>
                <View style={[styles.dropdownDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={styles.dropdownMenuItem}
                  onPress={() => {
                    setShowOptionsMenu(false);
                    handleSignOut();
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="log-out-outline" size={16} color="#ef4444" style={{ marginRight: 8 }} />
                  <Text style={styles.dropdownSignOutText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            )}

          </View>
        </View>
      </View>

      {/* ── EDIT PROFILE POPUP MODAL ── */}
      <InteractiveBottomModal
        visible={showEditModal}
        onDismiss={() => setShowEditModal(false)}
        handleColor={colors.border}
        cardStyle={[styles.editModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Profile</Text>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 28, gap: 16 }}
            >
              {/* Username Entry */}
              <View style={[styles.modalFieldCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <Text style={[styles.modalFieldLabel, { color: colors.textMuted }]}>USERNAME</Text>
                <View style={[styles.usernameModalInputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Text style={[styles.atSymbol, { color: colors.primary }]}>@</Text>
                  <TextInput
                    style={[styles.usernameTextInput, { color: colors.text }]}
                    value={usernameInput}
                    onChangeText={(t) => setUsernameInput(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="username"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>

              {/* Name Entry */}
              <View style={[styles.modalFieldCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <Text style={[styles.modalFieldLabel, { color: colors.textMuted }]}>NAME</Text>
                <View style={[styles.usernameModalInputRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <TextInput
                    style={[styles.usernameTextInput, { color: colors.text }]}
                    value={nameInput}
                    onChangeText={setNameInput}
                    autoCapitalize="words"
                    autoCorrect={false}
                    placeholder="Your Name"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              </View>


              {/* Unit System Toggle: US Customary vs Metric */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>UNIT SYSTEM</Text>
                <View style={[styles.unitsToggleBar, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <TouchableOpacity
                    style={[
                      styles.unitsToggleBtn,
                      unitSystem === 'us_customary' && [styles.unitsToggleBtnActive, { backgroundColor: colors.surface, borderColor: colors.border }],
                    ]}
                    onPress={() => handleToggleUnits('us_customary')}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.unitsToggleText,
                        { color: colors.textMuted },
                        unitSystem === 'us_customary' && { color: colors.text, fontWeight: '800' },
                      ]}
                    >
                      US Customary (lbs, ft/in)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.unitsToggleBtn,
                      unitSystem === 'metric' && [styles.unitsToggleBtnActive, { backgroundColor: colors.surface, borderColor: colors.border }],
                    ]}
                    onPress={() => handleToggleUnits('metric')}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.unitsToggleText,
                        { color: colors.textMuted },
                        unitSystem === 'metric' && { color: colors.text, fontWeight: '800' },
                      ]}
                    >
                      Metric (kg, cm)
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Measurements Row: Weight & Height Pickers */}
              <View style={styles.measurementsRow}>
                {/* Weight Column */}
                <View style={styles.measurementCol}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>WEIGHT</Text>
                  <View style={[styles.pickerWrapCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                    <FlipNumberPicker
                      min={unitSystem === 'us_customary' ? 66 : 30}
                      max={unitSystem === 'us_customary' ? 440 : 200}
                      value={weightVal}
                      onChange={setWeightVal}
                      unit={unitSystem === 'us_customary' ? 'lbs' : 'kg'}
                    />
                  </View>
                </View>

                {/* Height Column */}
                <View style={styles.measurementCol}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>HEIGHT</Text>
                  <View style={[styles.pickerWrapCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                    {unitSystem === 'us_customary' ? (
                      <View style={styles.usHeightContainer}>
                        <View style={styles.usHeightPicker}>
                          <FlipNumberPicker
                            min={3}
                            max={7}
                            value={heightFeet}
                            onChange={setHeightFeet}
                            unit="ft"
                          />
                        </View>
                        <View style={styles.usHeightPicker}>
                          <FlipNumberPicker
                            min={0}
                            max={11}
                            value={heightInches}
                            onChange={setHeightInches}
                            unit="in"
                          />
                        </View>
                      </View>
                    ) : (
                      <FlipNumberPicker
                        min={100}
                        max={230}
                        value={heightVal}
                        onChange={setHeightVal}
                        unit="cm"
                      />
                    )}
                  </View>
                </View>
              </View>

              {/* Age and Gender Inputs */}
              <View style={styles.measurementsRow}>
                <View style={styles.measurementCol}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>AGE</Text>
                  <View style={[styles.pickerWrapCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                    <FlipNumberPicker min={10} max={100} value={ageVal} onChange={setAgeVal} unit="yrs" />
                  </View>
                </View>
                <View style={styles.measurementCol}>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>SEX</Text>
                  <View style={[styles.pickerWrapCard, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, justifyContent: 'center', padding: 8 }]}>
                    <View style={styles.genderOptionsCol}>
                      {(['female', 'male', 'other'] as GenderOption[]).map((g) => (
                        <TouchableOpacity
                          key={g}
                          style={[
                            styles.genderOptionBtn,
                            gender === g && [styles.genderOptionBtnActive, { backgroundColor: colors.surface, borderColor: colors.border }],
                          ]}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setGender(g);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.genderOptionText, { color: colors.textMuted }, gender === g && { color: colors.primary, fontWeight: '900' }]}>
                            {g === 'female' ? '♀ Female' : g === 'male' ? '♂ Male' : '-'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              </View>

              {/* Apple Health Integration Quick Access in Edit Profile */}
              <TouchableOpacity
                style={[
                  styles.modalFieldCard,
                  {
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.05)',
                    borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setShowEditModal(false);
                  setTimeout(() => setShowAppleHealthModal(true), 200);
                }}
                activeOpacity={0.75}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: 'rgba(239, 68, 68, 0.15)',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons name="heart" size={18} color="#ef4444" />
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
                      Apple Health Sync
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>
                      Steps, distance & weight sync
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              {/* Save All Changes Button */}
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveAllProfileSettings}
                disabled={usernameLoading}
                activeOpacity={0.85}
              >
                <Ionicons name={savedSuccess ? 'checkmark-circle' : 'save-outline'} size={18} color="#ffffff" />
                <Text style={[styles.saveBtnText, { color: '#ffffff' }]}>
                  {savedSuccess ? 'SAVED!' : usernameLoading ? 'SAVING...' : 'SAVE CHANGES'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
      </InteractiveBottomModal>

      {/* ── LOWER SCREEN CONTAINER (Sub-tab bar and entire content below it: pure white in light mode, pure black in dark mode) ── */}
      <View style={[styles.lowerScreenSection, { backgroundColor: isDark ? '#000000' : '#ffffff', borderTopColor: isDark ? '#1a1a1f' : '#ededf0' }]}>
        {/* Animated Sub-Tab Selector: activity vs insights vs badges */}
        <View style={[styles.subTabBarContainer, { backgroundColor: isDark ? '#000000' : '#ffffff', borderBottomColor: isDark ? '#1f1f24' : '#e5e5ea' }]}>
          <TouchableOpacity
            style={styles.subTabBtn}
            onPress={() => switchTab('activity')}
            activeOpacity={0.75}
          >
            <Animated.Text
              style={[
                styles.subTabText,
                {
                  color: activeSubTab === 'activity' ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#71717a' : '#9ca3af'),
                  fontWeight: activeSubTab === 'activity' ? '800' : '600',
                },
              ]}
            >
              activity
            </Animated.Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.subTabBtn}
            onPress={() => switchTab('insights')}
            activeOpacity={0.75}
          >
            <Animated.Text
              style={[
                styles.subTabText,
                {
                  color: activeSubTab === 'insights' ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#71717a' : '#9ca3af'),
                  fontWeight: activeSubTab === 'insights' ? '800' : '600',
                },
              ]}
            >
              insights
            </Animated.Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.subTabBtn}
            onPress={() => switchTab('badges')}
            activeOpacity={0.75}
          >
            <Animated.Text
              style={[
                styles.subTabText,
                {
                  color: activeSubTab === 'badges' ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#71717a' : '#9ca3af'),
                  fontWeight: activeSubTab === 'badges' ? '800' : '600',
                },
              ]}
            >
              badges
            </Animated.Text>
          </TouchableOpacity>

          {/* Animated line highlighted under what is selected */}
          <Animated.View
            style={[
              styles.subTabHighlightLine,
              {
                backgroundColor: isDark ? '#ffffff' : '#000000',
                left: tabAnim.interpolate({
                  inputRange: [0, 1, 2],
                  outputRange: ['0%', '33.33%', '66.66%'],
                }),
                width: '33.33%',
              },
            ]}
          />
        </View>

        {/* ── PERSISTENT SUB-TAB CONTENT: ACTIVITY vs INSIGHTS vs BADGES ── */}
        <View style={[styles.activityTabWrapper, activeSubTab !== 'activity' && { display: 'none' }]}>
          <ProfileActivitySection
            userId={effectiveUserId}
            stepsGoal={stepsGoal}
            distanceGoalKm={distanceGoalKm}
            unitSystem={unitSystem}
          />
        </View>

        <View style={[activeSubTab !== 'insights' && { display: 'none' }]}>
          <InsightsSection
            key="ins_section"
            userId={effectiveUserId}
            unitSystem={unitSystem}
            gender={gender}
            age={ageVal}
          />
        </View>

        <View style={[styles.badgesSectionContainer, activeSubTab !== 'badges' && { display: 'none' }]}>
          {/* Badges Header Summary */}
          <View style={[styles.badgesSummaryBanner, { backgroundColor: isDark ? '#0d0d10' : '#f8f8fb', borderColor: isDark ? '#232328' : '#e8e8ed' }]}>
            <View style={styles.badgesSummaryCol}>
              <Text style={[styles.badgesSummaryNum, { color: TIER_METALLIC.gold.base }]}>
                {badges.filter((b) => b.currentTier === 'gold').length}
              </Text>
              <Text style={[styles.badgesSummaryLabel, { color: colors.textMuted }]}>GOLD</Text>
            </View>
            <View style={[styles.badgesSummaryDivider, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]} />
            <View style={styles.badgesSummaryCol}>
              <Text style={[styles.badgesSummaryNum, { color: TIER_METALLIC.silver.base }]}>
                {badges.filter((b) => b.currentTier === 'silver').length}
              </Text>
              <Text style={[styles.badgesSummaryLabel, { color: colors.textMuted }]}>SILVER</Text>
            </View>
            <View style={[styles.badgesSummaryDivider, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]} />
            <View style={styles.badgesSummaryCol}>
              <Text style={[styles.badgesSummaryNum, { color: TIER_METALLIC.bronze.base }]}>
                {badges.filter((b) => b.currentTier === 'bronze').length}
              </Text>
              <Text style={[styles.badgesSummaryLabel, { color: colors.textMuted }]}>BRONZE</Text>
            </View>
          </View>

          {/* Badges Grid with 3D Physics, Sheen and Depth */}
          <View style={styles.badgesGrid}>
            {badges.map((badge) => (
              <InteractiveBadge
                key={badge.id}
                badge={badge}
                isDark={isDark}
                onPress={() => setSelectedBadge(badge)}
              />
            ))}
          </View>

          {/* BADGE DETAIL POPUP BOTTOM SHEET */}
          <InteractiveBottomModal
            visible={!!selectedBadge}
            onDismiss={() => setSelectedBadge(null)}
            handleColor={isDark ? '#3f3f46' : '#d4d4d8'}
            cardStyle={[
              styles.badgeDetailCard,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: selectedBadge?.currentTier
                  ? TIER_METALLIC[selectedBadge.currentTier].border
                  : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              },
            ]}
          >
              {selectedBadge && (() => {
                const tierInfo = selectedBadge.currentTier
                  ? TIER_METALLIC[selectedBadge.currentTier]
                  : TIER_METALLIC.unearned;

                return (
                  <View style={{ width: '100%', alignItems: 'center' }}>
                    <SpinnableCoinHero badge={selectedBadge} userName={user?.name || username || 'Walker'} isDark={isDark} />

                    <Text style={[styles.badgeDetailTitle, { color: colors.text }]}>
                      {selectedBadge.title}
                    </Text>
                    <View style={[styles.badgeDetailTierPill, { backgroundColor: tierInfo.bg, borderColor: tierInfo.border }]}>
                      <Text style={[styles.badgeDetailTierText, { color: tierInfo.base }]}>
                        {tierInfo.label} TIER
                      </Text>
                    </View>

                    <Text style={[styles.badgeDetailDesc, { color: colors.textSecondary }]}>
                      {selectedBadge.description}
                    </Text>

                    {/* 3 Tier Targets Display: Bronze, Silver, Gold */}
                    <View style={[styles.tierTargetsGrid, { backgroundColor: isDark ? '#1a1a20' : '#f5f5f8', borderColor: isDark ? '#2a2a32' : '#e5e5ea' }]}>
                      <View style={[styles.tierTargetCol, selectedBadge.currentValue >= selectedBadge.bronzeTarget && { opacity: 1 }]}>
                        <View style={[styles.tierTargetIcon, { backgroundColor: TIER_METALLIC.bronze.bg }]}>
                            <Ionicons name="trophy" size={14} color={TIER_METALLIC.bronze.base} />
                          </View>
                          <Text style={[styles.tierTargetName, { color: TIER_METALLIC.bronze.base }]}>Bronze</Text>
                          <Text style={[styles.tierTargetNum, { color: colors.text }]}>
                            {selectedBadge.bronzeTarget.toLocaleString()} {selectedBadge.unit}
                          </Text>
                        </View>

                        <View style={[styles.tierTargetCol, selectedBadge.currentValue >= selectedBadge.silverTarget && { opacity: 1 }]}>
                          <View style={[styles.tierTargetIcon, { backgroundColor: TIER_METALLIC.silver.bg }]}>
                            <Ionicons name="trophy" size={14} color={TIER_METALLIC.silver.base} />
                          </View>
                          <Text style={[styles.tierTargetName, { color: TIER_METALLIC.silver.base }]}>Silver</Text>
                          <Text style={[styles.tierTargetNum, { color: colors.text }]}>
                            {selectedBadge.silverTarget.toLocaleString()} {selectedBadge.unit}
                          </Text>
                        </View>

                        <View style={[styles.tierTargetCol, selectedBadge.currentValue >= selectedBadge.goldTarget && { opacity: 1 }]}>
                          <View style={[styles.tierTargetIcon, { backgroundColor: TIER_METALLIC.gold.bg }]}>
                            <Ionicons name="trophy" size={14} color={TIER_METALLIC.gold.base} />
                          </View>
                          <Text style={[styles.tierTargetName, { color: TIER_METALLIC.gold.base }]}>Gold</Text>
                          <Text style={[styles.tierTargetNum, { color: colors.text }]}>
                            {selectedBadge.goldTarget.toLocaleString()} {selectedBadge.unit}
                          </Text>
                        </View>
                      </View>

                      {/* Progress to next tier */}
                      <View style={styles.badgeDetailCurrentRow}>
                        <Text style={[styles.badgeDetailCurrentLabel, { color: colors.textMuted }]}>
                          Current Progress:
                        </Text>
                        <Text style={[styles.badgeDetailCurrentVal, { color: colors.primary }]}>
                          {selectedBadge.currentValue.toLocaleString()} / {selectedBadge.nextTierTarget.toLocaleString()} {selectedBadge.unit} ({selectedBadge.progressPercent}%)
                        </Text>
                      </View>
                    </View>
                  );
                })()}
            </InteractiveBottomModal>
          </View>
      </View>

      {/* ── STEPS & DISTANCE GOAL MODAL ── */}
      <InteractiveBottomModal
        visible={showGoalModal}
        onDismiss={() => setShowGoalModal(false)}
        handleColor={colors.border}
        cardStyle={[styles.editModalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={styles.modalHeaderRow}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>
            {goalType === 'steps' ? 'Daily Steps Goal' : 'Daily Distance Goal'}
          </Text>
        </View>

        {/* Goal Type Switcher Pill inside modal */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16 }}>
          <View style={[styles.metricSegmentWrapper, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[
                styles.metricSegmentBtn,
                goalType === 'steps' && [styles.metricSegmentBtnActive, { backgroundColor: colors.primary }],
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setGoalType('steps');
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="footsteps"
                size={14}
                color={goalType === 'steps' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted}
              />
              <Text
                style={[
                  styles.metricSegmentText,
                  { color: goalType === 'steps' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted },
                  goalType === 'steps' && { fontWeight: '800' },
                ]}
              >
                Steps Goal
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.metricSegmentBtn,
                goalType === 'distance' && [styles.metricSegmentBtnActive, { backgroundColor: colors.primary }],
              ]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setGoalType('distance');
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name="navigate"
                size={14}
                color={goalType === 'distance' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted}
              />
              <Text
                style={[
                  styles.metricSegmentText,
                  { color: goalType === 'distance' ? (isDark ? '#09090b' : '#ffffff') : colors.textMuted },
                  goalType === 'distance' && { fontWeight: '800' },
                ]}
              >
                Distance Goal
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {goalType === 'steps' ? (
          <>
            <View style={[styles.goalDisplayBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <Ionicons name="footsteps" size={24} color={colors.primary} />
              <Text style={[styles.goalDisplayNum, { color: colors.primary, fontFamily: SERIF_FONT }]}>
                {(parseInt(goalInput.replace(/\D/g, '')) || stepsGoal).toLocaleString()}
              </Text>
              <Text style={[styles.goalDisplayUnit, { color: colors.textMuted }]}>steps / day</Text>
            </View>

            {/* Steps Presets */}
            <View style={styles.goalPresetsRow}>
              {[5000, 7500, 8000, 10000, 12000, 15000].map((p) => {
                const active = (parseInt(goalInput.replace(/\D/g, '')) || stepsGoal) === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.goalPresetChip,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                      active && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setGoalInput(String(p));
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.goalPresetText, { color: active ? '#09090b' : colors.textSecondary }]}>
                      {(p / 1000).toFixed(p % 1000 === 0 ? 0 : 1)}k
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Steps Input */}
            <View style={styles.inputWrap}>
              <Text style={[styles.inputLabelSmall, { color: colors.textMuted }]}>CUSTOM STEPS GOAL</Text>
              <View style={[styles.inputBox2, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <Ionicons name="footsteps-outline" size={16} color={colors.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                  style={[styles.input2, { color: colors.text }]}
                  value={goalInput}
                  onChangeText={setGoalInput}
                  keyboardType="numeric"
                  placeholder="e.g. 10000"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Distance Goal View */}
            <View style={[styles.goalDisplayBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <Ionicons name="navigate" size={24} color={colors.primary} />
              <Text style={[styles.goalDisplayNum, { color: colors.primary, fontFamily: SERIF_FONT }]}>
                {parseFloat(distanceGoalInput) || (unitSystem === 'us_customary' ? +(distanceGoalKm * 0.621371).toFixed(1) : distanceGoalKm)}
              </Text>
              <Text style={[styles.goalDisplayUnit, { color: colors.textMuted }]}>
                {unitSystem === 'us_customary' ? 'miles / day' : 'km / day'}
              </Text>
            </View>

            {/* Distance Presets */}
            <View style={styles.goalPresetsRow}>
              {(unitSystem === 'us_customary'
                ? [2, 3, 5, 6.2, 8, 10]
                : [3, 5, 8, 10, 12, 15]
              ).map((p) => {
                const curVal = parseFloat(distanceGoalInput) || (unitSystem === 'us_customary' ? +(distanceGoalKm * 0.621371).toFixed(1) : distanceGoalKm);
                const active = curVal === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.goalPresetChip,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                      active && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setDistanceGoalInput(String(p));
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.goalPresetText, { color: active ? '#09090b' : colors.textSecondary }]}>
                      {p} {unitSystem === 'us_customary' ? 'mi' : 'km'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom Distance Input */}
            <View style={styles.inputWrap}>
              <Text style={[styles.inputLabelSmall, { color: colors.textMuted }]}>
                CUSTOM DISTANCE GOAL ({unitSystem === 'us_customary' ? 'MILES' : 'KM'})
              </Text>
              <View style={[styles.inputBox2, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                <Ionicons name="navigate-outline" size={16} color={colors.textMuted} style={{ marginRight: 10 }} />
                <TextInput
                  style={[styles.input2, { color: colors.text }]}
                  value={distanceGoalInput}
                  onChangeText={setDistanceGoalInput}
                  keyboardType="decimal-pad"
                  placeholder={unitSystem === 'us_customary' ? 'e.g. 3.5' : 'e.g. 5.0'}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>
          </>
        )}

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary }, goalSaving && { opacity: 0.6 }]}
          onPress={handleSaveGoal}
          disabled={goalSaving}
          activeOpacity={0.85}
        >
          <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
          <Text style={[styles.saveBtnText, { color: '#ffffff' }]}>
            {goalSaving ? 'SAVING...' : 'SET GOAL'}
          </Text>
        </TouchableOpacity>
      </InteractiveBottomModal>

      {/* Apple Health Sync Modal */}
      <AppleHealthSyncModal
        visible={showAppleHealthModal}
        onClose={() => setShowAppleHealthModal(false)}
        userId={user?.id || 'guest_user'}
        onSyncCompleted={() => {
          setProfileRefreshKey((k) => k + 1);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 14, paddingTop: Platform.OS === 'ios' ? 76 : 48 },
  screenHeader: {
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  screenTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  screenSubtitle: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  card: { backgroundColor: '#121215', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#27272a' },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  avatarCircle: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: '#18181b',
    borderWidth: 1, borderColor: '#3f3f46', alignItems: 'center', justifyContent: 'center',
  },
  accountInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: '800', color: '#fafafa', letterSpacing: -0.3 },
  userEmail: { fontSize: 13, color: '#71717a', marginTop: 2 },
  providerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6,
    backgroundColor: '#18181b', paddingVertical: 3, paddingHorizontal: 8,
    borderRadius: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#27272a',
  },
  providerBadgeText: { fontSize: 11, fontWeight: '700' },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, backgroundColor: '#1a0a0a', borderRadius: 10, borderWidth: 1, borderColor: '#3f1010',
  },
  signOutBtnText: { color: '#ef4444', fontSize: 13, fontWeight: '700' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#71717a', letterSpacing: 1.2 },
  activeUnit: { fontSize: 12, fontWeight: '700' },
  pillTrack: {
    flexDirection: 'row', backgroundColor: '#09090b', borderRadius: 14, padding: 4,
    borderWidth: 1, borderColor: '#27272a', height: 48,
  },
  pillOption: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pillOptionActive: {
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
  pillText: { fontSize: 13, fontWeight: '700', color: '#71717a' },
  pillTextActive: { color: '#09090b', fontWeight: '900' },
  /* Username in Settings */
  usernameDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  usernameCurrent: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  usernameSub: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  editUsernamePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  editUsernamePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  editUsernameContainer: {
    gap: 10,
  },
  usernameInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  atSymbol: {
    fontSize: 16,
    fontWeight: '800',
    marginRight: 4,
  },
  usernameTextInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 0,
  },
  editUsernameButtons: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  cancelUsernameBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  cancelUsernameText: {
    fontSize: 12,
    fontWeight: '700',
  },
  saveUsernameBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  saveUsernameText: {
    color: '#09090b',
    fontSize: 12,
    fontWeight: '800',
  },
  formRow: { flexDirection: 'row', gap: 12, marginBottom: 14, marginTop: 12 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181b',
    borderRadius: 12, borderWidth: 1, borderColor: '#27272a', paddingHorizontal: 12, height: 46,
  },
  inputText: { flex: 1, color: '#fafafa', fontSize: 16, fontWeight: '700' },
  inputUnit: { color: '#71717a', fontSize: 12, fontWeight: '700' },
  genderRow: {
    flexDirection: 'row', backgroundColor: '#18181b', borderRadius: 12,
    borderWidth: 1, borderColor: '#27272a', height: 46, padding: 3,
  },
  genderChip: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  genderChipActive: { backgroundColor: '#27272a' },
  genderText: { fontSize: 16, fontWeight: '800', color: '#71717a' },
  genderTextActive: {},
  caloriePreview: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#18181b',
    padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#27272a', marginBottom: 16,
  },
  caloriePreviewTitle: { fontSize: 12, fontWeight: '800', color: '#fafafa' },
  caloriePreviewDesc: { fontSize: 12, color: '#a1a1aa', marginTop: 2, lineHeight: 16 },
  adjusterRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  adjusterCol: {
    flex: 1,
  },
  feetInchesRow: {
    flexDirection: 'row',
    gap: 6,
  },
  genderPickerContainer: {
    flexDirection: 'column',
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
    height: 180,
    justifyContent: 'space-evenly',
  },

  /* ── Retro Profile Header Styles ── */
  retroProfileHeader: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  retroProfileMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  retroProfileInfo: {
    flex: 1,
  },
  retroProfileName: {
    fontFamily: SERIF_FONT,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  retroProfileHandle: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  retroProfileAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 34,
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  retroMetaList: {
    gap: 7,
    marginBottom: 18,
  },
  retroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  retroMetaIcon: {
    marginRight: 8,
    width: 16,
  },
  retroMetaText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  retroActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  retroPillBtn: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  retroPillBtnText: {
    fontSize: 13.5,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  retroPillBtnIconOnly: {
    width: 44,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },

  /* ── Sun and Moon Theme Pill ── */
  retroThemePill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    padding: 3,
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  themePillSegment: {
    width: 32,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themePillSegmentActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },

  /* ── 3-Dots Menu & Dropdown ── */
  dotsMenuWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  dotsDropdownCard: {
    position: 'absolute',
    top: 44,
    right: 0,
    minWidth: 140,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 20,
  },
  dropdownMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  dropdownSignOutText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef4444',
  },
  dropdownMenuItemText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dropdownDivider: {
    height: 1,
    marginHorizontal: 10,
  },

  /* ── Edit Profile Modal Sheet ── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  editModalCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  modalSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFieldCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  modalFieldLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginBottom: 10,
  },
  usernameModalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
  },
  modalHelpText: {
    fontSize: 11.5,
    marginTop: 8,
    lineHeight: 16,
  },

  /* Edit Profile Form Styles */
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  unitsToggleBar: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 6,
  },
  unitsToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  unitsToggleBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  unitsToggleText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  measurementsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  measurementCol: {
    flex: 1,
    gap: 8,
  },
  pickerWrapCard: {
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    minHeight: 145,
  },
  usHeightContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    width: '100%',
  },
  usHeightPicker: {
    flex: 1,
  },
  genderOptionsCol: {
    width: '100%',
    gap: 6,
  },
  genderOptionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  genderOptionBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  genderOptionText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 8,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Goal modal

  goalDisplayBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  goalDisplayNum: {
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  goalDisplayUnit: {
    fontSize: 13,
    fontWeight: '600',
  },
  goalPresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  goalPresetChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  goalPresetText: {
    fontSize: 13,
    fontWeight: '700',
  },
  inputWrap: { marginBottom: 16 },
  inputLabelSmall: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginBottom: 8,
  },
  inputBox2: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
  },
  input2: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  metricSegmentWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    padding: 3,
    gap: 4,
  },
  metricSegmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  metricSegmentBtnActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  metricSegmentText: {
    fontSize: 12.5,
    fontWeight: '600',
    letterSpacing: -0.2,
  },

  /* ── Lower Screen Container (Full width below profile header) ── */
  lowerScreenSection: {
    marginHorizontal: -16,
    paddingTop: 4,
    paddingBottom: 60,
    minHeight: 600,
    borderTopWidth: 1,
  },
  /* ── Sub-tab bar (Activity vs Badges) with animated highlight underline ── */
  subTabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    position: 'relative',
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  subTabHighlightLine: {
    position: 'absolute',
    bottom: -1,
    width: '50%',
    height: 3,
    borderRadius: 1.5,
    zIndex: 5,
  },
  subTabBtn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  subTabText: {
    fontSize: 14.5,
    letterSpacing: -0.2,
    textTransform: 'lowercase',
  },
  activityTabWrapper: {
    paddingHorizontal: 16,
  },

  /* ── Badges Section ── */
  badgesSectionContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 40,
  },
  badgesSummaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    marginBottom: 16,
  },
  badgesSummaryCol: {
    alignItems: 'center',
  },
  badgesSummaryNum: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  badgesSummaryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginTop: 2,
  },
  badgesSummaryDivider: {
    width: 1,
    height: 24,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  badgeCard: {
    width: '48%',
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  badgeRingWrapper: {
    position: 'relative',
    marginBottom: 10,
    marginTop: 4,
  },
  badgeIconCenter: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierTagPill: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  tierTagPillText: {
    color: '#ffffff',
    fontSize: 9.5,
    fontWeight: '900',
  },
  badgeTitle: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  badgeTierText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  badgeProgressRow: {
    marginTop: 6,
    alignItems: 'center',
  },
  badgeProgressText: {
    fontSize: 10.5,
    fontWeight: '600',
  },

  /* ── Badge Detail Modal ── */
  badgeDetailModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  badgeDetailCard: {
    width: '100%',
    maxWidth: 500,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    paddingHorizontal: 22,
    paddingBottom: 28,
    alignItems: 'center',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  badgeDetailRingWrap: {
    marginBottom: 12,
  },
  badgeDetailIconCenter: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDetailTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  badgeDetailTierPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 8,
  },
  badgeDetailTierText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  badgeDetailDesc: {
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  tierTargetsGrid: {
    flexDirection: 'row',
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  tierTargetCol: {
    flex: 1,
    alignItems: 'center',
    opacity: 0.45,
  },
  tierTargetIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tierTargetName: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  tierTargetNum: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    textAlign: 'center',
  },
  badgeDetailCurrentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  badgeDetailCurrentLabel: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  badgeDetailCurrentVal: {
    fontSize: 12,
    fontWeight: '800',
  },
  badgeDetailCloseBtn: {
    width: '100%',
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDetailCloseBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
});
