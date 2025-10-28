import { describe, it, expect } from "vitest";
import { formatTime, parseTime } from "./timeUtils";

describe("timeUtils", () => {
  describe("formatTime", () => {
    it("should format seconds to MM:SS for times under 1 hour", () => {
      expect(formatTime(0)).toBe("0:00");
      expect(formatTime(5)).toBe("0:05");
      expect(formatTime(59)).toBe("0:59");
      expect(formatTime(65)).toBe("1:05");
      expect(formatTime(125)).toBe("2:05");
      expect(formatTime(599)).toBe("9:59");
    });

    it("should format seconds to HH:MM:SS for times 1 hour or longer", () => {
      expect(formatTime(3600)).toBe("1:00:00");
      expect(formatTime(3665)).toBe("1:01:05");
      expect(formatTime(7200)).toBe("2:00:00");
      expect(formatTime(7325)).toBe("2:02:05");
      expect(formatTime(36000)).toBe("10:00:00");
    });

    it("should handle decimal seconds by rounding to nearest integer (TD-004 fix)", () => {
      // Changed from Math.floor to Math.round to fix display issue
      expect(formatTime(65.7)).toBe("1:06"); // Rounds up
      expect(formatTime(125.9)).toBe("2:06"); // Rounds up
      expect(formatTime(3665.5)).toBe("1:01:06"); // Rounds up at .5

      // Test rounding down
      expect(formatTime(65.4)).toBe("1:05"); // Rounds down
      expect(formatTime(125.3)).toBe("2:05"); // Rounds down
    });

    it("should pad single digit minutes and seconds with leading zeros", () => {
      expect(formatTime(5)).toBe("0:05");
      expect(formatTime(65)).toBe("1:05");
      expect(formatTime(3665)).toBe("1:01:05");
    });

    it("should handle edge cases", () => {
      expect(formatTime(0)).toBe("0:00");
      expect(formatTime(3599)).toBe("59:59");
      expect(formatTime(3600)).toBe("1:00:00");
    });

    it("should fix TD-004: video end-of-playback display issue", () => {
      // Root cause: Videos stop at ~4.967s (last frame) but duration is 5.000s
      // Before fix: formatTime(4.967) = "0:04", formatTime(5.000) = "0:05"
      // Users saw "0:04 / 0:05" and thought playback stopped 1s early
      // After fix: formatTime(4.967) = "0:05", formatTime(5.000) = "0:05"
      // Users now see "0:05 / 0:05" correctly

      // Test with real codec values from testing
      expect(formatTime(4.967)).toBe("0:05"); // H.264 actual playback end
      expect(formatTime(5.000)).toBe("0:05"); // H.264 duration

      // Both should display the same value
      const currentTime = formatTime(4.967);
      const duration = formatTime(5.000);
      expect(currentTime).toBe(duration);
      expect(currentTime).toBe("0:05");

      // Test with other codec scenarios
      expect(formatTime(4.960)).toBe("0:05"); // HEVC/ProRes/VP9 end
      expect(formatTime(5.015)).toBe("0:05"); // HEVC duration
      expect(formatTime(5.017)).toBe("0:05"); // ProRes/VP9 duration

      // Ensure we don't over-round
      expect(formatTime(4.4)).toBe("0:04"); // Should still show 0:04
      expect(formatTime(4.5)).toBe("0:05"); // Rounds up at 0.5
    });
  });

  describe("parseTime", () => {
    it("should parse MM:SS format to seconds", () => {
      expect(parseTime("0:00")).toBe(0);
      expect(parseTime("0:05")).toBe(5);
      expect(parseTime("1:05")).toBe(65);
      expect(parseTime("2:05")).toBe(125);
      expect(parseTime("59:59")).toBe(3599);
    });

    it("should parse HH:MM:SS format to seconds", () => {
      expect(parseTime("1:00:00")).toBe(3600);
      expect(parseTime("1:01:05")).toBe(3665);
      expect(parseTime("2:00:00")).toBe(7200);
      expect(parseTime("2:02:05")).toBe(7325);
      expect(parseTime("10:00:00")).toBe(36000);
    });

    it("should return 0 for invalid formats", () => {
      expect(parseTime("")).toBe(0);
      expect(parseTime("5")).toBe(0);
      expect(parseTime("invalid")).toBe(0);
    });

    it("should be inverse of formatTime for MM:SS format", () => {
      const testValues = [0, 5, 65, 125, 599, 3599];
      testValues.forEach((seconds) => {
        const formatted = formatTime(seconds);
        const parsed = parseTime(formatted);
        expect(parsed).toBe(seconds);
      });
    });

    it("should be inverse of formatTime for HH:MM:SS format", () => {
      const testValues = [3600, 3665, 7200, 7325];
      testValues.forEach((seconds) => {
        const formatted = formatTime(seconds);
        const parsed = parseTime(formatted);
        expect(parsed).toBe(seconds);
      });
    });
  });
});
