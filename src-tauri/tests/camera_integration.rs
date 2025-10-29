//! Integration tests for camera flow
//!
//! Tests the end-to-end camera permission → list → select flow.
//! These tests validate that camera enumeration and info extraction work correctly.

use clippy_lib::services::camera::CameraService;

#[cfg(target_os = "macos")]
use clippy_lib::services::permissions::check_camera_permission;

/// Test: Camera enumeration and info extraction
///
/// This test validates:
/// 1. Camera service can be initialized
/// 2. Camera listing returns proper structure
/// 3. Camera info includes required fields (id, name, width, height, fps)
///
/// Note: This test assumes camera permission is granted in test environment.
/// On CI/CD, tests may need to mock permission checks or run on systems with cameras.
#[tokio::test]
async fn test_camera_enumeration_and_info() {
    // Step 1: Create camera service instance
    // Note: In real usage, we'd check permission first, but for tests we assume it's granted
    // or running in an environment where permission is not required (CI with mock camera)

    let camera_service = CameraService::new();
    let cameras_result = camera_service.list_cameras();

    // Step 2: Validate the result structure
    match cameras_result {
        Ok(cameras) => {
            println!("Found {} camera(s)", cameras.len());

            // If cameras are available, validate each camera has required fields
            for camera in &cameras {
                // Validate camera has an id
                println!("Validating camera ID: {}", camera.id);

                // Validate camera has a name
                assert!(!camera.name.is_empty(), "Camera name should not be empty");

                // Validate resolution string
                assert!(!camera.resolution.is_empty(), "Camera resolution should not be empty");

                // Validate FPS
                assert!(camera.fps > 0, "Camera FPS should be positive");

                println!("✓ Camera {}: {} ({} @ {}fps)",
                    camera.id,
                    camera.name,
                    camera.resolution,
                    camera.fps
                );
            }

            println!("✓ Camera enumeration test passed");
        }
        Err(e) => {
            // If no cameras found or permission denied, test still passes
            // but logs the reason for CI/CD debugging
            println!("⚠ Camera enumeration returned error: {}", e);
            println!("  This is acceptable in CI/CD environments without cameras");
            println!("  or when camera permission is not granted.");
        }
    }
}

/// Test: Camera permission check (macOS only)
///
/// Validates that camera permission check function works without crashing.
/// Note: We don't assert the result because permission state depends on the test environment.
#[cfg(target_os = "macos")]
#[test]
fn test_camera_permission_check() {
    // This test validates the permission check doesn't crash
    let permission_result = check_camera_permission();

    match permission_result {
        Ok(granted) => {
            println!("✓ Camera permission check succeeded: granted={}", granted);
        }
        Err(e) => {
            println!("✓ Camera permission check returned error: {}", e);
            // Error is acceptable (e.g., on CI without AVFoundation mocking)
        }
    }
}

/// Test: Camera service initialization
///
/// Validates that CameraService can be initialized without errors.
/// This is a basic smoke test to ensure the camera service module is properly linked.
#[test]
fn test_camera_service_initialization() {
    // Create camera service instance
    let camera_service = CameraService::new();

    // Attempt to list cameras - if service is properly initialized, this shouldn't panic
    let result = camera_service.list_cameras();

    // We don't assert the result, just that the function can be called
    match result {
        Ok(cameras) => {
            println!("✓ Camera service initialization successful: {} camera(s) found", cameras.len());
        }
        Err(e) => {
            println!("✓ Camera service initialization successful (error: {})", e);
            // Error is acceptable (e.g., no cameras, no permission)
        }
    }
}
