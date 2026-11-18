export type PokerState =
  | { phase: "idle"; revision: number; mySeat: number }
  | {
      phase: "playing" | "showdown" | "finished";
      revision: number;
      mySeat: number;
      stackBB: number;
      hand: number;
      dealer: number;
      turnSeat: number;
      street: number;
      stacks: number[];
      bets: number[];
      pot: number;
      board: number[];
      cards: number[];
      opponentCards: number[] | null;
      call: number;
      minRaiseTo: number;
      maxRaiseTo: number;
      canRaise: boolean;
      winner: number | null;
      lastPot: number;
      lastAction: string;
      ready: boolean[];
      rank: number | null;
    };
export const cardLabel = (card: number) =>
  `${["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"][card % 13]}${["♠", "♥", "♦", "♣"][Math.floor(card / 13)]}`;
