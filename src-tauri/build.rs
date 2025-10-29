fn main() {
    // Add Homebrew MPV library path for linking
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-search=native=/opt/homebrew/opt/mpv/lib");
        println!("cargo:rustc-link-lib=dylib=mpv");
        println!("cargo:rustc-link-lib=framework=AVFoundation");
    }

    tauri_build::build()
}
