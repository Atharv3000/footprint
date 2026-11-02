import { BoxingPads } from '@/components/BoxingPads';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Image, Linking, Modal, Share, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import Svg, { Circle, Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/constants/AuthContext';
import { useTheme } from '@/constants/ThemeContext';
import { DragSlider } from '@/components/DragSlider';
import { landmarkFrame, previewFrame } from '@/constants/cameraFraming';
import { WorkoutTrackingData } from '@/constants/workoutStorage';
import { BattleState, ownShare, PoseFrame, RepConnection, repServerUrl } from '@/constants/repTrackerProtocol';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaveTrackedWorkout: (data: WorkoutTrackingData) => void;
}
export type TrackableExercise = 'pushups' | 'squats' | 'bicep_curls' | 'boxing';
const bones = [['shoulder_l', 'shoulder_r'], ['shoulder_l', 'elbow_l'], ['elbow_l', 'wrist_l'],
  ['shoulder_r', 'elbow_r'], ['elbow_r', 'wrist_r'], ['shoulder_l', 'hip_l'], ['shoulder_r', 'hip_r'],
  ['hip_l', 'hip_r'], ['hip_l', 'knee_l'], ['hip_r', 'knee_r'], ['knee_l', 'ankle_l'], ['knee_r', 'ankle_r']];

function Action({ children, onPress, disabled = false, secondary = false }: {
  children: React.ReactNode; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  const { colors } = useTheme();
  return <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[s.action, { backgroundColor: colors.primary }, secondary && s.secondary, secondary && children === 'Pause' && { borderColor: '#ef4444' }, disabled && { opacity: .4 }]}>
    <Text style={[s.actionText, secondary && { color: children === 'Pause' ? '#ef4444' : '#f4f4f5' }]}>{children}</Text>
  </TouchableOpacity>;
}

