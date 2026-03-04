export interface Profile {
  id: string;
  name: string;
  gameName?: string;
  characterInfo: string;
  gameKnowledge: string;
  voice: string;
  pttKey?: string;
  pttMode?: 'hold' | 'toggle';
}
