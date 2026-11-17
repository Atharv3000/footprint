import React from 'react';
import { Circle, Ellipse, G, Path } from 'react-native-svg';
import { PET_PALETTES, PetAppearance } from '@/constants/petAppearance';
import { NutritionPetState, nutritionPetExpression } from '@/constants/nutritionPet';
import { PetAccessories } from './PetAccessories';

function Face({ species, happy, relaxed, blink, hungry, full, sad }: {
  species: PetAppearance['species']; happy: boolean; relaxed: boolean; blink: boolean; hungry: boolean; full: boolean; sad: boolean;
}) {
  const fox = species === 'fox', bunny = species === 'bunny';
  return <G>
    <Ellipse cx={-45} cy={44} rx={fox ? 12 : 15} ry={7} fill="#EFA2AF" opacity={happy ? .8 : .4} />
    <Ellipse cx={45} cy={44} rx={fox ? 12 : 15} ry={7} fill="#EFA2AF" opacity={happy ? .8 : .4} />
    {blink || (relaxed && !sad) ? <Path d="M -48 27 Q -37 34 -26 27 M 26 27 Q 37 34 48 27" stroke="#244940" strokeWidth={4} strokeLinecap="round" fill="none" />
      : happy ? <Path d={fox ? 'M -48 28 Q -38 17 -27 25 M 27 25 Q 38 17 48 28' : 'M -47 29 Q -37 15 -27 29 M 27 29 Q 37 15 47 29'} stroke="#244940" strokeWidth={4} strokeLinecap="round" fill="none" />
      : <G>
        <Ellipse cx={-37} cy={27} rx={bunny ? 8 : fox ? 9 : 6} ry={bunny ? 9 : fox ? 7 : 11} fill="#244940" />
        <Ellipse cx={37} cy={27} rx={bunny ? 8 : fox ? 9 : 6} ry={bunny ? 9 : fox ? 7 : 11} fill="#244940" />
        <Circle cx={-35} cy={24} r={2.5} fill="#fff" /><Circle cx={39} cy={24} r={2.5} fill="#fff" />
      </G>}
    <Path d={fox ? 'M -10 42 Q 0 36 10 42 Q 5 52 0 51 Q -5 52 -10 42 Z' : 'M -7 40 Q 0 35 7 40 L 0 46 Z'} fill={fox ? '#344A48' : '#C27384'} />
    {sad && <Path d="M -50 14 Q -38 17 -27 8 M 27 8 Q 38 17 50 14" stroke="#507568" strokeWidth={3} strokeLinecap="round" fill="none" />}
    {sad ? <Path d="M -13 61 Q 0 48 13 61" stroke="#31564B" strokeWidth={3} strokeLinecap="round" fill="none" />
      : full ? <Ellipse cy={58} rx={7} ry={9} fill="#36574A" />
      : happy ? <G><Path d="M -14 51 Q 0 78 14 51 Z" fill="#31564B" /><Ellipse cy={63} rx={8} ry={4} fill="#ED9FAD" /></G>
      : <Path d={hungry ? 'M -10 59 Q 0 52 10 59' : 'M -13 51 Q 0 65 13 51'} stroke="#31564B" strokeWidth={3} strokeLinecap="round" fill="none" />}
    {bunny && !full && !sad && <Path d="M -6 53 L 6 53 L 5 63 L -5 63 Z M 0 54 L 0 62" fill="#FFFDF4" stroke="#C0B8B4" strokeWidth={1} />}
    {species === 'cat' && <Path d="M -57 42 L -76 38 M -57 49 L -77 51 M 57 42 L 76 38 M 57 49 L 77 51" stroke="#507568" strokeWidth={2} strokeLinecap="round" />}
  </G>;
}