export function CameraFormTrackerModal({ visible, onClose, onSaveTrackedWorkout }: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const [isUltraWide, setIsUltraWide] = useState(false);
  const [ultraWideLens, setUltraWideLens] = useState<string>();
  const [standardLens, setStandardLens] = useState<string>();
  const [cameraZoom, setCameraZoom] = useState(0);
  const [fitFullFrame, setFitFullFrame] = useState(true);
  const [showZoomControls, setShowZoomControls] = useState(false);
  const [cameraAspect, setCameraAspect] = useState(.75);
  const discoveredFacing = useRef<string | null>(null);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const facingRef = useRef(facing);
  facingRef.current = facing;
  const [mode, setMode] = useState<'solo' | 'battle'>('solo');
  const [exercise, setExercise] = useState<TrackableExercise>('pushups');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [playerId, setPlayerId] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [pictureSize, setPictureSize] = useState<string>();
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [pose, setPose] = useState<PoseFrame | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [opponentFrame, setOpponentFrame] = useState<string | null>(null);
  const [opponentAt, setOpponentAt] = useState(0);
  const [joinCode, setJoinCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(Date.now());
  const [viewSize, setViewSize] = useState({ width: 300, height: 350 });
  const camera = useRef<CameraView>(null);
  const socket = useRef<RepConnection | null>(null);
  const framePending = useRef(false);
  const frameSentAt = useRef(0);
  const capturing = useRef(false);
  const commandPending = useRef(false);
  const commandTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resetting = useRef(false);
  const lastPoseAt = useRef(0);
  const startedAt = useRef(Date.now());
  const saved = useRef(false);
  const ignoredRooms = useRef(new Set<string>());
  const current = useRef({ running, active, battle, mode, exercise });
  current.current = { running, active, battle, mode, exercise };

  const send = (message: object) => {
    if (socket.current?.readyState !== RepConnection.OPEN) { setError('Connect to the rep server first.'); return false; }
    socket.current.send(JSON.stringify(message)); return true;
  };

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    activateKeepAwakeAsync('footprint-rep-tracker').then(() => {
      if (cancelled) deactivateKeepAwake('footprint-rep-tracker').catch(() => {});
    }).catch(() => {});
    return () => { cancelled = true; deactivateKeepAwake('footprint-rep-tracker').catch(() => {}); };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setRunning(false); setBattle(null); setPose(null); setMode('solo'); setExercise('pushups');
    setError(''); setOpponentFrame(null); setJoinCode(''); setPending(false); saved.current = false;
    ignoredRooms.current.clear();
    setCameraReady(false); setCameraError(''); setShowInfoModal(false); setShowZoomControls(false);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setTick(Date.now()), 250);
    const listener = AppState.addEventListener('change', state => {
      const foreground = state === 'active'; setActive(foreground);
      if (!foreground) {
        setRunning(false);
        if (socket.current?.readyState === RepConnection.OPEN) socket.current.send(JSON.stringify({ type: 'pause' }));
        if (current.current.battle) {
          ignoredRooms.current.add(current.current.battle.code);
          setError('You left the battle when the app moved to the background.');
        }
        setBattle(null); setOpponentFrame(null);
      }
    });
    return () => { clearInterval(timer); listener.remove(); };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    let ws: RepConnection;
    setConnected(false); setConnecting(true); setPlayerId(''); setPending(false);
    framePending.current = false; commandPending.current = false; resetting.current = false;
    const timeout = setTimeout(() => {
      if (!alive) return;
      setConnecting(false); setError('Rep server timed out. Start it with npm run start:reps:tunnel, then reconnect.');
      ws?.close();
    }, 12000);
    try {
      if (!process.env.EXPO_PUBLIC_REP_TOKEN) throw new Error('Start Expo with npm run start:reps:tunnel to enable rep tracking and battles.');
      ws = new RepConnection(repServerUrl()); socket.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: process.env.EXPO_PUBLIC_REP_TOKEN }));
      ws.onmessage = event => {
        if (!alive) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'connected') {
            clearTimeout(timeout); setPlayerId(message.player_id); setConnected(true); setConnecting(false); setError('');
          } else if (message.type === 'pose') {
            framePending.current = false;
            if (!resetting.current) {
              lastPoseAt.current = Date.now(); setPose(message);
              if (message.boxing?.finished) setRunning(false);
            }
          } else if (message.type === 'frame_skipped') {
            framePending.current = false;
          } else if (message.type === 'reset') {
            resetting.current = false; setPose(null); saved.current = false; startedAt.current = Date.now();
          } else if (message.type === 'battle_state') {
            if (ignoredRooms.current.has(message.code)) return;
            const previous = current.current.battle;
            if (previous && previous.code === message.code && previous.revision > message.revision) return;
            current.current = { ...current.current, battle: message };
            clearTimeout(commandTimer.current);
            commandPending.current = false; setPending(false); setError('');
            setBattle(message);
            if (message.status === 'active' && previous?.status !== 'active') { saved.current = false; startedAt.current = Date.now(); }
            if (message.status === 'finished' || message.status === 'cancelled') {
              setRunning(false); setOpponentFrame(null);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            }
          } else if (message.type === 'opponent_frame') {
            setOpponentFrame(`data:image/jpeg;base64,${message.image}`); setOpponentAt(Date.now());
          } else if (message.type === 'left') {
            clearTimeout(commandTimer.current);
            commandPending.current = false; setPending(false); setBattle(null); setOpponentFrame(null);
            if (current.current.mode === 'battle') setPose(null);
          } else if (message.type === 'error') {
            clearTimeout(commandTimer.current);
            framePending.current = false; commandPending.current = false; resetting.current = false;
            setPending(false); setError(message.message);
            if (current.current.mode === 'battle' && !current.current.battle) setRunning(false);
          }
        } catch { setError('The rep server sent an invalid response. Reconnect to start again.'); }
      };
      ws.onerror = () => setError('Cannot reach the rep server. Keep npm run start:reps:tunnel running.');
      ws.onclose = () => {
        if (!alive) return;
        clearTimeout(timeout); setConnected(false); setConnecting(false); setRunning(false);
        setBattle(null); setPose(null); setOpponentFrame(null); setPending(false);
        setError('Connection closed. Reconnect to begin a new session.');
      };
    } catch (failure) { setConnecting(false); setError((failure as Error).message); clearTimeout(timeout); }
    const heartbeat = setInterval(() => { if (ws?.readyState === RepConnection.OPEN) ws.send(JSON.stringify({ type: 'ping' })); }, 15000);
    return () => {
      alive = false; clearTimeout(timeout); clearInterval(heartbeat);
      clearTimeout(commandTimer.current);
      ws?.close(); socket.current = null; framePending.current = false;
    };
  }, [visible, connectionAttempt]);

  useEffect(() => {
    if (!visible || !connected || !permission?.granted || !cameraReady || !active || !running) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function nextFrame() {
      const state = current.current;
      if (!alive || !state.running || !state.active) return;
      if (framePending.current && Date.now() - frameSentAt.current > 10000) {
        setRunning(false); setError('Camera analysis stalled. Reconnect before continuing.'); return;
      }
      if (!capturing.current && !framePending.current && !commandPending.current && !resetting.current
          && Date.now() - frameSentAt.current >= 220 && camera.current) {
        capturing.current = true;
        let uri: string | undefined;
        try {
          const photo = await camera.current.takePictureAsync({ quality: .5, base64: true, exif: false, shutterSound: false });
          uri = photo?.uri;
          if (alive && current.current.running && current.current.active && photo?.base64 && socket.current?.readyState === RepConnection.OPEN) {
            framePending.current = true; frameSentAt.current = Date.now();
            socket.current.send(JSON.stringify({ type: 'frame', image: photo.base64 }));
          }
        } catch { if (alive) { setError('Camera capture failed. Check camera access and try again.'); setRunning(false); } }
        finally {
          capturing.current = false;
          if (uri && FileSystem.cacheDirectory && uri.startsWith(FileSystem.cacheDirectory)) {
            FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
          }
        }
      }
      if (alive) timer = setTimeout(nextFrame, 60);
    }
    nextFrame();
    return () => { alive = false; clearTimeout(timer); };
  }, [visible, connected, permission?.granted, cameraReady, active, running, facing]);

  function reset(ex: TrackableExercise = exercise) {
    setPose(null); setError(''); resetting.current = true;
    if (!send({ type: 'reset', exercise: ex })) resetting.current = false;
    saved.current = false; startedAt.current = Date.now();
  }

  function roomCommand(type: 'create' | 'join' | 'ready', ready?: boolean) {
    if (commandPending.current) return;
    commandPending.current = true; setPending(true); setError('');
    clearTimeout(commandTimer.current);
    commandTimer.current = setTimeout(() => {
      commandPending.current = false; setPending(false); setRunning(false);
      setError('Battle request timed out. Reconnect before trying again.');
      socket.current?.close();
    }, 10000);
    if (send({ type, name: user?.name || 'Player', code: joinCode.trim().toUpperCase(), ready })) {
      if (type !== 'ready') { setPose(null); setOpponentFrame(null); setRunning(true); saved.current = false; }
    } else { clearTimeout(commandTimer.current); commandPending.current = false; setPending(false); }
  }

  function leaveBattle() {
    if (battle) ignoredRooms.current.add(battle.code);
    send({ type: 'leave' }); setRunning(false); setBattle(null); setPose(null); setOpponentFrame(null); setError('');
  }

  function changeMode(next: 'solo' | 'battle') {
    if (battle || pending) return;
    setRunning(false); setMode(next); setPose(null); setError('');
    reset(next === 'battle' ? 'pushups' : exercise);
  }

  function close() {
    if (battle && ['waiting', 'countdown', 'active'].includes(battle.status)) {
      Alert.alert('Leave battle?', 'Leaving an active battle forfeits it to your friend.', [
        { text: 'Stay', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: () => { leaveBattle(); onClose(); } },
      ]);
    } else onClose();
  }

  const boxing = exercise === 'boxing' && mode === 'solo';
  const ownReps = battle ? battle.counts[playerId] || 0 : pose?.rep_count || 0;
  function save() {
    if (!ownReps || saved.current) return;
    saved.current = true; setRunning(false);
    onSaveTrackedWorkout({ exerciseType: battle || mode === 'battle' ? 'pushups' : exercise, repCount: ownReps,
      averageFormScore: 0, formAdvice: [exercise === 'boxing' ? 'Shadowboxing pad hits, not a boxing technique or impact-force assessment.' : 'Camera-counted repetitions. A biomechanical form score was not assessed.'],
      boxingScore: pose?.boxing?.score, boxingMisses: pose?.boxing?.misses, boxingBestCombo: pose?.boxing?.best_combo,
      feedbackHighlights: [exercise === 'boxing' ? 'Camera shadowboxing pad hits; experimental direction heuristics.' : battle ? 'Live push-up battle.' : 'Pose-based camera rep tracking.', 'Only complete visible cycles counted.'],
      durationSeconds: Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)),
    });
    onClose();
  }

  const opponent = battle?.players.find(p => p !== playerId);
  const opponentName = opponent ? battle?.names[opponent] || 'Friend' : 'Your friend';
  const ready = !!battle?.ready.includes(playerId);
  const canReady = pose?.valid && pose.calibrated && pose.view_mode === 'side' && pose.state === 'up' && tick - lastPoseAt.current < 2000;
  const share = battle ? ownShare(battle, playerId) : .5;
  const finished = battle?.status === 'finished' || battle?.status === 'cancelled';
  const countdown = battle?.start_at ? Math.max(0, Math.ceil(battle.start_at - tick / 1000)) : 3;
  const cameraStyle = useMemo(() => ({ position: 'absolute' as const,
    ...previewFrame(viewSize, cameraAspect, fitFullFrame) }),
  [viewSize.width, viewSize.height, cameraAspect, fitFullFrame]);
  const projected = landmarkFrame(cameraStyle, pose?.aspect);
  const frameWidth = projected.width;
  const frameHeight = projected.height;
  const framingLocked = running || !!battle;

  function changeFraming(apply: () => void) {
    if (current.current.running || current.current.battle) return;
    apply();
    // Keep recorded reps available to save. Starting the next set recalibrates.
    setPose(previous => previous ? { ...previous, valid: false, calibrated: false, keypoints: {} } : null);
  }

  const poseFresh = tick - lastPoseAt.current < 1600;
  const bodyDetected = poseFresh && !!pose && Object.values(pose.keypoints).some(point => point.visibility >= .4);
  const trackingStatus = connecting ? 'CONNECTING' : !connected ? 'OFFLINE' : !running ? 'READY'
    : boxing ? pose?.boxing?.finished ? 'ROUND COMPLETE' : !bodyDetected ? 'FINDING HANDS' : !pose?.calibrated ? 'RAISE YOUR GUARD' : 'BOXING'
    : !bodyDetected ? 'FINDING BODY' : !pose?.valid ? 'CHECK SETUP'
    : (exercise === 'pushups' || mode === 'battle') && pose.view_mode === 'head_on' ? 'TURN SIDE-ON'
    : !pose.calibrated ? 'CALIBRATING' : 'COUNTING REPS';
  const guideColor = poseFresh && pose?.valid ? '#22c55e' : '#f59e0b';
  const feedback = running ? poseFresh && pose ? (boxing ? pose.feedback.replace('as the pad reaches the ring', 'when HIT NOW appears') : pose.feedback) : 'Scanning for your body in frame...'
    : boxing ? 'Face the camera at chest height. Show both elbows and hands, raise your guard, then shadowbox the pads. Blue is LEFT; pink is RIGHT.'
    : exercise === 'pushups' || mode === 'battle' ? 'Place the phone low beside you. Turn your body side-on; show one complete arm and your hips. Begin in a straight-arm plank.'
    : exercise === 'squats' ? 'Place your phone at waist height. Keep hips, knees and ankles in view.' : 'Frame your shoulders, elbows and wrists. Extend, curl, then extend fully.';

  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
    <View style={styles.container} onLayout={event => setViewSize(event.nativeEvent.layout)}>
      {visible && active && permission?.granted && !cameraError ? <>
        <CameraView ref={camera} key={facing} style={cameraStyle} facing={facing} mirror={false}
          animateShutter={false} flash="off" pictureSize={pictureSize} zoom={cameraZoom} selectedLens={isUltraWide ? ultraWideLens : standardLens}
          onCameraReady={async () => {
            setCameraReady(true);
            try {
              const sizes = await camera.current?.getAvailablePictureSizesAsync();
              const ordered = sizes?.map(size => ({ size, pixels: size.split('x').reduce((a, n) => a * Number(n), 1) }))
                .filter(v => v.pixels >= 300000).sort((a, b) => a.pixels - b.pixels);
              if (ordered?.[0] && facingRef.current === facing) {
                setPictureSize(ordered[0].size);
                const dimensions = ordered[0].size.split('x').map(Number);
                setCameraAspect(Math.min(...dimensions) / Math.max(...dimensions));
              }
            } catch {}
            try {
              const lenses = await camera.current?.getAvailableLensesAsync();
              if (facingRef.current !== facing) return;
              const ultra = lenses?.find(lens => /ultra.?wide|0\.5/i.test(`${lens.deviceType} ${lens.localizedName}`))?.deviceType;
              const standard = lenses?.find(lens => /BuiltInWideAngleCamera/i.test(lens.deviceType))?.deviceType;
              setUltraWideLens(ultra); setStandardLens(standard);
              if (discoveredFacing.current !== facing) {
                discoveredFacing.current = facing;
                if (!current.current.running && !current.current.battle) setIsUltraWide(!!ultra);
              }
            } catch {}
          }} onMountError={event => { setCameraError(event.message); setRunning(false); }} />
        {!boxing && <View pointerEvents="none" style={[styles.framingGuideBox, { borderColor: guideColor }]}>
          <View style={[styles.guideCorner, styles.guideCornerTL, { borderColor: guideColor }]} />
          <View style={[styles.guideCorner, styles.guideCornerTR, { borderColor: guideColor }]} />
          <View style={[styles.guideCorner, styles.guideCornerBL, { borderColor: guideColor }]} />
          <View style={[styles.guideCorner, styles.guideCornerBR, { borderColor: guideColor }]} />
          <View style={[styles.distanceBadge, { backgroundColor: poseFresh && pose?.valid ? 'rgba(34,197,94,0.9)' : 'rgba(245,158,11,0.9)' }]}>
            <Ionicons name={poseFresh && pose?.valid ? 'checkmark-circle' : 'warning'} size={14} color="#fff" />
            <Text style={styles.distanceBadgeText}>{poseFresh && pose?.valid ? 'OPTIMAL DISTANCE · BODY IN FRAME'
              : exercise === 'pushups' || mode === 'battle' ? 'SIDE-ON VIEW · SHOW ARM & HIPS' : 'STEP BACK · FULL BODY MUST BE IN BOX'}</Text>
          </View>
        </View>
        }
        {boxing && <BoxingPads state={pose?.boxing} frame={projected} running={running} fresh={poseFresh && !!pose?.valid} />}
        {running && pose && bodyDetected && <Svg pointerEvents="none" width={viewSize.width} height={viewSize.height} style={StyleSheet.absoluteFill}>
          {bones.map(([a, b]) => {
            const p = pose.keypoints[a], q = pose.keypoints[b];
            if (!p || !q || p.visibility < .4 || q.visibility < .4) return null;
            const x1 = p.x * frameWidth + projected.left;
            const y1 = p.y * frameHeight + projected.top;
            const x2 = q.x * frameWidth + projected.left;
            const y2 = q.y * frameHeight + projected.top;
            const color = !pose.valid ? '#f59e0b' : a.startsWith('hip') || a.startsWith('knee') ? '#eab308' : '#22c55e';
            return <React.Fragment key={a+b}>
              <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={10} opacity={.35} strokeLinecap="round" />
              <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={4.5} opacity={.9} strokeLinecap="round" />
              <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={1.5} opacity={.8} strokeLinecap="round" />
            </React.Fragment>;
          })}
          {Object.values(pose.keypoints).filter(p => p.visibility >= .4).map(p => {
            const x = p.x * frameWidth + projected.left;
            const y = p.y * frameHeight + projected.top;
            const color = pose.valid ? '#22c55e' : '#f59e0b';
            return <React.Fragment key={p.id}><Circle cx={x} cy={y} r={11} fill={color} opacity={.25} />
              <Circle cx={x} cy={y} r={5.5} fill={color} stroke="#fff" strokeWidth={1.8} />
              <Circle cx={x} cy={y} r={2} fill="#fff" /></React.Fragment>;
          })}
        </Svg>}
      </> : <View style={styles.permissionFallback}>
        <Ionicons name="camera-outline" size={54} color={colors.primary} />
        <Text style={styles.permissionTitle}>{cameraError ? 'Camera unavailable' : 'Camera Permission Required'}</Text>
        <Text style={styles.permissionSubtitle}>{cameraError || 'Camera access is needed to track posture and count reps.'}</Text>
        <TouchableOpacity style={[styles.grantBtn, { backgroundColor: colors.primary }]} onPress={() => {
          if (cameraError) { setCameraError(''); setCameraReady(false); }
          else if (permission?.canAskAgain !== false) requestPermission().catch(() => setError('Could not request camera access.'));
          else Linking.openSettings();
        }}><Text style={styles.grantBtnText}>{cameraError ? 'Retry camera' : permission?.canAskAgain === false ? 'Open settings' : 'Grant Camera Permission'}</Text></TouchableOpacity>
      </View>}

      <View style={styles.topBar}>
        <TouchableOpacity accessibilityLabel="Close rep tracker" style={styles.circleIconButton} onPress={close}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexShrink: 1, marginHorizontal: 6 }} contentContainerStyle={styles.exerciseSelectorRow}>
          {(['boxing', 'pushups', 'squats', 'bicep_curls'] as const).map(ex => {
            const selected = (mode === 'battle' ? 'pushups' : exercise) === ex;
            return <TouchableOpacity key={ex} disabled={running || mode === 'battle'}
              style={[styles.exercisePill, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setExercise(ex); reset(ex); }}>
              <Text style={[styles.exercisePillText, selected && { color: '#09090b', fontWeight: '800' }]}>{ex === 'boxing' ? 'Boxing' : ex === 'pushups' ? 'Pushups' : ex === 'squats' ? 'Squats' : 'Curls'}</Text>
            </TouchableOpacity>;
          })}
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity accessibilityLabel="Adjust camera zoom and framing"
            style={[styles.circleIconButton, (isUltraWide || fitFullFrame) && { borderColor: colors.primary }]}
            onPress={() => setShowZoomControls(true)}>
            <Ionicons name="expand-outline" size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity accessibilityLabel="Flip camera" disabled={running || !!battle}
            style={[styles.circleIconButton, (running || !!battle) && { opacity: .45 }]}
            onPress={() => {
              discoveredFacing.current = null; setUltraWideLens(undefined); setStandardLens(undefined);
              setIsUltraWide(false); setCameraZoom(0); setCameraAspect(.75); setPictureSize(undefined);
              setCameraReady(false); setFacing(f => f === 'front' ? 'back' : 'front'); setPose(null); setCameraError('');
            }}>
            <Ionicons name="camera-reverse" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.hudOverlay}>
        {battle ? <View style={[styles.hudStatCard, { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
          <View style={s.between}><Text style={styles.hudLabel}>YOU · {ownReps}</Text><Text style={styles.hudLabel}>{opponentName.toUpperCase()} · {opponent ? battle.counts[opponent] || 0 : 0}</Text></View>
          <View accessibilityRole="progressbar" accessibilityLabel="Your share of the push-up battle" accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }} style={s.bar}>
            <View style={[s.fill, { width: `${share * 100}%`, backgroundColor: colors.primary }]} />
            <View style={[s.marker, { left: `${Math.max(1, Math.min(99, share * 100))}%` }]} /><View style={s.midline} />
          </View>
          <Text style={s.hint}>Lead by {battle.lead_to_win} reps to fill the bar and win.</Text>
        </View> : <View style={[styles.hudStatCard, boxing && { flexWrap: 'wrap', gap: 8 }]}>
          <View><Text style={styles.hudLabel}>{boxing ? 'BOXING SCORE' : 'REPS LOGGED'}</Text><Text style={styles.hudValue}>{boxing ? pose?.boxing?.score || 0 : ownReps}</Text>{boxing && <Text style={s.hint}>{ownReps} hits | {pose?.boxing?.misses || 0} misses | x{pose?.boxing?.combo || 0} combo</Text>}</View>
          <View style={styles.autoStatusPill}><View style={[styles.autoStatusDot, (!connected || running && trackingStatus !== 'COUNTING REPS') && { backgroundColor: '#f59e0b' }]} />
            <Text style={[styles.autoStatusText, running && trackingStatus !== 'COUNTING REPS' && { color: '#f59e0b' }]}>{boxing ? `${pose?.boxing?.remaining ?? 60}s | ${pose?.boxing?.finished ? 'ROUND COMPLETE' : pose?.boxing?.result || trackingStatus}` : trackingStatus}</Text>
          </View>
        </View>}
        {(!boxing || !running || !pose?.calibrated || !!error) && <View style={styles.adviceCapsule}>
          <View style={[styles.adviceHeaderRow, { justifyContent: 'space-between' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="scan" size={15} color="#22c55e" /><Text style={styles.adviceTitle}>FORM TRACKING & GUIDANCE</Text></View>
            <TouchableOpacity accessibilityLabel="Camera setup guide" onPress={() => setShowInfoModal(true)}><Ionicons name="information-circle-outline" size={20} color="#22c55e" /></TouchableOpacity>
          </View>
          <Text accessibilityLiveRegion="polite" style={[styles.adviceMessage, !!error && { color: '#fca5a5' }]}>{error || feedback}</Text>
          {!connected && !connecting && <TouchableOpacity onPress={() => setConnectionAttempt(n => n + 1)} style={{ paddingTop: 10 }}><Text style={s.link}>Reconnect</Text></TouchableOpacity>}
        </View>
        }
        {!battle && !boxing && <TouchableOpacity disabled={pending} onPress={() => changeMode(mode === 'solo' ? 'battle' : 'solo')}
          style={[styles.autoStatusPill, { alignSelf: 'flex-start', backgroundColor: 'rgba(10,10,16,0.94)' }]}>
          <Ionicons name={mode === 'solo' ? 'people-outline' : 'fitness-outline'} size={15} color="#22c55e" />
          <Text style={styles.autoStatusText}>{mode === 'solo' ? 'CHALLENGE A FRIEND' : 'BACK TO SOLO TRACKING'}</Text>
        </TouchableOpacity>}
      </View>

      {opponent && !finished && <View style={s.friendPreview}>
        {opponentFrame && tick - opponentAt < 2500 ? <Image source={{ uri: opponentFrame }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          : <View style={s.center}><Ionicons name="videocam-outline" size={26} color="#a1a1aa" /><Text style={s.hint}>Waiting for camera...</Text></View>}
        <View style={s.videoLabel}><Text numberOfLines={1} style={s.videoLabelText}>{opponentName} · {tick - opponentAt < 2500 ? 'LIVE' : 'WAITING'}</Text></View>
      </View>}
      {battle?.status === 'countdown' && <View pointerEvents="none" style={s.countdown}><Text style={[s.countdownNumber, { color: colors.primary }]}>{countdown || 'GO'}</Text><Text style={s.body}>Hold your plank. Start on GO.</Text></View>}

      <View style={styles.bottomDeck}>
        <View style={[s.deck, mode === 'battle' && styles.adviceCapsule]}>
        {finished ? <>
          <Text style={s.result}>{battle?.status === 'cancelled' ? 'Battle cancelled' : battle?.winner === playerId ? 'You won!' : `${opponentName} won`}</Text>
          <Text style={s.body}>{battle?.reason === 'opponent_left' ? 'A player left the battle.' : `${ownReps} reps. The bar is complete.`}</Text>
          <View style={s.row}><Action disabled={!ownReps} onPress={save}>Save my reps</Action><Action secondary onPress={leaveBattle}>New battle</Action></View>
        </> : mode === 'battle' && !battle ? <>
          <Text style={s.body}>Place your phone low beside you. Turn side-on and show a complete arm and your hips.</Text>
          <Text style={s.hint}>Creating or joining shares live camera frames with your opponent through this server. No audio or recording.</Text>
          <View style={s.row}><Action disabled={!connected || !cameraReady || pending} onPress={() => roomCommand('create')}>{pending ? 'Opening...' : 'Create battle'}</Action>
            <TextInput accessibilityLabel="Battle room code" autoCapitalize="characters" autoCorrect={false} maxLength={8} placeholder="ROOM CODE" placeholderTextColor="#71717a" value={joinCode} onChangeText={setJoinCode} style={s.input} />
            <Action secondary disabled={!connected || !cameraReady || pending || joinCode.trim().length !== 8} onPress={() => roomCommand('join')}>Join</Action>
          </View>
        </> : mode === 'battle' && battle ? <>
          {battle.status === 'waiting' && <>
            <View style={s.between}><Text selectable style={s.roomCode}>{battle.code.slice(0, 4)} {battle.code.slice(4)}</Text>
              <TouchableOpacity onPress={() => Share.share({ message: `Push-up battle? Open Footprint > Activity > Rep tracker > Challenge a friend, then join ${battle.code}. First to a 10-rep lead wins!` }).catch(() => setError('Could not share. Send your friend the room code above.'))}><Text style={s.link}>Invite friend</Text></TouchableOpacity></View>
            <Text style={s.body}>{pose && tick - lastPoseAt.current < 2000 ? pose.feedback : 'Hold a side-on straight-arm plank to calibrate.'}</Text>
            <View style={s.row}><Action disabled={pending || (!ready && !canReady)} onPress={() => roomCommand('ready', !ready)}>{ready ? 'Ready - tap to undo' : 'I am ready'}</Action><Action secondary onPress={leaveBattle}>Leave</Action></View>
            <Text style={s.hint}>{battle.ready.length}/2 ready. Both players must be in view; then a shared countdown begins.</Text>
          </>}
          {battle.status === 'active' && <><Text style={s.body}>{pose && tick - lastPoseAt.current < 2000 ? pose.feedback : 'Tracking paused until your full pose is visible.'}</Text><Action secondary onPress={close}>Leave battle</Action></>}
        </> : <>

          <View style={s.row}>
            <Action secondary={running} disabled={!connected || !cameraReady} onPress={() => {
              if (running) { setRunning(false); send({ type: 'pause' }); }
              else { reset(); setRunning(true); }
            }}>{running ? 'Pause' : boxing ? 'Start 60s boxing round' : ownReps ? 'Start a new set' : 'Start Camera Form Tracking'}</Action>
            {(running || ownReps > 0) && <Action disabled={!ownReps || resetting.current} onPress={save}>Save {boxing ? 'Hits' : 'Reps'} ({ownReps})</Action>}
          </View>
        </>}
        </View>
      </View>

      <Modal visible={visible && showZoomControls} transparent animationType="fade" onRequestClose={() => setShowZoomControls(false)}>
        <View style={styles.infoModalBackdrop}><View style={styles.infoModalCard}>
          <View style={styles.infoModalHeader}>
            <View><Text style={styles.infoModalTitle}>Camera framing</Text><Text style={styles.infoModalSubtitle}>Fit more of your body in view</Text></View>
            <TouchableOpacity accessibilityLabel="Close camera framing" style={styles.infoCloseBtn} onPress={() => setShowZoomControls(false)}><Ionicons name="close" size={20} color="#fff" /></TouchableOpacity>
          </View>
          <View style={{ gap: 16 }}>
            <View style={s.between}><Text style={styles.infoTipText}>Digital zoom</Text><Text style={[styles.infoTipText, { flex: 0 }]}>{Math.round(cameraZoom * 100)}%</Text></View>
            <View pointerEvents={framingLocked ? 'none' : 'auto'} style={framingLocked && { opacity: .4 }}>
              <DragSlider label="Camera zoom" hideHeader value={Math.round(cameraZoom * 100)} min={0} max={100} step={1}
                color={colors.primary} unit="%" onValueChange={value => changeFraming(() => setCameraZoom(Math.max(0, Math.min(1, value / 100))))} />
            </View>
            <View style={s.between}><Text style={s.hint}>Widest</Text><Text style={s.hint}>Zoom in</Text></View>
            <View style={s.row}>
              <Action disabled={framingLocked} onPress={() => changeFraming(() => {
                discoveredFacing.current = facing; setCameraZoom(0); setIsUltraWide(!!ultraWideLens); setFitFullFrame(true);
              })}>Widest view</Action>
              <Action secondary disabled={framingLocked} onPress={() => changeFraming(() => {
                discoveredFacing.current = facing; setCameraZoom(0); setIsUltraWide(false);
              })}>Standard lens</Action>
            </View>
            {!!ultraWideLens && <Action secondary disabled={framingLocked} onPress={() => changeFraming(() => {
              discoveredFacing.current = facing; setCameraZoom(0); setIsUltraWide(true);
            })}>{isUltraWide ? 'Ultra-wide lens selected' : 'Use ultra-wide lens'}</Action>}
            <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: fitFullFrame, disabled: framingLocked }}
              disabled={framingLocked} style={[s.row, framingLocked && { opacity: .4 }]} onPress={() => changeFraming(() => setFitFullFrame(value => !value))}>
              <Ionicons name={fitFullFrame ? 'checkbox' : 'square-outline'} size={22} color={colors.primary} />
              <Text style={[styles.infoTipText, { flex: 1 }]}>Show the full camera view</Text>
            </TouchableOpacity>
            <Text style={s.hint}>{framingLocked ? battle ? 'Framing is locked during a battle. Set it before creating or joining.' : 'Pause tracking to adjust framing, then begin a new set.'
              : ultraWideLens ? 'Ultra-wide shows more of your surroundings. Full camera view avoids cropping the sides of the preview.'
              : facing === 'front' ? 'Zero zoom is the front camera’s widest view. Try the rear camera for an ultra-wide lens on supported phones.' : 'This camera is at its widest at zero zoom. Full camera view shows the sides that the full-screen crop hides.'}</Text>
            <TouchableOpacity style={[styles.infoGotItBtn, { backgroundColor: colors.primary }]} onPress={() => setShowZoomControls(false)}><Text style={styles.infoGotItText}>Done</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      <Modal visible={visible && showInfoModal} transparent animationType="fade" onRequestClose={() => setShowInfoModal(false)}>
        <View style={styles.infoModalBackdrop}><View style={styles.infoModalCard}>
          <View style={styles.infoModalHeader}>
            <View><Text style={styles.infoModalTitle}>{boxing ? 'Boxing Setup Guide' : mode === 'battle' || exercise === 'pushups' ? 'Pushups Setup Guide' : exercise === 'squats' ? 'Squats Setup Guide' : 'Bicep Curls Setup Guide'}</Text><Text style={styles.infoModalSubtitle}>Optimal AI Camera Positioning</Text></View>
            <TouchableOpacity accessibilityLabel="Close setup guide" style={styles.infoCloseBtn} onPress={() => setShowInfoModal(false)}><Ionicons name="close" size={20} color="#fff" /></TouchableOpacity>
          </View>
          <View style={styles.infoContentBody}>
            <View style={styles.infoTipRow}><Ionicons name="phone-portrait-outline" size={20} color="#22c55e" /><Text style={styles.infoTipText}>{boxing ? 'Place the phone steadily at chest height, facing you. Keep both shoulders, elbows and hands visible. Shadowbox into open space, away from the phone.' : mode === 'battle' || exercise === 'pushups'
              ? 'Place the phone steadily at floor height beside you. Turn your body about 90 degrees to the camera, keeping one shoulder, elbow, wrist and hip visible. Keep the phone upright; do not rotate it sideways.'
              : exercise === 'squats' ? 'Place the phone around waist height. Keep your hips, knees and ankles visible.' : 'Face the camera with your shoulders, elbows and wrists clearly framed.'}</Text></View>
            <View style={styles.infoTipRow}><Ionicons name="scan-outline" size={20} color="#38bdf8" /><Text style={styles.infoTipText}>{boxing ? 'Raise both hands to guard to calibrate. Blue pads need your left hand; pink pads your right. Punch forward for straights, inward across for hooks, and upward for uppercuts. Strike when the pad glows and HIT NOW appears; return to guard.' : mode === 'battle' || exercise === 'pushups'
              ? 'Hold a straight-arm plank to calibrate, lower fully, then push back to straight arms. Keep the phone fixed after calibration.' : 'Move through a complete range of motion, then return fully to your starting position.'}</Text></View>
            <View style={styles.infoTipRow}><Ionicons name="body-outline" size={20} color="#eab308" /><Text style={styles.infoTipText}>{boxing ? 'A 60-second tracked round. Missed pads reset your combo. Tracking loss freezes the round. This camera prototype estimates motion direction; it cannot verify impact, power or boxing technique. Use deliberate punches at the on-screen pace.' : 'Only complete visible cycles count. Camera counting is experimental; a form score is not assessed.'}</Text></View>
          </View>
          <TouchableOpacity style={[styles.infoGotItBtn, { backgroundColor: colors.primary }]} onPress={() => setShowInfoModal(false)}><Text style={styles.infoGotItText}>Got It, Let's Go</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  permissionFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 18,
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionSubtitle: {
    fontSize: 14,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  grantBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 24,
  },
  grantBtnText: {
    color: '#09090b',
    fontWeight: '700',
    fontSize: 15,
  },
  framingGuideBox: {
    position: 'absolute',
    top: '16%',
    bottom: '22%',
    left: '8%',
    right: '8%',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 20,
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: 12,
  },
  guideCorner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderWidth: 3,
  },
  guideCornerTL: { top: -2, left: -2, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 18 },
  guideCornerTR: { top: -2, right: -2, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 18 },
  guideCornerBL: { bottom: -2, left: -2, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 18 },
  guideCornerBR: { bottom: -2, right: -2, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 18 },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  distanceBadgeText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  topBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 28,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  circleIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  lensBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  exerciseSelectorRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    gap: 2,
  },
  exercisePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  exercisePillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#ffffff',
  },
  hudOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : 90,
    left: 16,
    right: 16,
    gap: 10,
    zIndex: 10,
  },
  hudStatCard: {
    backgroundColor: 'rgba(15, 15, 20, 0.88)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hudLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9ca3af',
    letterSpacing: 1,
  },
  hudValue: {
    fontSize: 30,
    fontWeight: '900',
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
  },
  autoStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: 'rgba(34, 197, 94, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  autoStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  autoStatusText: {
    color: '#22c55e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  adviceCapsule: {
    backgroundColor: 'rgba(10, 10, 16, 0.94)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  adviceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  adviceTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#22c55e',
    letterSpacing: 0.8,
  },
  adviceMessage: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    lineHeight: 18,
  },
  bottomDeck: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 44 : 24,
    left: 16,
    right: 16,
    zIndex: 20,
  },
  mainActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 30,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  mainActionText: {
    color: '#09090b',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  activeDeckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deckSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 24,
    borderWidth: 1.5,
    backgroundColor: 'rgba(0,0,0,0.65)',
    gap: 6,
  },
  deckPrimaryBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
  },
  deckBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  infoModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  infoModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#18181b',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  infoModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  infoIconPill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  infoModalSubtitle: {
    fontSize: 12,
    color: '#a1a1aa',
    marginTop: 2,
  },
  infoCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContentBody: {
    gap: 14,
    marginBottom: 20,
  },
  infoTipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    borderRadius: 14,
  },
  infoTipText: {
    flex: 1,
    fontSize: 13,
    color: '#d4d4d8',
    lineHeight: 18,
  },
  infoGotItBtn: {
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoGotItText: {
    color: '#09090b',
    fontWeight: '800',
    fontSize: 15,
  },
  depthArrowOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  depthArrowPill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  depthArrowIconTop: {
    marginBottom: -55,
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  depthArrowIconBottom: {
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
  },
  depthTextBadge: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.75)',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  depthAlertText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
});


