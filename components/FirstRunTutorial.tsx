import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppState, BackHandler, DeviceEventEmitter, GestureResponderEvent, Keyboard, Pressable, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions, type ViewProps, type TouchableOpacityProps } from 'react-native';
import { router, usePathname } from 'expo-router';
import type { BottomTabBarButtonProps } from 'expo-router/js-tabs';
import { useAuth } from '@/constants/AuthContext';
import { INITIAL_TUTORIAL, ONBOARDING_STEPS, spotlightRect, tutorialReducer, TutorialRect, TutorialTargetId } from '@/constants/onboardingMachine';
import { loadTutorialForAccount, saveTutorialProgress } from '@/constants/onboardingStorage';
import { ForcedOnboardingOverlay } from './ForcedOnboardingOverlay';

const PREVIEW_EVENT = 'footprint:preview-tutorial';
export function previewOnboardingTutorial() { DeviceEventEmitter.emit(PREVIEW_EVENT); }

type Target = { measure: (callback: (rect: TutorialRect) => void) => void; section?: boolean; reveal?: () => void; press: (event: GestureResponderEvent) => void };
type Registry = { register: (id: TutorialTargetId, target: Target) => () => void; changed: () => void; activeTarget: TutorialTargetId | null };
const TargetContext = createContext<Registry | null>(null);
export function useTutorialTargetId() { return useContext(TargetContext)?.activeTarget ?? null; }
const ScrollContext = createContext<((node: React.ElementRef<typeof View> | null) => void) | undefined>(undefined);

/** Provides scroll-to-target behavior without changing a page's existing layout. */
export function TutorialScrollScope({ scrollRef, kind = 'scroll', children }: {
  scrollRef: React.RefObject<any>; kind?: 'scroll' | 'list'; children: React.ReactNode;
}) {
  const reveal = useCallback((node: React.ElementRef<typeof View> | null) => {
    const scroller = scrollRef.current;
    if (!scroller || !node) return;
    const scrollTo = (y: number) => kind === 'list' ? scroller.scrollToOffset({ offset: y, animated: false }) : scroller.scrollTo({ y, animated: false });
    scrollTo(0);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const viewport = kind === 'list' ? scroller.getNativeScrollRef?.() : scroller;
      viewport?.measureInWindow((_x: number, y: number) => node.measureInWindow((_tx, ty) => scrollTo(Math.max(0, ty - y - 110))));
    }));
  }, [scrollRef, kind]);
  return <ScrollContext.Provider value={reveal}>{children}</ScrollContext.Provider>;
}
export const TutorialScrollView = React.forwardRef<React.ElementRef<typeof ScrollView>, React.ComponentProps<typeof ScrollView>>(function TutorialScrollView(props, forwardedRef) {
  const ref = useRef<React.ElementRef<typeof ScrollView>>(null);
  React.useImperativeHandle(forwardedRef, () => ref.current!, []);
  return <TutorialScrollScope scrollRef={ref}><ScrollView {...props} ref={ref} /></TutorialScrollScope>;
});
function useTutorialTarget(id: TutorialTargetId, ref: React.RefObject<any>, onPress?: (event: GestureResponderEvent) => void, section = false) {
  const context = useContext(TargetContext), reveal = useContext(ScrollContext);
  const latest = useRef(onPress); latest.current = onPress;
  useEffect(() => context?.register(id, {
    section,
    measure: callback => ref.current?.measureInWindow((x: number, y: number, width: number, height: number) => callback({ x, y, width, height })),
    reveal: reveal ? () => reveal(ref.current) : undefined,
    press: event => latest.current?.(event),
  }), [context?.register, id, ref, reveal, section]);
  return context;
}
/** A section spotlight is an acknowledgement; its child controls stay untouched. */
export function TutorialAnchor({ tutorialId, ...props }: ViewProps & { tutorialId: TutorialTargetId }) {
  const ref = useRef<React.ElementRef<typeof View>>(null);
  const context = useTutorialTarget(tutorialId, ref, undefined, true);
  return <View {...props} ref={ref} collapsable={false} onLayout={event => { props.onLayout?.(event); context?.changed(); }} />;
}
export function TutorialButton({ tutorialId, ...props }: TouchableOpacityProps & { tutorialId: TutorialTargetId }) {
  const ref = useRef<React.ElementRef<typeof TouchableOpacity>>(null);
  const context = useTutorialTarget(tutorialId, ref, props.onPress);
  return <TouchableOpacity {...props} ref={ref} onLayout={event => { props.onLayout?.(event); context?.changed(); }} />;
}

