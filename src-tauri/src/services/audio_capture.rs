//! Audio Capture Service
//!
//! This module provides microphone audio capture capabilities using CPAL (CoreAudio on macOS).
//! It supports device enumeration, audio stream capture, and integration with the recording system.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, Host, Sample, SampleFormat, Stream, StreamConfig, SupportedStreamConfig};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

/// Errors that can occur during audio capture operations
#[derive(Error, Debug)]
pub enum AudioCaptureError {
    #[error("No audio input devices found")]
    NoDevicesFound,

    #[error("Default audio device not available")]
    DefaultDeviceNotAvailable,

    #[error("Failed to get device name: {0}")]
    DeviceNameError(String),

    #[error("Failed to get default stream config: {0}")]
    StreamConfigError(String),

    #[error("Unsupported sample format: {0:?}")]
    UnsupportedSampleFormat(SampleFormat),

    #[error("Failed to build audio stream: {0}")]
    StreamBuildError(String),

    #[error("Failed to start audio stream: {0}")]
    StreamPlayError(String),

    #[error("Audio host not available")]
    HostNotAvailable,

    #[error("Microphone permission denied or not available")]
    PermissionDenied,
}

/// Audio sample data in float32 format
///
/// Audio samples are always normalized to f32 format for consistency.
/// Sample rate and channel count are included for synchronization.
pub struct AudioSample {
    /// Audio data in f32 format (interleaved if multi-channel)
    pub data: Vec<f32>,
    /// Sample rate (e.g., 48000 Hz)
    pub sample_rate: u32,
    /// Number of channels (1 = mono, 2 = stereo)
    pub channels: u16,
    /// Timestamp when sample was captured (nanoseconds since recording start)
    pub timestamp_ns: u64,
}

/// Audio device information
#[derive(Debug, Clone)]
pub struct AudioDevice {
    /// Device name (e.g., "Built-in Microphone")
    pub name: String,
    /// Device identifier (internal, reserved for future use)
    #[allow(dead_code)]
    device_id: String,
}

impl AudioDevice {
    /// Create new AudioDevice from CPAL device
    fn from_cpal_device(device: &Device) -> Result<Self, AudioCaptureError> {
        let name = device
            .name()
            .map_err(|e| AudioCaptureError::DeviceNameError(e.to_string()))?;

        // Use device name as ID for now (CPAL doesn't provide stable IDs)
        let device_id = name.clone();

        Ok(Self { name, device_id })
    }
}

/// Microphone audio capture service
///
/// This service provides access to system microphone devices and captures audio
/// samples in f32 format at 48kHz (professional standard).
pub struct AudioCapture {
    /// CPAL audio host
    host: Host,
    /// Currently selected input device
    device: Option<Device>,
    /// Active audio stream
    stream: Option<Stream>,
    /// Stream configuration
    config: Option<SupportedStreamConfig>,
    /// Pause flag for sample discard (Story 4.8)
    is_paused: Arc<AtomicBool>,
}

impl AudioCapture {
    /// Create a new AudioCapture instance
    ///
    /// This initializes the audio host (CoreAudio on macOS) and prepares for capture.
    pub fn new() -> Result<Self, AudioCaptureError> {
        debug!("Initializing AudioCapture");

        // Get default audio host (CoreAudio on macOS)
        let host = cpal::default_host();
        info!("Using audio host: {}", host.id().name());

        Ok(Self {
            host,
            device: None,
            stream: None,
            config: None,
            is_paused: Arc::new(AtomicBool::new(false)),
        })
    }

    /// Enumerate available input devices (microphones)
    ///
    /// Returns a list of all available audio input devices on the system.
    pub fn enumerate_devices(&self) -> Result<Vec<AudioDevice>, AudioCaptureError> {
        debug!("Enumerating audio input devices");

        let devices = self
            .host
            .input_devices()
            .map_err(|e| {
                error!("Failed to enumerate input devices: {}", e);
                AudioCaptureError::NoDevicesFound
            })?
            .filter_map(|device| {
                match AudioDevice::from_cpal_device(&device) {
                    Ok(info) => {
                        debug!("Found device: {}", info.name);
                        Some(info)
                    }
                    Err(e) => {
                        warn!("Failed to get device info: {}", e);
                        None
                    }
                }
            })
            .collect::<Vec<_>>();

        if devices.is_empty() {
            warn!("No audio input devices found");
            return Err(AudioCaptureError::NoDevicesFound);
        }

        info!("Found {} input device(s)", devices.len());
        Ok(devices)
    }