const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  body: { color: '#fff', fontSize: 13, lineHeight: 18 },
  hint: { color: '#a1a1aa', fontSize: 11, lineHeight: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 8 },
  videoLabel: { position: 'absolute', bottom: 8, left: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.65)', padding: 6, borderRadius: 8 },
  videoLabelText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  friendPreview: { position: 'absolute', right: 16, top: '41%', width: '32%', height: '24%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#09090b', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  bar: { height: 20, backgroundColor: '#a78bfa', borderRadius: 12, overflow: 'hidden' },
  fill: { height: '100%' },
  marker: { position: 'absolute', width: 3, height: '100%', backgroundColor: '#fff', marginLeft: -1.5 },
  midline: { position: 'absolute', left: '50%', height: '100%', width: 1, backgroundColor: '#09090b55' },
  deck: { gap: 10 },
  link: { color: '#22c55e', fontSize: 12, fontWeight: '800' },
  action: { flexGrow: 1, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: 'rgba(0,0,0,0.65)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' },
  actionText: { color: '#09090b', fontSize: 14, fontWeight: '800' },
  input: { flex: 1, minWidth: 90, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', color: '#fff', padding: 12, fontSize: 12, letterSpacing: 1 },
  roomCode: { color: '#fff', fontSize: 24, letterSpacing: 3, fontWeight: '800' },
  countdown: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#09090b88', alignItems: 'center', justifyContent: 'center' },
  countdownNumber: { fontWeight: '900', fontSize: 100 },
  result: { color: '#fff', fontWeight: '900', fontSize: 28 },
});
