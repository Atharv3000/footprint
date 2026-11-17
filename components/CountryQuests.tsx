import { AppModal as Modal } from '@/components/AppModal';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, DeviceEventEmitter, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/constants/AuthContext';
import { useTheme, BRAND_ROUNDED_FONT, BRAND_ROUNDED_FONT_EXTRA } from '@/constants/ThemeContext';
import { WALKS_CHANGED } from '@/constants/walkStorage';
import { BORDER_COUNTRIES, COUNTRY_QUESTS_CHANGED, CountryQuest, cachedCountryQuests, createCountryQuest, joinCountryQuest, previewCountryQuest, syncCountryQuests } from '@/constants/countryQuests';
import { CountryBorderMap } from './CountryBorderMap';

export function CountryQuests() {
  const { colors } = useTheme(); const { user } = useAuth(); const id = user?.id || 'guest_user';
  const [items, setItems] = useState<CountryQuest[]>([]); const [selected, setSelected] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [teamExpanded, setTeamExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [countryLimit, setCountryLimit] = useState(8);
  const actionBusy = useRef(false);
  const [countryId, setCountryId] = useState('JPN'); const [title, setTitle] = useState(''); const [search, setSearch] = useState('');
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const scope = useRef(id); scope.current = id; const syncing = useRef(false);
  const country = BORDER_COUNTRIES.find(c => c.id === countryId) || BORDER_COUNTRIES[0];
  const featured = items.find(q => q.code === selected) || items.find(q => q.status === 'active' && !q.left) || items[0];
  const refresh = useCallback(async () => {
    if (syncing.current) return; syncing.current = true; setRefreshing(true);
    try { const result = await syncCountryQuests(id); if (scope.current === id) { setItems(result); setError(''); } }
    catch (e) { if (scope.current === id) setError((e as Error).message); }
    finally { syncing.current = false; if (scope.current === id) setRefreshing(false); }
  }, [id]);
  useEffect(() => { setItems([]); setSelected(''); setOpen(false); setCreating(false); setPickerOpen(false); setJoinOpen(false); setTeamExpanded(false); setCode(''); setTitle(''); setSearch(''); setError(''); cachedCountryQuests(id).then(result => { if (scope.current === id) setItems(result); }).catch(() => {}); }, [id]);
  useFocusEffect(useCallback(() => {
    refresh(); const timer = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 15000);
    const walks = DeviceEventEmitter.addListener(WALKS_CHANGED, (event: { userId: string }) => { if (event.userId === id) refresh(); });
    const changed = DeviceEventEmitter.addListener(COUNTRY_QUESTS_CHANGED, refresh);
    const app = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); walks.remove(); changed.remove(); app.remove(); };
  }, [id, refresh]));
  const run = async (action: () => Promise<unknown>, syncAfter = true) => {
    if (actionBusy.current) return; actionBusy.current = true; setBusy(true);
    try { await action(); if (syncAfter) await refresh(); }
    catch (e) { Alert.alert('Country quest', (e as Error).message); }
    finally { actionBusy.current = false; setBusy(false); }
  };
  const invite = (quest: CountryQuest) => Share.share({ message: `Walk around ${BORDER_COUNTRIES.find(c => c.id === quest.countryId)?.name} with us on Footprint! Open Community > Country Quests > Join your friends and join with code ${quest.code}. Our saved walks and runs combine to complete the virtual border together.` });
  const text = { color: colors.text }; const muted = { color: colors.textMuted };
  const button = (label: string, action: () => void, primary = false) => <TouchableOpacity key={label} accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }} onPress={action}
    style={[s.button, { opacity: busy ? .5 : 1, borderColor: primary ? colors.primary : colors.border, backgroundColor: primary ? colors.primary + '18' : colors.surfaceElevated }]}><Text style={[s.small, primary ? { color: colors.primary } : text]}>{label}</Text></TouchableOpacity>;
  const show = () => {
    setCreating(false); setPickerOpen(false); setJoinOpen(false); setTeamExpanded(false); setOpen(true); void refresh();
  };
  const matches = BORDER_COUNTRIES.filter(c => `${c.name} ${c.id}`.toLowerCase().includes(search.trim().toLowerCase()));
  const summary = (quest: CountryQuest, team = false) => {
    const route = BORDER_COUNTRIES.find(c => c.id === quest.countryId); if (!route) return null;
    const distance = Math.min(route.totalKm, quest.totalSteps / 1310), remaining = Math.max(0, route.totalKm-distance);
    const percent = Math.min(100, quest.totalSteps / quest.goalSteps * 100);
    return <View style={[s.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Ionicons name="earth" size={13} color={colors.primary} />
            <Text style={[s.eyebrow, { color: colors.primary }]}>{quest.status === 'completed' ? 'BORDER COMPLETE' : quest.status === 'closed' ? 'QUEST ENDED' : quest.left ? 'YOU LEFT THIS QUEST' : 'WALK THE BORDER TOGETHER'}</Text>
          </View>
          <Text style={[s.country, text]}>{route.name}</Text>
        </View>
        <View style={[s.iconBadge, { backgroundColor: colors.primary + '18' }]}>
          <Ionicons name={quest.status === 'completed' ? 'trophy' : 'earth'} size={20} color={colors.primary} />
        </View>
      </View>
      <Text style={[s.caption, muted, { marginBottom: 10 }]}>{quest.title}</Text>
      <CountryBorderMap country={route} steps={quest.totalSteps} />
      <View style={[s.row, { marginTop: 12 }]}><View style={s.stat}><Text style={[s.value, text]}>{distance.toLocaleString(undefined, { maximumFractionDigits: 1 })} km</Text><Text style={[s.caption, muted]}>walked together</Text></View><View style={[s.stat, { alignItems: 'flex-end' }]}><Text style={[s.value, text]}>{remaining.toLocaleString(undefined, { maximumFractionDigits: 1 })} km</Text><Text style={[s.caption, muted]}>left on the border</Text></View></View>
      <View accessibilityRole="progressbar" accessibilityLabel="Shared country border progress" accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }} style={[s.track, { backgroundColor: colors.border }]}><View style={{ height: 6, width: `${percent}%`, backgroundColor: colors.primary }} /></View>
      <Text style={[s.caption, muted, { marginTop: 4 }]}>{percent.toFixed(1)}% complete · {quest.totalSteps.toLocaleString()} / {quest.goalSteps.toLocaleString()} steps · {quest.members.filter(m => !m.left).length} walkers</Text>
      {team && <>
        <View style={[s.row, { flexWrap: 'wrap', marginTop: 12 }]}>{quest.status === 'active' && !quest.left && button('Invite friends', () => { invite(quest).catch(() => {}); }, true)}</View>
        <Text selectable style={[s.caption, muted, { marginTop: 8 }]}>Invite code: {quest.code}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: teamExpanded }} onPress={() => setTeamExpanded(value => !value)} style={[s.row, { justifyContent: 'space-between', marginTop: 16 }]}>
          <Text style={[s.small, text]}>Team contributions ({quest.members.length})</Text><Ionicons name={teamExpanded ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textMuted} />
        </TouchableOpacity>
        {teamExpanded && <>
        {[...quest.members].sort((a, b) => b.steps-a.steps).map((member, index) => <View key={member.id} style={[s.member, { borderColor: colors.border }]}>
          <View style={[s.row, { justifyContent: 'space-between' }]}><Text numberOfLines={1} style={[s.small, text, { flex: 1 }]}>{index+1}. {member.id === quest.you ? 'You' : member.name}{member.left ? ' (left)' : ''}</Text><Text style={[s.small, { color: colors.primary }]}>{(member.steps/1310).toLocaleString(undefined, { maximumFractionDigits: 1 })} km</Text></View>
          <Text style={[s.caption, muted]}>{member.steps.toLocaleString()} steps</Text>
        </View>)}
        {quest.status === 'active' && !quest.left && button(quest.isOwner ? 'End team quest' : 'Leave quest', () => Alert.alert(quest.isOwner ? 'End this quest for everyone?' : 'Leave this quest?', quest.isOwner ? 'The route and contributions stay visible, but new steps will stop counting.' : 'Your contributed steps stay with the team. You cannot rejoin this quest from this device.', [
          { text: 'Stay', style: 'cancel' }, { text: quest.isOwner ? 'End quest' : 'Leave', style: 'destructive', onPress: () => run(() => syncCountryQuests(id, { code: quest.code, action: quest.isOwner ? 'close' : 'leave' })) },
        ]))}
        </>}
      </>}
    </View>;
  };
  return <>
    <View style={[s.headerRow, { marginBottom: 12 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[s.headerIconWrap, { backgroundColor: colors.primary + '18' }]}>
          <Ionicons name="earth" size={17} color={colors.primary} />
        </View>
        <Text style={[s.sectionTitle, text]}>Country Quests</Text>
      </View>
      {button(featured ? 'Manage' : 'Start', show, true)}
    </View>
    {!!error && <Text style={[s.caption, muted, { marginBottom: 10 }]}>Offline — showing last synced progress. Open Manage to retry.</Text>}
    {featured ? <TouchableOpacity activeOpacity={.9} accessibilityRole="button" accessibilityLabel={`Open ${featured.title}`} onPress={show}>{summary(featured)}</TouchableOpacity>
      : <TouchableOpacity activeOpacity={.9} onPress={show} style={[s.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <Text style={[s.country, text]}>Pick a Country. Walk it Together.</Text><Text style={[s.caption, muted, { marginBottom: 10 }]}>Combine your friends' daily steps to trace a country border outline.</Text><CountryBorderMap country={country} height={180} />
      </TouchableOpacity>}
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[s.row, { padding: 20 }]}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close country quests" hitSlop={8} onPress={() => setOpen(false)}>
            <Ionicons name="close" size={25} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.title, text, { flex: 1 }]}>Country quests</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Sync country quests and saved walks" disabled={refreshing || busy}
            onPress={refresh} style={[s.headerIconWrap, { backgroundColor: colors.surfaceElevated }]}>
            {refreshing || busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={18} color={colors.textMuted} />}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 45 }} keyboardShouldPersistTaps="handled">
    {!!error && <View style={{ marginBottom: 12 }}><Text style={[s.caption, muted]}>Showing saved progress. Could not sync: {error}</Text>{button('Retry sync', refresh)}</View>}

    {items.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
      {items.map(quest => <View key={quest.code}>{button(quest.title, () => { setSelected(quest.code); setCreating(false); setTeamExpanded(false); }, featured?.code === quest.code && !creating)}</View>)}
    </ScrollView>}

    {featured && !creating && <>
      {summary(featured, true)}
      {button('Start another country quest', () => { setCreating(true); setPickerOpen(false); setSearch(''); })}
    </>}

    {(!featured || creating) && <View style={[s.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 6 }]}>
        <Text style={[s.country, text, { flex: 1 }]}>Walk a country together</Text>
        {featured && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel new country quest" disabled={busy} onPress={() => setCreating(false)}><Ionicons name="close" size={21} color={colors.textMuted} /></TouchableOpacity>}
      </View>
      <Text style={[s.caption, muted, { marginBottom: 14 }]}>Choose a border route. Your team's saved walks and runs fill it in together.</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Choose country, currently ${country.name}`} accessibilityState={{ expanded: pickerOpen }} disabled={busy}
        onPress={() => { setPickerOpen(value => !value); setSearch(''); setCountryLimit(8); }} style={[s.countryPicker, { borderColor: colors.border }]}>
        <Ionicons name="earth-outline" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}><Text style={[s.small, text]}>{country.name}</Text><Text style={[s.caption, muted]}>Country / border route</Text></View>
        <Ionicons name={pickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {pickerOpen && <View style={{ marginTop: 10, marginBottom: 12 }}>
        <TextInput accessibilityLabel="Search countries" placeholder={`Search ${BORDER_COUNTRIES.length} countries or regions`} placeholderTextColor={colors.textMuted}
          value={search} onChangeText={value => { setSearch(value); setCountryLimit(8); }} style={[s.input, text, { borderColor: colors.border }]} />
        {matches.slice(0, countryLimit).map(item => <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === countryId }} disabled={busy}
          onPress={() => { setCountryId(item.id); setTitle(''); setPickerOpen(false); }} style={[s.member, s.row, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}><Text style={[s.small, text]}>{item.name}</Text><Text style={[s.caption, muted]}>Approx. {Math.round(item.totalKm).toLocaleString()} km outline</Text></View>
          {item.id === countryId && <Ionicons name="checkmark-circle" size={18} color={colors.primary} />}
        </TouchableOpacity>)}
        {matches.length === 0 && <Text style={[s.caption, muted]}>No matching countries.</Text>}
        {matches.length > countryLimit && button('Show more countries', () => setCountryLimit(value => value + 12))}
      </View>}
      <CountryBorderMap country={country} height={180} />
      <View style={[s.row, { justifyContent: 'space-between', marginTop: 12, marginBottom: 14 }]}>
        <View style={s.stat}><Text style={[s.value, text]}>~{Math.round(country.totalKm).toLocaleString()} km</Text><Text style={[s.caption, muted]}>border distance</Text></View>
        <View style={[s.stat, { alignItems: 'flex-end' }]}><Text style={[s.small, text]}>{Math.ceil(country.totalKm * 1310).toLocaleString()} steps</Text><Text style={[s.caption, muted]}>shared team goal</Text></View>
      </View>
      <Text style={[s.small, text, { marginBottom: 8 }]}>Quest name (optional)</Text>
      <TextInput accessibilityLabel="Country quest name" editable={!busy} value={title} onChangeText={setTitle} maxLength={80}
        placeholder={`Walk around ${country.name}`} placeholderTextColor={colors.textMuted} style={[s.input, text, { borderColor: colors.border }]} />
      <Text style={[s.caption, muted, { marginBottom: 12 }]}>Up to 50 friends. Saved walks and runs after joining count automatically; cycling and demo activities do not count.</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Start ${country.name} country quest`} disabled={busy} accessibilityState={{ disabled: busy }}
        onPress={() => run(async () => {
          const quest = await createCountryQuest(id, user?.name || 'Walker', country.id, title);
          if (scope.current !== id) return;
          setSelected(quest.code); setItems(await cachedCountryQuests(id)); setCreating(false); setPickerOpen(false); setTeamExpanded(false); setTitle('');
        })} style={[s.startButton, { backgroundColor: colors.primary, opacity: busy ? .5 : 1 }]}>
        {busy ? <ActivityIndicator size="small" color="#101609" /> : <Ionicons name="play" size={17} color="#101609" />}
        <Text numberOfLines={1} style={s.startText}>{busy ? 'Starting…' : `Start ${country.name} quest`}</Text>
      </TouchableOpacity>
    </View>}

    <View style={[s.card, { borderColor: colors.border, backgroundColor: colors.surfaceElevated, marginTop: 4 }]}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: joinOpen }} onPress={() => setJoinOpen(value => !value)} style={[s.row, { justifyContent: 'space-between' }]}>
        <View style={[s.row, { flex: 1 }]}><Ionicons name="people-outline" size={18} color={colors.primary} /><Text style={[s.small, text]}>Join your friends</Text></View>
        <Ionicons name={joinOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {!joinOpen && <Text style={[s.caption, muted, { marginTop: 6 }]}>Already invited? Enter your team's code here.</Text>}
      {joinOpen && <View style={{ marginTop: 12 }}>
        <TextInput accessibilityLabel="Country quest invite code" placeholder="12-character invite code" placeholderTextColor={colors.textMuted} value={code} onChangeText={setCode}
          maxLength={12} autoCapitalize="characters" autoCorrect={false} editable={!busy} style={[s.input, text, { borderColor: colors.border }]} />
        {button('Review invite', () => run(async () => {
          const preview = await previewCountryQuest(code); const route = BORDER_COUNTRIES.find(c => c.id === preview.countryId);
          Alert.alert(preview.title, `${route?.name} · approx. ${Math.round(route?.totalKm || 0).toLocaleString()} km · ${preview.memberCount}/50 walkers. Share your step total with this team?`, [
            { text: 'Cancel', style: 'cancel' }, { text: 'Join team', onPress: () => run(async () => {
              const quest = await joinCountryQuest(id, user?.name || 'Walker', code);
              if (scope.current !== id) return;
              setSelected(quest.code); setItems(await cachedCountryQuests(id)); setCode(''); setJoinOpen(false); setCreating(false); setTeamExpanded(false);
            }) },
          ]);
        }, false), true)}
      </View>}
    </View>
    <Text style={[s.caption, muted, { marginBottom: 16 }]}>Virtual route using a simplified outline, including coastline. Distances and steps are estimates; islands are separate sections. No GPS routes or location data are shared. Made with Natural Earth.</Text>
        </ScrollView>
      </View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    marginBottom: 12,
  },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    fontFamily: BRAND_ROUNDED_FONT_EXTRA,
    letterSpacing: -0.3,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countryPicker: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderRadius: 14 },
  startButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, minHeight: 46, paddingHorizontal: 16, paddingVertical: 12 },
  startText: { flexShrink: 1, color: '#101609', fontSize: 14, fontWeight: '800' },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  title: { fontSize: 24, fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontWeight: '800' },
  heading: { fontSize: 16, fontWeight: '800', fontFamily: BRAND_ROUNDED_FONT_EXTRA, marginVertical: 12 },
  country: { fontSize: 22, fontFamily: BRAND_ROUNDED_FONT_EXTRA, fontWeight: '800', marginVertical: 3, letterSpacing: -0.4 },
  eyebrow: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8 },
  caption: { fontSize: 11.5, lineHeight: 17, fontWeight: '500' },
  small: { fontSize: 12, fontWeight: '700' },
  value: { fontSize: 18, fontWeight: '800', fontFamily: BRAND_ROUNDED_FONT_EXTRA },
  stat: { flex: 1 },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginVertical: 4,
  },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 14, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 14, padding: 13, fontSize: 15, marginBottom: 10 },
  member: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 13 },
});
