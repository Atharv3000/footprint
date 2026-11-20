import React, { useMemo } from 'react';
import { Animated } from 'react-native';
import Svg, { Circle, Ellipse, Line, Polygon, Rect } from 'react-native-svg';
import type { VectorExercise } from '@/constants/exerciseVector';

const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** Rounded vector limbs are driven by the same joints in each exercise's two source poses. */
export const ExerciseFigure = React.memo(function ExerciseFigure({ demo, progress, size, color, animate = true }: { demo: VectorExercise; progress: Animated.Value; size: number; color: string; animate?: boolean }) {
  // Static geometry below contains plain numbers/strings; expose the animated superset to JSX.
  const ALine = (animate ? AnimatedLine : Line) as typeof AnimatedLine;
  const ACircle = (animate ? AnimatedCircle : Circle) as typeof AnimatedCircle;
  const APolygon = (animate ? AnimatedPolygon : Polygon) as typeof AnimatedPolygon;
  const ARect = (animate ? AnimatedRect : Rect) as typeof AnimatedRect;
  const geometry = useMemo(() => {
    if (!animate) {
      const frame = demo.frames[0];
      return {
        coordinate: (i: number, axis: number, offset = 0) => frame[i][axis] + offset,
        pairMean: (indices: number[], axis: number) => indices.reduce((sum, i) => sum + frame[i][axis], 0) / indices.length,
        torso: [3,4,10,9].map(i => frame[i].join(',')).join(' '),
      };
    }
    const inputRange = demo.frames.map((_,i) => i/(demo.frames.length-1));
    const coordinate = (i: number, axis: number, offset = 0) => progress.interpolate({ inputRange, outputRange: demo.frames.map(pose => pose[i][axis]+offset), extrapolate: 'clamp' });
    const pairMean = (indices: number[], axis: number) => progress.interpolate({ inputRange, outputRange: demo.frames.map(pose => indices.reduce((sum,i) => sum+pose[i][axis],0)/indices.length) });
    const torso = progress.interpolate({ inputRange, outputRange: demo.frames.map(pose => [3,4,10,9].map(i => pose[i].join(',')).join(' ')) });
    return { coordinate, pairMean, torso };
  }, [demo, progress, animate]);
  const { coordinate: c, pairMean, torso } = geometry;
  const muscles = demo.muscles.join(' ');
  const armFocus = /biceps|triceps|forearms|shoulders/.test(muscles);
  const legFocus = /quadriceps|hamstrings|calves|glutes|adductors|abductors/.test(muscles);
  const trunkFocus = /chest|abdominals|back|lats|traps/.test(muscles);
  const limbs: [number,number,boolean][] = [[4,6,armFocus],[6,8,armFocus],[10,12,legFocus],[12,14,legFocus],[14,16,legFocus],[3,5,armFocus],[5,7,armFocus],[9,11,legFocus],[11,13,legFocus],[13,15,legFocus]];
  const [gripLeft, gripRight] = demo.barAt === 'shoulders' ? [3,4] : [7,8];
  return <Svg width={size} height={size} viewBox={demo.focus === 'feet' ? '20 57 60 38' : '0 0 100 100'}>
    <Ellipse cx={50} cy={90} rx={33} ry={3} fill={color} opacity={.08} />
    <Line x1={12} x2={88} y1={90} y2={90} stroke={color} strokeOpacity={.1} strokeWidth={1} />
    {demo.support === 'bench' && <>
      <Line x1={17} y1={64} x2={68} y2={64} stroke="#7F8D85" strokeWidth={3} strokeLinecap="round" />
      <Line x1={24} y1={64} x2={24} y2={87} stroke="#7F8D85" strokeWidth={2} /><Line x1={61} y1={64} x2={61} y2={87} stroke="#7F8D85" strokeWidth={2} />
    </>}
    {demo.support === 'proneBench' && <Line x1={30} y1={62} x2={79} y2={72} stroke="#7F8D85" strokeWidth={4} strokeLinecap="round" />}
    {demo.support === 'seat' && <><Line x1={36} y1={64} x2={64} y2={64} stroke="#7F8D85" strokeWidth={3} /><Line x1={50} y1={64} x2={50} y2={86} stroke="#7F8D85" strokeWidth={2} /></>}
    {demo.support === 'pullup' && <Line x1={25} y1={7} x2={71} y2={7} stroke="#7F8D85" strokeWidth={3} strokeLinecap="round" />}
    {demo.support === 'shoulderPads' && <Line x1={31} y1={34} x2={69} y2={34} stroke="#7F8D85" strokeWidth={4} strokeLinecap="round" />}
    {demo.support === 'footBall' && <Circle cx={48} cy={90} r={3} fill={color} opacity={.6} />}
    {demo.support === 'bike' && <>
      <Circle cx={24} cy={81} r={13} fill="none" stroke="#7F8D85" strokeWidth={2} /><Circle cx={79} cy={81} r={13} fill="none" stroke="#7F8D85" strokeWidth={2} />
      <Polygon points="24,81 43,59 55,80 24,81 66,59 79,81" fill="none" stroke="#7F8D85" strokeWidth={2} strokeLinejoin="round" />
      <Line x1={53} y1={58} x2={66} y2={58} stroke="#7F8D85" strokeWidth={3} strokeLinecap="round" />
    </>}
    {/* Far limbs first; near limbs and the torso keep the figure readable at icon sizes. */}
    {limbs.slice(0,5).map(([from,to,focus],i) => <ALine key={`far${i}`} x1={c(from,0)} y1={c(from,1)} x2={c(to,0)} y2={c(to,1)} stroke={focus ? color : '#84948C'} strokeWidth={from >= 9 ? 5 : 4.5} strokeOpacity={.48} strokeLinecap="round" />)}
    <APolygon points={torso} fill={trunkFocus ? color : '#B9C6BF'} fillOpacity={trunkFocus ? .82 : .9} stroke={trunkFocus ? color : '#B9C6BF'} strokeWidth={3} strokeLinejoin="round" />
    <ALine x1={pairMean([3,4],0)} y1={pairMean([3,4],1)} x2={pairMean([0,1,2],0)} y2={pairMean([0,1,2],1)} stroke="#B9C6BF" strokeWidth={5} strokeLinecap="round" />
    <ACircle cx={pairMean([0,1,2],0)} cy={pairMean([0,1,2],1)} r={5.5} fill="#D8E2DC" />
    {limbs.slice(5).map(([from,to,focus],i) => <ALine key={`near${i}`} x1={c(from,0)} y1={c(from,1)} x2={c(to,0)} y2={c(to,1)} stroke={focus ? color : '#B9C6BF'} strokeWidth={from >= 9 ? 5.5 : 5} strokeLinecap="round" />)}
    {[3,5,7,9,11,13].map(i => <ACircle key={`joint${i}`} cx={c(i,0)} cy={c(i,1)} r={1.3} fill="#EFF7F1" opacity={.65} />)}
    {demo.equipment === 'barbell' && <>
      <ALine x1={c(gripLeft,0,-6)} y1={c(gripLeft,1)} x2={c(gripRight,0,6)} y2={c(gripRight,1)} stroke="#7F8D85" strokeWidth={2} strokeLinecap="round" />
      <ARect x={c(gripLeft,0,-7)} y={c(gripLeft,1,-4)} width={3} height={8} rx={1} fill={color} />
      <ARect x={c(gripRight,0,4)} y={c(gripRight,1,-4)} width={3} height={8} rx={1} fill={color} />
    </>}
    {/dumbbell|kettlebell/.test(demo.equipment) && [7,8].map(i => <React.Fragment key={`weight${i}`}>
      <ALine x1={c(i,0,-4)} y1={c(i,1)} x2={c(i,0,4)} y2={c(i,1)} stroke="#7F8D85" strokeWidth={2} />
      <ARect x={c(i,0,-5)} y={c(i,1,-3)} width={2.5} height={6} rx={1} fill={color} />
      <ARect x={c(i,0,2.5)} y={c(i,1,-3)} width={2.5} height={6} rx={1} fill={color} />
    </React.Fragment>)}
    {demo.cableAt === 'top' && <>
      <ALine x1={c(7,0)} y1={c(7,1)} x2={7} y2={12} stroke="#7F8D85" strokeWidth={1} strokeOpacity={.5} />
      <Circle cx={7} cy={12} r={2} fill="#7F8D85" />
    </>}
    {demo.support === 'skates' && [13,14,15,16].map(i => <ACircle key={`wheel${i}`} cx={c(i,0)} cy={c(i,1,3)} r={1.5} fill="#7F8D85" />)}
  </Svg>;
});
