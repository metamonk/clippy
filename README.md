# clippy

A modern, lightweight video editor for macOS built with Tauri, React, and Rust.

## Features

- Video import with drag & drop
- Timeline-based editing
- Video preview with playback controls
- Media library management
- Trim and edit clips
- FFmpeg-powered video export

## Prerequisites

Before building clippy, ensure you have the following installed:

- **Node.js** 20+ ([Download](https://nodejs.org/))
- **Rust** 1.80+ ([Install via rustup](https://rustup.rs/))
- **MPV** (Required for video playback with universal codec support)
  ```bash
  brew install mpv
  ```
- **Xcode Command Line Tools** (macOS only)
  ```bash
  xcode-select --install
  ```

## Development

### Setup

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run tauri dev
   ```

### Running Tests

```bash
# Run frontend tests
npm test

# Run backend tests
cd src-tauri && cargo test
```

### Linting

```bash
npm run lint
```

## Production Build

### Building for macOS

1. Build the application:
   ```bash
   npm run tauri build
   ```

2. The build artifacts will be created at:
   - **App Bundle:** `src-tauri/target/release/bundle/macos/clippy.app`
   - **DMG Installer:** `src-tauri/target/release/bundle/dmg/clippy_0.1.0_aarch64.dmg`

### Code Signing (Development)

For development and local testing, you can sign the app with an Apple Development certificate:

1. **Create a development certificate** (if you don't have one):
   - Open **Keychain Access**
   - Navigate to **Keychain Access → Certificate Assistant → Create a Certificate**
   - Set **Certificate Type** to "Code Signing"
   - Follow the wizard to create the certificate

2. **Find your signing identity:**
   ```bash
   security find-identity -v -p codesigning
   ```

3. **Sign the app bundle:**
   ```bash
   codesign --force --deep --sign "Apple Development: Your Name (XXXXXXXXXX)" \
     src-tauri/target/release/bundle/macos/clippy.app
   ```

4. **Sign the DMG (optional):**
   ```bash
   codesign --force --sign "Apple Development: Your Name (XXXXXXXXXX)" \
     src-tauri/target/release/bundle/dmg/clippy_0.1.0_aarch64.dmg
   ```

5. **Verify the signature:**
   ```bash
   codesign -dv --verbose=4 src-tauri/target/release/bundle/macos/clippy.app
   ```

> **Note:** Production code signing requires enrollment in the Apple Developer Program and proper certificates. Development certificates are suitable for local testing only.

## Distribution

### Local Distribution

1. **Install the app:**
   - Copy `clippy.app` to `/Applications` folder
   - Or mount the DMG and drag the app to Applications

2. **First Launch:**
   - Right-click the app and select "Open" (required for unsigned/development-signed apps)
   - Or disable Gatekeeper temporarily (not recommended):
     ```bash
     sudo spctl --master-disable
     ```

3. **Distribute to other Macs:**
   - Share the `.app` bundle or `.dmg` file via AirDrop, USB, or file sharing
   - Recipients will need to right-click → Open on first launch

### Production Distribution (Future)

For App Store or public distribution, you'll need:
- Apple Developer Program membership
- Distribution certificate
- App notarization
- DMG/PKG installer creation

## System Requirements

- **macOS:** 12.3 (Monterey) or later (required for ScreenCaptureKit)
- **Architecture:** Apple Silicon (M1/M2/M3) primary, Intel secondary
- **RAM:** 8GB minimum, 16GB recommended

## macOS Permissions Setup

clippy requires specific macOS permissions to function properly. These permissions protect your privacy and are managed by macOS.

### Screen Recording Permission

**Required for:** Recording your screen, capturing displays and windows

**Setup:**

1. When you first attempt to record, clippy will request screen recording permission
2. macOS will show a system dialog asking for permission
3. If you deny or miss the dialog:
   - Open **System Preferences** (or **System Settings** on macOS Ventura+)
   - Navigate to **Privacy & Security** → **Screen Recording**
   - Find **clippy** in the list and enable the checkbox
   - **Restart clippy** for changes to take effect

**Troubleshooting:**
- If clippy doesn't appear in the list, try requesting permission again from within the app
- Screen recording permission is required for ScreenCaptureKit (macOS 12.3+)
- Older macOS versions are not supported for screen capture features

### Microphone Permission (Coming Soon)

**Required for:** Recording audio from your microphone during screen captures

Setup instructions will be similar to screen recording permission.

### Camera Permission (Coming Soon)

**Required for:** Recording webcam footage for picture-in-picture (PiP) overlays

Setup instructions will be similar to screen recording permission.

### File Access

**Required for:** Importing and exporting video files

macOS may prompt you to allow file access when you:
- Import videos via drag & drop or file picker
- Export edited videos to disk
- Access media library locations

These prompts are handled automatically by macOS file dialogs.

## Troubleshooting

### Build Issues

**Error: `beforeBuildCommand failed`**
- Ensure all TypeScript errors are resolved: `npm run build`
- Check that all dependencies are installed: `npm install`

**Error: Missing Xcode CLI tools**
```bash
xcode-select --install
```

**Rust compilation errors**
```bash
rustup update
cargo clean
```

### Runtime Issues

**App won't open / "damaged and can't be opened"**
- This is a Gatekeeper security message for unsigned apps
- Right-click the app → Open, then confirm

**Video import not working**
- Ensure the app has permission to access files
- Check System Preferences → Privacy & Security

**Export fails**
- Verify FFmpeg is working: Check console logs
- Ensure sufficient disk space for export

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
