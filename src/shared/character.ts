export type CardLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | "X";

export interface Card {
  id: string;
  name: string;
  level: CardLevel;
  initiative: number | `${number}/${number}`;
  image: string;
  form?: "melee" | "ranged";
}

export interface Character {
  id: string;
  name: string;
  handSize: number;
  icon: string;
  cardBack: string;
  cards: Card[];
}
