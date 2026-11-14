import React, { useState, useRef, useMemo, useEffect } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { useTheme, SERIF_FONT } from '@/constants/ThemeContext';
import { ProgressPhoto } from '@/constants/workoutStorage';
import {
  MuscleGroupTarget,
  MuscleAnalysisPhotoResult,
  MuscleGroupIsolationResult,
  MUSCLE_GROUPS_CONFIG,
  isolateMuscleGroupAcrossPhotos,
} from '@/constants/muscleIsolationAI';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ProgressPhotoGalleryModalProps {
  visible: boolean;
  onClose: () => void;
  photos: ProgressPhoto[];
  initialPhotoId?: string;
  onDeletePhoto: (photoId: string) => void;
  onUploadNewPhoto: () => void;
  onCaptureNewPhoto: () => void;
  onUpdatePhoto?: (photoId: string, updates: { caption?: string; date?: string; weightKg?: number }) => void;
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

  // Active view mode: 'single' | 'compare' | 'muscles'
  const [viewMode, setViewMode] = useState<'single' | 'compare' | 'muscles'>('single');

  // Muscle isolation tool state
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroupTarget>('abs');
  const [isAnalyzingMuscles, setIsAnalyzingMuscles] = useState<boolean>(false);
  const [muscleIsolationData, setMuscleIsolationData] = useState<MuscleGroupIsolationResult | null>(null);

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
  const [editWeight, setEditWeight] = useState('');

  // Toggle overlay for displaying weight on images in comparison and single views
  const [showWeightOverlay, setShowWeightOverlay] = useState<boolean>(true);

  // A/B Comparison Slider (0 to SCREEN_WIDTH)
  const sliderPosition = useRef(new Animated.Value(SCREEN_WIDTH / 2)).current;
  const currentSliderX = useRef<number>(SCREEN_WIDTH / 2);

  // Broad panResponder for dragging anywhere across the screen in A/B Comparison mode
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
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
  useEffect(() => {
    if (visible) {
      setViewMode('single');
      if (initialPhotoId && sortedPhotos.length > 0) {
        const idx = sortedPhotos.findIndex((p) => p.id === initialPhotoId);
        setActivePhotoIndex(idx >= 0 ? idx : sortedPhotos.length - 1);
      } else if (sortedPhotos.length > 0) {
        setActivePhotoIndex(sortedPhotos.length - 1);
      }
    }
  }, [visible, initialPhotoId, sortedPhotos]);

  // Run AI Muscle Isolation whenever 'muscles' mode is active or muscle selection changes
  useEffect(() => {
    if (viewMode === 'muscles' && sortedPhotos.length > 0) {
      let isMounted = true;
      setIsAnalyzingMuscles(true);
      isolateMuscleGroupAcrossPhotos(sortedPhotos, selectedMuscle)
        .then((res) => {
          if (isMounted) {
            setMuscleIsolationData(res);
            setIsAnalyzingMuscles(false);
          }
        })
        .catch(() => {
          if (isMounted) setIsAnalyzingMuscles(false);
        });
      return () => {
        isMounted = false;
      };
    }
  }, [viewMode, selectedMuscle, sortedPhotos]);

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
        await Sharing.shareAsync(currentPhoto.uri, {
          mimeType: 'image/jpeg',
          dialogTitle: shareMessage,
          UTI: 'public.jpeg',
        });
      } else {
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
    setEditWeight(currentPhoto.weightKg !== undefined && currentPhoto.weightKg !== null ? String(currentPhoto.weightKg) : '');
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!currentPhoto) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (onUpdatePhoto) {
      const parsedWeight = editWeight.trim() ? parseFloat(editWeight.trim()) : undefined;
      onUpdatePhoto(currentPhoto.id, {
        caption: editCaption.trim() || undefined,
        date: editDate.trim() || currentPhoto.date,
        weightKg: !isNaN(parsedWeight as number) ? parsedWeight : undefined,
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
        {/* TOP BAR: Solid black background, Centered Title/Date, Back/Close on left, Muscles & Compare on right */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.circleIconButton}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color="#ffffff" />
          </TouchableOpacity>

          {/* Centered Date Header with Subtext and Compact Toggles */}
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
            ) : viewMode === 'compare' ? (
              <>
                <Text style={styles.dateHeaderTitle}>A/B Comparison</Text>
                <Text style={styles.uploadSubText}>Drag slider to size images</Text>
              </>
            ) : (
              <>
                <Text style={styles.dateHeaderTitle}>AI Muscle Progress Grid</Text>
                <Text style={styles.uploadSubText}>Isolated across all photos over time</Text>
              </>
            )}

            {/* Compact Toggles below caption & date: Weight Toggle + AI Muscles Toggle */}
            <View style={styles.subHeaderTogglesRow}>
              {/* 1. Weight on/off toggle */}
              <TouchableOpacity
                style={[
                  styles.compactSubToggle,
                  showWeightOverlay && { backgroundColor: 'rgba(56, 189, 248, 0.22)', borderColor: '#38bdf8' },
                ]}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setShowWeightOverlay((prev) => !prev);
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="scale-outline"
                  size={12}
                  color={showWeightOverlay ? '#38bdf8' : '#a1a1aa'}
                />
                <Text
                  style={[
                    styles.compactSubToggleText,
                    { color: showWeightOverlay ? '#38bdf8' : '#a1a1aa' },
                  ]}
                >
                  Weight {showWeightOverlay ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>

              {/* 2. AI Muscles toggle */}
              {photos.length > 0 && (
                <TouchableOpacity
                  style={[
                    styles.compactSubToggle,
                    viewMode === 'muscles' && { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setViewMode((curr) => (curr === 'muscles' ? 'single' : 'muscles'));
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="grid"
                    size={12}
                    color={viewMode === 'muscles' ? '#09090b' : '#ffffff'}
                  />
                  <Text
                    style={[
                      styles.compactSubToggleText,
                      { color: viewMode === 'muscles' ? '#09090b' : '#ffffff' },
                    ]}
                  >
                    AI Muscles
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Right Action: A/B Compare Toggle (icon only) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 38, justifyContent: 'flex-end' }}>
            {photos.length >= 2 ? (
              <TouchableOpacity
                style={[
                  styles.modePillBtn,
                  viewMode === 'compare' && { backgroundColor: '#ffffff', borderColor: '#ffffff' },
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
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Ionicons
                  name="git-compare"
                  size={16}
                  color={viewMode === 'compare' ? '#09090b' : '#ffffff'}
                />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 10 }} />
            )}
          </View>
        </View>

        {/* MAIN VIEW AREA: Single | Compare | AI Muscle Isolation Grid */}
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
        ) : viewMode === 'muscles' ? (
          /* =========================================================================
             AI MUSCLE GROUP ISOLATION GRID
             ========================================================================= */
          <View style={styles.muscleIsolationContainer}>
            {/* Muscle Group Filter Selector */}
            <View style={styles.muscleSelectorBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.muscleChipsScroll}>
                {MUSCLE_GROUPS_CONFIG.map((group) => {
                  const isSelected = selectedMuscle === group.id;
                  return (
                    <TouchableOpacity
                      key={group.id}
                      style={[
                        styles.muscleChip,
                        isSelected && {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setSelectedMuscle(group.id);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={group.icon as any}
                        size={14}
                        color={isSelected ? '#09090b' : '#ffffff'}
                      />
                      <Text
                        style={[
                          styles.muscleChipText,
                          {
                            color: isSelected ? '#09090b' : '#ffffff',
                            fontWeight: isSelected ? '800' : '600',
                          },
                        ]}
                      >
                        {group.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* AI Analysis Summary Banner */}
            <View style={styles.aiBadgeBanner}>
              <View style={styles.aiPulseDot} />
              <Text style={styles.aiBadgeText}>
                {isAnalyzingMuscles
                  ? `AI Pose Tracker identifying ${selectedMuscle.toUpperCase()} across all photos...`
                  : `${muscleIsolationData?.summary || 'Muscles isolated & aligned chronologically'}`}
              </Text>
            </View>

            {/* Grid of Isolated Muscle Crops */}
            {isAnalyzingMuscles ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Aligning anatomy & isolating muscle contours...</Text>
              </View>
            ) : (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={styles.gridScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.musclePhotosGrid}>
                  {muscleIsolationData?.photos.map((item, idx) => {
                    const isNewest = idx === muscleIsolationData.photos.length - 1;
                    const crop = item.cropBox;
                    // Compute zoomed-in offset inside square tile
                    const tileWidth = (SCREEN_WIDTH - 44) / 2;
                    const tileHeight = tileWidth * 1.15;

                    return (
                      <View key={item.photoId} style={styles.muscleTile}>
                        {/* Zoomed Crop Container */}
                        <View style={[styles.cropWindow, { width: tileWidth, height: tileHeight }]}>
                          <Image
                            source={{ uri: item.photoUri }}
                            style={{
                              width: tileWidth * crop.zoomScale,
                              height: tileHeight * crop.zoomScale,
                              position: 'absolute',
                              left: -crop.x * tileWidth * crop.zoomScale,
                              top: -crop.y * tileHeight * crop.zoomScale,
                            }}
                            resizeMode="cover"
                          />

                          {/* Optical Reticle overlay */}
                          <View style={styles.reticleFrame}>
                            <View style={[styles.reticleCornerTL, { borderColor: colors.primary }]} />
                            <View style={[styles.reticleCornerBR, { borderColor: colors.primary }]} />
                          </View>

                          {/* Date Pill Top-Left */}
                          <View style={styles.tileDatePill}>
                            <Text style={styles.tileDatePillText}>
                              {new Date(item.date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </Text>
                          </View>

                          {/* Progression Tag Top-Right */}
                          {isNewest && (
                            <View style={[styles.tileNewestPill, { backgroundColor: colors.primary }]}>
                              <Text style={styles.tileNewestPillText}>LATEST</Text>
                            </View>
                          )}
                        </View>

                        {/* Clean Card Info: Only the Definition Score Tag */}
                        <View style={styles.tileDetails}>
                          <View style={styles.tileScoreRow}>
                            <View style={[styles.scoreTag, { backgroundColor: `${colors.primary}25` }]}>
                              <Text style={[styles.scoreTagText, { color: colors.primary }]}>
                                {item.definitionScore}% Definition
                              </Text>
                            </View>
                            <Text style={styles.tileVascScoreText}>
                              {item.vascularityScore}% Vasc
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
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

            {/* Weight Pill Overlay in Single View (when toggled ON and weight exists) */}
            {showWeightOverlay && currentPhoto?.weightKg !== undefined && currentPhoto?.weightKg !== null && (
              <View style={styles.singleWeightBadge}>
                <Ionicons name="scale" size={13} color="#ffffff" />
                <Text style={styles.singleWeightBadgeText}>{currentPhoto.weightKg} kg</Text>
              </View>
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
                  {showWeightOverlay && photoB.weightKg !== undefined && photoB.weightKg !== null && (
                    <Text style={styles.compareWeightText}>⚖️ {photoB.weightKg} kg</Text>
                  )}
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
                  {showWeightOverlay && photoA.weightKg !== undefined && photoA.weightKg !== null && (
                    <Text style={styles.compareWeightText}>⚖️ {photoA.weightKg} kg</Text>
                  )}
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
                        if (viewMode === 'muscles') {
                          setViewMode('single');
                        }
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
                <TouchableOpacity
                  style={styles.actionIconBtn}
                  onPress={handleOpenEdit}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="create-outline" size={25} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionIconBtn}
                  onPress={onCaptureNewPhoto}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera-outline" size={26} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionIconBtn}
                  onPress={onUploadNewPhoto}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="image-outline" size={25} color="#ffffff" />
                </TouchableOpacity>
              </View>

              {/* Right: Trashbin */}
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

              <Text style={styles.editFieldLabel}>BODY WEIGHT (KG / LBS):</Text>
              <TextInput
                style={styles.editTextInput}
                value={editWeight}
                onChangeText={setEditWeight}
                placeholder="e.g. 78.5"
                placeholderTextColor="#71717a"
                keyboardType="numeric"
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingBottom: 14,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    zIndex: 20,
  },
  circleIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateHeaderCol: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  dateHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    fontFamily: SERIF_FONT,
    textAlign: 'center',
  },
  uploadSubText: {
    color: '#a1a1aa',
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  captionSubText: {
    color: '#d4d4d8',
    fontSize: 11.5,
    marginTop: 2,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  subHeaderTogglesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  compactSubToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  compactSubToggleText: {
    fontSize: 10.5,
    fontWeight: '700',
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
  compareWeightText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    opacity: 0.95,
  },
  singleWeightBadge: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  singleWeightBadgeText: {
    color: '#ffffff',
    fontSize: 12,
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

  /* =========================================================================
     AI MUSCLE GROUP ISOLATION STYLES
     ========================================================================= */
  muscleIsolationContainer: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  muscleSelectorBar: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  muscleChipsScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  muscleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  muscleChipText: {
    fontSize: 12,
  },
  aiBadgeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  aiPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#38bdf8',
  },
  aiBadgeText: {
    fontSize: 11,
    color: '#a1a1aa',
    fontWeight: '600',
    flex: 1,
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 20,
  },
  loadingText: {
    fontSize: 13,
    color: '#a1a1aa',
    fontWeight: '600',
    textAlign: 'center',
  },
  gridScrollContent: {
    padding: 14,
    paddingBottom: 28,
  },
  musclePhotosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  muscleTile: {
    width: (SCREEN_WIDTH - 40) / 2,
    borderRadius: 14,
    backgroundColor: '#18181b',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  cropWindow: {
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000000',
  },
  reticleFrame: {
    ...StyleSheet.absoluteFillObject,
    padding: 8,
    justifyContent: 'space-between',
  },
  reticleCornerTL: {
    width: 14,
    height: 14,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  reticleCornerBR: {
    alignSelf: 'flex-end',
    width: 14,
    height: 14,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  tileDatePill: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  tileDatePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },
  tileNewestPill: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tileNewestPillText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#09090b',
    letterSpacing: 0.5,
  },
  tileDetails: {
    padding: 8,
  },
  tileScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  scoreTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  tileVascScoreText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#a1a1aa',
  },
  /* Filmstrip & Action Bar */
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
