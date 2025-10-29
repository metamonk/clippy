import { Shape } from 'react-konva';

interface WaveformShapeProps {
  /** Array of normalized peak values (0-1) */
  peaks: number[];

  /** Width of the waveform in pixels */
  width: number;

  /** Height of the waveform in pixels */
  height: number;

  /** Color of the waveform (supports rgba) */
  color?: string;
}

/**
 * WaveformShape Component
 *
 * Renders an audio waveform visualization using Konva Shape.
 * The waveform is drawn as vertical bars mirrored from the center,
 * creating a symmetric audio visualization.
 *
 * @param props - WaveformShape properties
 * @returns Konva Shape element with waveform visualization
 */
export function WaveformShape({
  peaks,
  width,
  height,
  color = 'rgba(59, 130, 246, 0.6)', // Semi-transparent blue
}: WaveformShapeProps) {
  // Don't render if no peaks data
  if (!peaks || peaks.length === 0) {
    return null;
  }

  return (
    <Shape
      sceneFunc={(context, shape) => {
        context.beginPath();
        context.fillStyle = color;

        const barWidth = width / peaks.length;
        const centerY = height / 2;

        // Draw waveform bars (mirrored top/bottom from center)
        for (let i = 0; i < peaks.length; i++) {
          const x = i * barWidth;
          // Scale to 80% of available height to leave some padding
          const barHeight = peaks[i] * (height / 2) * 0.8;

          // Top half (above center)
          context.fillRect(x, centerY - barHeight, Math.max(1, barWidth - 1), barHeight);

          // Bottom half (mirror below center)
          context.fillRect(x, centerY, Math.max(1, barWidth - 1), barHeight);
        }

        context.fillShape(shape);
      }}
      listening={false} // Waveform is visual only, not interactive
    />
  );
}
