//! Native AVFoundation Camera Capture for macOS
//!
//! This module provides direct AVFoundation camera capture for high-performance
//! real-time video recording at 30 FPS.
//!
//! # Performance
//!
//! - Native async frame delivery at true 30 FPS via AVCaptureVideoDataOutput callbacks
//! - No blocking waits for frames
//! - Minimal overhead between camera and encoder
//!
//! # Architecture
//!
//! Uses AVCaptureSession with AVCaptureVideoDataOutput and a custom Objective-C
//! delegate to receive frame callbacks asynchronously.

// Suppress warnings from objc crate macros about cfg(cargo-clippy)
#![allow(unexpected_cfgs)]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use thiserror::Error;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

/// Errors that can occur during camera operations
#[derive(Error, Debug)]
pub enum AVCameraError {
    #[error("Camera not found: {0}")]
    CameraNotFound(String),

    #[error("Camera access denied. Enable in System Preferences → Privacy & Security → Camera")]
    AccessDenied,

    #[error("Failed to initialize camera: {0}")]
    InitFailed(String),

    #[error("Failed to start camera stream: {0}")]
    StreamFailed(String),

    #[error("Camera operation failed: {0}")]
    OperationFailed(String),

    #[error("Unsupported platform - AVFoundation only available on macOS")]
    UnsupportedPlatform,
}

