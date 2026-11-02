import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg from 'react-native-svg';
import { BoxingFocusMitt } from './BoxingFocusMitt';
import { boxingPadArrival } from '@/constants/boxingPadPresentation';
import * as Haptics from 'expo-haptics';
import type { BoxingState } from '@/constants/repTrackerProtocol';

/** Animate only this overlay; camera preview size never depends on pad animation. */
export function BoxingPads({ state, frame, running, fresh }: {
  state?: BoxingState; frame: { left: number; top: number; width: number; height: number };
  running: boolean; fresh: boolean;
}) {
  const [elapsed, setElapsed] = useState(0); const received = useRef(Date.now());
  const previousHits = useRef(state?.hits || 0);
  useEffect(() => { received.current = Date.now(); setElapsed(0);
    if (state && state.hits > previousHits.current) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    previousHits.current = state?.hits || 0;
  }, [state]);
  useEffect(() => {
    if (!running || !fresh || !state?.target) return;
    const timer = setInterval(() => setElapsed(Math.min(.45, (Date.now()-received.current)/1000)), 33);
    return () => clearInterval(timer);
  }, [running, fresh, state?.target?.id]);
  const target = state?.target;
  if (!target || !running || !fresh) return null;
  const color = target.hand === 'l' ? '#38bdf8' : '#fb7185';
  const age = target.age + elapsed; const progress = Math.min(1.18, age / 3);
  const radius = Math.max(26, Math.min(55, state.scale * frame.height * .52));
  const cx = frame.left + target.x * frame.width, cy = frame.top + target.y * frame.height;
  const padRadius = radius * (.25 + .75 * Math.min(1.15, progress));
  const arrival = boxingPadArrival(target.kind, target.inward, age, radius);
  const ready = age >= 1.9 && age <= 3.8;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
      <BoxingFocusMitt x={cx+arrival.x} y={cy+arrival.y} size={padRadius} kind={target.kind} inward={target.inward} hand={target.hand} ready={ready} />
    </Svg>
    <View style={{ position: 'absolute', left: Math.max(8, cx-100), top: cy+radius*1.6+10, width: 200, alignItems: 'center' }}>
      <Text style={styles.label}>{target.hand === 'l' ? 'LEFT' : 'RIGHT'} {target.kind.toUpperCase()}</Text>
      <Text style={styles.direction}>{target.kind === 'uppercut' ? '↑ PUNCH UP' : target.kind === 'hook' ? `${target.inward < 0 ? '←' : '→'} HOOK INWARD` : 'PUNCH FORWARD'}</Text>
      <Text style={[styles.timing, { color }]}>{ready ? 'HIT NOW' : 'GET READY'}</Text>
    </View>
  </View>;
}
const styles = StyleSheet.create({ label: { color: '#fff', backgroundColor: '#09090bdd', borderRadius: 8, padding: 6, fontSize: 12, fontWeight: '800' },
  direction: { color: '#f4f4f5', backgroundColor: '#09090bcc', borderRadius: 5, paddingHorizontal: 5, fontSize: 10, fontWeight: '700', marginTop: 4 },
  timing: { fontSize: 11, fontWeight: '800', marginTop: 4, textShadowColor: '#000', textShadowRadius: 4 } });
