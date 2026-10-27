import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Modal,
  Alert,
  Platform,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/constants/AuthContext';
import { SERIF_FONT, useTheme } from '@/constants/ThemeContext';
import { DraggableSheetHandle } from '@/components/DraggableSheetHandle';
import { InteractiveBottomModal } from '@/components/InteractiveBottomModal';
import {
  SocialGroup,
  SquadType,
  loadGroups,
  createGroup,
  addMemberToGroup,
  leaveOrDeleteGroup,
  getOrCreateMyUsername,
} from '@/constants/socialEngine';
import { SquadDetailScreen, calculateSquadGrade } from '@/components/SquadDetailScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SQUADS_PAGE_WIDTH = SCREEN_WIDTH - 32;

export default function SquadsScreen() {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [groups, setGroups] = useState<SocialGroup[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [myUsername, setMyUsername] = useState<string>('');
  const [squadsPageIndex, setSquadsPageIndex] = useState<number>(0);

  // Create squad modal
  const [showCreateGroupModal, setShowCreateGroupModal] = useState<boolean>(false);
  const [groupNameInput, setGroupNameInput] = useState<string>('');
  const [groupDescInput, setGroupDescInput] = useState<string>('');
  const [selectedSquadType, setSelectedSquadType] = useState<SquadType>('open_invite');

  // Add member modal
  const [selectedGroupForMember, setSelectedGroupForMember] = useState<SocialGroup | null>(null);
  const [memberInput, setMemberInput] = useState<string>('');

  // Squad detail full page modal
  const [viewingSquad, setViewingSquad] = useState<SocialGroup | null>(null);

  const userId = user?.id || 'guest_user';

  const loadData = useCallback(async () => {
    try {
      const uName = await getOrCreateMyUsername(userId, user?.name);
      setMyUsername(uName);
      const g = await loadGroups(userId);
      setGroups(g);
    } catch (e) {
      console.warn('Failed loading squads:', e);
    }
  }, [userId, user?.name]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleCreateGroup = async () => {
    if (!groupNameInput.trim()) {
      Alert.alert('Squad Name Required', 'Please enter a name for your squad.');
      return;
    }
    try {
      await createGroup(
        userId,
        groupNameInput,
        groupDescInput,
        undefined,
        selectedSquadType
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setShowCreateGroupModal(false);
      setGroupNameInput('');
      setGroupDescInput('');
      setSelectedSquadType('open_invite');
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not create squad.');
    }
  };

  const handleAddMemberToGroup = async () => {
    if (!selectedGroupForMember || !memberInput.trim()) return;
    try {
      await addMemberToGroup(userId, selectedGroupForMember.id, memberInput);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setSelectedGroupForMember(null);
      setMemberInput('');
      loadData();
    } catch (e: any) {
      Alert.alert('Cannot Add Member', e.message || 'Could not add member.');
    }
  };

  const handleDeleteGroup = (group: SocialGroup) => {
    Alert.alert('Leave Squad', `Are you sure you want to leave ${group.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await leaveOrDeleteGroup(userId, group.id);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          loadData();
        },
      },
    ]);
  };

  const filteredGroups = groups.filter((g) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.name.toLowerCase().includes(q) ||
      g.description.toLowerCase().includes(q) ||
      g.memberUsernames.some((u) => u.toLowerCase().includes(q))
    );
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filteredGroups}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View>
            {/* Retro Header styled identically to other tabs */}
            <View style={[styles.retroHeader, { paddingTop: Platform.OS === 'ios' ? 76 : 48 }]}>
              <Text style={[styles.retroScreenTitle, { color: colors.text }]}>Squads</Text>
              <TouchableOpacity
                style={[styles.retroCreateBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setShowCreateGroupModal(true);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={16} color={isDark ? '#09090b' : '#ffffff'} />
                <Text style={[styles.retroCreateBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>New Squad</Text>
              </TouchableOpacity>
            </View>

            {/* Pill Search Bar */}
            <View style={[styles.retroSearchContainer, { backgroundColor: colors.surfaceElevated }]}>
              <Ionicons name="search" size={17} color={colors.textMuted} style={styles.retroSearchIcon} />
              <TextInput
                style={[styles.retroSearchInput, { color: colors.text }]}
                placeholder="Search squads or members"
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>

            {/* Section heading for squad cards */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 10 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.8, color: colors.textMuted }}>
                SQUADS ({filteredGroups.length})
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const memberCount = Math.max(1, item.memberUsernames.length);
          const totalSquadSteps = Math.round(memberCount * 42500);
          const gradeInfo = calculateSquadGrade(totalSquadSteps, memberCount);
          const isAdminOnly = item.squadType === 'admin_only';
          const isCreator = item.createdById === userId;

          return (
            <TouchableOpacity
              style={[styles.cardContainer, { backgroundColor: colors.surfaceElevated, borderWidth: 0 }]}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setViewingSquad(item);
              }}
              activeOpacity={0.88}
            >
              <View style={styles.cardHeaderRow}>
                {/* Grade Badge - clean solid with no low-contrast tinted background */}
                <View style={[styles.cardGradeBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', borderColor: gradeInfo.color }]}>
                  <Text style={[styles.cardGradeText, { color: gradeInfo.color }]}>
                    {gradeInfo.grade}
                  </Text>
                </View>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{item.name}</Text>
                    {/* Squad Permission Type Pill - Admin only, no Open pill */}
                    {isAdminOnly && (
                      <View
                        style={[
                          styles.squadTypeTag,
                          {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                            borderWidth: 0,
                          },
                        ]}
                      >
                        <Ionicons
                          name="lock-closed"
                          size={10}
                          color="#ef4444"
                        />
                        <Text
                          style={[
                            styles.squadTypeTagText,
                            { color: '#ef4444' },
                          ]}
                        >
                          ADMIN
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.cardDesc, { color: colors.textMuted }]} numberOfLines={2}>
                    {item.description}
                  </Text>
                </View>
              </View>

              {/* Group Stats Bar - Clean neutral */}
              <View style={[styles.cardStatsBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderWidth: 0 }]}>
                <View style={styles.cardStatCol}>
                  <Text style={[styles.cardStatVal, { color: colors.text }]}>{memberCount}</Text>
                  <Text style={[styles.cardStatLabel, { color: colors.textMuted }]}>MEMBERS</Text>
                </View>
                <View style={[styles.cardStatDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]} />
                <View style={styles.cardStatCol}>
                  <Text style={[styles.cardStatVal, { color: colors.text }]}>{totalSquadSteps.toLocaleString()}</Text>
                  <Text style={[styles.cardStatLabel, { color: colors.textMuted }]}>SQUAD STEPS</Text>
                </View>
                <View style={[styles.cardStatDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]} />
                <View style={styles.cardStatCol}>
                  <Text style={[styles.cardStatVal, { color: gradeInfo.color }]}>{gradeInfo.grade}</Text>
                  <Text style={[styles.cardStatLabel, { color: colors.textMuted }]}>RATING</Text>
                </View>
              </View>

              {/* Members List - Neutral surfaces without clashing green-on-green */}
              <View style={styles.membersContainer}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                  {item.memberUsernames.map((u) => {
                    const isSelf = u === myUsername;
                    const isGroupAdmin = item.createdById === userId && isSelf;
                    return (
                      <View
                        key={u}
                        style={[
                          styles.memberBadgePill,
                          {
                            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                            borderWidth: 0,
                          },
                        ]}
                      >
                        {isGroupAdmin && (
                          <Ionicons name="star" size={10} color={colors.textSecondary} style={{ marginRight: 3 }} />
                        )}
                        <Text style={[styles.memberBadgeText, { color: isSelf ? colors.text : colors.textMuted }]}>
                          @{u} {isSelf && '(You)'}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* CREATE SQUAD MODAL */}
      <InteractiveBottomModal
        visible={showCreateGroupModal}
        onDismiss={() => setShowCreateGroupModal(false)}
        handleColor={colors.border}
        cardStyle={[styles.modalSheetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
            <Text style={[styles.modalSheetHeading, { color: colors.text }]}>Create Walking Squad</Text>
            <Text style={[styles.modalSheetSubtext, { color: colors.textMuted }]}>
              Form a squad, invite companions, and compare step leaderboards.
            </Text>

            {/* Squad Type Selection */}
            <Text style={[styles.fieldLabel, { color: colors.textMuted, marginTop: 4 }]}>SQUAD ACCESS & INVITATIONS</Text>
            <View style={styles.typeOptionContainer}>
              {/* Option 1: Admin Only */}
              <TouchableOpacity
                style={[
                  styles.typeOptionCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  selectedSquadType === 'admin_only' && {
                    borderColor: colors.primary,
                    backgroundColor: `${colors.primary}12`,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSelectedSquadType('admin_only');
                }}
                activeOpacity={0.8}
              >
                <View style={styles.typeOptionHeader}>
                  <View style={[styles.typeIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                    <Ionicons name="lock-closed" size={16} color="#ef4444" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.typeOptionTitle, { color: colors.text }]}>Admin Only</Text>
                    <Text style={[styles.typeOptionDesc, { color: colors.textMuted }]}>
                      You are the only admin and can curate members. Other members cannot invite anyone.
                    </Text>
                  </View>
                  <Ionicons
                    name={selectedSquadType === 'admin_only' ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={selectedSquadType === 'admin_only' ? colors.primary : colors.textMuted}
                  />
                </View>
              </TouchableOpacity>

              {/* Option 2: Open Invite */}
              <TouchableOpacity
                style={[
                  styles.typeOptionCard,
                  { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
                  selectedSquadType === 'open_invite' && {
                    borderColor: colors.primary,
                    backgroundColor: `${colors.primary}12`,
                  },
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setSelectedSquadType('open_invite');
                }}
                activeOpacity={0.8}
              >
                <View style={styles.typeOptionHeader}>
                  <View style={[styles.typeIconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                    <Ionicons name="people" size={16} color="#3b82f6" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.typeOptionTitle, { color: colors.text }]}>Open Invite</Text>
                    <Text style={[styles.typeOptionDesc, { color: colors.textMuted }]}>
                      Anyone in the squad can add anyone else as long as they are already a member.
                    </Text>
                  </View>
                  <Ionicons
                    name={selectedSquadType === 'open_invite' ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={selectedSquadType === 'open_invite' ? colors.primary : colors.textMuted}
                  />
                </View>
              </TouchableOpacity>
            </View>

            {/* Inputs */}
            <View style={[styles.modalInputWrapper, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, marginTop: 12 }]}>
              <Ionicons name="flag" size={18} color={colors.primary} />
              <TextInput
                style={[styles.modalInputText, { color: colors.text, marginLeft: 8 }]}
                placeholder="Squad Name (e.g. Sunset Loopers)"
                placeholderTextColor={colors.textMuted}
                value={groupNameInput}
                onChangeText={setGroupNameInput}
              />
            </View>

            <View style={[styles.modalInputWrapper, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, height: 64, alignItems: 'flex-start', paddingTop: 10, marginTop: 10 }]}>
              <TextInput
                style={[styles.modalInputText, { color: colors.text, height: '100%' }]}
                placeholder="Squad Goal (e.g. 50k weekly steps together)"
                placeholderTextColor={colors.textMuted}
                value={groupDescInput}
                onChangeText={setGroupDescInput}
                multiline
              />
            </View>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalDismissBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                onPress={() => setShowCreateGroupModal(false)}
              >
                <Text style={[styles.modalDismissText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleCreateGroup}
              >
                <Ionicons name="checkmark-circle" size={16} color={isDark ? '#09090b' : '#ffffff'} />
                <Text style={[styles.modalPrimaryBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Create Squad</Text>
              </TouchableOpacity>
            </View>
        </ScrollView>
      </InteractiveBottomModal>

      {/* ADD MEMBER MODAL */}
      <InteractiveBottomModal
        visible={!!selectedGroupForMember}
        onDismiss={() => setSelectedGroupForMember(null)}
        handleColor={colors.border}
        cardStyle={[styles.modalSheetCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
            <Text style={[styles.modalSheetHeading, { color: colors.text }]}>
              Add to {selectedGroupForMember?.name}
            </Text>
            <Text style={[styles.modalSheetSubtext, { color: colors.textMuted }]}>
              {selectedGroupForMember?.squadType === 'admin_only'
                ? 'As the squad admin, invite a friend to join.'
                : 'Invite any friend to join this squad.'}
            </Text>

            <View style={[styles.modalInputWrapper, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
              <Text style={[styles.inputPrefix, { color: colors.primary }]}>@</Text>
              <TextInput
                style={[styles.modalInputText, { color: colors.text }]}
                placeholder="friend_username"
                placeholderTextColor={colors.textMuted}
                value={memberInput}
                onChangeText={(t) => setMemberInput(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity
                style={[styles.modalDismissBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
                onPress={() => setSelectedGroupForMember(null)}
              >
                <Text style={[styles.modalDismissText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalPrimaryBtn, { backgroundColor: colors.primary }]}
                onPress={handleAddMemberToGroup}
              >
                <Text style={[styles.modalPrimaryBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Add Member</Text>
              </TouchableOpacity>
            </View>
      </InteractiveBottomModal>

      {/* SQUAD DETAIL FULL-PAGE SLIDE-UP */}
      {!!viewingSquad && (
        <SquadDetailScreen
          visible={!!viewingSquad}
          squad={viewingSquad}
          userId={userId}
          myUsername={myUsername}
          onClose={() => setViewingSquad(null)}
          onAddMember={(squad) => {
            setViewingSquad(null);
            setSelectedGroupForMember(squad);
          }}
          onLeave={async (squad) => {
            setViewingSquad(null);
            await leaveOrDeleteGroup(userId, squad.id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            loadData();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  cardGradeBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardGradeText: {
    fontFamily: SERIF_FONT,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  retroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 16,
  },
  retroScreenTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  retroCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  retroCreateBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  retroSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    paddingHorizontal: 14,
    height: 42,
    marginBottom: 16,
  },
  retroSearchIcon: {
    marginRight: 8,
  },
  retroSearchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0,
  },
  /* Retro Team Carousel Styles */
  retroFriendsWrapper: {
    marginBottom: 16,
  },
  friendsPageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  retroFriendItem: {
    alignItems: 'center',
    width: (SQUADS_PAGE_WIDTH - 24) / 3,
  },
  retroAvatarContainer: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  retroPinBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    paddingHorizontal: 4,
    height: 18,
    minWidth: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  retroFriendName: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.1,
    marginTop: 7,
    textAlign: 'center',
    width: '100%',
  },
  friendStepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 3,
    width: '100%',
  },
  friendStepsText: {
    fontSize: 10.5,
    fontWeight: '600',
    letterSpacing: -0.1,
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
    width: 14,
    borderRadius: 3,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 16,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: SERIF_FONT,
    fontSize: 24,
    fontWeight: '700',
    marginTop: 6,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 260,
  },
  emptyActionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 12,
  },
  emptyActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  cardContainer: {
    borderRadius: 18,
    borderWidth: 0,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  squadTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  squadTypeTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cardDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  addMemberIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionBtn: {
    padding: 6,
    borderRadius: 8,
  },
  cardStatsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardStatCol: {
    alignItems: 'center',
  },
  cardStatVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  cardStatLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  cardStatDivider: {
    width: 1,
    height: 20,
  },
  membersContainer: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  membersHeading: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  memberBadgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  memberBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
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
  modalSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalSheetHeading: {
    fontFamily: SERIF_FONT,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  modalSheetSubtext: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  emojiPickerRow: {
    gap: 8,
    paddingBottom: 4,
  },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeOptionContainer: {
    gap: 8,
    marginBottom: 6,
  },
  typeOptionCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 12,
  },
  typeOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeOptionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  typeOptionDesc: {
    fontSize: 11.5,
    lineHeight: 15,
    marginTop: 2,
  },
  modalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
  },
  inputPrefix: {
    fontSize: 15,
    fontWeight: '800',
    marginRight: 4,
  },
  modalInputText: {
    flex: 1,
    fontSize: 14,
  },
  modalButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
  },
  modalDismissBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDismissText: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalPrimaryBtn: {
    flex: 1.5,
    height: 44,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalPrimaryBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
