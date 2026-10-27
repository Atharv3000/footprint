import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Animated,
  Dimensions,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  TextInput,
  FlatList,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { loadUserProfile } from '@/constants/userProfile';
import {
  SocialGroup,
  FriendUser,
  loadFriends,
  sendFriendRequest,
  setFriendCustomColor,
  removeFriend,
  FRIEND_CURSOR_PALETTE,
} from '@/constants/socialEngine';
import { InteractiveBottomModal } from '@/components/InteractiveBottomModal';
import { getWeekDates, formatWeekRange, dateString, ensureMockDataSeeded } from '@/constants/stepsStorage';
import { WalkHistorySection } from '@/components/WalkHistorySection';
import { InsightsSection } from '@/components/InsightsSection';
import { InteractiveBadge } from '@/components/InteractiveBadge';
import { WeeklyBarChart } from '@/components/StepsCharts';
import { CircularProgressRing } from '@/components/CircularProgressRing';
import {
  getUserBadgeStats,
  computeBadges,
  BadgeDefinition,
  TIER_METALLIC,
} from '@/constants/badgesEngine';
import Svg, { Rect, Defs, LinearGradient as SvgGradient, Stop as SvgStop } from 'react-native-svg';

const { width: SCREEN_W } = Dimensions.get('window');

export interface MemberStat {
  username: string;
  displayName: string;
  avatarColor: string;
  avatarUrl?: string;
  weeklySteps: number;
  dailySteps: number;
  totalDistance: number; // km
  totalWorkouts: number;
  isWalkingNow: boolean;
  currentActivity?: 'walk' | 'run' | 'cycle';
  isFriend: boolean;
  isSelf: boolean;
  lastActive: string;
}

export type SquadGrade = 'A++' | 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F';

export interface GradeInfo {
  grade: SquadGrade;
  color: string;
  label: string;
  desc: string;
}

export interface GradeThresholdDef {
  grade: SquadGrade;
  baseTotal: number;
  perMember: number;
  label: string;
  color: string;
  desc: string;
}

export const SQUAD_TIERS: GradeThresholdDef[] = [
  { grade: 'F', baseTotal: 0, perMember: 0, label: 'Dormant', color: '#ef4444', desc: 'Minimal squad activity this week' },
  { grade: 'D', baseTotal: 10000, perMember: 8000, label: 'Needs Boost', color: '#f97316', desc: 'Low overall squad steps this week' },
  { grade: 'C', baseTotal: 25000, perMember: 16000, label: 'Casual Pace', color: '#f59e0b', desc: 'Light weekly motion, room to step up' },
  { grade: 'C+', baseTotal: 40000, perMember: 26000, label: 'Moderate', color: '#eab308', desc: 'Moderate squad walking routine' },
  { grade: 'B', baseTotal: 65000, perMember: 38000, label: 'Solid Squad', color: '#6366f1', desc: 'Solid pace and active team consistency' },
  { grade: 'B+', baseTotal: 90000, perMember: 50000, label: 'Strong Pace', color: '#3b82f6', desc: 'Great endurance across all teammates' },
  { grade: 'A', baseTotal: 125000, perMember: 65000, label: 'Master Tier', color: '#10b981', desc: 'High-intensity squad averaging top distance' },
  { grade: 'A+', baseTotal: 165000, perMember: 80000, label: 'Elite Tier', color: '#22c55e', desc: 'Exceptional group performance and endurance' },
  { grade: 'A++', baseTotal: 215000, perMember: 98000, label: 'Legendary Tier', color: '#14b8a6', desc: 'Apex athletic achievement — top of the world' },
];

export function getSquadThresholds(memberCount: number) {
  const count = Math.max(1, memberCount);
  return SQUAD_TIERS.map((tier) => ({
    ...tier,
    threshold: tier.baseTotal + count * tier.perMember,
  }));
}

export function calculateSquadGrade(totalSteps: number, memberCount: number = 1): GradeInfo {
  const tiers = getSquadThresholds(memberCount);
  // Iterate from highest tier down to lowest
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (totalSteps >= tiers[i].threshold) {
      return {
        grade: tiers[i].grade,
        color: tiers[i].color,
        label: tiers[i].label,
        desc: tiers[i].desc,
      };
    }
  }
  return {
    grade: 'F',
    color: '#ef4444',
    label: 'Dormant',
    desc: 'Minimal squad activity this week',
  };
}

const SQUAD_CHART_H = 148;
const SQUAD_Y_AXIS_W = 42;
const SQUAD_GRID_COLOR = 'rgba(128,128,128,0.14)';

// Compute Y-Axis scale matching Activity Tab (StepsCharts.tsx)
function computeSquadYScale(
  roughMax: number,
  mode: 'steps' | 'distance'
): { lines: { value: number; label: string }[]; maxVal: number } {
  if (roughMax <= 0) return { lines: [], maxVal: 1 };

  if (mode === 'distance') {
    let step = 1;
    if (roughMax <= 5) step = 1;
    else if (roughMax <= 15) step = 3;
    else if (roughMax <= 35) step = 7;
    else if (roughMax <= 70) step = 15;
    else if (roughMax <= 150) step = 30;
    else step = 50;

    const lines = [];
    let v = step;
    while (lines.length < 5) {
      lines.push({ value: v, label: v + 'km' });
      v += step;
      if (lines[lines.length - 1].value >= roughMax && lines.length >= 3) break;
      if (v > roughMax * 1.4) break;
    }
    const maxVal = lines.length > 0 ? lines[lines.length - 1].value : roughMax;
    return { lines, maxVal };
  }

  // Steps mode
  const rawStep = roughMax / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, rawStep))));
  let step = mag;
  const r = rawStep / mag;
  if (r >= 7.5) step = mag * 10;
  else if (r >= 5) step = mag * 5;
  else if (r >= 2.5) step = mag * 2.5;
  else if (r >= 2) step = mag * 2;

  const lines = [];
  let v = step;
  while (lines.length < 5) {
    const kLabel = v >= 1000 ? (v % 1000 === 0 ? (v / 1000).toFixed(0) : (v / 1000).toFixed(1)) + 'k' : String(v);
    lines.push({ value: v, label: kLabel });
    v += step;
    if (v > roughMax * 1.5) break;
    if (lines[lines.length - 1].value >= roughMax && lines.length >= 3) break;
  }
  const maxVal = lines.length > 0 ? lines[lines.length - 1].value : roughMax;
  return { lines, maxVal };
}

interface HistoricalWeekGrade {
  weekLabel: string;
  dateRange: string;
  steps: number;
  gradeInfo: GradeInfo;
}

interface Props {
  visible: boolean;
  squad: SocialGroup;
  userId: string;
  myUsername: string;
  onClose: () => void;
  onAddMember: (squad: SocialGroup) => void;
  onLeave: (squad: SocialGroup) => void;
}