/// Camera information structure
#[derive(Debug, Clone)]
pub struct CameraInfo {
    /// Camera unique ID
    pub id: String,
    /// Camera name (e.g., "FaceTime HD Camera")
    pub name: String,
    /// Maximum supported resolution
    pub max_resolution: String,
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use crate::services::ffmpeg::TimestampedFrame;
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object, Protocol, Sel, BOOL, NO, YES};
    use objc::{msg_send, sel, sel_impl};
    use std::ffi::c_void;
    use std::os::raw::c_int;
    use std::ptr;
    use tokio::task::JoinHandle;

    // Link AVFoundation and CoreMedia frameworks
    #[link(name = "AVFoundation", kind = "framework")]
    #[link(name = "CoreMedia", kind = "framework")]
    #[link(name = "CoreVideo", kind = "framework")]
    extern "C" {}

    // FFI bindings for CoreMedia
    #[repr(C)]
    pub struct OpaqueCMSampleBuffer {
        _private: [u8; 0],
    }
    pub type CMSampleBufferRef = *mut OpaqueCMSampleBuffer;

    #[repr(C)]
    pub struct OpaqueCVImageBuffer {
        _private: [u8; 0],
    }
    pub type CVImageBufferRef = *mut OpaqueCVImageBuffer;
    pub type CVPixelBufferRef = CVImageBufferRef;

    extern "C" {
        // Get image buffer from sample buffer
        fn CMSampleBufferGetImageBuffer(sbuf: CMSampleBufferRef) -> CVImageBufferRef;

        // Lock/unlock pixel buffer for reading
        fn CVPixelBufferLockBaseAddress(
            pixel_buffer: CVPixelBufferRef,
            lock_flags: u64,
        ) -> c_int;
        fn CVPixelBufferUnlockBaseAddress(
            pixel_buffer: CVPixelBufferRef,
            unlock_flags: u64,
        ) -> c_int;

        // Get pixel buffer properties
        fn CVPixelBufferGetWidth(pixel_buffer: CVPixelBufferRef) -> usize;
        fn CVPixelBufferGetHeight(pixel_buffer: CVPixelBufferRef) -> usize;
        fn CVPixelBufferGetBaseAddress(pixel_buffer: CVPixelBufferRef) -> *mut c_void;
        fn CVPixelBufferGetBytesPerRow(pixel_buffer: CVPixelBufferRef) -> usize;
    }

    // Shared context for the delegate to send frames
    struct DelegateContext {
        frame_tx: mpsc::Sender<TimestampedFrame>,
        recording_start: std::time::Instant,
        width: u32,
        height: u32,
        frame_count: Arc<Mutex<u64>>,
    }

    /// AVFoundation camera capture implementation
    pub struct AVCameraCapture {
        /// Camera device ID
        device_id: String,
        /// Target width
        width: u32,
        /// Target height
        height: u32,
        /// Target frame rate
        _fps: u32,
        /// Flag indicating if capture is active
        is_capturing: bool,
        /// Stop signal
        stop_flag: Arc<AtomicBool>,
        /// Capture session (opaque Objective-C object)
        session: Option<*mut Object>,
        /// Delegate object (opaque Objective-C object)
        delegate: Option<*mut Object>,
        /// Frame count
        frame_count: Arc<Mutex<u64>>,
    }

    // AVCaptureSession and related objects are not Send/Sync by default
    // but we ensure thread safety through proper synchronization
    unsafe impl Send for AVCameraCapture {}
    unsafe impl Sync for AVCameraCapture {}

    impl AVCameraCapture {
        /// Create a new camera capture instance
        ///
        /// # Arguments
        ///
        /// * `camera_index` - Index of the camera (0 = default camera)
        /// * `width` - Target frame width
        /// * `height` - Target frame height
        /// * `fps` - Target frame rate
        pub fn new(
            camera_index: u32,
            width: u32,
            height: u32,
            fps: u32,
        ) -> Result<Self, AVCameraError> {
            info!(
                "Creating AVFoundation camera capture: {}x{} @ {} FPS (camera index {})",
                width, height, fps, camera_index
            );

            // Get camera device ID
            let device_id = Self::get_device_id(camera_index)?;

            Ok(Self {
                device_id,
                width,
                height,
                _fps: fps,
                is_capturing: false,
                stop_flag: Arc::new(AtomicBool::new(false)),
                session: None,
                delegate: None,
                frame_count: Arc::new(Mutex::new(0)),
            })
        }

        /// Get camera device ID by index
        fn get_device_id(camera_index: u32) -> Result<String, AVCameraError> {
            unsafe {
                // Get AVCaptureDevice class
                let av_capture_device_class = match Class::get("AVCaptureDevice") {
                    Some(cls) => cls,
                    None => {
                        return Err(AVCameraError::InitFailed(
                            "AVCaptureDevice class not found".to_string(),
                        ))
                    }
                };

                // Get array of video devices using the standard API
                // Create NSString for media type "vide" (AVMediaTypeVideo constant)
                let ns_string_class = Class::get("NSString").ok_or_else(|| {
                    AVCameraError::InitFailed("NSString class not found".to_string())
                })?;
                let media_type_c = std::ffi::CString::new("vide").unwrap();
                let media_type_video: *mut Object = msg_send![
                    ns_string_class,
                    stringWithUTF8String: media_type_c.as_ptr()
                ];

                // Get all available video devices
                let devices: *mut Object = msg_send![
                    av_capture_device_class,
                    devicesWithMediaType: media_type_video
                ];

                if devices.is_null() {
                    return Err(AVCameraError::CameraNotFound(
                        "No camera devices found".to_string(),
                    ));
                }

                let count: usize = msg_send![devices, count];

                if camera_index as usize >= count {
                    return Err(AVCameraError::CameraNotFound(format!(
                        "Camera index {} out of range (found {} cameras)",
                        camera_index, count
                    )));
                }

                let device: *mut Object = msg_send![devices, objectAtIndex: camera_index as usize];
                if device.is_null() {
                    return Err(AVCameraError::CameraNotFound(format!(
                        "Camera at index {} is null",
                        camera_index
                    )));
                }

                let unique_id: *mut Object = msg_send![device, uniqueID];
                let c_str: *const std::os::raw::c_char = msg_send![unique_id, UTF8String];
                let device_id = std::ffi::CStr::from_ptr(c_str).to_string_lossy().into_owned();

                info!("Found camera device ID: {}", device_id);
                Ok(device_id)
            }
        }

        /// Start continuous camera capture
        ///
        /// Captures frames and sends them through the provided channel.
        ///
        /// # Arguments
        ///
        /// * `frame_tx` - Channel sender for timestamped frames
        ///
        /// # Returns
        ///
        /// * `Ok(JoinHandle)` - Handle to the capture task
        /// * `Err(AVCameraError)` - Failed to start capture
        pub fn start_continuous_capture(
            &mut self,
            frame_tx: mpsc::Sender<TimestampedFrame>,
        ) -> Result<JoinHandle<()>, AVCameraError> {
            if self.is_capturing {
                return Err(AVCameraError::OperationFailed(
                    "Capture already in progress".to_string(),
                ));
            }

            info!("Starting AVFoundation camera capture");

            unsafe {
                // Get AVCaptureDevice by unique ID
                let av_capture_device_class = Class::get("AVCaptureDevice").ok_or_else(|| {
                    AVCameraError::InitFailed("AVCaptureDevice class not found".to_string())
                })?;

                let ns_string_class = Class::get("NSString").ok_or_else(|| {
                    AVCameraError::InitFailed("NSString class not found".to_string())
                })?;
                let device_id_c = std::ffi::CString::new(self.device_id.as_str()).unwrap();
                let device_id_nsstring: *mut Object = msg_send![
                    ns_string_class,
                    stringWithUTF8String: device_id_c.as_ptr()
                ];

                let device: *mut Object = msg_send![
                    av_capture_device_class,
                    deviceWithUniqueID: device_id_nsstring
                ];

                if device.is_null() {
                    return Err(AVCameraError::CameraNotFound(format!(
                        "Could not find camera with ID: {}",
                        self.device_id
                    )));
                }

                // Configure device format for best field of view before creating input
                // This prevents AVFoundation from auto-cropping to achieve the requested resolution
                let lock_error: *mut Object = ptr::null_mut();
                let lock_result: BOOL = msg_send![device, lockForConfiguration: &lock_error];

                if lock_result == YES {
                    info!("Locked device for format configuration");

                    // Get all available formats for this device
                    let formats: *mut Object = msg_send![device, formats];
                    let format_count: usize = msg_send![formats, count];

                    info!("Device has {} available formats", format_count);

                    // Find the best format: matches our resolution with widest field of view
                    let mut best_format: *mut Object = ptr::null_mut();

                    for i in 0..format_count {
                        let format: *mut Object = msg_send![formats, objectAtIndex: i];

                        // Get format dimensions
                        let format_description: *mut Object = msg_send![format, formatDescription];

                        #[repr(C)]
                        struct CMVideoDimensions {
                            width: i32,
                            height: i32,
                        }

                        let dimensions: (u32, u32) = {
                            extern "C" {
                                fn CMVideoFormatDescriptionGetDimensions(desc: *mut c_void) -> CMVideoDimensions;
                            }
                            let dims = CMVideoFormatDescriptionGetDimensions(format_description as *mut c_void);
                            (dims.width as u32, dims.height as u32)
                        };

                        debug!("Format {}: {}x{}", i, dimensions.0, dimensions.1);

                        // Look for format that matches or exceeds our target resolution
                        // Prefer native 16:9 formats to avoid cropping
                        if dimensions.0 >= self.width && dimensions.1 >= self.height {
                            // Use the first matching format (typically the widest FOV)
                            if best_format.is_null() {
                                best_format = format;
                                info!("Selected format: {}x{} for target {}x{}",
                                    dimensions.0, dimensions.1, self.width, self.height);
                            }
                        }
                    }

                    // Set the active format if we found one
                    if !best_format.is_null() {
                        let _: () = msg_send![device, setActiveFormat: best_format];
                        info!("Set active format on device");
                    } else {
                        warn!("No suitable format found, using device default");
                    }

                    // Unlock device
                    let _: () = msg_send![device, unlockForConfiguration];
                } else {
                    warn!("Failed to lock device for configuration, using defaults");
                }

                // Create device input
                let mut error: *mut Object = ptr::null_mut();
                let av_capture_device_input_class = Class::get("AVCaptureDeviceInput")
                    .ok_or_else(|| {
                        AVCameraError::InitFailed("AVCaptureDeviceInput class not found".to_string())
                    })?;

                let input: *mut Object = msg_send![
                    av_capture_device_input_class,
                    deviceInputWithDevice: device
                    error: &mut error
                ];

                if !error.is_null() {
                    let description: *mut Object = msg_send![error, localizedDescription];
                    let c_str: *const std::os::raw::c_char = msg_send![description, UTF8String];
                    let error_str = std::ffi::CStr::from_ptr(c_str).to_string_lossy();
                    return Err(AVCameraError::InitFailed(format!(
                        "Failed to create device input: {}",
                        error_str
                    )));
                }

                // Create capture session
                let av_capture_session_class = Class::get("AVCaptureSession").ok_or_else(|| {
                    AVCameraError::InitFailed("AVCaptureSession class not found".to_string())
                })?;

                let session: *mut Object = msg_send![av_capture_session_class, alloc];
                let session: *mut Object = msg_send![session, init];

                // Set session preset based on requested resolution
                let preset_string = if self.width >= 1920 && self.height >= 1080 {
                    "AVCaptureSessionPreset1920x1080"
                } else if self.width >= 1280 && self.height >= 720 {
                    "AVCaptureSessionPreset1280x720"
                } else if self.width >= 640 && self.height >= 480 {
                    "AVCaptureSessionPreset640x480"
                } else {
                    "AVCaptureSessionPresetHigh" // Fallback to high quality
                };

                let preset_c = std::ffi::CString::new(preset_string).unwrap();
                let preset_nsstring: *mut Object = msg_send![
                    ns_string_class,
                    stringWithUTF8String: preset_c.as_ptr()
                ];

                // Check if preset is supported and set it
                let can_set_preset: BOOL = msg_send![session, canSetSessionPreset: preset_nsstring];
                if can_set_preset == YES {
                    let _: () = msg_send![session, setSessionPreset: preset_nsstring];
                    info!("Set AVFoundation session preset to: {}", preset_string);
                } else {
                    warn!("Cannot set preset {}, using default", preset_string);
                }

                // Add input to session
                let can_add_input: BOOL = msg_send![session, canAddInput: input];
                if can_add_input == NO {
                    return Err(AVCameraError::InitFailed(
                        "Cannot add input to capture session".to_string(),
                    ));
                }
                let _: () = msg_send![session, addInput: input];

                // Create video data output
                let av_capture_video_data_output_class =
                    Class::get("AVCaptureVideoDataOutput").ok_or_else(|| {
                        AVCameraError::InitFailed(
                            "AVCaptureVideoDataOutput class not found".to_string(),
                        )
                    })?;

                let output: *mut Object = msg_send![av_capture_video_data_output_class, alloc];
                let output: *mut Object = msg_send![output, init];

                // Set output pixel format to BGRA (kCVPixelFormatType_32BGRA = 1111970369)
                let ns_number_class = Class::get("NSNumber").ok_or_else(|| {
                    AVCameraError::InitFailed("NSNumber class not found".to_string())
                })?;
                let pixel_format_number: *mut Object = msg_send![
                    ns_number_class,
                    numberWithInt: 1111970369i32  // kCVPixelFormatType_32BGRA
                ];

                let ns_dictionary_class = Class::get("NSDictionary").ok_or_else(|| {
                    AVCameraError::InitFailed("NSDictionary class not found".to_string())
                })?;

                let pixel_format_key_c = std::ffi::CString::new("PixelFormatType").unwrap();
                let k_cvpixel_buffer_pixel_format_type_key: *mut Object = msg_send![
                    ns_string_class,
                    stringWithUTF8String: pixel_format_key_c.as_ptr()
                ];
                let video_settings: *mut Object = msg_send![
                    ns_dictionary_class,
                    dictionaryWithObject: pixel_format_number
                    forKey: k_cvpixel_buffer_pixel_format_type_key
                ];

                let _: () = msg_send![output, setVideoSettings: video_settings];

                // Create delegate
                let delegate_context = Box::new(DelegateContext {
                    frame_tx: frame_tx.clone(),
                    recording_start: std::time::Instant::now(),
                    width: self.width,
                    height: self.height,
                    frame_count: self.frame_count.clone(),
                });

                let delegate = Self::create_delegate(delegate_context)?;

                // Create dispatch queue for frame callbacks
                let dispatch_queue_create: extern "C" fn(*const i8, *mut c_void) -> *mut c_void = std::mem::transmute(
                    dlsym(RTLD_DEFAULT, b"dispatch_queue_create\0".as_ptr() as *const i8)
                );
                let queue = dispatch_queue_create(
                    b"com.clippy.camera.queue\0".as_ptr() as *const i8,
                    ptr::null_mut(),
                );

                // Set delegate and queue
                let _: () = msg_send![output, setSampleBufferDelegate: delegate queue: queue];

                // Add output to session
                let can_add_output: BOOL = msg_send![session, canAddOutput: output];
                if can_add_output == NO {
                    return Err(AVCameraError::InitFailed(
                        "Cannot add output to capture session".to_string(),
                    ));
                }
                let _: () = msg_send![session, addOutput: output];

                // Start capture session
                let _: () = msg_send![session, startRunning];

                self.session = Some(session);
                self.delegate = Some(delegate);
                self.is_capturing = true;

                info!("AVFoundation camera capture started successfully");
            }

            // Spawn monitoring task
            let stop_flag = self.stop_flag.clone();
            let frame_count = self.frame_count.clone();
            let handle = tokio::spawn(async move {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(30));
                loop {
                    interval.tick().await;

                    if stop_flag.load(Ordering::Relaxed) {
                        break;
                    }

                    let count = frame_count.lock().unwrap();
                    debug!("AVFoundation camera: captured {} frames", *count);
                }
            });

            Ok(handle)
        }

        /// Create custom delegate class for frame callbacks
        unsafe fn create_delegate(
            context: Box<DelegateContext>,
        ) -> Result<*mut Object, AVCameraError> {
            // Check if delegate class already exists (it's a singleton class)
            let delegate_class = if let Some(existing_class) = Class::get("ClippyCameraDelegate") {
                existing_class
            } else {
                // Create delegate class for the first time
                let superclass = Class::get("NSObject").ok_or_else(|| {
                    AVCameraError::InitFailed("NSObject class not found".to_string())
                })?;

                let mut decl = ClassDecl::new("ClippyCameraDelegate", superclass).ok_or_else(|| {
                    AVCameraError::InitFailed("Failed to create delegate class".to_string())
                })?;

                // Add protocol
                let protocol = Protocol::get("AVCaptureVideoDataOutputSampleBufferDelegate")
                    .ok_or_else(|| {
                        AVCameraError::InitFailed(
                            "AVCaptureVideoDataOutputSampleBufferDelegate protocol not found"
                                .to_string(),
                        )
                    })?;
                decl.add_protocol(protocol);

                // Add ivar to store context pointer
                decl.add_ivar::<*mut c_void>("_context");

                // Add callback method
                extern "C" fn did_output_sample_buffer(
                this: &Object,
                _cmd: Sel,
                _output: *mut Object,
                sample_buffer: *mut Object,  // CMSampleBuffer is an Object in Objective-C
                _connection: *mut Object,
            ) {
                unsafe {
                    // Get context from ivar
                    let context_ptr: *mut c_void = *this.get_ivar("_context");
                    if context_ptr.is_null() {
                        return;
                    }
                    let context = &*(context_ptr as *const DelegateContext);

                    // Extract frame from sample buffer
                    if let Some(frame) = extract_frame_from_sample_buffer(
                        sample_buffer as CMSampleBufferRef,  // Cast to our type
                        context.width,
                        context.height,
                        &context.recording_start,
                    ) {
                        // Increment frame count
                        {
                            let mut count = context.frame_count.lock().unwrap();
                            *count += 1;
                        }

                        // Send frame (non-blocking try_send to avoid blocking AVFoundation thread)
                        if let Err(e) = context.frame_tx.try_send(frame) {
                            match e {
                                tokio::sync::mpsc::error::TrySendError::Full(_) => {
                                    // Channel full - drop frame (receiver can't keep up)
                                    // This is better than blocking AVFoundation
                                }
                                tokio::sync::mpsc::error::TrySendError::Closed(_) => {
                                    warn!("Frame channel closed, stopping capture");
                                }
                            }
                        }
                    }
                }
            }

                decl.add_method(
                    sel!(captureOutput:didOutputSampleBuffer:fromConnection:),
                    did_output_sample_buffer as extern "C" fn(&Object, Sel, *mut Object, *mut Object, *mut Object),
                );

                decl.register()
            };

            // Create delegate instance
            let delegate: *mut Object = msg_send![delegate_class, alloc];
            let delegate: *mut Object = msg_send![delegate, init];

            // Set context pointer
            let context_ptr = Box::into_raw(context) as *mut c_void;
            (*delegate).set_ivar("_context", context_ptr);

            Ok(delegate)
        }

        /// Stop continuous capture
        pub fn stop_capture(&mut self) {
            if self.is_capturing {
                info!("Stopping AVFoundation camera capture");
                self.stop_flag.store(true, Ordering::Relaxed);
                self.is_capturing = false;

                unsafe {
                    if let Some(session) = self.session {
                        let _: () = msg_send![session, stopRunning];
                        let _: () = msg_send![session, release];
                    }

                    if let Some(delegate) = self.delegate {
                        // Get context and free it
                        let context_ptr: *mut c_void = *(*delegate).get_ivar("_context");
                        if !context_ptr.is_null() {
                            let _ = Box::from_raw(context_ptr as *mut DelegateContext);
                        }
                        let _: () = msg_send![delegate, release];
                    }
                }

                self.session = None;
                self.delegate = None;
            }
        }

        /// Get camera width
        pub fn width(&self) -> u32 {
            self.width
        }

        /// Get camera height
        pub fn height(&self) -> u32 {
            self.height
        }

        /// Check if capture is active
        pub fn is_capturing(&self) -> bool {
            self.is_capturing
        }
    }

    impl Drop for AVCameraCapture {
        fn drop(&mut self) {
            self.stop_capture();
        }
    }

    /// Extract frame from CMSampleBuffer and convert to our format
    unsafe fn extract_frame_from_sample_buffer(
        sample_buffer: CMSampleBufferRef,
        width: u32,
        height: u32,
        recording_start: &std::time::Instant,
    ) -> Option<TimestampedFrame> {
        // Get image buffer
        let image_buffer = CMSampleBufferGetImageBuffer(sample_buffer);
        if image_buffer.is_null() {
            warn!("Failed to get image buffer from sample buffer");
            return None;
        }

        // Lock pixel buffer
        let lock_result = CVPixelBufferLockBaseAddress(image_buffer, 0);
        if lock_result != 0 {
            warn!("Failed to lock pixel buffer");
            return None;
        }

        // Get buffer properties
        let _buffer_width = CVPixelBufferGetWidth(image_buffer);
        let _buffer_height = CVPixelBufferGetHeight(image_buffer);
        let base_address = CVPixelBufferGetBaseAddress(image_buffer);
        let bytes_per_row = CVPixelBufferGetBytesPerRow(image_buffer);

        if base_address.is_null() {
            CVPixelBufferUnlockBaseAddress(image_buffer, 0);
            warn!("Pixel buffer base address is null");
            return None;
        }

        // Copy frame data (BGRA format, 4 bytes per pixel)
        let frame_size = (width * height * 4) as usize;
        let mut frame_data = vec![0u8; frame_size];

        // Copy row by row in case bytes_per_row != width * 4
        for y in 0..height as usize {
            let src_offset = y * bytes_per_row;
            let dst_offset = y * (width as usize * 4);
            let row_bytes = (width as usize * 4).min(bytes_per_row);

            std::ptr::copy_nonoverlapping(
                (base_address as *const u8).add(src_offset),
                frame_data.as_mut_ptr().add(dst_offset),
                row_bytes,
            );
        }

        // Unlock pixel buffer
        CVPixelBufferUnlockBaseAddress(image_buffer, 0);

        // Calculate timestamp
        let timestamp_ms = recording_start.elapsed().as_millis() as u64;

        Some(TimestampedFrame {
            data: frame_data,
            timestamp_ms,
            width,
            height,
        })
    }

    /// List available cameras
    pub fn list_cameras() -> Result<Vec<CameraInfo>, AVCameraError> {
        unsafe {
            // Get AVCaptureDevice class
            let av_capture_device_class = match Class::get("AVCaptureDevice") {
                Some(cls) => cls,
                None => {
                    return Err(AVCameraError::InitFailed(
                        "AVCaptureDevice class not found".to_string(),
                    ))
                }
            };

            // Get array of video devices
            let ns_string_class = Class::get("NSString").unwrap();
            let media_type_c = std::ffi::CString::new("vide").unwrap();
            let media_type_video: *mut Object = msg_send![
                ns_string_class,
                stringWithUTF8String: media_type_c.as_ptr()
            ];
            let devices: *mut Object = msg_send![
                av_capture_device_class,
                devicesWithMediaType: media_type_video
            ];

            if devices.is_null() {
                return Ok(Vec::new());
            }

            // Get device count
            let count: usize = msg_send![devices, count];
            let mut camera_list = Vec::with_capacity(count);

            for i in 0..count {
                let device: *mut Object = msg_send![devices, objectAtIndex: i];
                if device.is_null() {
                    continue;
                }

                // Get device name
                let name_obj: *mut Object = msg_send![device, localizedName];
                let c_str: *const std::os::raw::c_char = msg_send![name_obj, UTF8String];
                let name = std::ffi::CStr::from_ptr(c_str).to_string_lossy().into_owned();

                // Get unique ID
                let id_obj: *mut Object = msg_send![device, uniqueID];
                let c_str: *const std::os::raw::c_char = msg_send![id_obj, UTF8String];
                let id = std::ffi::CStr::from_ptr(c_str).to_string_lossy().into_owned();

                camera_list.push(CameraInfo {
                    id,
                    name,
                    max_resolution: "1920x1080".to_string(),
                });
            }

            info!("Found {} cameras via AVFoundation", camera_list.len());
            Ok(camera_list)
        }
    }

    // dlsym helper
    const RTLD_DEFAULT: *mut c_void = -2isize as *mut c_void;
    extern "C" {
        fn dlsym(handle: *mut c_void, symbol: *const i8) -> *mut c_void;
    }
}

// Export macOS implementation
#[cfg(target_os = "macos")]
pub use macos::*;

// Stub implementation for non-macOS platforms
#[cfg(not(target_os = "macos"))]
pub struct AVCameraCapture;

#[cfg(not(target_os = "macos"))]
impl AVCameraCapture {
    pub fn new(_: u32, _: u32, _: u32, _: u32) -> Result<Self, AVCameraError> {
        Err(AVCameraError::UnsupportedPlatform)
    }

    pub fn start_continuous_capture(
        &mut self,
        _: tokio::sync::mpsc::Sender<crate::services::ffmpeg::TimestampedFrame>,
    ) -> Result<tokio::task::JoinHandle<()>, AVCameraError> {
        Err(AVCameraError::UnsupportedPlatform)
    }

    pub fn stop_capture(&mut self) {}
    pub fn width(&self) -> u32 {
        0
    }
    pub fn height(&self) -> u32 {
        0
    }
    pub fn is_capturing(&self) -> bool {
        false
    }
}

#[cfg(not(target_os = "macos"))]
pub fn list_cameras() -> Result<Vec<CameraInfo>, AVCameraError> {
    Err(AVCameraError::UnsupportedPlatform)
}