/** Individually drawn silhouettes: round tabby, ruffed fox, and floppy-eared rabbit. */
export function PetSpeciesBody({ appearance, state, gradient, bow, blink, relaxed, happy, ribbon, petted = false }: {
  appearance: PetAppearance; state: NutritionPetState; gradient: string; bow: boolean;
  blink: boolean; relaxed: boolean; happy: boolean; ribbon: string; petted?: boolean;
}) {
  const expression = nutritionPetExpression(state, petted);
  const sad = expression === 'hungry' || expression === 'full';
  const p = PET_PALETTES[appearance.color];
  const fur = `url(#${gradient})`;
  const head = bow ? (appearance.species === 'bunny' ? 'translate(93 158) scale(0.8)' : 'translate(98 158) scale(0.85)')
    : appearance.species === 'bunny' ? 'translate(150 111) scale(0.9)' : appearance.species === 'fox' ? 'translate(150 101) scale(0.95)' : 'translate(150 100)';
  const face = <Face species={appearance.species} sad={sad} happy={happy && !sad} relaxed={relaxed} blink={blink} hungry={state.mood === 'hungry'} full={state.mood === 'stuffed' && !bow && !happy} />;
  return <G>
    {appearance.species === 'cat' ? bow ? <G>
      <Path d="M 91 186 Q 105 152 137 121 C 170 90 225 96 246 131 Q 264 159 248 197 L 252 223 Q 267 245 235 246 L 204 243 Q 185 236 192 216 Q 146 239 104 222 L 79 239 L 54 235 Z" fill={fur} stroke={p.outline} strokeWidth={3} />
      <Ellipse cx={177} cy={181} rx={53} ry={39} fill={p.belly} />
      <Path d="M 207 115 L 200 137 M 224 123 L 216 143 M 234 139 L 222 152" stroke={p.outline} strokeWidth={7} strokeLinecap="round" opacity={.6} />
      <Ellipse cx={232} cy={236} rx={30} ry={13} fill={p.mid} stroke={p.outline} strokeWidth={2} />
      <Ellipse cx={70} cy={241} rx={28} ry={12} fill={p.mid} stroke={p.outline} strokeWidth={2} /><Ellipse cx={120} cy={243} rx={27} ry={11} fill={p.mid} stroke={p.outline} strokeWidth={2} />
      <Path d="M 40 165 L 33 126 Q 32 117 43 122 L 73 144 Q 98 134 123 144 L 153 121 Q 166 115 161 131 L 154 168 Q 171 204 139 227 Q 98 248 54 227 Q 23 203 40 165 Z" fill={fur} stroke={p.outline} strokeWidth={3} />
      <Path d="M 43 133 L 48 159 L 65 148 Z M 151 133 L 145 159 L 130 149 Z" fill="#E6A8AE" />
      <Path d="M 84 145 L 88 156 M 98 141 L 98 155 M 112 145 L 108 156" stroke={p.outline} strokeWidth={5} strokeLinecap="round" opacity={.7} />
    </G> : <G>
      <Ellipse cx={150} cy={202} rx={68} ry={47} fill={fur} stroke={p.outline} strokeWidth={3} />
      <Ellipse cx={150} cy={207} rx={46} ry={32} fill={p.belly} />
      <Ellipse cx={105} cy={241} rx={28} ry={12} fill={p.mid} stroke={p.outline} strokeWidth={2} /><Ellipse cx={195} cy={241} rx={28} ry={12} fill={p.mid} stroke={p.outline} strokeWidth={2} />
      <Path d="M 82 92 L 72 47 Q 69 33 83 40 L 116 62 Q 150 51 184 62 L 219 39 Q 233 33 228 50 L 218 95 Q 243 128 224 159 Q 205 188 150 188 Q 96 188 76 159 Q 56 128 82 92 Z" fill={fur} stroke={p.outline} strokeWidth={3} />
      <Path d="M 82 52 L 91 83 L 107 68 Z M 218 52 L 210 83 L 194 68 Z" fill="#E6A8AE" />
      <Path d="M 128 67 L 135 83 M 150 62 L 150 81 M 172 67 L 165 83" stroke={p.outline} strokeWidth={7} strokeLinecap="round" opacity={.65} />
      <Path d="M 92 188 Q 99 211 112 204 M 208 188 Q 201 211 188 204" fill="none" stroke={p.outline} strokeWidth={4} strokeLinecap="round" />
    </G> : appearance.species === 'fox' ? bow ? <G>
      <Path d="M 86 190 Q 108 145 158 116 Q 194 93 224 110 L 222 119 L 240 119 L 233 131 Q 263 162 246 205 L 252 232 Q 252 246 224 246 L 200 237 L 193 216 Q 155 239 119 221 L 79 241 L 50 232 Z" fill={fur} stroke={p.outline} strokeWidth={3} />
      <Path d="M 132 163 L 146 174 L 151 159 Q 175 180 194 177 L 181 198 L 190 200 Q 154 228 120 216 Z" fill={p.belly} />
      <Ellipse cx={234} cy={237} rx={29} ry={11} fill={p.dark} /><Ellipse cx={65} cy={242} rx={28} ry={10} fill={p.dark} /><Ellipse cx={117} cy={243} rx={26} ry={10} fill={p.dark} />
      <Path d="M 48 164 L 32 112 Q 31 101 44 109 L 76 144 Q 99 133 122 145 L 157 108 Q 169 99 165 115 L 151 166 L 170 177 L 153 181 L 162 190 Q 137 217 98 233 Q 58 216 32 191 L 42 181 L 25 178 Z" fill={fur} stroke={p.outline} strokeWidth={3} />
      <Path d="M 43 121 L 53 158 L 69 147 Z M 154 122 L 143 158 L 129 149 Z" fill={p.dark} />
      <Path d="M 32 181 L 63 182 L 98 202 L 133 183 L 162 181 Q 144 215 98 233 Q 52 216 32 181 Z" fill={p.belly} />
    </G> : <G>
      <Path d="M 112 159 Q 150 142 190 162 L 207 225 Q 216 249 187 250 L 113 250 Q 82 248 94 223 Z" fill={fur} stroke={p.outline} strokeWidth={3} />
      <Path d="M 112 166 L 125 174 L 132 160 L 149 178 L 170 160 L 174 175 L 189 167 L 179 212 L 165 204 L 150 227 L 135 205 L 119 213 Z" fill={p.belly} />
      <Ellipse cx={111} cy={243} rx={27} ry={10} fill={p.dark} /><Ellipse cx={189} cy={243} rx={27} ry={10} fill={p.dark} />
      <Path d="M 87 88 L 67 29 Q 64 17 77 25 L 119 63 Q 150 52 180 64 L 224 25 Q 237 17 233 33 L 213 88 L 239 110 L 224 117 L 241 133 L 217 140 Q 198 173 150 186 Q 101 172 83 141 L 59 133 L 75 117 L 61 110 Z" fill={fur} stroke={p.outline} strokeWidth={3} />
      <Path d="M 77 39 L 93 86 L 111 68 Z M 223 40 L 207 86 L 188 68 Z" fill={p.dark} />
      <Path d="M 65 127 L 108 124 L 150 149 L 190 124 L 235 127 Q 215 162 150 186 Q 84 161 65 127 Z" fill={p.belly} />
    </G> : bow ? <G>
      <Ellipse cx={179} cy={180} rx={78} ry={59} fill={fur} stroke={p.outline} strokeWidth={3} />
      <Ellipse cx={211} cy={175} rx={42} ry={43} fill={p.light} opacity={.6} />
      <Ellipse cx={161} cy={195} rx={47} ry={30} fill={p.belly} />
      <Ellipse cx={230} cy={236} rx={35} ry={15} fill={p.mid} stroke={p.outline} strokeWidth={2} />
      <Ellipse cx={66} cy={242} rx={30} ry={11} fill={p.mid} stroke={p.outline} strokeWidth={2} /><Ellipse cx={116} cy={243} rx={27} ry={10} fill={p.mid} stroke={p.outline} strokeWidth={2} />
      <Path d="M 52 163 C 38 141 31 84 49 78 Q 70 75 80 155 Z" fill={fur} stroke={p.outline} strokeWidth={3} />
      <Path d="M 113 154 Q 131 82 153 99 Q 172 115 148 152 L 134 169 Z" fill={fur} stroke={p.outline} strokeWidth={3} />
      <Path d="M 49 94 Q 55 88 69 155 L 58 157 Z M 139 111 Q 152 101 151 121 L 131 155 L 123 153 Z" fill="#E6A8AE" />
      <Ellipse cx={93} cy={187} rx={63} ry={49} fill={fur} stroke={p.outline} strokeWidth={3} />
      <Ellipse cx={83} cy={207} rx={18} ry={13} fill={p.belly} /><Ellipse cx={103} cy={207} rx={18} ry={13} fill={p.belly} />
    </G> : <G>
      <Ellipse cx={150} cy={207} rx={70} ry={43} fill={fur} stroke={p.outline} strokeWidth={3} />
      <Ellipse cx={101} cy={220} rx={29} ry={29} fill={p.light} /><Ellipse cx={199} cy={220} rx={29} ry={29} fill={p.light} />
      <Ellipse cx={150} cy={209} rx={43} ry={32} fill={p.belly} />
      <Ellipse cx={101} cy={244} rx={34} ry={12} fill={p.mid} stroke={p.outline} strokeWidth={2} /><Ellipse cx={199} cy={244} rx={34} ry={12} fill={p.mid} stroke={p.outline} strokeWidth={2} />
      <Path d="M 102 98 C 72 63 73 3 93 7 Q 117 6 125 87 Z" fill={fur} stroke={p.outline} strokeWidth={3} />
      <Path d="M 171 87 Q 177 3 211 18 Q 246 37 214 78 L 192 99 Z" fill={fur} stroke={p.outline} strokeWidth={3} />
      <Path d="M 93 23 Q 101 16 113 85 L 103 83 Z M 195 34 Q 223 27 218 48 L 191 83 L 183 82 Z" fill="#E6A8AE" />
      <Ellipse cx={150} cy={134} rx={69} ry={58} fill={fur} stroke={p.outline} strokeWidth={3} />
      <Ellipse cx={138} cy={156} rx={20} ry={14} fill={p.belly} /><Ellipse cx={162} cy={156} rx={20} ry={14} fill={p.belly} />
      <Path d="M 122 195 Q 123 217 134 215 M 177 195 Q 177 217 166 215" stroke={p.outline} strokeWidth={4} strokeLinecap="round" fill="none" />
    </G>}
    <G transform={head}>{face}</G>
    <PetAccessories appearance={appearance} bow={bow} headTransform={head} />
    {!bow && <Path d={appearance.species === 'bunny' ? 'M 107 190 Q 150 204 193 190' : 'M 113 183 Q 150 196 187 183'} stroke={ribbon} strokeWidth={6} fill="none" strokeLinecap="round" />}
    {!bow && !happy && state.mood === 'stuffed' && <Path d="M 234 108 Q 245 127 234 129 Q 223 127 234 108 Z" fill="#8BCBE4" />}
  </G>;
}
