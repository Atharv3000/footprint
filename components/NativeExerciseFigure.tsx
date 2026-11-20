import React from 'react';
import Animated, { useAnimatedProps, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Line, Path, Polygon, Rect, type CircleProps, type LineProps, type RectProps, type PolygonProps } from 'react-native-svg';
import type { VectorExercise } from '@/constants/exerciseVector';
import { sampleExercisePose, type JointCoordinate, resolveJointCoordinate } from '@/constants/exerciseMotion';
const ALine=Animated.createAnimatedComponent(Line), ACircle=Animated.createAnimatedComponent(Circle);
const ARect=Animated.createAnimatedComponent(Rect), APolygon=Animated.createAnimatedComponent(Path);
type Coordinate = number | JointCoordinate;
type Pose = SharedValue<number[][]>;
const c=(i:number,axis:number,offset=0):JointCoordinate=>({indices:[i],axis,offset});
const pairMean=(indices:number[],axis:number):JointCoordinate=>({indices,axis,offset:0});
function MotionLine({pose,x1=0,y1=0,x2=0,y2=0,...rest}:Omit<LineProps,'x1'|'y1'|'x2'|'y2'> & {pose:Pose;x1?:Coordinate;y1?:Coordinate;x2?:Coordinate;y2?:Coordinate}) {
  const props=useAnimatedProps(()=>({x1:resolveJointCoordinate(pose.value,x1),y1:resolveJointCoordinate(pose.value,y1),x2:resolveJointCoordinate(pose.value,x2),y2:resolveJointCoordinate(pose.value,y2)}));
  return <ALine {...rest} animatedProps={props}/>;
}
function MotionCircle({pose,cx=0,cy=0,...rest}:Omit<CircleProps,'cx'|'cy'> & {pose:Pose;cx?:Coordinate;cy?:Coordinate}) {
  const props=useAnimatedProps(()=>({cx:resolveJointCoordinate(pose.value,cx),cy:resolveJointCoordinate(pose.value,cy)}));
  return <ACircle {...rest} animatedProps={props}/>;
}
function MotionRect({pose,x=0,y=0,...rest}:Omit<RectProps,'x'|'y'> & {pose:Pose;x?:Coordinate;y?:Coordinate}) {
  const props=useAnimatedProps(()=>({x:resolveJointCoordinate(pose.value,x),y:resolveJointCoordinate(pose.value,y)}));
  return <ARect {...rest} animatedProps={props}/>;
}
function MotionPolygon({pose,points:_points,...rest}:PolygonProps & {pose:Pose}) {
  // Polygon is a JS wrapper around Path; animate native d, not its JS-only points prop.
  const props=useAnimatedProps(()=>({d:'M '+[3,4,10,9].map(i=>pose.value[i].join(',')).join(' L ')+' Z'}));
  return <APolygon {...rest} animatedProps={props}/>;
}
/** Pose interpolation and SVG updates run on the UI thread, never through JS Animated. */
export const NativeExerciseFigure=React.memo(function NativeExerciseFigure({demo,progress,size,color}:{demo:VectorExercise;progress:SharedValue<number>;size:number;color:string}) {
  const pose=useDerivedValue(()=>sampleExercisePose(demo.frames,progress.value));
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
    {limbs.slice(0,5).map(([from,to,focus],i) => <MotionLine pose={pose} key={`far${i}`} x1={c(from,0)} y1={c(from,1)} x2={c(to,0)} y2={c(to,1)} stroke={focus ? color : '#84948C'} strokeWidth={from >= 9 ? 5 : 4.5} strokeOpacity={.48} strokeLinecap="round" />)}
    <MotionPolygon pose={pose} points="" fill={trunkFocus ? color : '#B9C6BF'} fillOpacity={trunkFocus ? .82 : .9} stroke={trunkFocus ? color : '#B9C6BF'} strokeWidth={3} strokeLinejoin="round" />
    <MotionLine pose={pose} x1={pairMean([3,4],0)} y1={pairMean([3,4],1)} x2={pairMean([0,1,2],0)} y2={pairMean([0,1,2],1)} stroke="#B9C6BF" strokeWidth={5} strokeLinecap="round" />
    <MotionCircle pose={pose} cx={pairMean([0,1,2],0)} cy={pairMean([0,1,2],1)} r={5.5} fill="#D8E2DC" />
    {limbs.slice(5).map(([from,to,focus],i) => <MotionLine pose={pose} key={`near${i}`} x1={c(from,0)} y1={c(from,1)} x2={c(to,0)} y2={c(to,1)} stroke={focus ? color : '#B9C6BF'} strokeWidth={from >= 9 ? 5.5 : 5} strokeLinecap="round" />)}
    {[3,5,7,9,11,13].map(i => <MotionCircle pose={pose} key={`joint${i}`} cx={c(i,0)} cy={c(i,1)} r={1.3} fill="#EFF7F1" opacity={.65} />)}
    {demo.equipment === 'barbell' && <>
      <MotionLine pose={pose} x1={c(gripLeft,0,-6)} y1={c(gripLeft,1)} x2={c(gripRight,0,6)} y2={c(gripRight,1)} stroke="#7F8D85" strokeWidth={2} strokeLinecap="round" />
      <MotionRect pose={pose} x={c(gripLeft,0,-7)} y={c(gripLeft,1,-4)} width={3} height={8} rx={1} fill={color} />
      <MotionRect pose={pose} x={c(gripRight,0,4)} y={c(gripRight,1,-4)} width={3} height={8} rx={1} fill={color} />
    </>}
    {/dumbbell|kettlebell/.test(demo.equipment) && [7,8].map(i => <React.Fragment key={`weight${i}`}>
      <MotionLine pose={pose} x1={c(i,0,-4)} y1={c(i,1)} x2={c(i,0,4)} y2={c(i,1)} stroke="#7F8D85" strokeWidth={2} />
      <MotionRect pose={pose} x={c(i,0,-5)} y={c(i,1,-3)} width={2.5} height={6} rx={1} fill={color} />
      <MotionRect pose={pose} x={c(i,0,2.5)} y={c(i,1,-3)} width={2.5} height={6} rx={1} fill={color} />
    </React.Fragment>)}
    {demo.cableAt === 'top' && <>
      <MotionLine pose={pose} x1={c(7,0)} y1={c(7,1)} x2={7} y2={12} stroke="#7F8D85" strokeWidth={1} strokeOpacity={.5} />
      <Circle cx={7} cy={12} r={2} fill="#7F8D85" />
    </>}
    {demo.support === 'skates' && [13,14,15,16].map(i => <MotionCircle pose={pose} key={`wheel${i}`} cx={c(i,0)} cy={c(i,1,3)} r={1.5} fill="#7F8D85" />)}
  </Svg>;
});
