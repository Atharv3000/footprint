import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { AppModal } from './AppModal';
import { ProgressPhotoGalleryModal } from './ProgressPhotoGalleryModal';
import { BRAND_ROUNDED_FONT_EXTRA, useTheme } from '@/constants/ThemeContext';
import { ProgressPhoto, deleteProgressPhoto, loadProgressPhotos, saveProgressPhoto, updateProgressPhoto } from '@/constants/workoutStorage';
import { dateString } from '@/constants/stepsStorage';

export function ProfileProgressSection({ userId, active }: { userId: string; active: boolean }) {
  const { colors } = useTheme();
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gallery, setGallery] = useState(false);
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [date, setDate] = useState(() => dateString(0));
  const owner = useRef(userId); owner.current = userId;
  const visible = useRef(active); visible.current = active;
  const picking = useRef(false);
  const refresh = useCallback(async () => {
    const result = await loadProgressPhotos(userId);
    if (owner.current === userId) setPhotos(result);
  }, [userId]);
  useEffect(() => { setPhotos([]); setDraft(null); setGallery(false); setBusy(false); }, [userId]);
  useEffect(() => {
    if (!active) { setGallery(false); setDraft(null); return; }
    setLoading(true);
    refresh().finally(() => { if (owner.current === userId) setLoading(false); });
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => subscription.remove();
  }, [active, refresh, userId]);
  const pick = async (camera: boolean) => {
    if (picking.current || busy) return;
    picking.current = true; setGallery(false);
    try {
      if (gallery) await new Promise(resolve => setTimeout(resolve, 350));
      if (owner.current !== userId || !visible.current) return;
      const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert(camera ? 'Camera permission' : 'Photo library permission', 'Allow access in Settings to add a progress photo.'); return; }
      const options = { allowsEditing: true, quality: .85 };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync({ ...options, mediaTypes: ['images'] });
      if (!result.canceled && result.assets[0] && owner.current === userId && visible.current) {
        setDraft(result.assets[0].uri); setCaption(''); setDate(dateString(0));
      }
    } catch { Alert.alert('Photo unavailable', 'Could not open your camera or photo library. Please try again.'); }
    finally { picking.current = false; }
  };
  const save = async () => {
    const parsed = new Date(`${date}T12:00:00`);
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed.getTime()) && parsed.getFullYear() === Number(date.slice(0,4)) && parsed.getMonth()+1 === Number(date.slice(5,7)) && parsed.getDate() === Number(date.slice(8,10)) && date <= dateString(0);
    if (!valid) { Alert.alert('Check the date', 'Use YYYY-MM-DD, today or earlier.'); return; }
    if (!draft || busy) return;
    setBusy(true);
    try {
      const saved = await saveProgressPhoto(userId, { uri: draft, date, caption: caption.trim() || undefined });
      const updated = await loadProgressPhotos(userId);
      if (!updated.some(photo => photo.id === saved.id)) throw new Error('Photo was not persisted');
      if (owner.current === userId) setPhotos(updated);
      if (owner.current === userId) { setDraft(null); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
    } catch { Alert.alert('Photo not saved', 'Please try again.'); }
    finally { if (owner.current === userId) setBusy(false); }
  };
  const open = (nextMode: 'single' | 'compare', id?: string) => { setMode(nextMode); setSelectedId(id); setGallery(true); };
  const before = photos[1] || photos[0], after = photos[0];
  const muted = { color: colors.textMuted }, text = { color: colors.text };
  return <View style={s.content}>
    <Text style={[s.heading, text]}>Progress photos</Text>
    <Text style={[s.caption, muted]}>Keep your check-ins together and compare changes over time.</Text>
    <View style={s.row}>
      {([{ label: 'Take photo', icon: 'camera-outline', camera: true }, { label: 'Upload photo', icon: 'images-outline', camera: false }] as const).map(action => <TouchableOpacity key={action.label} accessibilityRole="button" onPress={() => { void pick(action.camera); }} disabled={busy} style={[s.action, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}><Ionicons name={action.icon} size={18} color={colors.primary} /><Text style={[s.label, text]}>{action.label}</Text></TouchableOpacity>)}
    </View>
    {loading ? <ActivityIndicator color={colors.primary} /> : photos.length > 0 ? <>
      <View style={[s.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
        <View style={[s.row, { justifyContent: 'space-between', marginBottom: 12 }]}><Text style={[s.label, text]}>Photo comparison</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Compare progress photos" onPress={() => open('compare')} disabled={photos.length < 2}><Text style={[s.label, { color: photos.length < 2 ? colors.textMuted : colors.primary }]}>Compare</Text></TouchableOpacity></View>
        <View style={s.row}>{(photos.length > 1 ? [before, after] : [after]).map((photo,i) => <TouchableOpacity key={i} accessibilityRole="button" accessibilityLabel={`Open progress photo from ${photo.date}`} onPress={() => open('single',photo.id)} style={{ flex: 1, minWidth: 0 }}>
          <Image source={{ uri: photo.uri }} style={s.preview} resizeMode="contain" /><Text style={[s.label, text, { marginTop: 8 }]}>{photos.length === 1 || i ? 'Latest' : 'Previous'}</Text><Text style={[s.caption, muted]}>{photo.date}</Text>
        </TouchableOpacity>)}</View>
        {photos.length < 2 && <Text style={[s.caption, muted, { marginTop: 12 }]}>Add a second check-in to compare your photos.</Text>}
      </View>
      <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={[s.label, text]}>Photo library · {photos.length}</Text><TouchableOpacity onPress={() => open('single')}><Text style={[s.label, { color: colors.primary }]}>View all</Text></TouchableOpacity></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{photos.map(photo => <TouchableOpacity key={photo.id} accessibilityRole="button" accessibilityLabel={`Open photo from ${photo.date}`} onPress={() => open('single',photo.id)}><Image source={{ uri: photo.uri }} style={s.thumbnail} /><Text style={[s.caption, muted]}>{photo.date}</Text></TouchableOpacity>)}</ScrollView>
    </> : <View style={[s.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.border, alignItems: 'center', gap: 10 }]}><Ionicons name="images-outline" size={36} color={colors.primary} /><Text style={[s.label, text]}>Start your photo timeline</Text><Text style={[s.caption, muted]}>Take or upload a check-in to see your progress here.</Text></View>}
    <ProgressPhotoGalleryModal visible={active && gallery} initialViewMode={mode} onClose={() => setGallery(false)} photos={photos} initialPhotoId={selectedId}
      onDeletePhoto={async id => { await deleteProgressPhoto(userId,id); await refresh(); }}
      onUpdatePhoto={async (id,updates) => { await updateProgressPhoto(userId,id,updates); await refresh(); }}
      onUploadNewPhoto={() => { void pick(false); }} onCaptureNewPhoto={() => { void pick(true); }} />
    <AppModal visible={active && !!draft} animationType="slide" onRequestClose={() => { if (!busy) setDraft(null); }}>
      <ScrollView contentContainerStyle={[s.editor, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">
        <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={[s.heading, text]}>Save progress photo</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancel adding photo" disabled={busy} onPress={() => setDraft(null)}><Ionicons name="close" size={24} color={colors.text} /></TouchableOpacity></View>
        {!!draft && <Image source={{ uri: draft }} style={{ width: '100%', height: 300, borderRadius: 18 }} resizeMode="contain" />}
        <Text style={[s.label, text]}>Date</Text><TextInput accessibilityLabel="Photo date in YYYY-MM-DD format" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={[s.input, text, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} />
        <Text style={[s.label, text]}>Caption (optional)</Text><TextInput accessibilityLabel="Progress photo caption" value={caption} onChangeText={setCaption} maxLength={300} style={[s.input, text, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} />
        <TouchableOpacity accessibilityRole="button" onPress={save} disabled={busy} style={[s.action, { flex: 0, backgroundColor: colors.primary }]}><Text style={[s.label, { color: '#101609' }]}>{busy ? 'Saving…' : 'Save photo'}</Text></TouchableOpacity>
      </ScrollView>
    </AppModal>
  </View>;
}
const s=StyleSheet.create({ content:{paddingHorizontal:16,paddingBottom:32,gap:14},row:{flexDirection:'row',alignItems:'center',gap:10},heading:{fontFamily:BRAND_ROUNDED_FONT_EXTRA,fontSize:22,fontWeight:'800'},label:{fontFamily:BRAND_ROUNDED_FONT_EXTRA,fontSize:12,fontWeight:'700'},caption:{fontSize:11,lineHeight:17},action:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,borderWidth:1,borderColor:'transparent',padding:13,borderRadius:14},card:{padding:14,borderRadius:20,borderWidth:1},preview:{width:'100%',aspectRatio:.72,borderRadius:12,backgroundColor:'#10120f'},thumbnail:{width:90,height:115,borderRadius:12,backgroundColor:'#10120f'},editor:{padding:20,paddingBottom:40,gap:16,flexGrow:1},input:{padding:13,borderWidth:1,borderRadius:14,fontSize:14}});
