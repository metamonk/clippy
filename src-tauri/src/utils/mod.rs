pub mod ffmpeg;

/// Format a duration in seconds into a human-readable string (HH:MM:SS)
pub fn format_duration(seconds: u64) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;
    format!("{:02}:{:02}:{:02}", hours, minutes, secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_duration_zero() {
        assert_eq!(format_duration(0), "00:00:00");
    }

    #[test]
    fn test_format_duration_seconds() {
        assert_eq!(format_duration(45), "00:00:45");
    }

    #[test]
    fn test_format_duration_minutes() {
        assert_eq!(format_duration(125), "00:02:05");
    }

    #[test]
    fn test_format_duration_hours() {
        assert_eq!(format_duration(3665), "01:01:05");
    }
}
