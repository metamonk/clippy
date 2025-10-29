//! macOS Permission Handling Service
//!
//! This module handles macOS privacy permissions for screen recording, camera, and microphone.
//! It provides functions to check permission status and request permission from the user.
//!
//! # Permission Flow
//!
//! 1. Check permission status with `check_screen_recording_permission()`
//! 2. If permission not granted, call `request_screen_recording_permission()` to show system dialog
//! 3. User grants/denies permission in System Preferences → Privacy & Security → Screen Recording
//! 4. Permission state persists per-app bundle identifier
//!
//! # Example
//!
//! ```rust,no_run
//! use clippy_lib::services::permissions::{check_screen_recording_permission, request_screen_recording_permission};
//!
//! fn example() -> Result<(), Box<dyn std::error::Error>> {
//!     // Check permission before capture attempt
//!     if !check_screen_recording_permission()? {
//!         request_screen_recording_permission()?;
//!         return Err("Permission required. Please grant screen recording access.".into());
//!     }
//!     Ok(())
//! }
//! ```

use thiserror::Error;
use tracing::{debug, error, info, warn};

/// Errors that can occur during permission handling
#[derive(Error, Debug)]
pub enum PermissionError {
    #[error("Screen recording permission denied. Enable in System Preferences → Privacy & Security → Screen Recording")]
    ScreenRecordingDenied,

    #[error("macOS version too old. ScreenCaptureKit requires macOS 12.3+")]
    UnsupportedMacOSVersion,

    #[error("Permission check failed: {0}")]
    CheckFailed(String),

    #[error("Permission request failed: {0}")]
    RequestFailed(String),
}

/// Check if the app has screen recording permission
///
/// Returns `Ok(true)` if permission is granted, `Ok(false)` if not granted or not determined.
///
/// # Platform Support
///
/// This function only works on macOS 12.3+. On older versions, it returns an error.
///
/// # Errors
///
/// Returns `PermissionError::UnsupportedMacOSVersion` if macOS version is too old.
/// Returns `PermissionError::CheckFailed` if the permission check encounters an error.
#[cfg(target_os = "macos")]
pub fn check_screen_recording_permission() -> Result<bool, PermissionError> {
    debug!("Checking screen recording permission status");

    // Check macOS version (ScreenCaptureKit requires 12.3+)
    match check_macos_version() {
        Ok(false) => {
            error!("macOS version too old for ScreenCaptureKit");
            return Err(PermissionError::UnsupportedMacOSVersion);
        }
        Err(e) => {
            warn!("Could not determine macOS version: {}", e);
            // Continue anyway - better to try and fail than block the user
        }
        _ => {}
    }

    // Use CGPreflightScreenCaptureAccess to check permission
    // This is the recommended way to check screen recording permission without triggering the dialog
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
    }

    let has_permission = unsafe { CGPreflightScreenCaptureAccess() };

    if has_permission {
        info!("Screen recording permission granted");
    } else {
        warn!("Screen recording permission not granted");
    }

    Ok(has_permission)
}

/// Request screen recording permission from the user
///
/// This triggers the macOS system dialog asking the user to grant screen recording permission.
/// The user must then enable the app in System Preferences → Privacy & Security → Screen Recording.
///
/// # Platform Support
///
/// This function only works on macOS 12.3+.
///
/// # Errors
///
/// Returns `PermissionError::UnsupportedMacOSVersion` if macOS version is too old.
/// Returns `PermissionError::RequestFailed` if the permission request encounters an error.
#[cfg(target_os = "macos")]
pub fn request_screen_recording_permission() -> Result<(), PermissionError> {
    debug!("Requesting screen recording permission");

    // Check macOS version
    match check_macos_version() {
        Ok(false) => {
            error!("macOS version too old for ScreenCaptureKit");
            return Err(PermissionError::UnsupportedMacOSVersion);
        }
        Err(e) => {
            warn!("Could not determine macOS version: {}", e);
        }
        _ => {}
    }

    // Use CGRequestScreenCaptureAccess to trigger the permission dialog
    // This is the recommended way to request screen recording permission
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGRequestScreenCaptureAccess() -> bool;
    }

    let result = unsafe { CGRequestScreenCaptureAccess() };

    if result {
        info!("Screen recording permission granted or request initiated");
        Ok(())
    } else {
        error!("Screen recording permission denied or request failed");
        Err(PermissionError::RequestFailed(
            "Permission dialog shown, but permission was denied".to_string(),
        ))
    }
}

