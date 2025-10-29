# Story 2.4 Implementation Guide - Complete Story Fully

This guide walks you through completing Story 2.4: System Audio and Microphone Capture with all required fixes.

## Status

✅ **DONE**: Audio architecture set up (delegates, channels, orchestrator)
⚠️ **IN PROGRESS**: Real ScreenCaptureKit system audio extraction (CMSampleBuffer parsing)
❌ **TODO**: Microphone permission checking
❌ **TODO**: Fix test infrastructure issues

---

## 🔴 HIGH PRIORITY #1: Complete System Audio Capture Implementation

### What's Done
- ✅ `VideoStreamOutput` struct updated with `audio_tx` channel
- ✅ `did_output_sample_buffer` now handles both Screen (video) and Audio types
- ✅ `handle_video_frame` and `handle_audio_sample` methods created
- ✅ Audio output handler registered with SCStream when audio enabled
- ✅ SCStreamConfiguration set to capture audio (`set_captures_audio(true)`)

### What's Missing

**The actual audio data extraction from `CMSampleBuffer`** in `handle_audio_sample()` method.

**File:** `src-tauri/src/services/screen_capture/screencapturekit.rs:173-219`

**Current Status:** Placeholder with TODO comments

**What You Need to Do:**

The `CMSampleBuffer` for audio contains a `CMBlockBuffer` with raw PCM audio data. You need to:

1. **Extract the `CMBlockBuffer` from `CMSampleBuffer`**
   - Look for methods like `sample_buffer.get_data_buffer()` or similar in the `core-media-rs` crate

2. **Get audio format description**
   - Extract sample rate and channel count from the buffer
   - ScreenCaptureKit audio is typically **48kHz, 2 channels (stereo), f32 format**

3. **Copy audio data**
   - Extract the raw bytes from CMBlockBuffer
   - Convert to `Vec<f32>` (system audio is usually already in f32 format)

4. **Create `AudioSample` and send**

