import { describe, it, expect } from 'vitest';
import { WaveformShape } from './WaveformShape';

// Skip Konva tests in node environment (requires canvas)
describe.skip('WaveformShape', () => {
  it('should have peaks prop', () => {
    expect(WaveformShape).toBeDefined();
  });

  it('should return null when peaks is empty', () => {
    const result = WaveformShape({ peaks: [], width: 500, height: 100 });
    expect(result).toBeNull();
  });

  it('should return null when peaks is null', () => {
    const result = WaveformShape({
      peaks: null as unknown as number[],
      width: 500,
      height: 100,
    });
    expect(result).toBeNull();
  });

  it('should return Shape component when peaks are provided', () => {
    const result = WaveformShape({
      peaks: [0.1, 0.5, 0.3, 0.8],
      width: 500,
      height: 100,
    });
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('type');
  });

  it('should accept custom color prop', () => {
    const customColor = 'rgba(255, 0, 0, 0.5)';
    const result = WaveformShape({
      peaks: [0.5, 0.8, 0.3],
      width: 500,
      height: 100,
      color: customColor,
    });
    expect(result).not.toBeNull();
  });

  it('should use default color when not provided', () => {
    const result = WaveformShape({
      peaks: [0.5, 0.8, 0.3],
      width: 500,
      height: 100,
    });
    expect(result).not.toBeNull();
  });

  it('should handle single peak value', () => {
    const result = WaveformShape({
      peaks: [0.7],
      width: 500,
      height: 100,
    });
    expect(result).not.toBeNull();
  });

  it('should handle many peaks', () => {
    const peaks = new Array(1000).fill(0).map(() => Math.random());
    const result = WaveformShape({
      peaks,
      width: 500,
      height: 100,
    });
    expect(result).not.toBeNull();
  });

  it('should handle zero peak values', () => {
    const result = WaveformShape({
      peaks: [0, 0, 0, 0],
      width: 500,
      height: 100,
    });
    expect(result).not.toBeNull();
  });

  it('should handle maximum peak values', () => {
    const result = WaveformShape({
      peaks: [1.0, 1.0, 1.0, 1.0],
      width: 500,
      height: 100,
    });
    expect(result).not.toBeNull();
  });
});
