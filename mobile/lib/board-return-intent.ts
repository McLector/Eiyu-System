export type BoardReturnLane = 'one-time';

let pendingBoardReturnLane: BoardReturnLane | null = null;

export function publishBoardReturnIntent(lane: BoardReturnLane): void {
  pendingBoardReturnLane = lane;
}

export function consumeBoardReturnIntent(): BoardReturnLane | null {
  const lane = pendingBoardReturnLane;
  pendingBoardReturnLane = null;
  return lane;
}
