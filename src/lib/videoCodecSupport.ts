/**
 * Video Codec Support Detection
 *
 * Checks browser support for various video codecs and provides
 * helpful error messages when codecs are not supported.
 */

export interface CodecSupport {
  h264: boolean;
  hevc: boolean;
  vp8: boolean;
  vp9: boolean;
  av1: boolean;
}

/**
 * Check which video codecs are supported by the browser
 */
export function detectCodecSupport(): CodecSupport {
  const video = document.createElement('video');

  return {
    h264: video.canPlayType('video/mp4; codecs="avc1.42E01E"') !== '',
    hevc: video.canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"') !== '',
    vp8: video.canPlayType('video/webm; codecs="vp8"') !== '',
    vp9: video.canPlayType('video/webm; codecs="vp9"') !== '',
    av1: video.canPlayType('video/mp4; codecs="av01.0.05M.08"') !== '',
  };
}

/**
 * Get a human-readable error message for unsupported codec
 */
export function getCodecErrorMessage(codec: string): string {
  const codecName = codec.toLowerCase();

  if (codecName.includes('hevc') || codecName.includes('h265')) {
    return 'HEVC (H.265) codec is not supported in this browser. Please convert your video to H.264 (MP4) format for playback.';
  }

  return `Video codec "${codec}" may not be supported. Try converting to H.264 (MP4) format.`;
}

/**
 * Log codec support information to console
 */
export function logCodecSupport(): void {
  const support = detectCodecSupport();
  console.log('[CodecSupport] Browser codec support:', support);
}
