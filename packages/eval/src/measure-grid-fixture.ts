import { BACKDROP_VERSION, CELL, type Grid } from '@make-it-accessible/pipeline/pdf/backdrop'

// A backdrop.json of one row of white cells, nothing printed on it (measure tests).
export const emptyGrid = (cols: number): Grid => ({
  version: BACKDROP_VERSION,
  cell: CELL,
  cols,
  rows: 1,
  min: Array<number>(cols).fill(1),
  max: Array<number>(cols).fill(1),
  mean: Array<string>(cols).fill('#ffffff'),
  inks: {},
  alpha: {},
  shadows: {},
  strokes: {},
  undrawn: [],
  ends: {},
  kept: [],
  capsFaces: [],
  ground: null,
  fills: null,
})
