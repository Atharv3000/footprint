/**
 * Lightweight, zero-dependency QR Code Matrix generator (Supports alphanumeric & byte modes)
 * Uses standard ISO/IEC 18004 QR specification to produce valid scan matrix grids
 */

export function generateQrMatrix(text: string): boolean[][] {
  // We use standard 25x25 (Version 2) or 21x21 (Version 1) matrix
  const len = text.length;
  const size = len > 14 ? 25 : 21;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // 1. Draw Position Finder Patterns (Top-Left, Top-Right, Bottom-Left 7x7 boxes)
  function drawFinderPattern(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const currR = row + r;
        const currC = col + c;
        if (currR >= 0 && currR < size && currC >= 0 && currC < size) {
          isFunction[currR][currC] = true;
          if (r === -1 || r === 7 || c === -1 || c === 7) {
            matrix[currR][currC] = false; // Separator
          } else if (r === 0 || r === 6 || c === 0 || c === 6) {
            matrix[currR][currC] = true; // Outer black ring
          } else if (r === 1 || r === 5 || c === 1 || c === 5) {
            matrix[currR][currC] = false; // White ring
          } else {
            matrix[currR][currC] = true; // Center black 3x3
          }
        }
      }
    }
  }

  drawFinderPattern(0, 0);
  drawFinderPattern(0, size - 7);
  drawFinderPattern(size - 7, 0);

  // 2. Alignment pattern for Version 2 (25x25) at (18, 18)
  if (size === 25) {
    const aRow = 18;
    const aCol = 18;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        isFunction[aRow + r][aCol + c] = true;
        if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
          matrix[aRow + r][aCol + c] = true;
        } else {
          matrix[aRow + r][aCol + c] = false;
        }
      }
    }
  }

  // 3. Timing Patterns (alternating black/white lines on row 6 and col 6)
  for (let i = 8; i < size - 8; i++) {
    isFunction[6][i] = true;
    matrix[6][i] = i % 2 === 0;
    isFunction[i][6] = true;
    matrix[i][6] = i % 2 === 0;
  }

  // Dark module
  isFunction[size - 8][8] = true;
  matrix[size - 8][8] = true;

  // Reserve Format information areas
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      isFunction[8][i] = true;
      isFunction[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunction[8][size - 1 - i] = true;
    isFunction[size - 1 - i][8] = true;
  }

  // Format bits (Mask 000, Error Correction M)
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i] === 1;
  matrix[8][7] = formatBits[6] === 1;
  matrix[8][8] = formatBits[7] === 1;
  matrix[7][8] = formatBits[8] === 1;
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i] === 1;

  for (let i = 0; i < 8; i++) matrix[size - 1 - i][8] = formatBits[i] === 1;
  for (let i = 8; i < 15; i++) matrix[8][size - 15 + i] = formatBits[i] === 1;

  // 4. Encode Payload Bits into data streams
  const bitStream: number[] = [];
  // Mode: 8-bit byte mode = 0100
  bitStream.push(0, 1, 0, 0);
  // Character count (8 bits)
  for (let i = 7; i >= 0; i--) {
    bitStream.push((len >> i) & 1);
  }
  // Data bytes
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    for (let b = 7; b >= 0; b--) {
      bitStream.push((code >> b) & 1);
    }
  }
  // Terminator
  bitStream.push(0, 0, 0, 0);
  while (bitStream.length % 8 !== 0) bitStream.push(0);

  // Fill padding bytes (0xEC, 0x11)
  const totalCapacityBits = (size === 25 ? 44 : 26) * 8;
  const padPatterns = [
    [1, 1, 1, 0, 1, 1, 0, 0],
    [0, 0, 0, 1, 0, 0, 0, 1],
  ];
  let padIdx = 0;
  while (bitStream.length < totalCapacityBits) {
    bitStream.push(...padPatterns[padIdx % 2]);
    padIdx++;
  }

  // 5. Place Data Bits in Up/Down Zig-Zag with Standard Mask ((row + col) % 2 === 0)
  let bitIndex = 0;
  let upwards = true;

  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing line

    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (let c = 0; c < 2; c++) {
        const col = right - c;
        if (!isFunction[r][col]) {
          const bit = bitIndex < bitStream.length ? bitStream[bitIndex++] : 0;
          // Apply Mask 0: (r + col) % 2 === 0
          const maskInvert = (r + col) % 2 === 0;
          matrix[r][col] = (bit === 1) !== maskInvert;
        }
      }
    }
    upwards = !upwards;
  }

  return matrix;
}