export function SquadDetailScreen({
  visible,
  squad,
  userId,
  myUsername,
  onClose,
  onAddMember,
  onLeave,
}: Props) {
  const { colors, isDark } = useTheme();
  const slideAnim = useRef(new Animated.Value(SCREEN_W)).current;

  const [members, setMembers] = useState<MemberStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [requestsSent, setRequestsSent] = useState<Set<string>>(new Set());

  // Past grades history selected week (default to newest week which is on the right)
  const [selectedHistoryWeekIdx, setSelectedHistoryWeekIdx] = useState<number>(9);

  // Friend profile bottom sheet modal (same menu as community tab)
  const [selectedFriendForProfile, setSelectedFriendForProfile] = useState<FriendUser | null>(null);

  // Scope toggle ('daily' | 'weekly') and swipeable page ('steps' = 0, 'distance' = 1)
  const [squadTimeScope, setSquadTimeScope] = useState<'daily' | 'weekly'>('daily');
  const [squadChartPage, setSquadChartPage] = useState<number>(0);
  const chartScrollRef = useRef<ScrollView>(null);
  const [squadChartMetric, setSquadChartMetric] = useState<'steps' | 'distance'>('steps');
  const [squadActiveTooltip, setSquadActiveTooltip] = useState<{ idx: number; title: string; sub: string } | null>(null);
  const [squadWeekOffset, setSquadWeekOffset] = useState<number>(0);

  // Full Profile Sub-tab in Member sheet: 'activity' | 'badges' | 'cursor' (History is private to the user)
  const [memberSubTab, setMemberSubTab] = useState<'activity' | 'badges' | 'cursor'>('activity');
  const memberTabAnim = useRef(new Animated.Value(0)).current;
  const [memberBadges, setMemberBadges] = useState<BadgeDefinition[]>([]);
  const [selectedMemberBadge, setSelectedMemberBadge] = useState<BadgeDefinition | null>(null);

  // States for member's daily activity charts
  const [memberWeekOffset, setMemberWeekOffset] = useState<number>(0);
  const [memberSelectedDate, setMemberSelectedDate] = useState<string>(dateString(0));
  const [memberMetricMode, setMemberMetricMode] = useState<'steps' | 'distance'>('steps');

  // Animated progress for next tier goal (0 to 100)
  const tierProgressAnim = useRef(new Animated.Value(0)).current;

  const switchMemberSubTab = (tab: 'activity' | 'badges' | 'cursor') => {
    if (tab === memberSubTab) return;
    Haptics.selectionAsync().catch(() => {});
    setMemberSubTab(tab);
    const targetVal = tab === 'activity' ? 0 : tab === 'badges' ? 1 : 2;
    Animated.timing(memberTabAnim, {
      toValue: targetVal,
      duration: 220,
      useNativeDriver: false,
    }).start();
  };

  // Member search in sheet
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>('');

  // Members Sheet modal state
  const [showMembersSheet, setShowMembersSheet] = useState<boolean>(false);

  // In-app Leave confirmation modal state
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState<boolean>(false);

  // In-app Report Squad modal state
  const [showReportSquadModal, setShowReportSquadModal] = useState<boolean>(false);
  const [reportReason, setReportReason] = useState<string>('');
  const [reportSubmitted, setReportSubmitted] = useState<boolean>(false);

  // Header options selected state (shows black Add & Leave buttons only when selected)
  const [showHeaderOptionsMenu, setShowHeaderOptionsMenu] = useState<boolean>(false);

  // Target member for long-press Friend / Profile action sheet
  const [friendActionTargetMember, setFriendActionTargetMember] = useState<MemberStat | null>(null);

  // Main Tab navigation: 'overview' | 'more'
  const [squadActiveTab, setSquadActiveTab] = useState<'overview' | 'more'>('overview');

  // 3-per-page member visualizer carousel in More tab
  const [moreMemberPageIndex, setMoreMemberPageIndex] = useState<number>(0);

  // Slide-in from right animation - reliably triggers every time
  useEffect(() => {
    if (visible) {
      setSquadActiveTab('overview');
      slideAnim.setValue(SCREEN_W);
      Animated.spring(slideAnim, {
        toValue: 0,
        damping: 26,
        stiffness: 240,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, squad?.id]);

  // Subtitle header switcher: toggles between squad description and online members summary (only if online members exist)
  const [headerSubtitleMode, setHeaderSubtitleMode] = useState<'desc' | 'online'>('desc');
  const subtitleFadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    const hasOnline = members.some((m) => m.isWalkingNow);
    if (!hasOnline) {
      setHeaderSubtitleMode('desc');
      subtitleFadeAnim.setValue(1);
      return;
    }
    const interval = setInterval(() => {
      Animated.timing(subtitleFadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        setHeaderSubtitleMode((prev) => (prev === 'desc' ? 'online' : 'desc'));
        Animated.timing(subtitleFadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }).start();
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [visible, members, subtitleFadeAnim]);


  const handleClose = () => {
    Haptics.selectionAsync().catch(() => {});
    Animated.timing(slideAnim, {
      toValue: SCREEN_W,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  const loadMemberData = useCallback(async () => {
    if (!squad) return;
    setLoading(true);
    try {
      const [friends, userProfile] = await Promise.all([
        loadFriends(userId),
        loadUserProfile().catch(() => null),
      ]);
      const friendMap = new Map(friends.map((f) => [f.username.toLowerCase(), f]));

      const stats: MemberStat[] = squad.memberUsernames.map((uname, idx) => {
        const isSelf = uname.toLowerCase() === myUsername.toLowerCase();
        const friend = friendMap.get(uname.toLowerCase());
        const seed = uname.charCodeAt(0) + uname.charCodeAt(uname.length - 1) + idx * 43;
        const weeklySteps = isSelf
          ? 54230
          : (friend?.weeklySteps || (9400 + (seed % 15) * 3100));
        const dailySteps = isSelf
          ? 8400
          : (friend?.dailySteps || Math.round(weeklySteps / 7));
        const totalWorkouts = isSelf ? 24 : (friend?.totalWorkouts || (6 + (seed % 18)));
        const totalDistance = Math.round((weeklySteps * 0.00076) * 10) / 10;
        const colorIdx = (seed + idx) % FRIEND_CURSOR_PALETTE.length;

        return {
          username: uname,
          displayName: friend?.displayName || (isSelf ? (userProfile?.name || 'You') : uname),
          avatarColor: friend?.avatarColor || FRIEND_CURSOR_PALETTE[colorIdx],
          avatarUrl: isSelf ? userProfile?.avatarUrl : friend?.avatarUrl,
          weeklySteps,
          dailySteps,
          totalDistance,
          totalWorkouts,
          isWalkingNow: friend?.isWalkingNow || false,
          currentActivity: friend?.currentActivity || (friend?.isWalkingNow ? 'walk' : undefined),
          isFriend: isSelf || friendMap.has(uname.toLowerCase()),
          isSelf,
          lastActive: friend?.lastActive || '2h ago',
        };
      });

      stats.sort((a, b) => b.weeklySteps - a.weeklySteps);
      setMembers(stats);
    } catch (e) {
      console.warn('SquadDetail load error:', e);
    } finally {
      setLoading(false);
    }
  }, [squad, userId, myUsername]);

  useEffect(() => {
    if (visible && squad) {
      setRequestsSent(new Set());
      loadMemberData();
    }
  }, [visible, squad, loadMemberData]);

  const handleAddFriend = async (member: MemberStat) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      await sendFriendRequest(userId, myUsername, member.username);
      setRequestsSent((prev) => new Set([...prev, member.username]));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e: any) {
      Alert.alert('Could not send friend request', e.message || 'Please try again later.');
    }
  };

  const handleOpenMemberProfile = (member: MemberStat) => {
    Haptics.selectionAsync().catch(() => {});
    const friendObj: FriendUser = {
      id: member.username,
      username: member.username,
      displayName: member.displayName,
      avatarColor: member.avatarColor,
      avatarUrl: member.avatarUrl,
      dailySteps: member.dailySteps,
      weeklySteps: member.weeklySteps,
      totalWorkouts: member.totalWorkouts,
      isWalkingNow: member.isWalkingNow,
      lastActive: member.lastActive,
    };
    setSelectedFriendForProfile(friendObj);
    setMemberSubTab('activity');
    setMemberWeekOffset(0);
    setMemberSelectedDate(dateString(0));
    setMemberMetricMode('steps');
    memberTabAnim.setValue(0);
    // Ensure mock step data exists so Daily Steps and Daily Distance render accurately
    ensureMockDataSeeded(member.username, 8000).catch(() => {});
    // Load badges for this user
    getUserBadgeStats(member.username).then((stats) => {
      const computed = computeBadges(stats);
      setMemberBadges(computed);
    }).catch(() => {});
  };

  const handleSelectColor = async (friend: FriendUser, color: string) => {
    try {
      Haptics.selectionAsync().catch(() => {});
      await setFriendCustomColor(userId, friend.username, color);
      setSelectedFriendForProfile((prev) => (prev ? { ...prev, avatarColor: color } : null));
      setMembers((prev) =>
        prev.map((m) =>
          m.username.toLowerCase() === friend.username.toLowerCase()
            ? { ...m, avatarColor: color }
            : m
        )
      );
    } catch (e) {
      console.warn('Failed setting friend cursor color:', e);
    }
  };

  const handleRemoveFriendAction = async (friend: FriendUser) => {
    try {
      await removeFriend(userId, friend.username);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      setSelectedFriendForProfile(null);
      setMembers((prev) =>
        prev.map((m) =>
          m.username.toLowerCase() === friend.username.toLowerCase()
            ? { ...m, isFriend: false }
            : m
        )
      );
    } catch (e) {
      console.warn('Failed removing friend:', e);
    }
  };

  const totalSteps = squad ? members.reduce((s, m) => s + m.weeklySteps, 0) : 0;
  const totalDistance = squad ? Math.round(members.reduce((s, m) => s + m.totalDistance, 0) * 10) / 10 : 0;
  const totalWorkouts = squad ? members.reduce((s, m) => s + m.totalWorkouts, 0) : 0;
  const memberCount = Math.max(1, members.length);
  const avgStepsPerMember = Math.round(totalSteps / memberCount);
  const currentGrade = calculateSquadGrade(totalSteps, memberCount);

  // Cumulative lifetime stats combining every previous week
  // The two test groups keep test data as is; other squads start cleanly from scratch
  const isTestGroup = squad?.id === 'group_morning_walkers' || squad?.id === 'group_weekend_hikers';
  // 10 weeks of historical multipliers sum to ~8.52x weekly volume
  const pastWeeksFactor = isTestGroup ? 8.52 : 0;
  const cumulativeSteps = isTestGroup
    ? Math.round(totalSteps * (1 + pastWeeksFactor))
    : totalSteps;
  const cumulativeDistance = isTestGroup
    ? Math.round(totalDistance * (1 + pastWeeksFactor) * 10) / 10
    : totalDistance;
  const cumulativeWorkouts = isTestGroup
    ? Math.round(totalWorkouts * (1 + pastWeeksFactor))
    : totalWorkouts;

  const isCreator = squad ? squad.createdById === userId : false;
  const isAdminOnly = squad ? squad.squadType === 'admin_only' : false;
  const canAddMember = !isAdminOnly || isCreator;

  // Grade threshold ladder for next grade progression based on group base + per-member requirement
  const GRADE_THRESHOLDS = getSquadThresholds(memberCount);

  const currentGradeIdx = GRADE_THRESHOLDS.findIndex((g) => g.grade === currentGrade.grade);
  const nextGradeTier = currentGradeIdx < GRADE_THRESHOLDS.length - 1 ? GRADE_THRESHOLDS[currentGradeIdx + 1] : null;

  const totalStepsNeededForSquad = nextGradeTier ? Math.max(0, nextGradeTier.threshold - totalSteps) : 0;
  const stepsNeededPerMember = Math.round(totalStepsNeededForSquad / memberCount);

  // Progress towards next grade (0-100%) based on squad total steps
  const currentTierMin = GRADE_THRESHOLDS[currentGradeIdx]?.threshold || 0;
  const nextTierMin = nextGradeTier?.threshold || currentTierMin;
  const gradeSpan = Math.max(1, nextTierMin - currentTierMin);
  const gradeProgressPct = nextGradeTier
    ? Math.min(100, Math.max(0, Math.round(((totalSteps - currentTierMin) / gradeSpan) * 100)))
    : 100;

  // Animate tier progress fill smoothly
  useEffect(() => {
    Animated.timing(tierProgressAnim, {
      toValue: gradeProgressPct,
      duration: 650,
      useNativeDriver: false,
    }).start();
  }, [gradeProgressPct]);

  // Filtered members by search query for the search bar & carousel
  const filteredMembers = members.filter((m) => {
    if (!memberSearchQuery.trim()) return true;
    const q = memberSearchQuery.toLowerCase().trim();
    return (
      m.username.toLowerCase().includes(q) ||
      (m.displayName && m.displayName.toLowerCase().includes(q))
    );
  });

  // 7-day squad aggregate daily breakdown & cumulative stats with week offset support
  const weekDates = getWeekDates(squadWeekOffset);
  const weekLabel = squadWeekOffset === 0 ? 'this week' : squadWeekOffset === -1 ? 'last week' : `${Math.abs(squadWeekOffset)}w ago`;
  const canGoNextWeek = squadWeekOffset < 0;

  // Week offset scaling factor for historical weeks
  const weekStepMultiplier = squadWeekOffset === 0 ? 1 : squadWeekOffset === -1 ? 0.94 : squadWeekOffset === -2 ? 1.08 : squadWeekOffset === -3 ? 0.82 : 0.74;
  const currentWeekSquadSteps = Math.round(totalSteps * weekStepMultiplier);
  const currentWeekSquadDistance = Math.round(totalDistance * weekStepMultiplier * 10) / 10;

  const myMember = members.find((m) => m.isSelf);
  const mySelfRatio = totalSteps > 0 && myMember ? Math.min(0.9, Math.max(0.08, myMember.weeklySteps / totalSteps)) : 0.25;

  const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dailyDayWeights = [0.12, 0.14, 0.15, 0.13, 0.16, 0.18, 0.12]; // standard weekly distribution
  let runningCumulativeSteps = 0;
  let runningCumulativeDist = 0;
  const squadDailySteps = DAYS_OF_WEEK.map((day, dIdx) => {
    const dayTotal = Math.round(currentWeekSquadSteps * dailyDayWeights[dIdx]);
    const dayDist = Math.round(dayTotal * 0.00076 * 10) / 10;
    const mySteps = Math.round(dayTotal * mySelfRatio);
    const myDist = Math.round(dayDist * mySelfRatio * 10) / 10;
    const squadSteps = Math.max(0, dayTotal - mySteps);
    const squadDist = Math.max(0, Math.round((dayDist - myDist) * 10) / 10);

    runningCumulativeSteps += dayTotal;
    runningCumulativeDist = Math.round((runningCumulativeDist + dayDist) * 10) / 10;
    return {
      day,
      date: weekDates[dIdx],
      totalSteps: dayTotal,
      totalDistance: dayDist,
      mySteps,
      myDistance: myDist,
      squadSteps,
      squadDistance: squadDist,
      cumulativeSteps: runningCumulativeSteps,
      cumulativeDistance: runningCumulativeDist,
    };
  });

  // 12-week squad breakdown (last 3 months / 12 weeks)
  const WEEKS_12_FACTORS = [0.72, 0.78, 0.82, 0.86, 0.80, 0.92, 0.88, 0.95, 0.91, 1.04, 0.97, 1.0];
  const squadWeeklyData = WEEKS_12_FACTORS.map((factor, idx) => {
    const weekIndex = idx + 1; // W1 to W12
    const weekTotalSteps = Math.round(totalSteps * factor);
    const weekTotalDist = Math.round(totalDistance * factor * 10) / 10;
    const mySteps = Math.round(weekTotalSteps * mySelfRatio);
    const myDist = Math.round(weekTotalDist * mySelfRatio * 10) / 10;
    const squadSteps = Math.max(0, weekTotalSteps - mySteps);
    const squadDist = Math.max(0, Math.round((weekTotalDist - myDist) * 10) / 10);
    return {
      weekIndex,
      label: `W${weekIndex}`,
      totalSteps: weekTotalSteps,
      totalDistance: weekTotalDist,
      mySteps,
      myDistance: myDist,
      squadSteps,
      squadDistance: squadDist,
    };
  });

  // Max scales for Steps chart (Daily & Weekly)
  const maxDailyStepsVal = Math.max(...squadDailySteps.map(d => d.totalSteps), 1000);
  const maxWeeklyStepsVal = Math.max(...squadWeeklyData.map(w => w.totalSteps), 5000);
  const currentMaxSteps = squadTimeScope === 'daily' ? maxDailyStepsVal : maxWeeklyStepsVal;
  const { lines: squadStepsGridlines, maxVal: squadStepsChartMaxVal } = computeSquadYScale(currentMaxSteps * 1.1, 'steps');

  // Max scales for Distance chart (Daily & Weekly)
  const maxDailyDistVal = Math.max(...squadDailySteps.map(d => d.totalDistance), 2);
  const maxWeeklyDistVal = Math.max(...squadWeeklyData.map(w => w.totalDistance), 10);
  const currentMaxDist = squadTimeScope === 'daily' ? maxDailyDistVal : maxWeeklyDistVal;
  const { lines: squadDistGridlines, maxVal: squadDistChartMaxVal } = computeSquadYScale(currentMaxDist * 1.1, 'distance');

  // Comprehensive 10-week squad grade history timeline for test groups; non-test squads start from scratch
  // Ordered chronologically from oldest (left) to newest (right)
  const squadHistoryWeeks: HistoricalWeekGrade[] = isTestGroup
    ? [
        {
          weekLabel: 'Week 30',
          dateRange: 'Jul 14 – Jul 20',
          steps: Math.round(totalSteps * 0.62),
          gradeInfo: calculateSquadGrade(Math.round(totalSteps * 0.62), memberCount),
        },
        {
          weekLabel: 'Week 31',
          dateRange: 'Jul 21 – Jul 27',
          steps: Math.round(totalSteps * 0.78),
          gradeInfo: calculateSquadGrade(Math.round(totalSteps * 0.78), memberCount),
        },
        {
          weekLabel: 'Week 32',
          dateRange: 'Jul 28 – Aug 03',
          steps: Math.round(totalSteps * 0.69),
          gradeInfo: calculateSquadGrade(Math.round(totalSteps * 0.69), memberCount),
        },
        {
          weekLabel: 'Week 33',
          dateRange: 'Aug 04 – Aug 10',
          steps: Math.round(totalSteps * 0.96),
          gradeInfo: calculateSquadGrade(Math.round(totalSteps * 0.96), memberCount),
        },
        {
          weekLabel: 'Week 34',
          dateRange: 'Aug 11 – Aug 17',
          steps: Math.round(totalSteps * 0.88),
          gradeInfo: calculateSquadGrade(Math.round(totalSteps * 0.88), memberCount),
        },
        {
          weekLabel: 'Week 35',
          dateRange: 'Aug 18 – Aug 24',
          steps: Math.round(totalSteps * 0.74),
          gradeInfo: calculateSquadGrade(Math.round(totalSteps * 0.74), memberCount),
        },
        {
          weekLabel: 'Week 36',
          dateRange: 'Aug 25 – Aug 31',
          steps: Math.round(totalSteps * 0.82),
          gradeInfo: calculateSquadGrade(Math.round(totalSteps * 0.82), memberCount),
        },
        {
          weekLabel: 'Week 37',
          dateRange: 'Sep 01 – Sep 07',
          steps: Math.round(totalSteps * 1.08),
          gradeInfo: calculateSquadGrade(Math.round(totalSteps * 1.08), memberCount),
        },
        {
          weekLabel: 'Week 38',
          dateRange: 'Sep 08 – Sep 14',
          steps: Math.round(totalSteps * 0.94),
          gradeInfo: calculateSquadGrade(Math.round(totalSteps * 0.94), memberCount),
        },
        {
          weekLabel: 'Current Week',
          dateRange: 'This Week',
          steps: totalSteps,
          gradeInfo: currentGrade,
        },
      ]
    : [
        {
          weekLabel: 'Current Week',
          dateRange: 'This Week',
          steps: totalSteps,
          gradeInfo: currentGrade,
        },
      ];

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.fullPageContainer, { backgroundColor: colors.background }]}>
        
          <Animated.View
            style={[
              styles.animatedWrapper,
              { transform: [{ translateX: slideAnim }] },
            ]}
          >
          {/* Top Full Screen Header - Only shown on overview tab */}
          {squadActiveTab === 'overview' && (
            <View
              style={[
                styles.navHeader,
                {
                  borderBottomColor: colors.border,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  paddingTop: Platform.OS === 'ios' ? 56 : 36,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <TouchableOpacity
                style={[styles.roundNavBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderWidth: 1 }]}
                onPress={handleClose}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-back" size={20} color={colors.text} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.navTitleCenter}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSquadActiveTab('more');
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.navTitleText, { color: colors.text }]} numberOfLines={1}>
                  {squad.name}
                </Text>
                {(() => {
                  const onlineMembers = members.filter((m) => m.isWalkingNow);
                  if (onlineMembers.length === 0) {
                    return !!squad.description ? (
                      <Text style={[styles.navSubtitleText, { color: colors.textMuted }]} numberOfLines={1}>
                        {squad.description}
                      </Text>
                    ) : null;
                  }
                  return (
                    <Animated.View style={{ opacity: subtitleFadeAnim }}>
                      {headerSubtitleMode === 'desc' && !!squad.description ? (
                        <Text style={[styles.navSubtitleText, { color: colors.textMuted }]} numberOfLines={1}>
                          {squad.description}
                        </Text>
                      ) : (
                        <View style={styles.headerOnlineRow}>
                          <View style={styles.headerOnlineDot} />
                          <Text style={[styles.navSubtitleText, { color: colors.textMuted, marginLeft: 0 }]} numberOfLines={1}>
                            {onlineMembers.length === 1
                              ? `${onlineMembers[0].displayName || onlineMembers[0].username} is online`
                              : onlineMembers.length === 2
                              ? `${onlineMembers[0].displayName || onlineMembers[0].username} & ${onlineMembers[1].displayName || onlineMembers[1].username} online`
                              : `${onlineMembers.length} members online now`}
                          </Text>
                        </View>
                      )}
                    </Animated.View>
                  );
                })()}
              </TouchableOpacity>

              {/* Top Right Header Spacer to keep title center balanced (no elements/buttons) */}
              <View style={{ width: 38 }} />
            </View>
          )}

          {squadActiveTab === 'overview' ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 }]}
            >
            {/* ── SQUAD RATING / GRADE HERO CARD ── */}
            <View style={[styles.gradeHeroCard, { backgroundColor: colors.surfaceElevated, borderWidth: 0 }]}>
              <View style={styles.gradeHeaderRow}>
                <View style={{ flex: 1, paddingRight: 14, justifyContent: 'center' }}>
                  <Text style={[styles.gradeTierTitle, { color: currentGrade.color, marginBottom: 4 }]}>
                    {currentGrade.label}
                  </Text>
                  <Text style={[styles.gradeDesc, { color: colors.textSecondary, fontSize: 13, lineHeight: 18 }]}>
                    {currentGrade.desc}
                  </Text>
                </View>

                {/* Current Grade Progress Ring */}
                <View style={{ alignItems: 'center' }}>
                  <CircularProgressRing
                    size={74}
                    strokeWidth={6}
                    strokeLinecap="butt"
                    progressPercent={gradeProgressPct}
                    activeColor={currentGrade.color}
                    gradientToColor={nextGradeTier ? nextGradeTier.color : currentGrade.color}
                    trackColor={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
                  >
                    {/* Current Rank Core Visualizer */}
                    <View style={[styles.gradeBadgeCircle, { backgroundColor: colors.surfaceElevated, borderWidth: 0 }]}>
                      <Text style={[styles.gradeBadgeText, { color: currentGrade.color }]}>
                        {currentGrade.grade}
                      </Text>
                    </View>
                  </CircularProgressRing>
                </View>
              </View>

              {/* Weekly Average and More Button */}
              <View style={[styles.gradeFooterRow, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="footsteps-outline" size={14} color={colors.textMuted} />
                  <Text style={[styles.avgStepsNote, { color: colors.textSecondary }]}>
                    Avg{' '}
                    <Text style={{ color: colors.text, fontWeight: '700' }}>
                      {avgStepsPerMember.toLocaleString()}
                    </Text>{' '}
                    steps / member
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.viewHistoryBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderWidth: 0 }]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSquadActiveTab('more');
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="ellipsis-horizontal-circle-outline" size={15} color={colors.text} />
                  <Text style={[styles.viewHistoryBtnText, { color: colors.text }]}>More</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── SQUAD AGGREGATE ACTIVITY STATS (Clean neutral surfaces) ── */}
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SQUAD TOTALS</Text>
            </View>

            {/* Interactive Activity Graph: Swipeable Entire Cards (Card 0: Steps, Card 1: Distance) */}
            <ScrollView
              ref={chartScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              scrollEventThrottle={16}
              onMomentumScrollEnd={(e) => {
                const cardW = SCREEN_W - 32;
                const page = Math.round(e.nativeEvent.contentOffset.x / (cardW || 1));
                if (page !== squadChartPage) {
                  setSquadChartPage(page);
                  setSquadChartMetric(page === 0 ? 'steps' : 'distance');
                  setSquadActiveTooltip(null);
                  Haptics.selectionAsync().catch(() => {});
                }
              }}
              contentContainerStyle={{ width: (SCREEN_W - 32) * 2 }}
            >
              {/* ── CARD 0: ENTIRELY SEPARATE SQUAD STEPS CARD ── */}
              <View style={{ width: SCREEN_W - 32, paddingRight: 6 }}>
                <View style={[styles.squadChartCard, { width: '100%', backgroundColor: colors.surfaceElevated, borderWidth: 0, paddingHorizontal: 16, paddingBottom: 16, marginBottom: 0 }]}>
                  {/* Header with Title and Daily vs Weekly Toggle */}
                  <View style={styles.chartHeaderRow}>
                    <View style={{ flex: 1, paddingRight: 8, justifyContent: 'center' }}>
                      <Text style={[styles.chartCardTitle, { color: colors.text }]} numberOfLines={1}>
                        Squad Steps
                      </Text>
                      <Text style={[styles.chartCardSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
                        {squadTimeScope === 'daily'
                          ? `${formatWeekRange(weekDates[0], weekDates[6])} · ${weekLabel}`
                          : 'Last 3 Months · 12 Weeks'}
                      </Text>
                    </View>

                    {/* Navigation buttons and Daily/Weekly toggle in one aligned row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {/* Week navigation arrows when in Daily scope */}
                      {squadTimeScope === 'daily' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <TouchableOpacity
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              setSquadWeekOffset((prev) => prev - 1);
                              setSquadActiveTooltip(null);
                            }}
                            style={[styles.arrowNavBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderWidth: 0 }]}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="chevron-back" size={13} color={colors.text} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              if (!canGoNextWeek) return;
                              Haptics.selectionAsync().catch(() => {});
                              setSquadWeekOffset((prev) => prev + 1);
                              setSquadActiveTooltip(null);
                            }}
                            disabled={!canGoNextWeek}
                            style={[
                              styles.arrowNavBtn,
                              { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderWidth: 0 },
                              !canGoNextWeek && { opacity: 0.3 },
                            ]}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="chevron-forward" size={13} color={colors.text} />
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Daily vs Weekly scope toggle */}
                      <View style={[styles.chartMetricToggle, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderWidth: 0 }]}>
                        <TouchableOpacity
                          style={[
                            styles.chartMetricPill,
                            squadTimeScope === 'daily' && [styles.chartMetricPillActive, { backgroundColor: colors.surfaceElevated }],
                          ]}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setSquadTimeScope('daily');
                            setSquadActiveTooltip(null);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.chartMetricPillText,
                              { color: squadTimeScope === 'daily' ? colors.text : colors.textMuted },
                            ]}
                          >
                            Daily
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.chartMetricPill,
                            squadTimeScope === 'weekly' && [styles.chartMetricPillActive, { backgroundColor: colors.surfaceElevated }],
                          ]}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setSquadTimeScope('weekly');
                            setSquadActiveTooltip(null);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.chartMetricPillText,
                              { color: squadTimeScope === 'weekly' ? colors.text : colors.textMuted },
                            ]}
                          >
                            Weekly
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                {/* Stacked Legend indicator (You vs Rest of Squad) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4, gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: colors.primary }} />
                    <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textSecondary }}>You</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)' }} />
                    <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textMuted }}>Squad</Text>
                  </View>
                </View>
                  <View style={{ height: SQUAD_CHART_H, flexDirection: 'row', position: 'relative', marginTop: 4 }}>
                    <View style={{ width: SQUAD_Y_AXIS_W }} />

                    {/* Bars Area: Stacked Bars (You on bottom, Squad on top) */}
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end' }}>
                      {squadTimeScope === 'daily'
                        ? squadDailySteps.map((d, idx) => {
                            const isSelected = squadActiveTooltip?.idx === idx && squadChartPage === 0;
                            const totalRatio = Math.max(0.04, Math.min(1, d.totalSteps / (squadStepsChartMaxVal || 1)));
                            const barTotalH = SQUAD_CHART_H * totalRatio;
                            const myRatio = d.totalSteps > 0 ? d.mySteps / d.totalSteps : 0;
                            const myH = Math.max(0, barTotalH * myRatio);
                            const squadH = Math.max(0, barTotalH - myH);

                            return (
                              <TouchableOpacity
                                key={d.day}
                                style={{ flex: 1, height: SQUAD_CHART_H, justifyContent: 'flex-end', alignItems: 'center' }}
                                activeOpacity={0.72}
                                onPress={() => {
                                  Haptics.selectionAsync().catch(() => {});
                                  if (isSelected) {
                                    setSquadActiveTooltip(null);
                                  } else {
                                    setSquadActiveTooltip({
                                      idx,
                                      title: `${d.day} Steps Breakdown`,
                                      sub: `You: ${d.mySteps.toLocaleString()} · Squad: ${d.squadSteps.toLocaleString()} (Total: ${d.totalSteps.toLocaleString()})`,
                                    });
                                  }
                                }}
                              >
                                <View style={{ width: '56%', maxWidth: 22, height: barTotalH, borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' }}>
                                  {/* Top segment: squad members */}
                                  <View style={{ height: squadH, backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)' }} />
                                  {/* Bottom segment: self */}
                                  <View style={{ height: myH, backgroundColor: colors.primary }} />
                                </View>
                                {isSelected && (
                                  <View style={{ position: 'absolute', inset: 0, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 6, opacity: 0.35 }} />
                                )}
                              </TouchableOpacity>
                            );
                          })
                        : squadWeeklyData.map((w, idx) => {
                            const isSelected = squadActiveTooltip?.idx === idx && squadChartPage === 0;
                            const totalRatio = Math.max(0.04, Math.min(1, w.totalSteps / (squadStepsChartMaxVal || 1)));
                            const barTotalH = SQUAD_CHART_H * totalRatio;
                            const myRatio = w.totalSteps > 0 ? w.mySteps / w.totalSteps : 0;
                            const myH = Math.max(0, barTotalH * myRatio);
                            const squadH = Math.max(0, barTotalH - myH);

                            return (
                              <TouchableOpacity
                                key={w.label}
                                style={{ flex: 1, height: SQUAD_CHART_H, justifyContent: 'flex-end', alignItems: 'center' }}
                                activeOpacity={0.72}
                                onPress={() => {
                                  Haptics.selectionAsync().catch(() => {});
                                  if (isSelected) {
                                    setSquadActiveTooltip(null);
                                  } else {
                                    setSquadActiveTooltip({
                                      idx,
                                      title: `${w.label} Steps Breakdown`,
                                      sub: `You: ${w.mySteps.toLocaleString()} · Squad: ${w.squadSteps.toLocaleString()} (Total: ${w.totalSteps.toLocaleString()})`,
                                    });
                                  }
                                }}
                              >
                                <View style={{ width: '68%', maxWidth: 14, height: barTotalH, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' }}>
                                  <View style={{ height: squadH, backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)' }} />
                                  <View style={{ height: myH, backgroundColor: colors.primary }} />
                                </View>
                                {isSelected && (
                                  <View style={{ position: 'absolute', inset: 0, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 4, opacity: 0.35 }} />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                    </View>

                    {/* Y-Axis Gridlines Overlay */}
                    {squadStepsGridlines.map((l) => {
                      const bot = (l.value / squadStepsChartMaxVal) * SQUAD_CHART_H;
                      return (
                        <React.Fragment key={l.value}>
                          <View
                            pointerEvents="none"
                            style={{
                              position: 'absolute',
                              bottom: bot,
                              left: SQUAD_Y_AXIS_W,
                              right: 0,
                              height: 1,
                              backgroundColor: SQUAD_GRID_COLOR,
                            }}
                          />
                          <View
                            pointerEvents="none"
                            style={{
                              position: 'absolute',
                              bottom: bot - 6,
                              left: 0,
                              width: SQUAD_Y_AXIS_W - 5,
                              alignItems: 'flex-end',
                            }}
                          >
                            <Text style={{ fontSize: 8.5, fontWeight: '600', color: colors.textMuted }}>{l.label}</Text>
                          </View>
                        </React.Fragment>
                      );
                    })}

                    {/* Floating Tooltip */}
                    {squadActiveTooltip !== null && squadChartPage === 0 && (() => {
                      const itemCount = squadTimeScope === 'daily' ? 7 : 12;
                      const barW = (SCREEN_W - 32 - 32 - SQUAD_Y_AXIS_W) / itemCount;
                      const rawVal = squadTimeScope === 'daily'
                        ? squadDailySteps[squadActiveTooltip.idx]?.totalSteps || 0
                        : squadWeeklyData[squadActiveTooltip.idx]?.totalSteps || 0;
                      const barHeight = (rawVal / squadStepsChartMaxVal) * SQUAD_CHART_H;
                      const barCenterX = SQUAD_Y_AXIS_W + squadActiveTooltip.idx * barW + barW / 2;
                      const tipW = 154;
                      const tipH = 50;
                      const posLeft = Math.max(SQUAD_Y_AXIS_W, Math.min(barCenterX - tipW / 2, SCREEN_W - 32 - tipW - 16));
                      const posBottom = Math.max(8, Math.min(barHeight + 10, SQUAD_CHART_H - tipH - 4));
                      const bg = isDark ? '#f4f4f5' : '#09090b';
                      const fg = isDark ? '#09090b' : '#f4f4f5';

                      return (
                        <View
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            left: posLeft,
                            bottom: posBottom,
                            width: tipW,
                            backgroundColor: bg,
                            borderRadius: 11,
                            paddingVertical: 7,
                            paddingHorizontal: 10,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.25,
                            shadowRadius: 10,
                            elevation: 12,
                            zIndex: 999,
                          }}
                        >
                          <Text style={{ color: fg, fontWeight: '800', fontSize: 11 }}>{squadActiveTooltip.title}</Text>
                          <Text style={{ color: fg, fontSize: 9.5, opacity: 0.85, marginTop: 2 }}>{squadActiveTooltip.sub}</Text>
                        </View>
                      );
                    })()}
                  </View>

                  {/* X-axis labels (7 days or 12 weeks) */}
                  <View style={{ flexDirection: 'row', marginTop: 6 }}>
                    <View style={{ width: SQUAD_Y_AXIS_W }} />
                    {squadTimeScope === 'daily'
                      ? squadDailySteps.map((d, i) => {
                          const isSel = squadActiveTooltip?.idx === i && squadChartPage === 0;
                          return (
                            <View key={d.day} style={{ flex: 1, alignItems: 'center' }}>
                              <Text
                                style={{
                                  fontSize: 10,
                                  fontWeight: isSel ? '800' : '600',
                                  color: isSel ? colors.primary : colors.textMuted,
                                }}
                              >
                                {d.day.charAt(0)}
                              </Text>
                            </View>
                          );
                        })
                      : squadWeeklyData.map((w, i) => {
                          const isSel = squadActiveTooltip?.idx === i && squadChartPage === 0;
                          return (
                            <View key={w.label} style={{ flex: 1, alignItems: 'center' }}>
                              <Text
                                style={{
                                  fontSize: 8.5,
                                  fontWeight: isSel ? '800' : '600',
                                  color: isSel ? colors.primary : colors.textMuted,
                                }}
                              >
                                {w.label}
                              </Text>
                            </View>
                          );
                        })}
                  </View>

                  {/* Week total indicator inside Steps Card */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      marginTop: 12,
                      paddingTop: 10,
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                    }}
                  >
                    <Ionicons name="footsteps" size={13} color={colors.primary} />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>
                      {currentWeekSquadSteps.toLocaleString()}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted }}>
                      {squadTimeScope === 'daily' ? 'steps this week' : 'steps recorded'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* ── CARD 1: ENTIRELY SEPARATE SQUAD DISTANCE CARD ── */}
              <View style={{ width: SCREEN_W - 32, paddingLeft: 6 }}>
                <View style={[styles.squadChartCard, { width: '100%', backgroundColor: colors.surfaceElevated, borderWidth: 0, paddingHorizontal: 16, paddingBottom: 16, marginBottom: 0 }]}>
                  {/* Header with Title and Daily vs Weekly Toggle */}
                  <View style={styles.chartHeaderRow}>
                    <View style={{ flex: 1, paddingRight: 8, justifyContent: 'center' }}>
                      <Text style={[styles.chartCardTitle, { color: colors.text }]} numberOfLines={1}>
                        Squad Distance
                      </Text>
                      <Text style={[styles.chartCardSubtitle, { color: colors.textMuted }]}>
                        {squadTimeScope === 'daily'
                          ? `${formatWeekRange(weekDates[0], weekDates[6])} · ${weekLabel}`
                          : 'Last 3 Months · 12 Weeks'}
                      </Text>
                    </View>

                    {/* Navigation buttons and Daily/Weekly toggle in one aligned row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {/* Week navigation arrows when in Daily scope */}
                      {squadTimeScope === 'daily' && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <TouchableOpacity
                            onPress={() => {
                              Haptics.selectionAsync().catch(() => {});
                              setSquadWeekOffset((prev) => prev - 1);
                              setSquadActiveTooltip(null);
                            }}
                            style={[styles.arrowNavBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderWidth: 0 }]}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="chevron-back" size={13} color={colors.text} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => {
                              if (!canGoNextWeek) return;
                              Haptics.selectionAsync().catch(() => {});
                              setSquadWeekOffset((prev) => prev + 1);
                              setSquadActiveTooltip(null);
                            }}
                            disabled={!canGoNextWeek}
                            style={[
                              styles.arrowNavBtn,
                              { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderWidth: 0 },
                              !canGoNextWeek && { opacity: 0.3 },
                            ]}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="chevron-forward" size={13} color={colors.text} />
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Daily vs Weekly scope toggle */}
                      <View style={[styles.chartMetricToggle, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderWidth: 0 }]}>
                        <TouchableOpacity
                          style={[
                            styles.chartMetricPill,
                            squadTimeScope === 'daily' && [styles.chartMetricPillActive, { backgroundColor: colors.surfaceElevated }],
                          ]}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setSquadTimeScope('daily');
                            setSquadActiveTooltip(null);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.chartMetricPillText,
                              { color: squadTimeScope === 'daily' ? colors.text : colors.textMuted },
                            ]}
                          >
                            Daily
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.chartMetricPill,
                            squadTimeScope === 'weekly' && [styles.chartMetricPillActive, { backgroundColor: colors.surfaceElevated }],
                          ]}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setSquadTimeScope('weekly');
                            setSquadActiveTooltip(null);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.chartMetricPillText,
                              { color: squadTimeScope === 'weekly' ? colors.text : colors.textMuted },
                            ]}
                          >
                            Weekly
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                {/* Stacked Legend indicator (You vs Rest of Squad) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4, gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#3b82f6' }} />
                    <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textSecondary }}>You</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)' }} />
                    <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textMuted }}>Squad</Text>
                  </View>
                </View>

                <View style={{ height: SQUAD_CHART_H, flexDirection: 'row', position: 'relative', marginTop: 4 }}>
                  <View style={{ width: SQUAD_Y_AXIS_W }} />

                  {/* Bars Area: Stacked Bars for Distance */}
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end' }}>
                    {squadTimeScope === 'daily'
                      ? squadDailySteps.map((d, idx) => {
                          const isSelected = squadActiveTooltip?.idx === idx && squadChartPage === 1;
                          const totalRatio = Math.max(0.04, Math.min(1, d.totalDistance / (squadDistChartMaxVal || 1)));
                          const barTotalH = SQUAD_CHART_H * totalRatio;
                          const myRatio = d.totalDistance > 0 ? d.myDistance / d.totalDistance : 0;
                          const myH = Math.max(0, barTotalH * myRatio);
                          const squadH = Math.max(0, barTotalH - myH);

                          return (
                            <TouchableOpacity
                              key={d.day}
                              style={{ flex: 1, height: SQUAD_CHART_H, justifyContent: 'flex-end', alignItems: 'center' }}
                              activeOpacity={0.72}
                              onPress={() => {
                                Haptics.selectionAsync().catch(() => {});
                                if (isSelected) {
                                  setSquadActiveTooltip(null);
                                } else {
                                  setSquadActiveTooltip({
                                    idx,
                                    title: `${d.day} Distance Breakdown`,
                                    sub: `You: ${d.myDistance.toFixed(1)} km · Squad: ${d.squadDistance.toFixed(1)} km (Total: ${d.totalDistance.toFixed(1)} km)`,
                                  });
                                }
                              }}
                            >
                              <View style={{ width: '56%', maxWidth: 22, height: barTotalH, borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' }}>
                                <View style={{ height: squadH, backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)' }} />
                                <View style={{ height: myH, backgroundColor: '#3b82f6' }} />
                              </View>
                              {isSelected && (
                                <View style={{ position: 'absolute', inset: 0, borderWidth: 1.5, borderColor: '#3b82f6', borderRadius: 6, opacity: 0.35 }} />
                              )}
                            </TouchableOpacity>
                          );
                        })
                      : squadWeeklyData.map((w, idx) => {
                          const isSelected = squadActiveTooltip?.idx === idx && squadChartPage === 1;
                          const totalRatio = Math.max(0.04, Math.min(1, w.totalDistance / (squadDistChartMaxVal || 1)));
                          const barTotalH = SQUAD_CHART_H * totalRatio;
                          const myRatio = w.totalDistance > 0 ? w.myDistance / w.totalDistance : 0;
                          const myH = Math.max(0, barTotalH * myRatio);
                          const squadH = Math.max(0, barTotalH - myH);

                          return (
                            <TouchableOpacity
                              key={w.label}
                              style={{ flex: 1, height: SQUAD_CHART_H, justifyContent: 'flex-end', alignItems: 'center' }}
                              activeOpacity={0.72}
                              onPress={() => {
                                Haptics.selectionAsync().catch(() => {});
                                if (isSelected) {
                                  setSquadActiveTooltip(null);
                                } else {
                                  setSquadActiveTooltip({
                                    idx,
                                    title: `${w.label} Distance Breakdown`,
                                    sub: `You: ${w.myDistance.toFixed(1)} km · Squad: ${w.squadDistance.toFixed(1)} km (Total: ${w.totalDistance.toFixed(1)} km)`,
                                  });
                                }
                              }}
                            >
                              <View style={{ width: '68%', maxWidth: 14, height: barTotalH, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' }}>
                                <View style={{ height: squadH, backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.18)' }} />
                                <View style={{ height: myH, backgroundColor: '#3b82f6' }} />
                              </View>
                              {isSelected && (
                                <View style={{ position: 'absolute', inset: 0, borderWidth: 1.5, borderColor: '#3b82f6', borderRadius: 4, opacity: 0.35 }} />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                  </View>

                  {/* Y-Axis Gridlines Overlay for Distance */}
                  {squadDistGridlines.map((l) => {
                    const bot = (l.value / squadDistChartMaxVal) * SQUAD_CHART_H;
                    return (
                      <React.Fragment key={l.value}>
                        <View
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            bottom: bot,
                            left: SQUAD_Y_AXIS_W,
                            right: 0,
                            height: 1,
                            backgroundColor: SQUAD_GRID_COLOR,
                          }}
                        />
                        <View
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            bottom: bot - 6,
                            left: 0,
                            width: SQUAD_Y_AXIS_W - 5,
                            alignItems: 'flex-end',
                          }}
                        >
                          <Text style={{ fontSize: 8.5, fontWeight: '600', color: colors.textMuted }}>{l.label}</Text>
                        </View>
                      </React.Fragment>
                    );
                  })}

                  {/* Floating Tooltip for Distance */}
                  {squadActiveTooltip !== null && squadChartPage === 1 && (() => {
                    const itemCount = squadTimeScope === 'daily' ? 7 : 12;
                    const barW = (SCREEN_W - 32 - 32 - SQUAD_Y_AXIS_W) / itemCount;
                    const rawVal = squadTimeScope === 'daily'
                      ? squadDailySteps[squadActiveTooltip.idx]?.totalDistance || 0
                      : squadWeeklyData[squadActiveTooltip.idx]?.totalDistance || 0;
                    const barHeight = (rawVal / squadDistChartMaxVal) * SQUAD_CHART_H;
                    const barCenterX = SQUAD_Y_AXIS_W + squadActiveTooltip.idx * barW + barW / 2;
                    const tipW = 154;
                    const tipH = 50;
                    const posLeft = Math.max(SQUAD_Y_AXIS_W, Math.min(barCenterX - tipW / 2, SCREEN_W - 32 - tipW - 16));
                    const posBottom = Math.max(8, Math.min(barHeight + 10, SQUAD_CHART_H - tipH - 4));
                    const bg = isDark ? '#f4f4f5' : '#09090b';
                    const fg = isDark ? '#09090b' : '#f4f4f5';

                    return (
                      <View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          left: posLeft,
                          bottom: posBottom,
                          width: tipW,
                          backgroundColor: bg,
                          borderRadius: 11,
                          paddingVertical: 7,
                          paddingHorizontal: 10,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.25,
                          shadowRadius: 10,
                          elevation: 12,
                          zIndex: 999,
                        }}
                      >
                        <Text style={{ color: fg, fontWeight: '800', fontSize: 11 }}>{squadActiveTooltip.title}</Text>
                        <Text style={{ color: fg, fontSize: 9.5, opacity: 0.85, marginTop: 2 }}>{squadActiveTooltip.sub}</Text>
                      </View>
                    );
                  })()}
                </View>

                {/* X-axis labels for Distance */}
                <View style={{ flexDirection: 'row', marginTop: 6 }}>
                  <View style={{ width: SQUAD_Y_AXIS_W }} />
                  {squadTimeScope === 'daily'
                    ? squadDailySteps.map((d, i) => {
                        const isSel = squadActiveTooltip?.idx === i && squadChartPage === 1;
                        return (
                          <View key={d.day} style={{ flex: 1, alignItems: 'center' }}>
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: isSel ? '800' : '600',
                                color: isSel ? '#3b82f6' : colors.textMuted,
                              }}
                            >
                              {d.day.charAt(0)}
                            </Text>
                          </View>
                        );
                      })
                    : squadWeeklyData.map((w, i) => {
                        const isSel = squadActiveTooltip?.idx === i && squadChartPage === 1;
                        return (
                          <View key={w.label} style={{ flex: 1, alignItems: 'center' }}>
                            <Text
                              style={{
                                fontSize: 8.5,
                                fontWeight: isSel ? '800' : '600',
                                color: isSel ? '#3b82f6' : colors.textMuted,
                              }}
                            >
                              {w.label}
                            </Text>
                          </View>
                        );
                      })}
                </View>

                {/* Week total indicator inside Distance Card */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    marginTop: 12,
                    paddingTop: 10,
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  }}
                >
                  <Ionicons name="navigate" size={13} color="#3b82f6" />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text }}>
                    {currentWeekSquadDistance.toFixed(1)} km
                  </Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted }}>
                    {squadTimeScope === 'daily' ? 'distance this week' : 'distance recorded'}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

            {/* Pagination dots (matching friends tab style) */}
            <View style={[styles.retroDotsRow, { marginTop: 12, marginBottom: 16 }]}>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  chartScrollRef.current?.scrollTo({ x: 0, animated: true });
                  setSquadChartPage(0);
                  setSquadChartMetric('steps');
                  setSquadActiveTooltip(null);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View
                  style={[
                    styles.retroDot,
                    squadChartPage === 0
                      ? [styles.retroDotActive, { backgroundColor: colors.text }]
                      : { backgroundColor: colors.border },
                  ]}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  chartScrollRef.current?.scrollTo({ x: SCREEN_W - 32, animated: true });
                  setSquadChartPage(1);
                  setSquadChartMetric('distance');
                  setSquadActiveTooltip(null);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View
                  style={[
                    styles.retroDot,
                    squadChartPage === 1
                      ? [styles.retroDotActive, { backgroundColor: colors.text }]
                      : { backgroundColor: colors.border },
                  ]}
                />
              </TouchableOpacity>
            </View>

            {/* ── NEXT GRADE PROGRESSION CARD (With Animated Bar & Circular Progress Indicator) ── */}
            <View style={[styles.gradeProgressCard, { backgroundColor: colors.surfaceElevated, borderWidth: 0 }]}>
              <View style={styles.gradeProgressHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.nextGradeLabel, { color: colors.textMuted }]}>NEXT GOAL</Text>
                  <Text style={[styles.stepsNeededMainText, { color: colors.text }]}>
                    {nextGradeTier
                      ? `${totalStepsNeededForSquad.toLocaleString()} squad steps needed`
                      : 'Legendary Tier Achieved'}
                  </Text>
                  {nextGradeTier && (
                    <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '500' }}>
                      ~{stepsNeededPerMember.toLocaleString()} steps / member needed
                    </Text>
                  )}
                </View>
              </View>

              {nextGradeTier && (
                <View style={styles.gradeProgressBarContainer}>
                  <View style={[styles.gradeProgressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                    <Animated.View
                      style={[
                        styles.gradeProgressFill,
                        {
                          backgroundColor: nextGradeTier.color,
                          width: tierProgressAnim.interpolate({
                            inputRange: [0, 100],
                            outputRange: ['0%', '100%'],
                          }),
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.gradeProgressLabelsRow}>
                    <Text style={[styles.tierRangeLabel, { color: colors.textMuted }]}>
                      {totalSteps.toLocaleString()} squad steps
                    </Text>
                    <Text style={[styles.tierRangeLabel, { color: nextGradeTier.color, fontWeight: '700' }]}>
                      {nextGradeTier.threshold.toLocaleString()} goal ({nextGradeTier.grade})
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* ── SQUAD LEADERBOARD & MEMBERS SEARCH ── */}
            <View style={[styles.sectionHeaderRow, { marginTop: 22, marginBottom: 10 }]}>
              <View>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>LEADERBOARD</Text>
                <Text style={[styles.hintSubtext, { color: colors.textMuted }]}>
                  Ranked by weekly steps
                </Text>
              </View>
            </View>

            {/* In-place Leaderboard Search Input — formatted identically to Friends search bar */}
            <View
              style={[
                styles.memberSearchContainer,
                { backgroundColor: colors.surfaceElevated, borderWidth: 0, marginBottom: 12 },
              ]}
            >
              <Ionicons name="search" size={17} color={colors.textMuted} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.memberSearchInput, { color: colors.text }]}
                placeholder="Search squad runners by name or handle..."
                placeholderTextColor={colors.textMuted}
                value={memberSearchQuery}
                onChangeText={setMemberSearchQuery}
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              {memberSearchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setMemberSearchQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 28 }} />
            ) : (
              <View style={[styles.rosterCard, { backgroundColor: colors.surfaceElevated, borderWidth: 0 }]}>
                {filteredMembers.length === 0 ? (
                  <View style={{ padding: 28, alignItems: 'center', gap: 6 }}>
                    <Ionicons name="search-outline" size={24} color={colors.textMuted} />
                    <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>
                      {memberSearchQuery.trim()
                        ? `No members match "${memberSearchQuery}"`
                        : 'No squad members found'}
                    </Text>
                  </View>
                ) : (
                  filteredMembers.map((member, index) => {
                    // True leaderboard position from the full sorted members list
                    const originalRank = members.findIndex((m) => m.username.toLowerCase() === member.username.toLowerCase()) + 1;
                    const rank = originalRank > 0 ? originalRank : index + 1;
                    const maxSteps = members[0]?.weeklySteps || 1;
                    const ratio = Math.max(8, Math.round((member.weeklySteps / maxSteps) * 100));
                    const isSent = requestsSent.has(member.username);

                    const badgeColor =
                      rank === 1 ? '#f59e0b' : rank === 2 ? '#94a3b8' : rank === 3 ? '#ca8a04' : colors.textMuted;

                    return (
                      <View key={member.username}>
                        {index > 0 && <View style={[styles.dividerLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]} />}
                        <TouchableOpacity
                          style={styles.memberCardRow}
                          onPress={() => handleOpenMemberProfile(member)}
                          onLongPress={() => {
                            if (!member.isSelf) {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                              setFriendActionTargetMember(member);
                            }
                          }}
                          delayLongPress={300}
                          activeOpacity={0.7}
                        >
                          {/* Rank Position */}
                          <View style={styles.rankPositionWrap}>
                            {rank <= 3 ? (
                              <Ionicons
                                name={rank === 1 ? 'trophy' : 'medal'}
                                size={rank === 1 ? 19 : 16}
                                color={badgeColor}
                              />
                            ) : (
                              <Text style={[styles.rankNumberText, { color: colors.textMuted }]}>#{rank}</Text>
                            )}
                          </View>

                          {/* Member Avatar */}
                          <View
                            style={[
                              styles.avatarCircle,
                              {
                                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                                borderWidth: 0,
                              },
                            ]}
                          >
                            {member.avatarUrl ? (
                              <Image source={{ uri: member.avatarUrl }} style={styles.avatarImg} />
                            ) : (
                              <Text style={[styles.avatarInitial, { color: member.avatarColor }]}>
                                {(member.displayName || member.username)[0].toUpperCase()}
                              </Text>
                            )}
                            {member.isWalkingNow && (
                              <View style={[styles.onlineBadge, { borderColor: colors.surfaceElevated }]}>
                                {!!member.currentActivity && (
                                  <Ionicons
                                    name="footsteps"
                                    size={7.5}
                                    color={isDark ? '#09090b' : '#ffffff'}
                                  />
                                )}
                              </View>
                            )}
                          </View>

                          {/* Member Identity & Comparison Bar */}
                          <View style={styles.memberInfoCol}>
                            <View style={styles.memberNameLine}>
                              <Text style={[styles.memberNameText, { color: colors.text }]} numberOfLines={1}>
                                {member.displayName || member.username}
                              </Text>
                              {member.isSelf && (
                                <View style={[styles.youPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderWidth: 0 }]}>
                                  <Text style={[styles.youPillText, { color: colors.textSecondary }]}>YOU</Text>
                                </View>
                              )}
                            </View>
                            <Text style={[styles.memberHandleText, { color: colors.textMuted }]}>
                              @{member.username.toLowerCase()}
                            </Text>

                            {/* Mini Comparison Bar */}
                            <View style={[styles.miniBarTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                              <View
                                style={[
                                  styles.miniBarFill,
                                  {
                                    backgroundColor: rank === 1 ? '#f59e0b' : member.avatarColor,
                                    width: `${ratio}%` as any,
                                  },
                                ]}
                              />
                            </View>
                          </View>

                          {/* Steps */}
                          <View style={styles.memberRightActionCol}>
                            <Text style={[styles.memberStepsValue, { color: rank === 1 ? '#f59e0b' : colors.text }]}>
                              {member.weeklySteps >= 10000
                                ? `${(member.weeklySteps / 1000).toFixed(1)}k`
                                : member.weeklySteps.toLocaleString()}
                            </Text>
                            <Text style={[styles.memberStepsLabel, { color: colors.textMuted }]}>steps</Text>
                          </View>
                        </TouchableOpacity>

                        {/* Secondary metrics (distance & workouts) */}
                        <View style={styles.secondaryMetaRow}>
                          <Ionicons name="map-outline" size={11} color={colors.textMuted} />
                          <Text style={[styles.secondaryMetaText, { color: colors.textMuted }]}>
                            {member.totalDistance.toFixed(1)} km
                          </Text>
                          <Text style={[styles.secondaryMetaDot, { color: colors.border }]}>•</Text>
                          <Ionicons name="footsteps-outline" size={11} color={colors.textMuted} />
                          <Text style={[styles.secondaryMetaText, { color: colors.textMuted }]}>
                            {member.totalWorkouts} walks
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </ScrollView>
          ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scrollContent, { paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingBottom: 110 }]}
          >
            {/* Top row with Back button on left, centered rating badge / ring */}
            <View style={{ width: '100%', position: 'relative', alignItems: 'center', marginBottom: 16 }}>
              {/* Back button pinned to top-left */}
              <TouchableOpacity
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  zIndex: 10,
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: colors.surfaceElevated,
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSquadActiveTab('overview');
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-back" size={20} color={colors.text} />
              </TouchableOpacity>

              {/* 1. TOP MIDDLE: Rating badge / ring, squad name, and description */}
              <CircularProgressRing
                size={64}
                strokeWidth={5.5}
                strokeLinecap="butt"
                progressPercent={gradeProgressPct}
                activeColor={currentGrade.color}
                gradientToColor={nextGradeTier ? nextGradeTier.color : currentGrade.color}
                trackColor={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}
              >
                <View style={[styles.gradeBadgeCircle, { backgroundColor: colors.surfaceElevated, borderWidth: 0, width: 44, height: 44, borderRadius: 22 }]}>
                  <Text style={[styles.gradeBadgeText, { color: currentGrade.color, fontSize: 19, fontWeight: '900' }]}>
                    {currentGrade.grade}
                  </Text>
                </View>
              </CircularProgressRing>

              {/* Club name below rating */}
              <Text style={{ fontFamily: SERIF_FONT, fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center', letterSpacing: -0.4, marginTop: 10, paddingHorizontal: 24 }}>
                {squad.name}
              </Text>
              {/* Squad description below name */}
              {!!squad.description && (
                <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 4, lineHeight: 18, paddingHorizontal: 20 }}>
                  {squad.description}
                </Text>
              )}
            </View>

            {/* 2. ACTION BUTTONS: Add Member, Report, Leave Squad sharing space with icon on top and text below */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              {canAddMember && (
                <TouchableOpacity
                  style={{
                    flex: 1,
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 12,
                    paddingHorizontal: 4,
                    borderRadius: 14,
                    backgroundColor: colors.surfaceElevated,
                    gap: 5,
                  }}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    onAddMember(squad);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-add-outline" size={19} color={colors.text} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'center' }} numberOfLines={1}>
                    Add Member
                  </Text>
                </TouchableOpacity>
              )}

              {/* Report button between Add and Leave */}
              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 12,
                  paddingHorizontal: 4,
                  borderRadius: 14,
                  backgroundColor: colors.surfaceElevated,
                  gap: 5,
                }}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setShowReportSquadModal(true);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="flag-outline" size={19} color={colors.text} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'center' }} numberOfLines={1}>
                  Report
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 12,
                  paddingHorizontal: 4,
                  borderRadius: 14,
                  backgroundColor: colors.surfaceElevated,
                  gap: 5,
                }}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setShowLeaveConfirmModal(true);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="log-out-outline" size={19} color={colors.text} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text, textAlign: 'center' }} numberOfLines={1}>
                  Leave Squad
                </Text>
              </TouchableOpacity>
            </View>

            {/* 3. CUMULATIVE STATS: 3 equal buttons/cards taking up the space below, no 'ALL TIME' tag */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <View style={{ flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', gap: 4 }}>
                <Ionicons name="footsteps" size={16} color={colors.primary} />
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }} numberOfLines={1}>
                  {cumulativeSteps >= 1000 ? `${(cumulativeSteps / 1000).toFixed(1)}k` : cumulativeSteps.toLocaleString()}
                </Text>
                <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' }} numberOfLines={1}>
                  Total Steps
                </Text>
              </View>

              <View style={{ flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', gap: 4 }}>
                <Ionicons name="navigate" size={16} color="#3b82f6" />
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }} numberOfLines={1}>
                  {cumulativeDistance.toFixed(1)} km
                </Text>
                <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' }} numberOfLines={1}>
                  Total Dist
                </Text>
              </View>

              <View style={{ flex: 1, backgroundColor: colors.surfaceElevated, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', gap: 4 }}>
                <Ionicons name="fitness" size={16} color="#10b981" />
                <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text }} numberOfLines={1}>
                  {cumulativeWorkouts}
                </Text>
                <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase' }} numberOfLines={1}>
                  Total Walks
                </Text>
              </View>
            </View>

            {/* 4. SQUAD MEMBERS CAROUSEL: Matching community.tsx friends viewer exactly (3-on-one) */}
            {(() => {
              const carouselMembers = members;
              const memberPages: MemberStat[][] = [];
              for (let i = 0; i < carouselMembers.length; i += 3) {
                memberPages.push(carouselMembers.slice(i, i + 3));
              }

              const numPages = memberPages.length;
              const formatStepsCount = (st: number) => {
                if (st >= 1000) return `${(st / 1000).toFixed(1)}k`;
                return st.toString();
              };

              const MORE_PAGE_WIDTH = SCREEN_W - 32;

              return (
                <View style={[styles.retroFriendsWrapper, { marginTop: 4, marginBottom: 16 }]}>
                  <FlatList
                    data={memberPages}
                    keyExtractor={(_, index) => `squad_member_page_${index}`}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    snapToInterval={MORE_PAGE_WIDTH}
                    snapToAlignment="start"
                    onMomentumScrollEnd={(e) => {
                      const p = Math.round(e.nativeEvent.contentOffset.x / MORE_PAGE_WIDTH);
                      setMoreMemberPageIndex(p);
                    }}
                    renderItem={({ item: pageItems }) => (
                      <View style={[styles.friendsPageContainer, { width: MORE_PAGE_WIDTH, paddingHorizontal: 0 }]}>
                        {pageItems.map((m) => {
                          const stepsCount = m.dailySteps || Math.round(m.weeklySteps / 7) || 0;
                          return (
                            <TouchableOpacity
                              key={m.username}
                              style={styles.retroFriendItem}
                              onPress={() => {
                                handleOpenMemberProfile(m);
                              }}
                              activeOpacity={0.8}
                            >
                              {/* Circular Avatar with status dot (green pin badge if active) */}
                              <View
                                style={[
                                  styles.retroAvatarContainer,
                                  { backgroundColor: m.avatarColor || '#3f3f46' },
                                ]}
                              >
                                {m.avatarUrl ? (
                                  <Image source={{ uri: m.avatarUrl }} style={styles.friendAvatarImage} />
                                ) : (
                                  <Text style={styles.retroAvatarLetter}>
                                    {(m.displayName || m.username).charAt(0).toUpperCase()}
                                  </Text>
                                )}
                                {m.isWalkingNow && (
                                  <View
                                    style={[
                                      styles.retroPinBadge,
                                      {
                                        borderColor: colors.background,
                                      },
                                    ]}
                                  >
                                    {!!m.currentActivity && (
                                      <Ionicons
                                        name="footsteps"
                                        size={7.5}
                                        color={isDark ? '#09090b' : '#ffffff'}
                                      />
                                    )}
                                  </View>
                                )}
                              </View>

                              {/* Username lowercase only */}
                              <Text style={[styles.retroFriendName, { color: colors.text, fontWeight: '800' }]} numberOfLines={1}>
                                {m.username.toLowerCase()}
                              </Text>

                              {/* Tiny cursor icon on same line with daily steps */}
                              <View style={styles.friendStepsRow}>
                                <Ionicons
                                  name="navigate"
                                  size={11}
                                  color={m.avatarColor}
                                  style={styles.cursorIconRotated}
                                />
                                <Text style={[styles.friendStepsText, { color: colors.textMuted, fontWeight: '700' }]} numberOfLines={1}>
                                  {formatStepsCount(stepsCount)} steps today
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}

                        {/* Spacer if fewer than 3 on last page */}
                        {pageItems.length < 3 &&
                          Array.from({ length: 3 - pageItems.length }).map((_, spacerIdx) => (
                            <View key={`more_spacer_${spacerIdx}`} style={styles.retroFriendItem} />
                          ))}
                      </View>
                    )}
                  />

                  {/* Indicator dots */}
                  {numPages > 1 && (
                    <View style={styles.retroDotsRow}>
                      {memberPages.map((_, i) => {
                        const isActive = i === moreMemberPageIndex;
                        return (
                          <View
                            key={`more_dot_${i}`}
                            style={[
                              styles.retroDot,
                              isActive
                                ? [styles.retroDotActive, { backgroundColor: colors.text }]
                                : { backgroundColor: colors.border },
                            ]}
                          />
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })()}

            {/* 5. WEEKLY GRADE TIMELINE: Newest week on right (chronological left to right) */}
            <View style={[styles.historyGraphCard, { backgroundColor: colors.surfaceElevated, borderColor: 'transparent', borderWidth: 0, marginTop: 4, paddingTop: 14 }]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.historyGraphScroll}
              >
                {squadHistoryWeeks.map((item, idx) => {
                  const isSelected = selectedHistoryWeekIdx === idx;
                  const maxStepsInGraph = Math.max(...squadHistoryWeeks.map((w) => w.steps), 10000);
                  const barHeight = Math.max(24, Math.min(108, Math.round((item.steps / maxStepsInGraph) * 108)));
                  const gradId = `histGrad_${idx}_${item.gradeInfo.grade.replace(/\+/g, 'plus')}`;

                  const currentTierIndex = GRADE_THRESHOLDS.findIndex((g) => g.grade === item.gradeInfo.grade);
                  const isUpperTier = currentTierIndex >= 4;
                  const baseBlendColor = isUpperTier ? '#3b82f6' : '#ef4444';

                  const isNewestLive = idx === squadHistoryWeeks.length - 1;
                  const displayWeekLabel = isNewestLive ? 'LIVE' : item.weekLabel.replace('Week ', 'W');

                  return (
                    <TouchableOpacity
                      key={idx}
                      activeOpacity={0.75}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setSelectedHistoryWeekIdx(idx);
                      }}
                      style={[
                        styles.historyBarCol,
                        isSelected && { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
                      ]}
                    >
                      {/* Grade text at top of bar */}
                      <Text
                        style={[
                          styles.historyBarGradeText,
                          { color: item.gradeInfo.color, fontWeight: isSelected ? '900' : '700' },
                        ]}
                      >
                        {item.gradeInfo.grade}
                      </Text>

                      {/* Bar Container with vertical gradient blending */}
                      <View style={styles.historyBarTrack}>
                        <Svg width={22} height={barHeight} style={{ borderRadius: 6, overflow: 'hidden' }}>
                          <Defs>
                            <SvgGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
                              <SvgStop offset="0%" stopColor={item.gradeInfo.color} stopOpacity="1" />
                              <SvgStop offset="100%" stopColor={baseBlendColor} stopOpacity="0.45" />
                            </SvgGradient>
                          </Defs>
                          <Rect x="0" y="0" width="22" height={barHeight} fill={`url(#${gradId})`} rx="6" ry="6" />
                        </Svg>
                      </View>

                      {/* Week label */}
                      <Text
                        style={[
                          styles.historyBarWeekLabel,
                          {
                            color: isSelected ? colors.text : colors.textMuted,
                            fontWeight: isSelected ? '800' : '500',
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {displayWeekLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* 6. DETAILS CARD FOR SELECTED WEEK */}
            {(() => {
              const selWeek = squadHistoryWeeks[selectedHistoryWeekIdx] || squadHistoryWeeks[squadHistoryWeeks.length - 1];
              const isSelectedLive = selectedHistoryWeekIdx === squadHistoryWeeks.length - 1;
              return (
                <View style={[styles.historyRowCard, { backgroundColor: colors.surfaceElevated, borderColor: 'transparent', borderWidth: 0, marginTop: 12, flexDirection: 'column', alignItems: 'stretch', padding: 14 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={[styles.historyMiniBadge, { backgroundColor: colors.surface, borderColor: selWeek.gradeInfo.color }]}>
                        <Text style={[styles.historyMiniBadgeText, { color: selWeek.gradeInfo.color }]}>{selWeek.gradeInfo.grade}</Text>
                      </View>
                      <View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.historyWeekTitle, { color: colors.text }]}>{selWeek.weekLabel}</Text>
                          {isSelectedLive && (
                            <View style={[styles.currentPill, { backgroundColor: colors.primary }]}>
                              <Text style={[styles.currentPillText, { color: isDark ? '#09090b' : '#ffffff' }]}>LIVE</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>{selWeek.dateRange}</Text>
                      </View>
                    </View>

                    {/* Tier badge */}
                    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.surface }}>
                      <Text style={[styles.historyTierLabel, { color: selWeek.gradeInfo.color }]}>{selWeek.gradeInfo.label}</Text>
                    </View>
                  </View>

                  {/* Stacked stats info */}
                  <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', paddingTop: 8, gap: 3 }}>
                    <Text style={[styles.historyWeekSteps, { color: colors.textSecondary }]}>
                      Avg steps: <Text style={{ color: colors.text, fontWeight: '700' }}>{selWeek.steps.toLocaleString()}</Text> steps / member
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted, lineHeight: 16 }}>
                      {selWeek.gradeInfo.desc}
                    </Text>
                  </View>
                </View>
              );
            })()}
          </ScrollView>
          )}
        </Animated.View>

        {/* ── MEMBER FULL PROFILE MODAL (All profile elements carried over) ── */}
        <InteractiveBottomModal
          visible={!!selectedFriendForProfile}
          onDismiss={() => {
            setSelectedFriendForProfile(null);
            setSelectedMemberBadge(null);
          }}
          handleColor={colors.border}
          cardStyle={[
            styles.modalSheetCard,
            { backgroundColor: colors.surface, borderColor: colors.border, height: '82%', maxHeight: '90%' },
          ]}
        >
          {selectedFriendForProfile && (
            <View style={{ flex: 1, justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                {/* Header */}
                <View style={styles.detailFriendHeader}>
                  <View style={[styles.detailAvatar, { backgroundColor: selectedFriendForProfile.avatarColor, position: 'relative' }]}>
                    {selectedFriendForProfile.avatarUrl ? (
                      <Image source={{ uri: selectedFriendForProfile.avatarUrl }} style={styles.detailAvatarImage} />
                    ) : (
                      <Text style={styles.detailAvatarLetter}>
                        {selectedFriendForProfile.username.charAt(0).toUpperCase()}
                      </Text>
                    )}
                    {selectedFriendForProfile.isWalkingNow && (
                      <View style={[styles.onlineBadge, { borderColor: colors.surface }]}>
                        {!!selectedFriendForProfile.currentActivity && (
                          <Ionicons
                            name="footsteps"
                            size={7.5}
                            color={isDark ? '#09090b' : '#ffffff'}
                          />
                        )}
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={[styles.detailName, { color: colors.text }]}>
                      {selectedFriendForProfile.displayName || selectedFriendForProfile.username}
                    </Text>
                    <Text style={[styles.detailHandle, { color: colors.textMuted }]}>
                      @{selectedFriendForProfile.username}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <Ionicons name="navigate" size={11} color={selectedFriendForProfile.avatarColor} style={styles.cursorIconRotated} />
                      <Text style={[styles.detailActive, { color: colors.textMuted }]}>
                        {(selectedFriendForProfile.dailySteps || 4200).toLocaleString()} daily steps • Active {selectedFriendForProfile.lastActive}
                      </Text>
                    </View>
                  </View>
                  {selectedFriendForProfile.username.toLowerCase() !== myUsername.toLowerCase() && (
                    <TouchableOpacity
                      style={[styles.detailRemoveBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                      onPress={() => handleRemoveFriendAction(selectedFriendForProfile)}
                    >
                      <Ionicons name="person-remove-outline" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Stats Bar */}
                <View style={[styles.profileStatsBar, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <View style={styles.profileStatCol}>
                    <Text style={[styles.profileStatVal, { color: colors.text }]}>
                      {(selectedFriendForProfile.weeklySteps / 1000).toFixed(1)}k
                    </Text>
                    <Text style={[styles.profileStatLabel, { color: colors.textMuted }]}>WEEKLY STEPS</Text>
                  </View>
                  <View style={[styles.profileStatDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.profileStatCol}>
                    <Text style={[styles.profileStatVal, { color: colors.text }]}>
                      {selectedFriendForProfile.totalWorkouts}
                    </Text>
                    <Text style={[styles.profileStatLabel, { color: colors.textMuted }]}>WORKOUTS</Text>
                  </View>
                  <View style={[styles.profileStatDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.profileStatCol}>
                    <Text style={[styles.profileStatVal, { color: colors.text }]}>
                      {Math.round((selectedFriendForProfile.dailySteps || 0) * 0.045)}
                    </Text>
                    <Text style={[styles.profileStatLabel, { color: colors.textMuted }]}>EST. KCAL</Text>
                  </View>
                </View>

                {/* Profile Sub-tabs: Activity | Badges | Cursor */}
                <View style={[styles.subTabBarContainer, { backgroundColor: isDark ? '#000000' : '#ffffff', borderBottomColor: isDark ? '#1f1f24' : '#e5e5ea' }]}>
                  <TouchableOpacity
                    style={styles.subTabBtn}
                    onPress={() => switchMemberSubTab('activity')}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.subTabText,
                        {
                          color: memberSubTab === 'activity' ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#71717a' : '#9ca3af'),
                          fontWeight: memberSubTab === 'activity' ? '800' : '600',
                        },
                      ]}
                    >
                      activity
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.subTabBtn}
                    onPress={() => switchMemberSubTab('badges')}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.subTabText,
                        {
                          color: memberSubTab === 'badges' ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#71717a' : '#9ca3af'),
                          fontWeight: memberSubTab === 'badges' ? '800' : '600',
                        },
                      ]}
                    >
                      badges
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.subTabBtn}
                    onPress={() => switchMemberSubTab('cursor')}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.subTabText,
                        {
                          color: memberSubTab === 'cursor' ? (isDark ? '#ffffff' : '#000000') : (isDark ? '#71717a' : '#9ca3af'),
                          fontWeight: memberSubTab === 'cursor' ? '800' : '600',
                        },
                      ]}
                    >
                      cursor
                    </Text>
                  </TouchableOpacity>

                  {/* Animated active underline line identical to profile tab */}
                  <Animated.View
                    style={[
                      styles.subTabHighlightLine,
                      {
                        backgroundColor: isDark ? '#ffffff' : '#000000',
                        left: memberTabAnim.interpolate({
                          inputRange: [0, 1, 2],
                          outputRange: ['0%', '33.33%', '66.66%'],
                        }),
                        width: '33.33%',
                      },
                    ]}
                  />
                </View>

                {/* Scrollable Sub-tab Content */}
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 24 }}
                  style={{ flex: 1 }}
                >
                  {memberSubTab === 'activity' ? (
                    <View style={styles.memberActivityChartsContainer}>
                      {/* Daily Steps Graph (exact same as analytics/activity page) */}
                      <WeeklyBarChart
                        userId={selectedFriendForProfile.username}
                        stepsGoal={8000}
                        distanceGoal={5}
                        metricMode="steps"
                        distanceUnit="mi"
                        weekOffset={memberWeekOffset}
                        onWeekOffsetChange={setMemberWeekOffset}
                        selectedDate={memberSelectedDate}
                        onDaySelect={setMemberSelectedDate}
                        hideGoalLine={true}
                      />

                      {/* Daily Distance Graph (exact same as analytics/activity page) */}
                      <WeeklyBarChart
                        userId={selectedFriendForProfile.username}
                        stepsGoal={8000}
                        distanceGoal={5}
                        metricMode="distance"
                        distanceUnit="mi"
                        weekOffset={memberWeekOffset}
                        onWeekOffsetChange={setMemberWeekOffset}
                        selectedDate={memberSelectedDate}
                        onDaySelect={setMemberSelectedDate}
                        hideGoalLine={true}
                      />
                    </View>
                  ) : memberSubTab === 'badges' ? (
                    <View style={styles.badgesSectionContainer}>
                      {/* Badges Header Summary */}
                      <View style={[styles.badgesSummaryBanner, { backgroundColor: isDark ? '#0d0d10' : '#f8f8fb', borderColor: isDark ? '#232328' : '#e8e8ed' }]}>
                        <View style={styles.badgesSummaryCol}>
                          <Text style={[styles.badgesSummaryNum, { color: TIER_METALLIC.gold.base }]}>
                            {memberBadges.filter((b) => b.currentTier === 'gold').length}
                          </Text>
                          <Text style={[styles.badgesSummaryLabel, { color: colors.textMuted }]}>GOLD</Text>
                        </View>
                        <View style={[styles.badgesSummaryDivider, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]} />
                        <View style={styles.badgesSummaryCol}>
                          <Text style={[styles.badgesSummaryNum, { color: TIER_METALLIC.silver.base }]}>
                            {memberBadges.filter((b) => b.currentTier === 'silver').length}
                          </Text>
                          <Text style={[styles.badgesSummaryLabel, { color: colors.textMuted }]}>SILVER</Text>
                        </View>
                        <View style={[styles.badgesSummaryDivider, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]} />
                        <View style={styles.badgesSummaryCol}>
                          <Text style={[styles.badgesSummaryNum, { color: TIER_METALLIC.bronze.base }]}>
                            {memberBadges.filter((b) => b.currentTier === 'bronze').length}
                          </Text>
                          <Text style={[styles.badgesSummaryLabel, { color: colors.textMuted }]}>BRONZE</Text>
                        </View>
                      </View>

                      {/* Badges Grid with 3D Physics */}
                      <View style={styles.badgesGrid}>
                        {memberBadges.map((badge) => (
                          <InteractiveBadge
                            key={badge.id}
                            badge={badge}
                            isDark={isDark}
                            onPress={() => setSelectedMemberBadge(badge)}
                          />
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={{ paddingTop: 8 }}>
                      {/* Map Cursor color palette */}
                      <Text style={[styles.profilePaletteTitle, { color: colors.text }]}>Map Cursor Color</Text>
                      <Text style={[styles.profilePaletteDesc, { color: colors.textMuted }]}>
                        Pick a radar cursor & trail color for this companion on your map.
                      </Text>
                      <View style={styles.paletteGrid}>
                        {FRIEND_CURSOR_PALETTE.map((color) => {
                          const isSelected = selectedFriendForProfile.avatarColor === color;
                          return (
                            <TouchableOpacity
                              key={color}
                              style={[styles.paletteSwatch, { backgroundColor: color }, isSelected && styles.paletteSwatchSelected]}
                              onPress={() => handleSelectColor(selectedFriendForProfile, color)}
                              activeOpacity={0.8}
                            >
                              {isSelected && <Ionicons name="checkmark" size={18} color="#ffffff" />}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </ScrollView>
              </View>

              <TouchableOpacity
                style={[styles.colorDoneBtn, { backgroundColor: colors.primary, marginTop: 10 }]}
                onPress={() => {
                  setSelectedFriendForProfile(null);
                  setSelectedMemberBadge(null);
                }}
              >
                <Text style={[styles.colorDoneBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </InteractiveBottomModal>

        {/* ── MEMBER BADGE DETAIL POPUP BOTTOM SHEET ── */}
        <InteractiveBottomModal
          visible={!!selectedMemberBadge}
          onDismiss={() => setSelectedMemberBadge(null)}
          handleColor={isDark ? '#3f3f46' : '#d4d4d8'}
          cardStyle={[
            styles.badgeDetailCard,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: selectedMemberBadge?.currentTier
                ? TIER_METALLIC[selectedMemberBadge.currentTier].border
                : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            },
          ]}
        >
          {selectedMemberBadge && (() => {
            const tierInfo = selectedMemberBadge.currentTier
              ? TIER_METALLIC[selectedMemberBadge.currentTier]
              : null;
            return (
              <View style={styles.badgeDetailContent}>
                <View
                  style={[
                    styles.badgeDetailIconCircle,
                    {
                      backgroundColor: tierInfo ? tierInfo.base : isDark ? '#27272a' : '#e4e4e7',
                      borderColor: tierInfo ? tierInfo.glow : isDark ? '#3f3f46' : '#d4d4d8',
                    },
                  ]}
                >
                  <Ionicons
                    name={selectedMemberBadge.icon as any}
                    size={42}
                    color={tierInfo ? '#ffffff' : colors.textMuted}
                  />
                </View>

                <Text style={[styles.badgeDetailTitle, { color: colors.text }]}>
                  {selectedMemberBadge.title}
                </Text>

                {tierInfo ? (
                  <View style={[styles.badgeDetailTierPill, { backgroundColor: `${tierInfo.base}22`, borderColor: tierInfo.border }]}>
                    <Text style={[styles.badgeDetailTierText, { color: tierInfo.glow }]}>
                      {selectedMemberBadge.currentTier?.toUpperCase()} TIER
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.badgeDetailTierPill, { backgroundColor: isDark ? '#27272a' : '#f4f4f5', borderColor: colors.border }]}>
                    <Text style={[styles.badgeDetailTierText, { color: colors.textMuted }]}>
                      LOCKED
                    </Text>
                  </View>
                )}

                <Text style={[styles.badgeDetailDesc, { color: colors.textSecondary }]}>
                  {selectedMemberBadge.description}
                </Text>

                <View style={[styles.badgeProgressBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <View style={styles.badgeProgressHeader}>
                    <Text style={[styles.badgeProgressLabel, { color: colors.textMuted }]}>
                      PROGRESS TO NEXT TIER
                    </Text>
                    <Text style={[styles.badgeProgressPct, { color: colors.text }]}>
                      {selectedMemberBadge.progressPercent}%
                    </Text>
                  </View>
                  <View style={[styles.badgeProgressTrack, { backgroundColor: isDark ? '#27272a' : '#e4e4e7' }]}>
                    <View
                      style={[
                        styles.badgeProgressBar,
                        {
                          backgroundColor: tierInfo ? tierInfo.base : colors.primary,
                          width: `${selectedMemberBadge.progressPercent}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.badgeProgressValueText, { color: colors.textMuted }]}>
                    {selectedMemberBadge.currentValue.toLocaleString()} / {selectedMemberBadge.nextTierTarget.toLocaleString()} {selectedMemberBadge.unit}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.badgeDetailCloseBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setSelectedMemberBadge(null)}
                >
                  <Text style={[styles.badgeDetailCloseText, { color: isDark ? '#09090b' : '#ffffff' }]}>
                    Close
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })()}
        </InteractiveBottomModal>



        {/* ── MEMBER LONG-PRESS FRIEND / PROFILE ACTION SHEET ── */}
        <InteractiveBottomModal
          visible={!!friendActionTargetMember}
          onDismiss={() => setFriendActionTargetMember(null)}
          handleColor={colors.border}
          cardStyle={[
            styles.modalSheetCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          {friendActionTargetMember && (
            <View style={styles.friendActionSheetContainer}>
              {/* Member Avatar & Identity */}
              <View style={styles.friendActionHeader}>
                <View
                  style={[
                    styles.avatarCircle,
                    {
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  {friendActionTargetMember.avatarUrl ? (
                    <Image source={{ uri: friendActionTargetMember.avatarUrl }} style={styles.avatarImg} />
                  ) : (
                    <Text style={[styles.avatarInitial, { fontSize: 20, color: friendActionTargetMember.avatarColor }]}>
                      {(friendActionTargetMember.displayName || friendActionTargetMember.username)[0].toUpperCase()}
                    </Text>
                  )}
                  {friendActionTargetMember.isWalkingNow && (
                    <View style={[styles.onlineBadge, { borderColor: colors.surfaceElevated }]}>
                      {!!friendActionTargetMember.currentActivity && (
                        <Ionicons
                          name="footsteps"
                          size={7.5}
                          color={isDark ? '#09090b' : '#ffffff'}
                        />
                      )}
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.friendActionName, { color: colors.text }]}>
                    {friendActionTargetMember.displayName || friendActionTargetMember.username}
                  </Text>
                  <Text style={[styles.friendActionHandle, { color: colors.textMuted }]}>
                    @{friendActionTargetMember.username.toLowerCase()} · {friendActionTargetMember.weeklySteps.toLocaleString()} steps
                  </Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.friendActionButtonsCol}>
                {!friendActionTargetMember.isFriend ? (
                  <TouchableOpacity
                    style={[styles.friendActionPrimaryBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      const member = friendActionTargetMember;
                      setFriendActionTargetMember(null);
                      if (!requestsSent.has(member.username)) {
                        handleAddFriend(member);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={requestsSent.has(friendActionTargetMember.username) ? 'checkmark-circle' : 'person-add'}
                      size={18}
                      color={isDark ? '#09090b' : '#ffffff'}
                    />
                    <Text style={[styles.friendActionPrimaryText, { color: isDark ? '#09090b' : '#ffffff' }]}>
                      {requestsSent.has(friendActionTargetMember.username) ? 'Friend Request Sent' : 'Add as Friend'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.alreadyFriendBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                    <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                    <Text style={[styles.alreadyFriendText, { color: colors.textSecondary }]}>Already in your friends list</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.friendActionSecondaryBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                  onPress={() => {
                    const member = friendActionTargetMember;
                    setFriendActionTargetMember(null);
                    setTimeout(() => {
                      handleOpenMemberProfile(member);
                    }, 280);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-outline" size={17} color={colors.text} />
                  <Text style={[styles.friendActionSecondaryText, { color: colors.text }]}>View Full Profile</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.friendActionCancelBtn, { borderColor: colors.border }]}
                  onPress={() => setFriendActionTargetMember(null)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.friendActionCancelText, { color: colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </InteractiveBottomModal>
        <InteractiveBottomModal
          visible={showLeaveConfirmModal}
          onDismiss={() => setShowLeaveConfirmModal(false)}
          handleColor={colors.border}
          cardStyle={[
            styles.modalSheetCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.confirmLeaveContainer}>
            <View style={[styles.confirmLeaveIconWrap, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderWidth: 1 }]}>
              <Ionicons name="exit-outline" size={28} color={colors.text} />
            </View>

            <Text style={[styles.confirmLeaveTitle, { color: colors.text }]}>Leave Squad?</Text>
            <Text style={[styles.confirmLeaveDesc, { color: colors.textMuted }]}>
              Are you sure you want to leave <Text style={{ color: colors.text, fontWeight: '700' }}>{squad.name}</Text>?
              {'\n'}Your step contributions and weekly rankings will be removed from this squad.
            </Text>

            <View style={styles.confirmLeaveBtnRow}>
              <TouchableOpacity
                style={[
                  styles.confirmLeaveCancelBtn,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                ]}
                onPress={() => setShowLeaveConfirmModal(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.confirmLeaveCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmLeaveDestructiveBtn,
                  { backgroundColor: isDark ? '#27272a' : '#18181b', borderColor: colors.border, borderWidth: 1 },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  setShowLeaveConfirmModal(false);
                  setShowMembersSheet(false);
                  onLeave(squad);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="exit-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.confirmLeaveDestructiveText}>Leave Squad</Text>
              </TouchableOpacity>
            </View>
          </View>
        </InteractiveBottomModal>

        {/* In-app Report Squad Modal */}
        <InteractiveBottomModal
          visible={showReportSquadModal}
          onDismiss={() => {
            setShowReportSquadModal(false);
            setReportSubmitted(false);
            setReportReason('');
          }}
          handleColor={colors.border}
          cardStyle={[
            styles.modalSheetCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.confirmLeaveContainer}>
            <View style={[styles.confirmLeaveIconWrap, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, borderWidth: 1 }]}>
              <Ionicons name="flag-outline" size={28} color={colors.text} />
            </View>

            {reportSubmitted ? (
              <>
                <Text style={[styles.confirmLeaveTitle, { color: colors.text }]}>Report Received</Text>
                <Text style={[styles.confirmLeaveDesc, { color: colors.textMuted }]}>
                  Thank you for helping keep the community safe. Our team will review this squad within 24 hours.
                </Text>
                <TouchableOpacity
                  style={[
                    styles.confirmLeaveCancelBtn,
                    { backgroundColor: colors.surfaceElevated, borderColor: colors.border, width: '100%', marginTop: 8 },
                  ]}
                  onPress={() => {
                    setShowReportSquadModal(false);
                    setReportSubmitted(false);
                    setReportReason('');
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.confirmLeaveCancelText, { color: colors.text }]}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.confirmLeaveTitle, { color: colors.text }]}>Report Squad</Text>
                <Text style={[styles.confirmLeaveDesc, { color: colors.textMuted }]}>
                  Report <Text style={{ color: colors.text, fontWeight: '700' }}>{squad.name}</Text> for inappropriate content or community guidelines violations.
                </Text>

                <View style={{ width: '100%', gap: 8, marginBottom: 18 }}>
                  {['Inappropriate name or description', 'Harassment or spam', 'Other violation'].map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={{
                        paddingVertical: 12,
                        paddingHorizontal: 14,
                        borderRadius: 12,
                        backgroundColor: reportReason === opt ? (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)') : colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: reportReason === opt ? colors.primary : colors.border,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setReportReason(opt);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{opt}</Text>
                      {reportReason === opt && <Ionicons name="checkmark" size={17} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.confirmLeaveBtnRow}>
                  <TouchableOpacity
                    style={[
                      styles.confirmLeaveCancelBtn,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                    ]}
                    onPress={() => {
                      setShowReportSquadModal(false);
                      setReportReason('');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.confirmLeaveCancelText, { color: colors.text }]}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.confirmLeaveDestructiveBtn,
                      {
                        backgroundColor: isDark ? '#27272a' : '#18181b',
                        borderColor: colors.border,
                        borderWidth: 1,
                        opacity: reportReason ? 1 : 0.5,
                      },
                    ]}
                    disabled={!reportReason}
                    onPress={() => {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                      setReportSubmitted(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.confirmLeaveDestructiveText}>Submit Report</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </InteractiveBottomModal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullPageContainer: {
    flex: 1,
  },
  animatedWrapper: {
    flex: 1,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  roundNavBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitleCenter: {
    flex: 1,
  },
  squadBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  squadIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitleText: {
    fontFamily: SERIF_FONT,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    flex: 1,
  },
  navSubtitleText: {
    fontSize: 12,
    marginTop: 2,
  },
  headerOnlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  headerOnlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#22c55e',
  },
  navActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerOptionsTriggerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerOptionsSelectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerBlackActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#09090b',
    borderWidth: 1,
    borderColor: '#27272a',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 18,
  },
  headerBlackActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.2,
  },
  headerBlackCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: '#27272a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedActionStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 3,
    gap: 4,
    marginBottom: 4,
  },
  stripLongRectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 12,
    borderRadius: 11,
    borderWidth: 1,
  },
  stripAddBtn: {},
  stripLeaveBtn: {},
  stripBtnText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  gradeHeroCard: {
    borderRadius: 20,
    borderWidth: 0,
    padding: 16,
    marginBottom: 16,
  },
  gradeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
  },
  gradeOverline: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  gradeTierTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  gradeDesc: {
    fontSize: 12,
    marginTop: 3,
    maxWidth: 210,
  },
  gradeBadgeCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroRankRingWrapper: {
    width: 74,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroRankRingBg: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 3.5,
  },
  heroRankRingFill: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 3.5,
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  gradeBadgeText: {
    fontFamily: SERIF_FONT,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  gradeFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginTop: 4,
  },
  avgStepsNote: {
    fontSize: 11.5,
  },
  viewHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  viewHistoryBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  hintSubtext: {
    fontSize: 11,
  },
  memberCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  memberCountPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statsHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  statsMetricCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  metricNumber: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  metricLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  metricDivider: {
    width: 1,
    height: 38,
    marginHorizontal: 4,
  },
  goalProgressCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginTop: 12,
  },
  goalTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  goalTitleText: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  goalSubtitleText: {
    fontSize: 11.5,
    marginTop: 2,
  },
  goalPctText: {
    fontSize: 15,
    fontWeight: '800',
  },
  goalTrack: {
    height: 9,
    borderRadius: 5,
    overflow: 'hidden',
  },
  goalBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  rosterCard: {
    borderRadius: 18,
    borderWidth: 0,
    overflow: 'hidden',
  },
  dividerLine: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  memberCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 14,
    gap: 10,
  },
  rankPositionWrap: {
    width: 24,
    alignItems: 'center',
  },
  rankNumberText: {
    fontSize: 12,
    fontWeight: '700',
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 17,
    fontWeight: '800',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInfoCol: {
    flex: 1,
    gap: 3,
  },
  memberNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberNameText: {
    fontSize: 14,
    fontWeight: '700',
  },
  youPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  youPillText: {
    fontSize: 9,
    fontWeight: '800',
  },
  memberHandleText: {
    fontSize: 11.5,
  },
  miniBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  memberRightActionCol: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  memberStepsValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  memberStepsLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  addFriendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 5,
  },
  addFriendBtnText: {
    fontSize: 10,
    fontWeight: '800',
  },
  secondaryMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingLeft: 14 + 24 + 42 + 20,
    marginTop: 2,
  },
  secondaryMetaText: {
    fontSize: 11,
    fontWeight: '600',
  },
  secondaryMetaDot: {
    fontSize: 11,
    marginHorizontal: 2,
  },
  modalSheetCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 22,
    paddingBottom: Platform.OS === 'ios' ? 44 : 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  historyModalContent: {
    paddingBottom: 8,
  },
  historyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  historyIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyModalHeading: {
    fontFamily: SERIF_FONT,
    fontSize: 20,
    fontWeight: '700',
  },
  historyModalSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  historyGraphCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 8,
  },
  historyGraphHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  historyGraphTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  historyGraphSubtitle: {
    fontSize: 11,
  },
  historyGraphScroll: {
    paddingHorizontal: 4,
    gap: 8,
    alignItems: 'flex-end',
    height: 154,
    paddingBottom: 4,
  },
  historyBarCol: {
    alignItems: 'center',
    width: 38,
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRadius: 10,
  },
  historyBarGradeText: {
    fontSize: 11,
    marginBottom: 4,
  },
  historyBarTrack: {
    height: 108,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  historyBarWeekLabel: {
    fontSize: 10,
    marginTop: 6,
  },
  historySelectedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
  },
  historyRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  historyRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  historyMiniBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyMiniBadgeText: {
    fontSize: 15,
    fontWeight: '800',
  },
  historyWeekTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  historyWeekSteps: {
    fontSize: 11.5,
    marginTop: 2,
  },
  currentPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  currentPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  historyTierLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  historyCloseBtn: {
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyCloseBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  detailFriendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  detailAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailAvatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  detailAvatarLetter: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
  },
  detailName: {
    fontFamily: SERIF_FONT,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  detailHandle: {
    fontSize: 12,
    marginTop: 1,
  },
  detailActive: {
    fontSize: 11.5,
  },
  detailRemoveBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileStatsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
  },
  profileStatCol: {
    alignItems: 'center',
  },
  profileStatVal: {
    fontSize: 16,
    fontWeight: '800',
  },
  profileStatLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  profileStatDivider: {
    width: 1,
    height: 24,
  },
  cardStatColorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePaletteTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 3,
  },
  profilePaletteDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  paletteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  paletteSwatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paletteSwatchSelected: {
    borderWidth: 2.5,
    borderColor: '#ffffff',
  },
  colorDoneBtn: {
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDoneBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  // Squad Cumulative Chart styles
  squadChartCard: {
    borderRadius: 20,
    borderWidth: 0,
    padding: 16,
    marginBottom: 12,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  chartCardTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  chartCardSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  chartMetricToggle: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  chartMetricPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 11,
  },
  chartMetricPillActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  chartMetricPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chartTooltipWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  chartTooltipTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  chartTooltipSub: {
    fontSize: 12,
    fontWeight: '800',
  },
  chartOuterRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 140,
    paddingTop: 8,
  },
  chartYAxis: {
    height: '100%',
    width: 38,
    justifyContent: 'space-between',
    paddingBottom: 22,
    alignItems: 'flex-start',
  },
  chartYAxisLabel: {
    fontSize: 9.5,
    fontWeight: '600',
  },
  chartMainContainer: {
    flex: 1,
    height: '100%',
    position: 'relative',
    justifyContent: 'flex-end',
  },
  chartGridLines: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    bottom: 24,
    justifyContent: 'space-between',
  },
  chartGridLine: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.5,
    width: '100%',
  },
  chartBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: '100%',
    paddingHorizontal: 4,
  },
  chartBarCol: {
    alignItems: 'center',
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  chartBarTrack: {
    flex: 1,
    width: 22,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 4,
  },
  chartBarFill: {
    width: '100%',
    borderRadius: 6,
    minHeight: 6,
  },
  chartDayLabel: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  // Next Grade Progression Card Styles
  gradeProgressCard: {
    borderRadius: 20,
    borderWidth: 0,
    padding: 18,
    marginBottom: 12,
  },
  gradeProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  nextGradeLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  nextGradePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  nextGradePillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  stepsNeededMainText: {
    fontFamily: SERIF_FONT,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 4,
  },
  stepsNeededSubText: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  nextGradeIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextGradeIconText: {
    fontFamily: SERIF_FONT,
    fontSize: 20,
    fontWeight: '800',
  },
  gradeProgressBarContainer: {
    marginTop: 14,
  },
  gradeProgressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  gradeProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  gradeProgressLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  tierRangeLabel: {
    fontSize: 11,
  },
  // Member Search and Friends-Style Carousel Styles
  retroMemberSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 21,
    borderWidth: 0,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  searchIconStyle: {
    marginRight: 8,
  },
  retroMemberSearchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0,
  },
  emptyMembersWrap: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  emptyMembersText: {
    fontSize: 13,
    fontWeight: '500',
  },
  retroFriendsWrapper: {
    marginBottom: 16,
  },
  friendsPageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  retroFriendItem: {
    width: 88,
    alignItems: 'center',
  },
  retroAvatarContainer: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 6,
  },
  friendAvatarImage: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  retroAvatarLetter: {
    fontSize: 22,
    fontWeight: '800',
    color: '#09090b',
  },
  retroPinBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retroFriendName: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 2,
    maxWidth: 86,
  },
  friendStepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    justifyContent: 'center',
  },
  friendStepsText: {
    fontSize: 10,
  },
  cursorIconRotated: {
    transform: [{ rotate: '-45deg' }],
  },
  retroDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  retroDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  retroDotActive: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  arrowNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    position: 'relative',
    borderBottomWidth: 1,
    marginBottom: 14,
  },
  subTabBtn: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  subTabText: {
    fontSize: 14,
    letterSpacing: -0.2,
    textTransform: 'lowercase',
  },
  subTabHighlightLine: {
    position: 'absolute',
    bottom: -1,
    height: 3,
    borderRadius: 1.5,
    zIndex: 5,
  },
  badgesSectionContainer: {
    paddingTop: 4,
  },
  badgesSummaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  badgesSummaryCol: {
    alignItems: 'center',
  },
  badgesSummaryNum: {
    fontSize: 18,
    fontWeight: '800',
  },
  badgesSummaryLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  badgesSummaryDivider: {
    width: 1,
    height: 24,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  badgeDetailCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 44 : 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  badgeDetailContent: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  badgeDetailIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  badgeDetailTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  badgeDetailTierPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  badgeDetailTierText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  badgeDetailDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
    paddingHorizontal: 12,
  },
  badgeProgressBox: {
    width: '100%',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
  },
  badgeProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeProgressLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgeProgressPct: {
    fontSize: 12,
    fontWeight: '800',
  },
  badgeProgressTrack: {
    height: 7,
    borderRadius: 3.5,
    overflow: 'hidden',
    marginBottom: 6,
  },
  badgeProgressBar: {
    height: '100%',
    borderRadius: 3.5,
  },
  badgeProgressValueText: {
    fontSize: 11,
    textAlign: 'right',
  },
  badgeDetailCloseBtn: {
    width: '100%',
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDetailCloseText: {
    fontSize: 15,
    fontWeight: '800',
  },
  // Members Bottom Sheet Styles
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitleText: {
    fontFamily: SERIF_FONT,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sheetSubtitleText: {
    fontSize: 12.5,
    marginTop: 2,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  membersActionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  membersActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  membersActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  membersLeaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  membersLeaveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef4444',
  },
  memberSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    borderRadius: 21,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  memberSearchInput: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '500',
    paddingVertical: 0,
  },
  memberListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  memberListItemTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberListAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  memberListAvatarImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  memberListAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#09090b',
  },
  memberLiveWalkingDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
    borderWidth: 2,
  },
  memberListName: {
    fontSize: 14,
    fontWeight: '700',
  },
  memberListHandle: {
    fontSize: 11.5,
    marginTop: 2,
  },
  youBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  youBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  friendStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  friendStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  memberAddFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  memberAddFriendBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  // In-app Leave Squad Confirmation Dialog Styles
  confirmLeaveContainer: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  confirmLeaveIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  confirmLeaveTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  confirmLeaveDesc: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  confirmLeaveBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  confirmLeaveCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmLeaveCancelText: {
    fontSize: 14,
    fontWeight: '700',
  },
  confirmLeaveDestructiveBtn: {
    flex: 1.2,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#18181b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmLeaveDestructiveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  headerActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  friendPillInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  friendPillInlineText: {
    fontSize: 10,
    fontWeight: '700',
  },
  // Member long-press friend action sheet styles
  friendActionSheetContainer: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  friendActionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  friendActionName: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 3,
  },
  friendActionHandle: {
    fontSize: 13,
    fontWeight: '500',
  },
  friendActionButtonsCol: {
    gap: 10,
  },
  friendActionPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
  },
  friendActionPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
  },
  alreadyFriendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
  },
  alreadyFriendText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  friendActionSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
  },
  friendActionSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
  },
  friendActionCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  friendActionCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Public Profile Activity Stats Cards Styles
  memberActivityChartsContainer: {
    paddingTop: 6,
    gap: 14,
  },
  memberActivityStatsContainer: {
    paddingTop: 4,
  },
  publicStatCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  publicStatCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  publicStatCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  publicStatDesc: {
    fontSize: 11.5,
    lineHeight: 16,
    marginBottom: 12,
  },
  publicStatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  publicGridTile: {
    width: '48%',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  publicGridVal: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 3,
  },
  publicGridLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  publicConsistencyVal: {
    fontSize: 14,
    fontWeight: '700',
  },
  publicConsistencySub: {
    fontSize: 11,
    marginTop: 2,
  },
  publicStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  publicStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  publicStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  gradeTotalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginVertical: 10,
  },
  gradeTotalStatCol: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  gradeTotalStatVal: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  gradeTotalStatLbl: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  gradeTotalDivider: {
    width: 1,
    height: 28,
  },
  circularProgressContainer: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  circularProgressRingBg: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
  },
  circularProgressRingFill: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
  },
});

