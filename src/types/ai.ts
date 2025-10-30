export interface PersonalityAnalysis {
  style: string;
  energyDescription: string;
  funStats: string[];
  motivationalFeedback: string;
}

export interface AlternativeNarration {
  styleName: string;
  emoji: string;
  text: string;
}

export interface AiAnalysisResult {
  transcript: string;
  personality: PersonalityAnalysis;
  alternativeNarrations: AlternativeNarration[];
}
