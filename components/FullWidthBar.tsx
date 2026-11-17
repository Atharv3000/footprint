import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaFrame } from 'react-native-safe-area-context';
import { fullWidthBarOffset } from '@/constants/fullWidthLayout';

/** Measure a stable anchor, then let its track bleed across the screen's gutters.
 * The anchor never changes width, avoiding layout/measurement feedback loops.
 * A presented sheet uses its own frame, so tracks also fit iPad and rotated layouts.
 */
export function FullWidthBar({ children }: { children: React.ReactNode }) {
  const frame = useSafeAreaFrame();
  const anchor = useRef<React.ElementRef<typeof View>>(null);
  const [left, setLeft] = useState(0);
  const [measured, setMeasured] = useState(false);
  const update = useCallback(() => {
    anchor.current?.measureInWindow((x, _y, width) => {
      if (width <= 0) return;
      const offset = fullWidthBarOffset(frame.x,frame.width,x,width);
      setLeft(old => old === offset ? old : offset);
      setMeasured(true);
    });
  }, [frame.x,frame.width]);
  useLayoutEffect(() => { update(); }, [update]);
  return <View ref={anchor} collapsable={false} onLayout={update} style={{ alignSelf: 'stretch', overflow: 'visible' }}>
    <View style={measured ? { width: frame.width, marginLeft: -left, overflow: 'visible' } : undefined}>{children}</View>
  </View>;
}
