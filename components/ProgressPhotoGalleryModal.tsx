import React, { useState, useRef, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  Modal,
  Dimensions,
  ScrollView,
  PanResponder,
  Animated,
  Platform,
  Share,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { ProgressPhoto } from '@/constants/workoutStorage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ProgressPhotoGalleryModalProps {
  visible: boolean;
  onClose: () => void;
  photos: ProgressPhoto[];
  initialPhotoId?: string;
  onDeletePhoto: (photoId: string) => void;
  onUploadNewPhoto: () => void;
  onCaptureNewPhoto: () => void;
  onUpdatePhoto?: (photoId: string, updates: { caption?: string; date?: string }) => void;
}

export function ProgressPhotoGalleryModal({
  visible,
  onClose,
  photos,
  initialPhotoId,
  onDeletePhoto,
  onUploadNewPhoto,
  onCaptureNewPhoto,
  onUpdatePhoto,
}: ProgressPhotoGalleryModalProps) {
  const { colors, isDark } = useTheme();

  // Active view mode: 'single' | 'compare'
  const [viewMode, setViewMode] = useState<'single' | 'compare'>('single');

  // Currently viewed photo in single mode
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(() => {
    if (initialPhotoId) {
      const idx = photos.findIndex((p) => p.id === initialPhotoId);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });

  // Comparison selection
  const [comparePhotoAId, setComparePhotoAId] = useState<string | null>(null);
  const [comparePhotoBId, setComparePhotoBId] = useState<string | null>(null);

  // Edit photo modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [editDate, setEditDate] = useState('');

  // A/B Comparison Slider (0 to SCREEN_WIDTH)
  const sliderPosition = useRef(new Animated.Value(SCREEN_WIDTH / 2)).current;
  const currentSliderX = useRef<number>(SCREEN_WIDTH / 2);

  // Broad panResponder for dragging anywhere across the screen in A/B Comparison mode
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        // Instant response wherever finger touches screen
        const touchX = evt.nativeEvent.pageX;
        if (touchX >= 10 && touchX <= SCREEN_WIDTH - 10) {
          currentSliderX.current = touchX;
          sliderPosition.setValue(touchX);
        }
      },
      onPanResponderMove: (evt) => {
        let touchX = evt.nativeEvent.pageX;
        if (touchX < 15) touchX = 15;
        if (touchX > SCREEN_WIDTH - 15) touchX = SCREEN_WIDTH - 15;
        currentSliderX.current = touchX;
        sliderPosition.setValue(touchX);
      },
      onPanResponderRelease: (evt) => {
        let touchX = evt.nativeEvent.pageX;
        if (touchX < 15) touchX = 15;
        if (touchX > SCREEN_WIDTH - 15) touchX = SCREEN_WIDTH - 15;
        currentSliderX.current = touchX;
        sliderPosition.setValue(touchX);
      },
    })
  ).current;

  // Chronological order: oldest -> newest so the most recent is closest to the right
  const sortedPhotos = useMemo(() => {
    return [...photos].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [photos]);

  // Sync index and viewMode when photos change or modal opens
  React.useEffect(() => {
    if (visible) {
      setViewMode('single');
      if (initialPhotoId && sortedPhotos.length > 0) {
        const idx = sortedPhotos.findIndex((p) => p.id === initialPhotoId);
        setActivePhotoIndex(idx >= 0 ? idx : sortedPhotos.length - 1);
      } else if (sortedPhotos.length > 0) {
        // Default to the most recent photo (on the far right)
        setActivePhotoIndex(sortedPhotos.length - 1);
      }
    }
  }, [visible, initialPhotoId, sortedPhotos]);

  const currentPhoto =
    sortedPhotos.length > 0 && activePhotoIndex < sortedPhotos.length
      ? sortedPhotos[activePhotoIndex]
      : sortedPhotos[sortedPhotos.length - 1];

  const photoA = sortedPhotos.find((p) => p.id === comparePhotoAId) || sortedPhotos[Math.max(0, sortedPhotos.length - 2)] || sortedPhotos[0];
  const photoB = sortedPhotos.find((p) => p.id === comparePhotoBId) || sortedPhotos[sortedPhotos.length - 1];

  const handleToggleSelectForCompare = (photoId: string) => {
    Haptics.selectionAsync().catch(() => {});
    if (comparePhotoAId === photoId) {
      setComparePhotoAId(null);
    } else if (comparePhotoBId === photoId) {
      setComparePhotoBId(null);
    } else if (!comparePhotoAId) {
      setComparePhotoAId(photoId);
    } else {
      setComparePhotoBId(photoId);
      setViewMode('compare');
    }
  };

  const handleDeleteCurrent = () => {
    if (!currentPhoto) return;
    Alert.alert(
      'Delete Photo',
      'Are you sure you want to delete this progress photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
            onDeletePhoto(currentPhoto.id);
            if (photos.length <= 1) {
              onClose();
            } else {
              setActivePhotoIndex((prev) => Math.max(0, prev - 1));
            }
          },
        },
      ]
    );
  };

  const handleShareCurrent = async () => {
    if (!currentPhoto) return;
    Haptics.selectionAsync().catch(() => {});
    try {
      const shareMessage = currentPhoto.caption
        ? `Footprint Transformation (${currentPhoto.date}): "${currentPhoto.caption}"`
        : `Footprint Transformation Progress (${currentPhoto.date})`;

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable && currentPhoto.uri) {
        // Native photo share sheet (shares the actual image file to Instagram, Messages, Camera Roll, etc.)
        await Sharing.shareAsync(currentPhoto.uri, {
          mimeType: 'image/jpeg',
          dialogTitle: shareMessage,
          UTI: 'public.jpeg',
        });
      } else {
        // Fallback to React Native Share
        await Share.share({
          message: shareMessage,
          url: currentPhoto.uri,
          title: 'Footprint Progress',
        });
      }
    } catch (e) {
      console.warn('Share dismissed or failed', e);
    }
  };

  const handleOpenEdit = () => {
    if (!currentPhoto) return;
    Haptics.selectionAsync().catch(() => {});
    setEditCaption(currentPhoto.caption || '');
    setEditDate(currentPhoto.date || '');
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!currentPhoto) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (onUpdatePhoto) {
      onUpdatePhoto(currentPhoto.id, {
        caption: editCaption.trim() || undefined,
        date: editDate.trim() || currentPhoto.date,
      });
    }
    setShowEditModal(false);
  };

  // Format uploaded time
  const uploadSubtext = currentPhoto
    ? (() => {
        if (currentPhoto.createdAt) {
          const cDate = new Date(currentPhoto.createdAt);
          if (!isNaN(cDate.getTime())) {
            const timeStr = cDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            const dateStr = cDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            return `Uploaded on ${dateStr} at ${timeStr}`;
          }
        }
        return `Recorded on ${currentPhoto.date}`;
      })()
    : '';

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <View style={styles.container}>
        {/* TOP BAR: Solid black background, Centered Date, Back/Close on left, Compare on right */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.circleIconButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color="#ffffff" />
          </TouchableOpacity>

          {/* Centered Date Header with Upload Subtext */}
          <View style={styles.dateHeaderCol}>
            {viewMode === 'single' ? (
              <>
                <Text style={styles.dateHeaderTitle}>
                  {currentPhoto?.date
                    ? new Date(currentPhoto.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : 'Progress Photo'}
                </Text>
                <Text style={styles.uploadSubText} numberOfLines={1}>
                  {uploadSubtext}
                </Text>
                {currentPhoto?.caption ? (
                  <Text style={styles.captionSubText} numberOfLines={1}>
                    "{currentPhoto.caption}"
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={styles.dateHeaderTitle}>A/B Comparison</Text>
                <Text style={styles.uploadSubText}>Drag slider to size images</Text>
              </>
            )}
          </View>

          {/* Right Action: Compare Toggle (Icon-only) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 40, justifyContent: 'flex-end' }}>
            {photos.length >= 2 ? (
              <TouchableOpacity
                style={[
                  styles.modePillBtn,
                  viewMode === 'compare' && { backgroundColor: '#ffffff' },
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  if (viewMode === 'compare') {
                    setViewMode('single');
                  } else {
                    if (!comparePhotoAId || !comparePhotoBId) {
                      setComparePhotoAId(sortedPhotos[Math.max(0, sortedPhotos.length - 2)]?.id || null);
                      setComparePhotoBId(sortedPhotos[sortedPhotos.length - 1]?.id || null);
                    }
                    setViewMode('compare');
                  }
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="git-compare"
                  size={18}
                  color={viewMode === 'compare' ? '#09090b' : '#ffffff'}
                />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>
        </View>

        {/* MAIN VIEW AREA: Pinch and Zoom enabled in Single View, Interactive Split in Compare View */}
        {photos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={54} color="#52525b" />
            <Text style={styles.emptyTitle}>No Progress Photos Yet</Text>
            <Text style={styles.emptySubtitle}>
              Take or upload photos from your library to track your transformation over time.
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.addPhotoOptionBtn, { backgroundColor: '#ffffff' }]}
                onPress={onCaptureNewPhoto}
              >
                <Ionicons name="camera" size={16} color="#09090b" />
                <Text style={styles.addPhotoOptionText}>Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addPhotoOptionBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
                onPress={onUploadNewPhoto}
              >
                <Ionicons name="image" size={16} color="#ffffff" />
                <Text style={[styles.addPhotoOptionText, { color: '#ffffff' }]}>Upload Library</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : viewMode === 'single' ? (
          /* Single Photo with Pinch-To-Zoom */
          <View style={styles.singlePhotoContainer}>
            {currentPhoto && (
              <ScrollView
                style={{ flex: 1, width: '100%' }}
                contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
                maximumZoomScale={4.0}
                minimumZoomScale={1.0}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                centerContent
              >
                <Image
                  source={{ uri: currentPhoto.uri }}
                  style={styles.fullScreenImage}
                  resizeMode="contain"
                />
              </ScrollView>
            )}
          </View>
        ) : (
          /* Interactive A/B Comparison Split Slider - Full screen touch tracking */
          <View style={styles.compareContainer} {...panResponder.panHandlers}>
            {/* Background Image B (Right side) */}
            {photoB && (
              <View style={StyleSheet.absoluteFill}>
                <Image
                  source={{ uri: photoB.uri }}
                  style={styles.fullScreenImage}
                  resizeMode="cover"
                />
                <View style={styles.compareLabelBadgeRight}>
                  <Text style={styles.compareLabelText}>B: {photoB.date}</Text>
                </View>
              </View>
            )}

            {/* Foreground Image A (Left side - clipped by width) */}
            {photoA && (
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    width: sliderPosition,
                    overflow: 'hidden',
                  },
                ]}
              >
                <Image
                  source={{ uri: photoA.uri }}
                  style={[styles.fullScreenImage, { width: SCREEN_WIDTH }]}
                  resizeMode="cover"
                />
                <View style={styles.compareLabelBadgeLeft}>
                  <Text style={styles.compareLabelText}>A: {photoA.date}</Text>
                </View>
              </Animated.View>
            )}

            {/* Draggable Vertical Split Divider Line */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.splitSliderDivider,
                {
                  transform: [{ translateX: sliderPosition }],
                },
              ]}
            >
              <View style={styles.sliderKnob}>
                <Ionicons name="swap-horizontal" size={18} color="#09090b" />
              </View>
            </Animated.View>
          </View>
        )}

        {/* BOTTOM FILMSTRIP PREVIEWS & FIVE-ICON ACTION BAR */}
        {sortedPhotos.length > 0 && (
          <View style={styles.bottomFilmstripContainer}>
            {/* Horizontal Scrollable Compact Thumbnails */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbnailsScroll}
            >
              {sortedPhotos.map((item, idx) => {
                const isActive = activePhotoIndex === idx;
                const isSelectedA = comparePhotoAId === item.id;
                const isSelectedB = comparePhotoBId === item.id;

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.thumbnailWrapper,
                      isActive && viewMode === 'single' && { borderColor: colors.primary, borderWidth: 2 },
                      viewMode === 'compare' && isSelectedA && { borderColor: '#38bdf8', borderWidth: 2.5 },
                      viewMode === 'compare' && isSelectedB && { borderColor: '#ec4899', borderWidth: 2.5 },
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      if (viewMode === 'compare') {
                        handleToggleSelectForCompare(item.id);
                      } else {
                        setActivePhotoIndex(idx);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Image source={{ uri: item.uri }} style={styles.thumbnailImage} />

                    {/* A/B badge ONLY if in compare mode */}
                    {viewMode === 'compare' && isSelectedA && (
                      <View style={[styles.thumbnailBadge, { backgroundColor: '#38bdf8' }]}>
                        <Text style={styles.thumbnailBadgeText}>A</Text>
                      </View>
                    )}
                    {viewMode === 'compare' && isSelectedB && (
                      <View style={[styles.thumbnailBadge, { backgroundColor: '#ec4899' }]}>
                        <Text style={styles.thumbnailBadgeText}>B</Text>
                      </View>
                    )}

                    <Text style={styles.thumbnailDateText} numberOfLines={1}>
                      {item.date ? item.date.slice(5) : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* ACTION STRIP: Share on Left, Edit/Camera/Upload in Middle, Trash on Right */}
            <View style={styles.bottomActionBar}>
              {/* Left: Share button */}
              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={handleShareCurrent}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
              >
                <Ionicons name="share-outline" size={26} color="#ffffff" />
              </TouchableOpacity>

              {/* Middle 3 Icons: Edit, Camera, Upload */}
              <View style={styles.centerActionGroup}>
                {/* 1. Edit current image */}
                <TouchableOpacity
                  style={styles.actionIconBtn}
                  onPress={handleOpenEdit}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="create-outline" size={25} color="#ffffff" />
                </TouchableOpacity>

                {/* 2. Take photo with Camera */}
                <TouchableOpacity
                  style={styles.actionIconBtn}
                  onPress={onCaptureNewPhoto}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera-outline" size={26} color="#ffffff" />
                </TouchableOpacity>

                {/* 3. Upload from photo library */}
                <TouchableOpacity
                  style={styles.actionIconBtn}
                  onPress={onUploadNewPhoto}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="image-outline" size={25} color="#ffffff" />
                </TouchableOpacity>
              </View>

              {/* Right: Trashbin without circle background */}
              <TouchableOpacity
                style={styles.actionIconBtn}
                onPress={handleDeleteCurrent}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={25} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* EDIT PHOTO MODAL */}
        <Modal visible={showEditModal} transparent animationType="fade" onRequestClose={() => setShowEditModal(false)}>
          <View style={styles.editModalOverlay}>
            <View style={styles.editModalCard}>
              <View style={styles.editModalHeader}>
                <Text style={styles.editModalTitle}>Edit Progress Photo</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={20} color="#a1a1aa" />
                </TouchableOpacity>
              </View>

              <Text style={styles.editFieldLabel}>DATE (YYYY-MM-DD):</Text>
              <TextInput
                style={styles.editTextInput}
                value={editDate}
                onChangeText={setEditDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#71717a"
              />

              <Text style={styles.editFieldLabel}>NOTE / CAPTION:</Text>
              <TextInput
                style={styles.editTextInput}
                value={editCaption}
                onChangeText={setEditCaption}
                placeholder="e.g. Morning fasted check-in"
                placeholderTextColor="#71717a"
              />

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={[styles.editBtn, { backgroundColor: '#27272a' }]}
                  onPress={() => setShowEditModal(false)}
                >
                  <Text style={[styles.editBtnText, { color: '#ffffff' }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editBtn, { backgroundColor: colors.primary, flex: 1 }]}
                  onPress={handleSaveEdit}
                >
                  <Text style={[styles.editBtnText, { color: isDark ? '#09090b' : '#ffffff' }]}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    paddingTop: Platform.OS === 'ios' ? 56 : 28,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000000',
    zIndex: 20,
  },
  circleIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  dateHeaderCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
  },
  dateHeaderTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    fontFamily: SERIF_FONT,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  uploadSubText: {
    color: '#71717a',
    fontSize: 10.5,
    marginTop: 2,
    fontWeight: '600',
    textAlign: 'center',
  },
  captionSubText: {
    color: '#a1a1aa',
    fontSize: 11.5,
    marginTop: 2,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  modePillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  modePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  singlePhotoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  compareContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  compareLabelBadgeLeft: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(56, 189, 248, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  compareLabelBadgeRight: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(236, 72, 153, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  compareLabelText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  splitSliderDivider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 5,
  },
  sliderKnob: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#71717a',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
  },
  addPhotoOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
  addPhotoOptionText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#09090b',
  },
  bottomFilmstripContainer: {
    backgroundColor: '#000000',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  thumbnailsScroll: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  thumbnailWrapper: {
    width: 48,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  thumbnailImage: {
    width: '100%',
    height: 40,
    resizeMode: 'cover',
  },
  thumbnailDateText: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#a1a1aa',
    marginTop: 1,
  },
  thumbnailBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  bottomActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    borderTopWidth: 0,
  },
  centerActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 28,
  },
  actionIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  editModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272a',
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  editModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    fontFamily: SERIF_FONT,
  },
  editFieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#a1a1aa',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 5,
  },
  editTextInput: {
    backgroundColor: '#27272a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: '#ffffff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#3f3f46',
  },
  editBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
});
