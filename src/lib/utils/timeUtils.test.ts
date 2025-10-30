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

    it("should show decimals for times >0.05s away from whole seconds", () => {
      // Times significantly away from whole seconds show .X
      expect(formatTime(65.7)).toBe("1:05.7");
      expect(formatTime(125.9)).toBe("2:05.9");
      expect(formatTime(3665.5)).toBe("1:01:05.5");
      expect(formatTime(4.967)).toBe("0:05.0"); // Real-world case
      expect(formatTime(4.1)).toBe("0:04.1");
      expect(formatTime(125.3)).toBe("2:05.3");
    });

    it("should hide decimals for times within 0.02s of whole seconds", () => {
      // Times close to whole seconds show clean display
      expect(formatTime(5.0)).toBe("0:05");
      expect(formatTime(5.01)).toBe("0:05"); // Within tolerance
      expect(formatTime(4.99)).toBe("0:05"); // Within tolerance
      expect(formatTime(65.015)).toBe("1:05");
      expect(formatTime(125.02)).toBe("2:05");
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

    it("should fix TD-004: video end-of-playback display issue with precision", () => {
      // Root cause: Videos stop at ~4.967s (last frame) but displayed "0:05"
      // Users thought they could seek to 5.0s when video ends at 4.967s
      // New fix: Show decimal precision to indicate exact duration

      // Test with real codec values from testing
      expect(formatTime(4.967)).toBe("0:05.0"); // H.264 actual playback end - shows decimal
      expect(formatTime(5.000)).toBe("0:05");   // H.264 exact duration - no decimal

      // Now users can distinguish between exact and approximate times
      expect(formatTime(4.960)).toBe("0:05.0"); // HEVC/ProRes/VP9 - shows decimal (40ms from 5)
      expect(formatTime(5.015)).toBe("0:05");   // Within 0.02s tolerance, no decimal
      expect(formatTime(5.025)).toBe("0:05.0"); // Just outside 0.02s tolerance, shows decimal

      // Times within 0.02s of whole seconds don't show decimals
      expect(formatTime(4.99)).toBe("0:05");  // Within tolerance, no decimal
      expect(formatTime(5.01)).toBe("0:05");  // Within tolerance, no decimal

      // Times far from whole seconds show decimals
      expect(formatTime(4.4)).toBe("0:04.4");
      expect(formatTime(4.5)).toBe("0:04.5");
      expect(formatTime(4.6)).toBe("0:04.6");
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
