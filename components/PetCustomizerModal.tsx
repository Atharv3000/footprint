import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal } from './AppModal';
import { NutritionPetArtwork } from './NutritionPetArtwork';
import { useTheme } from '@/constants/ThemeContext';
import type { NutritionPetState } from '@/constants/nutritionPet';
import { DEFAULT_PET_APPEARANCE, PET_FACE, PET_HATS, PET_NECK, PET_PALETTES, PET_SPECIES, PetAppearance, randomPetAppearance } from '@/constants/petAppearance';

const tabs = ['Pets', 'Colors', 'Hats', 'Face', 'Neck'] as const;
type Tab = typeof tabs[number];
const labels: Record<string, string> = { cat: 'Cat', fox: 'Fox', bunny: 'Bunny', none: 'None', cap: 'Cap', beanie: 'Beanie', crown: 'Crown', glasses: 'Glasses', shades: 'Shades', bowtie: 'Bow tie', medal: 'Medal' };
const noop = () => {};
export function PetCustomizerModal({ visible, name, appearance, state, reduceMotion, onClose, onSave }: {
  visible: boolean; name: string; appearance: PetAppearance; state: NutritionPetState; reduceMotion: boolean;
  onClose: () => void; onSave: (appearance: PetAppearance) => Promise<void>;
}) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const [draft, setDraft] = useState(appearance);
  const [tab, setTab] = useState<Tab>('Pets');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [previewRub, setPreviewRub] = useState(false);
  useEffect(() => { if (visible) { setDraft(appearance); setTab('Pets'); setPreviewRub(false); } }, [visible, appearance]);
  const choices = tab === 'Pets' ? PET_SPECIES : tab === 'Colors' ? Object.keys(PET_PALETTES) : tab === 'Hats' ? PET_HATS : tab === 'Face' ? PET_FACE : PET_NECK;
  const field = tab === 'Pets' ? 'species' : tab === 'Colors' ? 'color' : tab === 'Hats' ? 'hat' : tab === 'Face' ? 'face' : 'neck';
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true);
    try { await onSave(draft); onClose(); }
    catch { Alert.alert('Look not saved', 'Your previous look is safe. Please try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <AppModal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!savingRef.current) onClose(); }}>
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={s.header}>
        <View style={{ flex: 1 }}><Text style={[s.title, { color: colors.text }]}>Style {name}</Text><Text style={{ color: colors.textMuted, fontSize: 12 }}>A little personality for your daily companion</Text></View>
        <TouchableOpacity accessibilityLabel="Cancel pet customization" disabled={saving} onPress={onClose} style={[s.icon, { backgroundColor: colors.surfaceElevated }]}><Ionicons name="close" size={22} color={colors.text} /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <View style={[s.preview, { backgroundColor: colors.surfaceElevated }]}>
          <NutritionPetArtwork state={state} appearance={draft} active={visible} reduceMotion={reduceMotion}
            celebration={0} petted={previewRub} onHeadRub={() => setPreviewRub(true)} sizeOverride={height < 720 ? 190 : 240} />
          <View style={s.previewActions}>
            <TouchableOpacity disabled={saving} accessibilityRole="button" onPress={() => setDraft(randomPetAppearance())} style={s.smallButton}><Ionicons name="shuffle" size={17} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: '700' }}>Surprise me</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => setPreviewRub(value => !value)} style={s.smallButton}><Text style={{ color: colors.textMuted, fontWeight: '700' }}>{previewRub ? 'Idle pose' : 'Petting pose'}</Text></TouchableOpacity>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs} accessibilityRole="tablist">
          {tabs.map(item => <TouchableOpacity key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} onPress={() => setTab(item)} style={[s.tab, { backgroundColor: tab === item ? colors.primaryBg : colors.surfaceElevated }]}><Text style={{ color: tab === item ? colors.primary : colors.textMuted, fontWeight: '800' }}>{item}</Text></TouchableOpacity>)}
        </ScrollView>
        <View style={s.grid}>
          {choices.map(value => {
            const selected = draft[field] === value;
            const option = { ...draft, [field]: value } as PetAppearance;
            const label = tab === 'Colors' ? PET_PALETTES[value as PetAppearance['color']].label : labels[value];
            return <TouchableOpacity key={`${tab}-${value}`} accessibilityRole="button" accessibilityLabel={`${label} ${tab.toLowerCase()}`} accessibilityState={{ selected }} disabled={saving}
              onPress={() => setDraft(option)} style={[s.choice, { backgroundColor: selected ? colors.primaryBg : colors.surfaceElevated, borderColor: selected ? colors.primary : colors.border }]}>
              {tab === 'Colors' ? <View style={[s.swatch, { backgroundColor: PET_PALETTES[value as PetAppearance['color']].mid }]} />
                : <View pointerEvents="none"><NutritionPetArtwork state={state} appearance={option} active={false} reduceMotion celebration={0} petted={false} onHeadRub={noop} sizeOverride={82} /></View>}
              <Text numberOfLines={1} style={{ color: selected ? colors.primary : colors.text, fontSize: 12, fontWeight: '700' }}>{label}</Text>
              {selected && <Ionicons name="checkmark-circle" size={17} color={colors.primary} style={{ position: 'absolute', top: 6, right: 6 }} />}
            </TouchableOpacity>;
          })}
        </View>
      </ScrollView>
      <View style={[s.footer, { borderColor: colors.border }]}>
        <TouchableOpacity disabled={saving} onPress={() => setDraft({ ...DEFAULT_PET_APPEARANCE })} style={[s.reset, { borderColor: colors.border }]}><Text style={{ color: colors.textMuted, fontWeight: '700' }}>Reset</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={save} style={[s.done, { backgroundColor: colors.primary, opacity: saving ? .5 : 1 }]}><Text style={{ color: '#101609', fontWeight: '800', fontSize: 15 }}>{saving ? 'Saving…' : 'Done'}</Text></TouchableOpacity>
      </View>
    </View>
  </AppModal>;
}
const s = StyleSheet.create({
  container: { flex: 1 }, header: { padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }, title: { fontSize: 23, fontWeight: '800', marginBottom: 5 }, icon: { padding: 9, borderRadius: 14 },
  preview: { marginHorizontal: 18, borderRadius: 24, alignItems: 'center', paddingTop: 6, paddingBottom: 8 }, previewActions: { flexDirection: 'row', justifyContent: 'center', gap: 18 }, smallButton: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 9 },
  tabs: { gap: 7, padding: 18 }, tab: { borderRadius: 15, paddingHorizontal: 17, paddingVertical: 11 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 18 },
  choice: { width: '30%', flexGrow: 1, maxWidth: '33%', borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 7, minHeight: 108 }, swatch: { width: 48, height: 48, borderRadius: 24, margin: 8 },
  footer: { padding: 18, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12 }, reset: { padding: 15, borderWidth: 1, borderRadius: 16 }, done: { flex: 1, padding: 15, borderRadius: 16, alignItems: 'center' },
});
