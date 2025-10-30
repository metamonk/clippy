//! Test utilities for composition parity validation
//!
//! This module provides utilities for validating that timeline composition playback
//! produces output that matches export output, with acceptable variance thresholds.

pub mod frame_comparison;
pub mod audio_comparison;
pub mod timeline_fixtures;
pub mod composition_playback;

pub use frame_comparison::*;
pub use audio_comparison::*;
pub use timeline_fixtures::*;
pub use composition_playback::*;