export function TutorialTabButton({ tutorialId, ...props }: BottomTabBarButtonProps & { tutorialId: TutorialTargetId }) {
  const context = useContext(TargetContext);
  const ref = useRef<React.ElementRef<typeof Pressable>>(null);
  const latestPress = useRef(props.onPress); latestPress.current = props.onPress;
  useEffect(() => context?.register(tutorialId, {
    measure: callback => ref.current?.measureInWindow((x, y, width, height) => callback({ x, y, width, height })),
    press: event => latestPress.current?.(event),
  }), [context?.register, tutorialId]);
  const { hoverEffect: _hover, pressColor: _pressColor, pressOpacity: _opacity, href: _href, onLayout, style, ...rest } = props;
  return <Pressable {...rest} ref={ref} collapsable={false} style={style} onLayout={event => { onLayout?.(event); context?.changed(); }} />;
}

export function FirstRunTutorial({ children }: { children: React.ReactNode }) {
  const { user, profile, isLoading } = useAuth();
  const userId = user?.id;
  const path = usePathname();
  const dimensions = useWindowDimensions();
  const root = useRef<React.ElementRef<typeof View>>(null);
  const registry = useRef(new Map<TutorialTargetId, Target>());
  const [version, setVersion] = useState(0);
  const [frame, setFrame] = useState<TutorialRect>({ x: 0, y: 0, width: 0, height: 0 });
  const [target, setTarget] = useState<TutorialRect | null>(null);
  const [preview, setPreview] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loadedAccount, setLoadedAccount] = useState<string | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [state, dispatch] = useReducer(tutorialReducer, INITIAL_TUTORIAL);
  const stateRef = useRef(state); stateRef.current = state;
  const pressing = useRef(false);
  const revealed = useRef<Target | null>(null);
  const currentAccount = useRef(userId); currentAccount.current = userId;
  const active = enabled && !!userId && loadedAccount === userId && profile.hasCompletedSetup && !isLoading && state.phase !== 'done';
  const changed = useCallback(() => setVersion(value => value + 1), []);
  const register = useCallback((id: TutorialTargetId, entry: Target) => {
    registry.current.set(id, entry); changed();
    return () => { if (registry.current.get(id) === entry) { registry.current.delete(id); changed(); } };
  }, [changed]);
  const activeTarget = active ? ONBOARDING_STEPS[state.step].id : null;
  const context = useMemo(() => ({ register, changed, activeTarget }), [register, changed, activeTarget]);
  const measureRoot = useCallback(() => root.current?.measureInWindow((x, y, width, height) => {
    setFrame(old => old.x === x && old.y === y && old.width === width && old.height === height ? old : { x, y, width, height });
  }), []);
  useLayoutEffect(() => { measureRoot(); }, [measureRoot, dimensions.width, dimensions.height]);
  useEffect(() => {
    let alive = true;
    setPreview(false); setEnabled(false); setLoadedAccount(null); setTarget(null); pressing.current = false;
    if (!userId || isLoading || !profile.hasCompletedSetup) return;
    loadTutorialForAccount(userId).then(saved => {
      if (!alive || currentAccount.current !== userId || !saved) return;
      dispatch({ type: 'RESTORE', state: saved }); setLoadedAccount(userId); setEnabled(true); Keyboard.dismiss();
    }).catch(() => {});
    return () => { alive = false; };
  }, [userId, isLoading, profile.hasCompletedSetup]);
  useEffect(() => {
    if (enabled && !preview && userId && loadedAccount === userId) void saveTutorialProgress(userId, state).catch(() => {});
  }, [enabled, preview, userId, loadedAccount, state]);
  useEffect(() => {
    const listener = DeviceEventEmitter.addListener(PREVIEW_EVENT, () => {
      if (!userId || !profile.hasCompletedSetup) return;
      setPreview(true); setLoadedAccount(userId); pressing.current = false;
      dispatch({ type: 'RESTORE', state: INITIAL_TUTORIAL }); setEnabled(true); Keyboard.dismiss();
    });
    return () => listener.remove();
  }, [userId, profile.hasCompletedSetup]);
  useEffect(() => {
    if (preview && state.phase === 'done') { setEnabled(false); setPreview(false); }
  }, [preview, state.phase]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => listener.remove();
  }, []);
  useEffect(() => {
    if (!active) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => listener.remove();
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const step = ONBOARDING_STEPS[state.step];
    if (!['workouts', 'nutrition', 'community', 'map', 'account'].includes(step.id) && path !== step.route)
      router.navigate(step.route);
  }, [active, state.step, path]);
  useEffect(() => {
    if (!active || !foreground) return;
    let alive = true;
    setTarget(null);
    revealed.current = null;
    const measure = () => {
      const entry = registry.current.get(ONBOARDING_STEPS[state.step].id);
      if (entry && revealed.current !== entry) { revealed.current = entry; entry.reveal?.(); }
      entry?.measure(rect => {
      if (!alive) return;
      const local = spotlightRect(rect, frame);
      // On compact screens spotlight the visible top of an explanatory section so the card stays clear.
      if (local && entry?.section) local.height = Math.min(local.height, Math.max(48, frame.height - 470));
      setTarget(old => JSON.stringify(old) === JSON.stringify(local) ? old : local);
      });
    };
    measure(); const timer = setInterval(measure, 250);
    return () => { alive = false; clearInterval(timer); };
  }, [active, foreground, state.step, version, frame]);
  useEffect(() => {
    if (!active || state.phase !== 'waiting') { pressing.current = false; return; }
    dispatch({ type: 'ROUTE_READY', route: path });
    const timer = setTimeout(() => dispatch({ type: 'ACTION_FAILED' }), 5000);
    return () => clearTimeout(timer);
  }, [active, state.phase, state.step, path]);
  const act = (event: GestureResponderEvent) => {
    const current = stateRef.current;
    if (current.phase !== 'act' || !target || pressing.current) return;
    const step = ONBOARDING_STEPS[current.step]; const entry = registry.current.get(step.id);
    if (!entry) return;
    pressing.current = true;
    dispatch({ type: 'TARGET', id: step.id });
    try { entry.press(event); } catch { dispatch({ type: 'ACTION_FAILED' }); }
  };
  return <TargetContext.Provider value={context}>
    <View ref={root} collapsable={false} style={{ flex: 1 }} onLayout={measureRoot}>
      <View style={{ flex: 1 }} pointerEvents={active ? 'none' : 'auto'} accessibilityElementsHidden={active} importantForAccessibility={active ? 'no-hide-descendants' : 'auto'}>{children}</View>
      {active && frame.width > 0 && frame.height > 0 && <View style={[StyleSheet.absoluteFill, { zIndex: 10000, elevation: 10000 }]}>
        <ForcedOnboardingOverlay state={state} target={target} width={frame.width} height={frame.height}
          onRead={() => dispatch({ type: 'READ_NEXT' })} onTarget={act}
          onClose={preview ? () => { setEnabled(false); setPreview(false); } : undefined} />
      </View>}
    </View>
  </TargetContext.Provider>;
}
