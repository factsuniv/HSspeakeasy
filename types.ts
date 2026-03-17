
export interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface AudioConfig {
  sampleRate: number;
  channels: number;
}

// Added to fix errors in ChatBubble.tsx
/**
 * Represents an emotion score, used by the ChatBubble component.
 */
export interface Emotion {
  name: string;
  score: number;
}

// Added to fix errors in ChatBubble.tsx
/**
 * Represents a chat message, used by the ChatBubble component.
 */
export interface ChatMessage {
  id: string;
  sender: 'user' | 'model';
  text: string;
  timestamp: number;
  audioSrc?: string;
  emotions?: Emotion[];
}
