import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, DeviceEventEmitter, FlatList, Modal, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/constants/AuthContext';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { WALKS_CHANGED } from '@/constants/walkStorage';
import { BORDER_COUNTRIES, COUNTRY_QUESTS_CHANGED, CountryQuest, cachedCountryQuests, createCountryQuest, joinCountryQuest, previewCountryQuest, syncCountryQuests } from '@/constants/countryQuests';
import { CountryBorderMap } from './CountryBorderMap';

export function CountryQuests() {
  const { colors } = useTheme(); const { user } = useAuth(); const id = user?.id || 'guest_user';
  const [items, setItems] = useState<CountryQuest[]>([]); const [selected, setSelected] = useState('');
  const [open, setOpen] = useState(false); const [panel, setPanel] = useState<'home' | 'create' | 'countries'>('home');
  const [countryId, setCountryId] = useState('JPN'); const [title, setTitle] = useState(''); const [search, setSearch] = useState('');
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const scope = useRef(id); scope.current = id; const syncing = useRef(false);
  const country = BORDER_COUNTRIES.find(c => c.id === countryId) || BORDER_COUNTRIES[0];
  const featured = items.find(q => q.code === selected) || items.find(q => q.status === 'active' && !q.left) || items[0];
  const refresh = useCallback(async () => {
    if (syncing.current) return; syncing.current = true;
    try { const result = await syncCountryQuests(id); if (scope.current === id) { setItems(result); setError(''); } }
    catch (e) { if (scope.current === id) setError((e as Error).message); }
    finally { syncing.current = false; }
  }, [id]);
  useEffect(() => { setItems([]); setSelected(''); setOpen(false); setError(''); cachedCountryQuests(id).then(result => { if (scope.current === id) setItems(result); }).catch(() => {}); }, [id]);
  useFocusEffect(useCallback(() => {
    refresh(); const timer = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 15000);
    const walks = DeviceEventEmitter.addListener(WALKS_CHANGED, (event: { userId: string }) => { if (event.userId === id) refresh(); });
    const changed = DeviceEventEmitter.addListener(COUNTRY_QUESTS_CHANGED, refresh);
    const app = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); walks.remove(); changed.remove(); app.remove(); };
  }, [id, refresh]));
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return; setBusy(true);
    try { await action(); await refresh(); }
    catch (e) { Alert.alert('Country quest', (e as Error).message); }
    finally { setBusy(false); }
  };
  const invite = (quest: CountryQuest) => Share.share({ message: `Walk around ${BORDER_COUNTRIES.find(c => c.id === quest.countryId)?.name} with us on Footprint! Open Community > Quests > Country quests and join with code ${quest.code}. Our saved walks and runs combine to complete the virtual border together.` });
  const text = { color: colors.text }; const muted = { color: colors.textMuted };
  const button = (label: string, action: () => void, primary = false) => <TouchableOpacity key={label} accessibilityRole="button" disabled={busy} onPress={action}
    style={[s.button, { borderColor: primary ? colors.primary : colors.border, backgroundColor: primary ? colors.primary + '18' : colors.surfaceElevated }]}><Text style={[s.small, primary ? { color: colors.primary } : text]}>{label}</Text></TouchableOpacity>;
  const show = () => { setPanel('home'); setOpen(true); refresh(); };
  const summary = (quest: CountryQuest, team = false) => {
    const route = BORDER_COUNTRIES.find(c => c.id === quest.countryId); if (!route) return null;
    const distance = Math.min(route.totalKm, quest.totalSteps / 1310), remaining = Math.max(0, route.totalKm-distance);
    const percent = Math.min(100, quest.totalSteps / quest.goalSteps * 100);
    return <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={s.row}><View style={{ flex: 1 }}><Text style={[s.eyebrow, { color: colors.primary }]}>{quest.status === 'completed' ? 'BORDER COMPLETE' : quest.status === 'closed' ? 'QUEST ENDED' : quest.left ? 'YOU LEFT THIS QUEST' : 'WALK THE BORDER TOGETHER'}</Text><Text style={[s.country, text]}>{route.name}</Text></View><Ionicons name={quest.status === 'completed' ? 'trophy-outline' : 'earth-outline'} size={25} color={colors.primary} /></View>
      <Text style={[s.caption, muted]}>{quest.title}</Text>
      <CountryBorderMap country={route} steps={quest.totalSteps} />
      <View style={s.row}><View style={s.stat}><Text style={[s.value, text]}>{distance.toLocaleString(undefined, { maximumFractionDigits: 1 })} km</Text><Text style={[s.caption, muted]}>walked together</Text></View><View style={[s.stat, { alignItems: 'flex-end' }]}><Text style={[s.value, text]}>{remaining.toLocaleString(undefined, { maximumFractionDigits: 1 })} km</Text><Text style={[s.caption, muted]}>left on the border</Text></View></View>
      <View accessibilityRole="progressbar" accessibilityLabel="Shared country border progress" accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }} style={[s.track, { backgroundColor: colors.border }]}><View style={{ height: 5, width: `${percent}%`, backgroundColor: colors.primary }} /></View>
      <Text style={[s.caption, muted]}>{percent.toFixed(1)}% complete · {quest.totalSteps.toLocaleString()} / {quest.goalSteps.toLocaleString()} steps · {quest.members.filter(m => !m.left).length} walkers</Text>
      {team && <>
        <View style={[s.row, { flexWrap: 'wrap', marginTop: 10 }]}>{quest.status === 'active' && !quest.left && button('Invite friends', () => { invite(quest).catch(() => {}); }, true)}{button('Sync walks', refresh)}</View>
        <Text selectable style={[s.caption, muted]}>Invite code: {quest.code}</Text>
        <Text style={[s.heading, text]}>Team contributions</Text>
        {[...quest.members].sort((a, b) => b.steps-a.steps).map((member, index) => <View key={member.id} style={[s.member, { borderColor: colors.border }]}>
          <View style={[s.row, { justifyContent: 'space-between' }]}><Text numberOfLines={1} style={[s.small, text, { flex: 1 }]}>{index+1}. {member.id === quest.you ? 'You' : member.name}{member.left ? ' (left)' : ''}</Text><Text style={[s.small, { color: colors.primary }]}>{(member.steps/1310).toLocaleString(undefined, { maximumFractionDigits: 1 })} km</Text></View>
          <Text style={[s.caption, muted]}>{member.steps.toLocaleString()} steps</Text>
        </View>)}
        {quest.status === 'active' && !quest.left && button(quest.isOwner ? 'End team quest' : 'Leave quest', () => Alert.alert(quest.isOwner ? 'End this quest for everyone?' : 'Leave this quest?', quest.isOwner ? 'The route and contributions stay visible, but new steps will stop counting.' : 'Your contributed steps stay with the team. You cannot rejoin this quest from this device.', [
          { text: 'Stay', style: 'cancel' }, { text: quest.isOwner ? 'End quest' : 'Leave', style: 'destructive', onPress: () => run(() => syncCountryQuests(id, { code: quest.code, action: quest.isOwner ? 'close' : 'leave' })) },
        ]))}
      </>}
    </View>;
  };
  return <>
    <View style={[s.row, { marginBottom: 12 }]}><Ionicons name="earth-outline" size={20} color={colors.primary} /><Text style={[s.heading, text, { flex: 1, marginVertical: 0 }]}>Country quests</Text>{button(featured ? 'Manage' : 'Start a quest', show, true)}</View>
    {!!error && <Text style={[s.caption, muted, { marginBottom: 10 }]}>Offline — showing last synced progress. Open Manage to retry.</Text>}
    {featured ? <TouchableOpacity activeOpacity={.9} accessibilityRole="button" accessibilityLabel={`Open ${featured.title}`} onPress={show}>{summary(featured)}</TouchableOpacity>
      : <TouchableOpacity activeOpacity={.9} onPress={() => { setPanel('create'); setOpen(true); }} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[s.country, text]}>Pick a country. Walk it together.</Text><Text style={[s.caption, muted]}>Combine your friends' steps to trace a country outline.</Text><CountryBorderMap country={country} height={180} /><Text style={[s.small, { color: colors.primary }]}>Choose your first border route →</Text>
      </TouchableOpacity>}
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.row, { padding: 20 }]}><TouchableOpacity accessibilityLabel={panel === 'home' ? 'Close country quests' : 'Back'} onPress={() => panel === 'home' ? setOpen(false) : setPanel(panel === 'countries' ? 'create' : 'home')}><Ionicons name={panel === 'home' ? 'close' : 'arrow-back'} size={25} color={colors.text} /></TouchableOpacity><Text style={[s.title, text, { flex: 1 }]}>{panel === 'countries' ? 'Choose a country' : panel === 'create' ? 'New country quest' : 'Country quests'}</Text>{busy && <ActivityIndicator color={colors.primary} />}</View>
      {panel === 'countries' ? <>
        <TextInput autoFocus accessibilityLabel="Search countries" placeholder="Search countries or regions" placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} style={[s.input, text, { borderColor: colors.border, marginHorizontal: 20 }]} />
        <FlatList data={BORDER_COUNTRIES.filter(c => `${c.name} ${c.id}`.toLowerCase().includes(search.toLowerCase()))} keyExtractor={c => c.id} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 30 }} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <TouchableOpacity onPress={() => { setCountryId(item.id); setTitle(''); setPanel('create'); }} style={[s.member, { borderColor: colors.border }]}><Text style={[s.small, text]}>{item.name}</Text><Text style={[s.caption, muted]}>Approx. {Math.round(item.totalKm).toLocaleString()} km outline</Text></TouchableOpacity>} ListEmptyComponent={<Text style={muted}>No matching countries.</Text>} />
      </> : <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 45 }} keyboardShouldPersistTaps="handled">
        {error && <View style={[s.card, { borderColor: colors.border }]}><Text style={[s.caption, muted]}>Not synced: {error}</Text>{button('Retry', refresh)}</View>}
        {panel === 'create' ? <>
          {button(`${country.name} · Change country`, () => { setSearch(''); setPanel('countries'); }, true)}
          <CountryBorderMap country={country} height={240} />
          <Text style={[s.value, text]}>~{Math.round(country.totalKm).toLocaleString()} km together</Text><Text style={[s.caption, muted]}>About {Math.ceil(country.totalKm*1310).toLocaleString()} steps across the team.</Text>
          <Text style={[s.heading, text]}>Quest name</Text><TextInput accessibilityLabel="Country quest name" value={title} onChangeText={setTitle} maxLength={80} placeholder={`Walk around ${country.name}`} placeholderTextColor={colors.textMuted} style={[s.input, text, { borderColor: colors.border }]} />
          <Text style={[s.caption, muted]}>Up to 50 friends can contribute. Saved walks and runs completed after each person joins count automatically. Cycling and demo activities do not count.</Text>
          {button('Create team quest', () => run(async () => {
            const quest = await createCountryQuest(id, user?.name || 'Walker', country.id, title); setSelected(quest.code); setItems(await cachedCountryQuests(id)); setPanel('home');
          }), true)}
        </> : <>
          <View style={[s.row, { flexWrap: 'wrap' }]}>{button('New country quest', () => setPanel('create'), true)}{button('Refresh', refresh)}</View>
          {items.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{items.map(q => <View key={q.code}>{button(q.title, () => setSelected(q.code), featured?.code === q.code)}</View>)}</ScrollView>}
          {featured && summary(featured, true)}
          <Text style={[s.heading, text]}>Join your friends</Text><TextInput accessibilityLabel="Country quest invite code" placeholder="12-character invite code" placeholderTextColor={colors.textMuted} value={code} onChangeText={setCode} maxLength={12} autoCapitalize="characters" autoCorrect={false} style={[s.input, text, { borderColor: colors.border }]} />
          {button('Review invite', () => run(async () => {
            const preview = await previewCountryQuest(code); const route = BORDER_COUNTRIES.find(c => c.id === preview.countryId);
            Alert.alert(preview.title, `${route?.name} · approx. ${Math.round(route?.totalKm || 0).toLocaleString()} km · ${preview.memberCount}/50 walkers. Share your step total with this team?`, [
              { text: 'Cancel', style: 'cancel' }, { text: 'Join team', onPress: () => run(async () => { const quest = await joinCountryQuest(id, user?.name || 'Walker', code); setSelected(quest.code); setCode(''); }) },
            ]);
          }))}
        </>}
        <Text style={[s.caption, muted, { marginTop: 18 }]}>Virtual route using a simplified outline, including coastline. Distances and steps are estimates; islands are separate sections. No GPS routes or location data are shared. Made with Natural Earth.</Text>
      </ScrollView>}
    </SafeAreaView></Modal>
  </>;
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, card: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 16 },
  title: { fontSize: 25, fontFamily: SERIF_FONT }, heading: { fontSize: 16, fontWeight: '700', marginVertical: 13 },
  country: { fontSize: 25, fontFamily: SERIF_FONT, marginVertical: 5 }, eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  caption: { fontSize: 11, lineHeight: 17 }, small: { fontSize: 12, fontWeight: '600' }, value: { fontSize: 19, fontWeight: '700' }, stat: { flex: 1 },
  button: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10, marginVertical: 4 },
  track: { height: 5, borderRadius: 4, overflow: 'hidden', marginTop: 14, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 13, fontSize: 16, marginBottom: 10 },
  member: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 13 },
});