    /// Select the default input device
    ///
    /// This selects the system's default microphone for capture.
    pub fn select_default_device(&mut self) -> Result<String, AudioCaptureError> {
        debug!("Selecting default input device");

        let device = self
            .host
            .default_input_device()
            .ok_or_else(|| {
                error!("No default input device available");
                AudioCaptureError::DefaultDeviceNotAvailable
            })?;

        let device_name = device
            .name()
            .map_err(|e| AudioCaptureError::DeviceNameError(e.to_string()))?;

        info!("Selected default device: {}", device_name);

        // Get default config (prefer 48kHz for professional audio)
        let config = device
            .default_input_config()
            .map_err(|e| {
                error!("Failed to get default input config: {}", e);
                AudioCaptureError::StreamConfigError(e.to_string())
            })?;

        debug!(
            "Device config: {} Hz, {} channels, format: {:?}",
            config.sample_rate().0,
            config.channels(),
            config.sample_format()
        );

        self.device = Some(device);
        self.config = Some(config);

        Ok(device_name)
    }

    /// Start capturing audio samples
    ///
    /// This starts the audio stream and sends captured samples to the provided channel.
    /// Audio is captured in f32 format at the device's native sample rate.
    ///
    /// # Arguments
    ///
    /// * `sample_tx` - Channel sender for audio samples
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if stream started successfully
    pub fn start_capture(
        &mut self,
        sample_tx: mpsc::Sender<AudioSample>,
    ) -> Result<(), AudioCaptureError> {
        debug!("Starting audio capture");

        let device = self.device.as_ref().ok_or_else(|| {
            error!("No device selected");
            AudioCaptureError::DefaultDeviceNotAvailable
        })?;

        let config = self.config.as_ref().ok_or_else(|| {
            error!("No stream config available");
            AudioCaptureError::StreamConfigError("Config not initialized".to_string())
        })?;

        let sample_format = config.sample_format();
        let stream_config: StreamConfig = config.clone().into();
        let sample_rate = stream_config.sample_rate.0;
        let channels = stream_config.channels;

        info!(
            "Building audio stream: {} Hz, {} channels, {:?}",
            sample_rate, channels, sample_format
        );

        // Timestamp tracking (nanoseconds since capture start)
        let start_time = std::time::Instant::now();

        // Build stream based on sample format
        let stream = match sample_format {
            SampleFormat::F32 => self.build_stream::<f32>(
                device,
                &stream_config,
                sample_tx,
                sample_rate,
                channels,
                start_time,
                self.is_paused.clone(), // Story 4.8
            )?,
            SampleFormat::I16 => self.build_stream::<i16>(
                device,
                &stream_config,
                sample_tx,
                sample_rate,
                channels,
                start_time,
                self.is_paused.clone(), // Story 4.8
            )?,
            SampleFormat::U16 => self.build_stream::<u16>(
                device,
                &stream_config,
                sample_tx,
                sample_rate,
                channels,
                start_time,
                self.is_paused.clone(), // Story 4.8
            )?,
            _ => {
                error!("Unsupported sample format: {:?}", sample_format);
                return Err(AudioCaptureError::UnsupportedSampleFormat(sample_format));
            }
        };

        // Start the stream
        stream.play().map_err(|e| {
            error!("Failed to start audio stream: {}", e);
            AudioCaptureError::StreamPlayError(e.to_string())
        })?;

        self.stream = Some(stream);
        info!("Audio capture started successfully");

        Ok(())
    }

