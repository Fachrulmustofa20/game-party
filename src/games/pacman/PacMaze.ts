/**
 * Original 21x21 arena maze for Pac-Man: Ghost Hunt.
 * '#' = wall, '.' = pellet, 'o' = power pellet.
 * Layout is intentionally original and not copied from any classic Pac-Man maze.
 */
export const PAC_MAZE_ROWS = [
  '#####################',
  '#.........#.........#',
  '#o###.###.#.###.###o#',
  '#...................#',
  '#.###.###.#.###.###.#',
  '#.....#...#...#.....#',
  '#####.#.#####.#.#####',
  '#.....#.#...#.#.....#',
  '#.###.#.#.#.#.#.###.#',
  '#.#.......#.......#.#',
  '#.#.###.#######.###.#',
  '#...#...#...#...#...#',
  '###.#.#.#...#.#.#.###',
  '#.....#...#...#.....#',
  '#.###.###.#.###.###.#',
  '#o..#.....#.....#..o#',
  '###.#.###.#.###.#.###',
  '#.....#...#...#.....#',
  '#.###.###.#.###.###.#',
  '#...................#',
  '#####################',
] as const;

export const PAC_MAZE_WIDTH = PAC_MAZE_ROWS[0].length;
export const PAC_MAZE_HEIGHT = PAC_MAZE_ROWS.length;

export const PAC_PELLET = 1;
export const PAC_POWER_PELLET = 2;

export interface MazePoint {
  x: number;
  y: number;
}

export const PAC_SPAWNS: MazePoint[] = [
  { x: 1, y: 1 },
  { x: 19, y: 1 },
  { x: 1, y: 19 },
  { x: 19, y: 19 },
  { x: 9, y: 15 },
  { x: 5, y: 3 },
  { x: 15, y: 3 },
  { x: 5, y: 17 },
  { x: 15, y: 17 },
  { x: 10, y: 19 },
];

export const PAC_GHOST_SPAWNS: MazePoint[] = [
  { x: 9, y: 9 },
  { x: 11, y: 9 },
  { x: 9, y: 12 },
  { x: 11, y: 12 },
];

export function isMazeWall(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= PAC_MAZE_WIDTH || y >= PAC_MAZE_HEIGHT) return true;
  return PAC_MAZE_ROWS[y][x] === '#';
}

export function createPelletGrid(): Uint8Array {
  const grid = new Uint8Array(PAC_MAZE_WIDTH * PAC_MAZE_HEIGHT);
  for (let y = 0; y < PAC_MAZE_HEIGHT; y++) {
    for (let x = 0; x < PAC_MAZE_WIDTH; x++) {
      const cell = PAC_MAZE_ROWS[y][x];
      if (cell === '.') grid[y * PAC_MAZE_WIDTH + x] = PAC_PELLET;
      else if (cell === 'o') grid[y * PAC_MAZE_WIDTH + x] = PAC_POWER_PELLET;
    }
  }
  return grid;
}

export function countPowerPellets(grid: Uint8Array): number {
  let count = 0;
  for (const cell of grid) {
    if (cell === PAC_POWER_PELLET) count++;
  }
  return count;
}