**Example implementation pattern** (you'll need to adapt based on actual core-media-rs API):

```rust
fn handle_audio_sample(&self, sample_buffer: CMSampleBuffer) {
    // Only process if audio channel is available
    let audio_tx = match &self.audio_tx {
        Some(tx) => tx,
        None => return, // Audio not enabled
    };

    // Get audio format description (sample rate, channels)
    // This depends on core-media-rs API - check documentation
    let sample_rate = 48000; // TODO: Extract from sample_buffer format description
    let channels = 2;        // TODO: Extract from sample_buffer format description

    // Extract CMBlockBuffer containing audio data
    let block_buffer = match sample_buffer.get_data_buffer() {
        Ok(buffer) => buffer,
        Err(e) => {
            warn!("Failed to get audio data buffer: {:?}", e);
            return;
        }
    };

    // Get audio data as bytes
    let audio_bytes = match block_buffer.get_data() {
        Ok(bytes) => bytes,
        Err(e) => {
            warn!("Failed to get audio bytes: {:?}", e);
            return;
        }
    };

    // Convert bytes to f32 samples
    // Audio data from ScreenCaptureKit is typically f32le (little-endian 32-bit float)
    let num_samples = audio_bytes.len() / 4; // 4 bytes per f32
    let mut audio_data = Vec::with_capacity(num_samples);

    for chunk in audio_bytes.chunks_exact(4) {
        let sample_bytes = [chunk[0], chunk[1], chunk[2], chunk[3]];
        let sample = f32::from_le_bytes(sample_bytes);
        audio_data.push(sample);
    }

    // Calculate timestamp
    let timestamp_ns = if let Ok(guard) = self.recording_start.lock() {
        if let Some(start) = *guard {
            start.elapsed().as_nanos() as u64
        } else {
            0
        }
    } else {
        0
    };

    // Create AudioSample
    let audio_sample = crate::services::audio_capture::AudioSample {
        data: audio_data,
        sample_rate,
        channels,
        timestamp_ns,
    };

    // Send via channel
    let tx = audio_tx.clone();
    tokio::spawn(async move {
        if let Err(e) = tx.send(audio_sample).await {
            error!("Failed to send audio sample: {}", e);
        }
    });
}
```

**Resources:**
- [core-media-rs documentation](https://docs.rs/core-media-rs/latest/core_media_rs/)
- [Apple CMSampleBuffer documentation](https://developer.apple.com/documentation/coremedia/cmsamplebuffer)
- Look at existing `handle_video_frame` implementation for similar pattern

**Testing:**
```bash
cd src-tauri
cargo build
cargo test --lib screen_capture
```

---

## 🔴 HIGH PRIORITY #2: Implement Microphone Permission Checking

### Current Issue
`AudioCapture::start_capture()` doesn't check microphone permission before attempting capture. Users get cryptic CPAL errors instead of friendly permission prompts.

### What To Implement

**Step 1: Add PermissionType::Microphone**

**File:** `src-tauri/src/services/permissions/macos.rs`

Add Microphone variant to PermissionType enum and implement checking:

```rust
// In macos.rs

#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl};
#[cfg(target_os = "macos")]
use objc_foundation::{INSString, NSString};

pub enum PermissionType {
    ScreenRecording,
    Microphone,  // ADD THIS
    Camera,      // For Story 2.7
}

#[cfg(target_os = "macos")]
pub fn check_microphone_permission() -> Result<bool, String> {
    use objc::runtime::Object;
    use std::ptr;

    unsafe {
        let av_capture_device_class = class!(AVCaptureDevice);

        // Check microphone authorization status
        // AVAuthorizationStatus for AVMediaTypeAudio
        let media_type_audio = NSString::from_str("vide"); // "vide" is AVMediaTypeAudio constant
        let auth_status: i64 = msg_send![av_capture_device_class, authorizationStatusForMediaType: media_type_audio];

        // AVAuthorizationStatus values:
        // 0 = NotDetermined
        // 1 = Restricted
        // 2 = Denied
        // 3 = Authorized

        match auth_status {
            3 => Ok(true),  // Authorized
            2 => Ok(false), // Denied
            1 => Ok(false), // Restricted
            0 => Ok(false), // NotDetermined
            _ => Err("Unknown authorization status".to_string()),
        }
    }
}

#[cfg(target_os = "macos")]
pub async fn request_microphone_permission() -> Result<bool, String> {
    use objc::runtime::Object;
    use std::sync::{Arc, Mutex};
    use tokio::sync::oneshot;

    unsafe {
        let av_capture_device_class = class!(AVCaptureDevice);
        let media_type_audio = NSString::from_str("vide"); // AVMediaTypeAudio

        let (tx, rx) = oneshot::channel();
        let tx = Arc::new(Mutex::new(Some(tx)));

        // Request permission (async callback)
        let callback = move |granted: bool| {
            if let Some(sender) = tx.lock().unwrap().take() {
                let _ = sender.send(granted);
            }
        };

        // This is a simplified version - full implementation requires Objective-C block handling
        // For now, use CPAL's permission request mechanism

        // Return current status
        check_microphone_permission()
    }
}
```

**Note:** The above is a sketch. The actual implementation requires proper Objective-C block callbacks. You may want to use the `block` crate for this.

**Simpler Alternative:** Use CPAL's built-in permission handling and wrap it:

```rust
// In audio_capture.rs

impl AudioCapture {
    /// Check if microphone permission is granted
    pub fn check_permission() -> Result<bool, AudioCaptureError> {
        // CPAL doesn't have a direct permission check
        // On macOS, permission is requested when you first access the device
        // We can try to enumerate devices as a permission check

        let host = cpal::default_host();
        match host.input_devices() {
            Ok(mut devices) => {
                // If we can enumerate devices, permission is likely granted
                Ok(devices.next().is_some())
            }
            Err(_) => {
                // If enumeration fails, permission might be denied
                Ok(false)
            }
        }
    }
}
```

**Step 2: Add Tauri Commands**

**File:** `src-tauri/src/commands/recording.rs`

```rust
#[tauri::command]
pub async fn check_microphone_permission() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        crate::services::permissions::check_microphone_permission()
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(true) // Non-macOS platforms don't have this permission model
    }
}

#[tauri::command]
pub async fn request_microphone_permission() -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        crate::services::permissions::request_microphone_permission().await
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(true)
    }
}
```

**Step 3: Register Commands**

**File:** `src-tauri/src/lib.rs`

```rust
// Add to the invoke_handler list
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    commands::recording::check_microphone_permission,
    commands::recording::request_microphone_permission,
])
```

**Step 4: Update RecordingPanel UI**

**File:** `src/components/recording/RecordingPanel.tsx`

Add permission check before starting recording with microphone:

```typescript
const handleStartRecording = async () => {
  const audioConfig = useRecordingStore.getState().audioSources;

  // Check microphone permission if microphone is enabled
  if (audioConfig.microphone) {
    const permitted = await invoke('check_microphone_permission');
    if (!permitted) {
      // Show permission prompt dialog
      setShowMicPermissionPrompt(true);
      return;
    }
  }

  // Start recording...
};
```

**Step 5: Create Permission Prompt Component**

Similar to existing PermissionPrompt for screen recording, create a microphone variant.

---

## 🟡 MEDIUM PRIORITY #3: Fix Rust Test Infrastructure

### Issue
Tests panic with "there is no reactor running, must be called from the context of a Tokio 1.x runtime"

**File:** `src-tauri/src/services/screen_capture/screencapturekit.rs` (test module)

**Fix:**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]  // ADD THIS instead of #[test]
    async fn test_screen_capture_creation() {
        let capture = ScreenCapture::new();
        assert!(capture.is_ok());
    }

    #[tokio::test]  // ADD THIS
    async fn test_continuous_capture() {
        // ... test code ...
    }
}
```

For tests that spawn background tasks (line 151), wrap in `tokio::test`:

```rust
#[tokio::test]
async fn test_start_continuous_capture() {
    let mut capture = ScreenCapture::new().unwrap();
    let (tx, mut rx) = mpsc::channel(30);

    let handle = capture.start_continuous_capture(tx, None).unwrap();

    // ... rest of test ...
}
```

---

## 🟡 MEDIUM PRIORITY #4: Add Disk Space Check

**File:** `src-tauri/src/services/recording/orchestrator.rs:219-237`

**Before creating PCM files, check available disk space:**

```rust
// Add sys-info to Cargo.toml
// sys-info = "0.9"

use sys_info::disk_info;

impl RecordingOrchestrator {
    pub async fn start_recording(&mut self) -> Result<()> {
        // Check disk space before creating files
        let temp_dir = std::env::temp_dir();
        if let Ok(disk) = disk_info() {
            let available_mb = disk.free / 1024 / 1024;
            if available_mb < 500 {
                return Err(anyhow::anyhow!(
                    "Insufficient disk space. Please free up at least 500MB and try again. Available: {}MB",
                    available_mb
                ));
            }
        }

        // ... continue with recording setup ...
    }
}
```

---

## 🟢 LOW PRIORITY #5: Fix Frontend Test Failures

**HTML Nesting Issue in PermissionPrompt:**

**File:** `src/components/recording/PermissionPrompt.tsx`

Replace nested `<p>` tags with `<div>`:

```tsx
<AlertDialogDescription className="space-y-3 text-base">
  <div>  {/* Changed from <p> */}
    clippy needs permission to record your screen...
  </div>
  <ul className="list-disc pl-6 space-y-1">
    {/* ... */}
  </ul>
</AlertDialogDescription>
```

**act() Warnings in RecordingPanel Tests:**

Wrap state updates in `act()`:

```typescript
import { act } from '@testing-library/react';

test('should update recording status', async () => {
  await act(async () => {
    useRecordingStore.getState().startRecording();
  });

  expect(screen.getByText(/Recording/i)).toBeInTheDocument();
});
```

---

## Testing Strategy

### After Each Fix:

**Backend Tests:**
```bash
cd src-tauri
cargo test --lib
cargo clippy
```

**Frontend Tests:**
```bash
npm test
npm run lint
```

**Integration Test:**
```bash
npm run tauri dev
# Manual test: Start recording with system audio + microphone
```

### Full Validation Checklist:

- [ ] Real ScreenCaptureKit audio captured (not simulated)
- [ ] Microphone permission check works
- [ ] All Rust tests pass (no Tokio panics)
- [ ] All frontend tests pass
- [ ] Record 30 seconds with system audio + microphone
- [ ] Verify final MP4 has 2 audio tracks (system + mic)
- [ ] Check audio/video sync (<50ms drift)
- [ ] Verify macOS system audio indicator (orange icon) appears

---

## Completion Criteria

When all of these are complete, update Story 2.4 status to "done":

1. ✅ Real system audio captured from ScreenCaptureKit (not simulated)
2. ✅ Microphone permission checking implemented
3. ✅ All tests passing (Rust + frontend)
4. ✅ Disk space check in place
5. ✅ Manual validation of 5-minute recording with both audio sources
6. ✅ Update sprint-status.yaml to "done"
7. ✅ Run `/bmad:bmm:workflows:review-story` again to verify all findings resolved

---

## Resources

- [ScreenCaptureKit Audio Documentation](https://developer.apple.com/documentation/screencapturekit)
- [core-media-rs Docs](https://docs.rs/core-media-rs/latest/core_media_rs/)
- [CPAL Audio Documentation](https://docs.rs/cpal/latest/cpal/)
- [Story 2.4 Review Document](./stories/2-4-system-audio-and-microphone-capture.md#senior-developer-review-ai)

---

**Questions?** Check the review findings in the story file for detailed rationale behind each fix.