    /// Build audio stream with generic sample type
    ///
    /// This is a helper method that builds a CPAL stream with the appropriate sample type
    /// and converts all samples to f32 format.
    fn build_stream<T>(
        &self,
        device: &Device,
        config: &StreamConfig,
        sample_tx: mpsc::Sender<AudioSample>,
        sample_rate: u32,
        channels: u16,
        start_time: std::time::Instant,
        is_paused: Arc<AtomicBool>, // Story 4.8
    ) -> Result<Stream, AudioCaptureError>
    where
        T: cpal::Sample + cpal::SizedSample,
    {
        let err_fn = |err| {
            error!("Audio stream error: {}", err);
        };

        let sample_tx = Arc::new(sample_tx);

        let data_fn = move |data: &[T], _: &cpal::InputCallbackInfo| {
            // Story 4.8: Discard samples during pause (sample discard approach)
            if is_paused.load(Ordering::Relaxed) {
                debug!("Microphone audio sample discarded during pause");
                return;
            }

            let timestamp_ns = start_time.elapsed().as_nanos() as u64;

            // Convert samples to f32
            // CPAL's to_float_sample() converts to associated Float type
            // We need to explicitly convert to f32
            let f32_data: Vec<f32> = data
                .iter()
                .map(|s| {
                    let float_val = s.to_float_sample();
                    // Convert to f32 explicitly
                    float_val.to_sample::<f32>()
                })
                .collect();

            let audio_sample = AudioSample {
                data: f32_data,
                sample_rate,
                channels,
                timestamp_ns,
            };

            // Send sample (non-blocking)
            if let Err(e) = sample_tx.try_send(audio_sample) {
                warn!("Failed to send audio sample: {}", e);
            }
        };

        device
            .build_input_stream(config, data_fn, err_fn, None)
            .map_err(|e| {
                error!("Failed to build input stream: {}", e);
                AudioCaptureError::StreamBuildError(e.to_string())
            })
    }

    /// Stop audio capture
    ///
    /// This stops the active audio stream and releases resources.
    pub fn stop_capture(&mut self) {
        debug!("Stopping audio capture");

        if let Some(stream) = self.stream.take() {
            drop(stream);
            info!("Audio stream stopped");
        }
    }

    /// Check if currently capturing
    pub fn is_capturing(&self) -> bool {
        self.stream.is_some()
    }

    /// Pause audio capture (Story 4.8 - AC #1)
    ///
    /// When paused, audio samples continue to be captured but are immediately
    /// discarded (sample discard approach). This prevents audio gaps in the output.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if pause succeeded, or error if capture is not active.
    pub fn pause_capture(&self) -> Result<(), AudioCaptureError> {
        if !self.is_capturing() {
            return Err(AudioCaptureError::StreamPlayError(
                "Cannot pause: capture is not active".to_string(),
            ));
        }

        self.is_paused.store(true, Ordering::Relaxed);
        info!("Microphone audio capture paused (sample discard enabled)");
        Ok(())
    }

    /// Resume audio capture (Story 4.8 - AC #3)
    ///
    /// Resumes capturing audio samples after a pause.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if resume succeeded, or error if capture is not active.
    pub fn resume_capture(&self) -> Result<(), AudioCaptureError> {
        if !self.is_capturing() {
            return Err(AudioCaptureError::StreamPlayError(
                "Cannot resume: capture is not active".to_string(),
            ));
        }

        self.is_paused.store(false, Ordering::Relaxed);
        info!("Microphone audio capture resumed");
        Ok(())
    }

    /// Check if capture is currently paused (Story 4.8)
    pub fn is_paused(&self) -> bool {
        self.is_paused.load(Ordering::Relaxed)
    }

    /// Get the pause flag for external control (Story 4.8 - PiP pause/resume integration)
    ///
    /// Returns a clone of the Arc<AtomicBool> pause flag that can be used by
    /// commands to control pause state without accessing the AudioCapture instance.
    ///
    /// # Returns
    ///
    /// Returns `Arc<AtomicBool>` that can be used to pause/resume capture externally.
    pub fn get_pause_flag(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.is_paused)
    }
}

impl Drop for AudioCapture {
    fn drop(&mut self) {
        self.stop_capture();
    }
}

/// PCM File Writer
///
/// Writes audio samples to a PCM file in s16le format (signed 16-bit little-endian).
/// This format is compatible with FFmpeg's audio muxing.
pub struct PcmFileWriter {
    file: std::fs::File,
    samples_written: usize,
}

impl PcmFileWriter {
    /// Create a new PCM file writer
    ///
    /// # Arguments
    ///
    /// * `path` - Path to the output PCM file
    ///
    /// # Returns
    ///
    /// Returns `Ok(PcmFileWriter)` if file created successfully
    pub fn new(path: &std::path::Path) -> std::io::Result<Self> {
        let file = std::fs::File::create(path)?;
        info!("Created PCM file writer: {}", path.display());
        Ok(Self {
            file,
            samples_written: 0,
        })
    }

