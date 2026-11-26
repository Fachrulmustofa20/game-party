export const SUITS = ['♠', '♥', '♦', '♣'] as const;
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

export const HAND_CATEGORY_NAMES = [
  'Kartu Tinggi',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
  'Royal Flush',
] as const;

export interface HandEvalResult {
  category: number; // 0..9
  score: number;
  name: string;
}

export function cardRank(card: number): number {
  return card % 13; // 0=2 .. 12=A
}

export function cardSuit(card: number): number {
  return Math.floor(card / 13); // 0=♠, 1=♥, 2=♦, 3=♣
}

export function isRedSuit(card: number): boolean {
  const s = cardSuit(card);
  return s === 1 || s === 2;
}

export function cardRankLabel(card: number): string {
  return RANKS[cardRank(card)] ?? '?';
}

export function cardSuitSymbol(card: number): string {
  return SUITS[cardSuit(card)] ?? '?';
}

export function createShuffledDeck(): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function encodeTiebreak(cat: number, kickers: number[]): number {
  let score = cat;
  for (let i = 0; i < 5; i++) {
    score = score * 15 + ((kickers[i] ?? 0) + 1);
  }
  return score;
}

function evaluate5(cards: number[]): HandEvalResult {
  const ranks = cards.map(cardRank).sort((a, b) => b - a);
  const suits = cards.map(cardSuit);
  const isFlush = suits.every((s) => s === suits[0]);

  const counts = new Map<number, number>();
  for (const r of ranks) {
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }

  const groups = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  // Check Straight (including A-2-3-4-5 wheel)
  let isStraight = false;
  let straightHigh = ranks[0];
  if (counts.size === 5) {
    if (ranks[0] - ranks[4] === 4) {
      isStraight = true;
      straightHigh = ranks[0];
    } else if (ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
      isStraight = true;
      straightHigh = 3; // 5-high wheel
    }
  }

  if (isFlush && isStraight) {
    const cat = straightHigh === 12 ? 9 : 8;
    return {
      category: cat,
      score: encodeTiebreak(cat, [straightHigh]),
      name: HAND_CATEGORY_NAMES[cat],
    };
  }

  if (groups[0][1] === 4) {
    return {
      category: 7,
      score: encodeTiebreak(7, [groups[0][0], groups[1][0]]),
      name: HAND_CATEGORY_NAMES[7],
    };
  }

  if (groups[0][1] === 3 && groups[1]?.[1] === 2) {
    return {
      category: 6,
      score: encodeTiebreak(6, [groups[0][0], groups[1][0]]),
      name: HAND_CATEGORY_NAMES[6],
    };
  }

  if (isFlush) {
    return {
      category: 5,
      score: encodeTiebreak(5, ranks),
      name: HAND_CATEGORY_NAMES[5],
    };
  }

  if (isStraight) {
    return {
      category: 4,
      score: encodeTiebreak(4, [straightHigh]),
      name: HAND_CATEGORY_NAMES[4],
    };
  }

  if (groups[0][1] === 3) {
    const kickers = groups.slice(1).map((g) => g[0]);
    return {
      category: 3,
      score: encodeTiebreak(3, [groups[0][0], ...kickers]),
      name: HAND_CATEGORY_NAMES[3],
    };
  }

  if (groups[0][1] === 2 && groups[1]?.[1] === 2) {
    const highPair = Math.max(groups[0][0], groups[1][0]);
    const lowPair = Math.min(groups[0][0], groups[1][0]);
    const kicker = groups[2]?.[0] ?? 0;
    return {
      category: 2,
      score: encodeTiebreak(2, [highPair, lowPair, kicker]),
      name: HAND_CATEGORY_NAMES[2],
    };
  }

  if (groups[0][1] === 2) {
    const kickers = groups.slice(1).map((g) => g[0]);
    return {
      category: 1,
      score: encodeTiebreak(1, [groups[0][0], ...kickers]),
      name: HAND_CATEGORY_NAMES[1],
    };
  }

  return {
    category: 0,
    score: encodeTiebreak(0, ranks),
    name: HAND_CATEGORY_NAMES[0],
  };
}

export function evaluateBestHand(cards: number[]): HandEvalResult {
  if (cards.length < 2) {
    return { category: 0, score: 0, name: HAND_CATEGORY_NAMES[0] };
  }
  if (cards.length < 5) {
    // Pre-flop or partial evaluation
    const r0 = cardRank(cards[0]);
    const r1 = cardRank(cards[1]);
    if (r0 === r1) {
      return { category: 1, score: encodeTiebreak(1, [r0]), name: HAND_CATEGORY_NAMES[1] };
    }
    return {
      category: 0,
      score: encodeTiebreak(0, [Math.max(r0, r1), Math.min(r0, r1)]),
      name: HAND_CATEGORY_NAMES[0],
    };
  }
  if (cards.length === 5) return evaluate5(cards);

  let best: HandEvalResult | null = null;
  const n = cards.length;
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            const res = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || res.score > best.score) best = res;
          }
        }
      }
    }
  }
  return best ?? { category: 0, score: 0, name: HAND_CATEGORY_NAMES[0] };
}