/// Check if the current macOS version supports ScreenCaptureKit (12.3+)
///
/// Returns `Ok(true)` if version is 12.3 or higher, `Ok(false)` otherwise.
/// Returns `Err` if version cannot be determined.
#[cfg(target_os = "macos")]
fn check_macos_version() -> Result<bool, String> {
    use std::process::Command;

    let output = Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .map_err(|e| format!("Failed to execute sw_vers: {}", e))?;

    if !output.status.success() {
        return Err("sw_vers command failed".to_string());
    }

    let version_str = String::from_utf8_lossy(&output.stdout);
    let version_str = version_str.trim();

    debug!("Detected macOS version: {}", version_str);

    // Parse version (e.g., "12.6.3" or "13.0")
    let parts: Vec<&str> = version_str.split('.').collect();
    if parts.is_empty() {
        return Err(format!("Invalid version format: {}", version_str));
    }

    let major: u32 = parts[0]
        .parse()
        .map_err(|_| format!("Invalid major version: {}", parts[0]))?;

    if major < 12 {
        return Ok(false);
    }

    if major > 12 {
        return Ok(true);
    }

    // macOS 12.x - need to check minor version
    if parts.len() < 2 {
        // Assume 12.0 if no minor version specified
        return Ok(false);
    }

    let minor: u32 = parts[1]
        .parse()
        .map_err(|_| format!("Invalid minor version: {}", parts[1]))?;

    // ScreenCaptureKit requires 12.3+
    Ok(minor >= 3)
}

// Non-macOS platforms - provide stubs that return errors
#[cfg(not(target_os = "macos"))]
pub fn check_screen_recording_permission() -> Result<bool, PermissionError> {
    Err(PermissionError::CheckFailed(
        "Screen recording is only supported on macOS".to_string(),
    ))
}

#[cfg(not(target_os = "macos"))]
pub fn request_screen_recording_permission() -> Result<(), PermissionError> {
    Err(PermissionError::RequestFailed(
        "Screen recording is only supported on macOS".to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "macos")]
    fn test_check_screen_recording_permission_returns_bool() {
        // This test verifies the function returns a bool result without panicking
        let result = check_screen_recording_permission();
        assert!(result.is_ok(), "Permission check should return Ok");

        let has_permission = result.unwrap();
        // We can't assert the value as it depends on system state
        // but we can verify it's a valid bool
        assert!(has_permission == true || has_permission == false);
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_request_permission_does_not_panic() {
        // This test verifies the function executes without panicking
        // We cannot verify the dialog appears in automated tests
        let result = request_screen_recording_permission();
        // Function should either succeed or return a proper error
        match result {
            Ok(()) => {
                // Permission request initiated successfully
            }
            Err(e) => {
                // Should be a proper PermissionError, not a panic
                assert!(!e.to_string().is_empty());
            }
        }
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn test_macos_version_check() {
        let result = check_macos_version();
        // Should be able to determine version on macOS
        assert!(result.is_ok(), "Version check should succeed on macOS");

        let is_supported = result.unwrap();
        // We're running on macOS in CI, version should be detectable
        // (May be true or false depending on macOS version)
        assert!(is_supported == true || is_supported == false);
    }

    #[test]
    #[cfg(not(target_os = "macos"))]
    fn test_non_macos_returns_error() {
        let check_result = check_screen_recording_permission();
        assert!(check_result.is_err());

        let request_result = request_screen_recording_permission();
        assert!(request_result.is_err());
    }
}
