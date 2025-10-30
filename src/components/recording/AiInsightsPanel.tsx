import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AiAnalysisResult } from '../../types/ai';

interface AiInsightsPanelProps {
  audioPath: string | null;
  onClose?: () => void;
}

export const AiInsightsPanel: React.FC<AiInsightsPanelProps> = ({ audioPath, onClose }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AiAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    if (!audioPath) {
      setError('No audio file available');
      return;
    }

    // Get API key from environment (embedded for demo)
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      setError('OpenAI API key not configured. Please contact the developer.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const analysisResult = await invoke<AiAnalysisResult>('cmd_analyze_recording', {
        videoPath: audioPath,
        apiKey: apiKey,
      });
      setResult(analysisResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      console.error('AI analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-gray-900 rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="text-3xl">🤖</span>
            AI Video Insights
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          {!result && !isAnalyzing && (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🎭</div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Ready to analyze your video!
              </h3>
              <p className="text-gray-400 mb-6">
                Our AI will analyze your presentation style and generate fun insights
              </p>
              <button
                onClick={handleAnalyze}
                disabled={!audioPath}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors"
              >
                Analyze with AI ✨
              </button>
              {!audioPath && (
                <p className="text-red-400 text-sm mt-2">No audio file available</p>
              )}
            </div>
          )}

          {isAnalyzing && (
            <div className="text-center py-12">
              <div className="animate-spin text-6xl mb-4">🤖</div>
              <h3 className="text-xl font-semibold text-white mb-2">
                AI is analyzing your video...
              </h3>
              <p className="text-gray-400">This may take 15-30 seconds</p>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 text-red-400">
              <p className="font-semibold">Error</p>
              <p className="text-sm">{error}</p>
              <button
                onClick={handleAnalyze}
                className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
              >
                Try Again
              </button>
            </div>
          )}

          {result && (
            <div className="space-y-6">
              {/* Personality Analysis */}
              <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 rounded-lg p-6 border border-purple-500/30">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">⚡</span>
                  Your Presenter Style
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-3xl font-bold text-purple-400 mb-2">
                      {result.personality.style}
                    </p>
                    <p className="text-gray-300">{result.personality.energyDescription}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-400 uppercase mb-2">Fun Stats</h4>
                    <ul className="space-y-1">
                      {result.personality.funStats.map((stat, idx) => (
                        <li key={idx} className="text-gray-300 flex items-start gap-2">
                          <span className="text-blue-400">•</span>
                          {stat}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-4">
                    <p className="text-sm font-semibold text-yellow-400 mb-1">Coach's Feedback</p>
                    <p className="text-gray-200 italic">{result.personality.motivationalFeedback}</p>
                  </div>
                </div>
              </div>

              {/* Alternative Narrations */}
              <div className="bg-gradient-to-br from-green-900/30 to-teal-900/30 rounded-lg p-6 border border-green-500/30">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">🎬</span>
                  Alternative Reality Versions
                </h3>
                <div className="space-y-4">
                  {result.alternativeNarrations.map((narration, idx) => (
                    <div
                      key={idx}
                      className="bg-gray-800/50 rounded-lg p-4 border border-gray-700"
                    >
                      <h4 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
                        <span className="text-2xl">{narration.emoji}</span>
                        {narration.styleName}
                      </h4>
                      <p className="text-gray-300 italic">{narration.text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transcript (collapsed by default) */}
              <details className="bg-gray-800/50 rounded-lg border border-gray-700">
                <summary className="p-4 cursor-pointer text-white font-semibold hover:bg-gray-800/70 rounded-lg">
                  📝 View Full Transcript
                </summary>
                <div className="p-4 pt-0">
                  <p className="text-gray-300 text-sm whitespace-pre-wrap">{result.transcript}</p>
                </div>
              </details>

              {/* Re-analyze button */}
              <div className="text-center">
                <button
                  onClick={handleAnalyze}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Re-analyze
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