    /// Write audio samples to the PCM file
    ///
    /// Converts f32 samples to s16le format and writes to file.
    ///
    /// # Arguments
    ///
    /// * `sample` - Audio sample with f32 data
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if write succeeded
    pub fn write_sample(&mut self, sample: &AudioSample) -> std::io::Result<()> {
        use std::io::Write;

        // Convert f32 samples to s16le (signed 16-bit little-endian)
        let mut buffer = Vec::with_capacity(sample.data.len() * 2); // 2 bytes per sample

        for &f32_sample in &sample.data {
            // Clamp to [-1.0, 1.0] range
            let clamped = f32_sample.max(-1.0).min(1.0);

            // Convert to s16 range [-32768, 32767]
            let s16_sample = (clamped * 32767.0) as i16;

            // Write as little-endian bytes
            buffer.extend_from_slice(&s16_sample.to_le_bytes());
        }

        // Write to file
        self.file.write_all(&buffer)?;
        self.samples_written += sample.data.len();

        if self.samples_written % 48000 == 0 {
            debug!("Wrote {} audio samples to PCM file", self.samples_written);
        }

        Ok(())
    }

    /// Get the total number of samples written
    pub fn samples_written(&self) -> usize {
        self.samples_written
    }

    /// Flush and sync the file to disk
    pub fn finalize(mut self) -> std::io::Result<()> {
        use std::io::Write;
        self.file.flush()?;
        self.file.sync_all()?;
        info!(
            "PCM file finalized with {} total samples",
            self.samples_written
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_audio_capture_new() {
        let capture = AudioCapture::new();
        assert!(capture.is_ok(), "AudioCapture should initialize");
    }

    #[test]
    fn test_enumerate_devices() {
        let capture = AudioCapture::new().expect("Failed to create AudioCapture");
        let devices = capture.enumerate_devices();

        // May fail if no microphone connected, but should not panic
        match devices {
            Ok(devices) => {
                assert!(!devices.is_empty(), "Should find at least one device");
                for device in devices {
                    assert!(!device.name.is_empty(), "Device name should not be empty");
                }
            }
            Err(AudioCaptureError::NoDevicesFound) => {
                // Acceptable if no microphone connected
            }
            Err(e) => {
                panic!("Unexpected error: {}", e);
            }
        }
    }

    #[test]
    fn test_select_default_device() {
        let mut capture = AudioCapture::new().expect("Failed to create AudioCapture");
        let result = capture.select_default_device();

        match result {
            Ok(name) => {
                assert!(!name.is_empty(), "Device name should not be empty");
                assert!(capture.device.is_some(), "Device should be set");
                assert!(capture.config.is_some(), "Config should be set");
            }
            Err(AudioCaptureError::DefaultDeviceNotAvailable) => {
                // Acceptable if no microphone connected
            }
            Err(e) => {
                panic!("Unexpected error: {}", e);
            }
        }
    }

    #[tokio::test]
    async fn test_start_stop_capture() {
        let mut capture = AudioCapture::new().expect("Failed to create AudioCapture");

        // Try to select default device
        if capture.select_default_device().is_err() {
            // Skip test if no microphone available
            return;
        }

        let (tx, mut rx) = mpsc::channel(100);

        // Start capture
        let result = capture.start_capture(tx);
        assert!(result.is_ok(), "Should start capture successfully");
        assert!(capture.is_capturing(), "Should be capturing");

        // Wait a bit to receive some samples
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // Check if we received samples
        let mut received_samples = false;
        while let Ok(sample) = rx.try_recv() {
            received_samples = true;
            assert!(!sample.data.is_empty(), "Sample data should not be empty");
            assert!(sample.sample_rate > 0, "Sample rate should be > 0");
            assert!(sample.channels > 0, "Channels should be > 0");
        }

        // Stop capture
        capture.stop_capture();
        assert!(!capture.is_capturing(), "Should not be capturing");

        if received_samples {
            println!("Successfully captured audio samples");
        } else {
            println!("Warning: No samples received (may need microphone input)");
        }
    }

    #[test]
    fn test_audio_sample_structure() {
        let sample = AudioSample {
            data: vec![0.0, 0.5, -0.5, 1.0],
            sample_rate: 48000,
            channels: 2,
            timestamp_ns: 1000000,
        };

        assert_eq!(sample.data.len(), 4);
        assert_eq!(sample.sample_rate, 48000);
        assert_eq!(sample.channels, 2);
        assert_eq!(sample.timestamp_ns, 1000000);
    }
}
