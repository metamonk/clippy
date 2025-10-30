use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use async_openai::{
    types::{
        AudioInput,
        CreateTranscriptionRequestArgs,
        CreateChatCompletionRequestArgs,
        ChatCompletionRequestMessage,
        ChatCompletionRequestUserMessageArgs,
    },
    Client,
    config::OpenAIConfig,
};
use anyhow::Result;
use bytes::Bytes;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PersonalityAnalysis {
    pub style: String,
    pub energy_description: String,
    pub fun_stats: Vec<String>,
    pub motivational_feedback: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AlternativeNarration {
    pub style_name: String,
    pub emoji: String,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiAnalysisResult {
    pub transcript: String,
    pub personality: PersonalityAnalysis,
    pub alternative_narrations: Vec<AlternativeNarration>,
}

/// Analyze a recording with AI (transcription + personality + alternative narrations)
#[tauri::command]
pub async fn cmd_analyze_recording(video_path: String, api_key: String) -> Result<AiAnalysisResult, String> {
    tracing::info!(event = "ai_analysis_start", video_path = ?video_path, "Starting AI analysis");

    // Check if video file exists
    let path = PathBuf::from(&video_path);
    if !path.exists() {
        return Err(format!("Video file not found: {}", video_path));
    }

    // Extract audio from video using FFmpeg
    let audio_path = extract_audio_from_video(&path)
        .map_err(|e| format!("Failed to extract audio: {}", e))?;

    // Create OpenAI client with provided API key
    let config = OpenAIConfig::new().with_api_key(api_key);
    let client = Client::with_config(config);

    // Step 1: Transcribe audio using Whisper
    tracing::info!(event = "whisper_transcription_start", "Transcribing audio");
    let transcript = transcribe_audio(&client, &audio_path).await
        .map_err(|e| format!("Transcription failed: {}", e))?;
    tracing::info!(event = "whisper_transcription_complete", transcript_length = transcript.len(), "Transcription complete");

    // Step 2: Generate personality analysis
    tracing::info!(event = "personality_analysis_start", "Analyzing personality");
    let personality = analyze_personality(&client, &transcript).await
        .map_err(|e| format!("Personality analysis failed: {}", e))?;
    tracing::info!(event = "personality_analysis_complete", "Personality analysis complete");

    // Step 3: Generate alternative narrations
    tracing::info!(event = "alternative_narrations_start", "Generating alternative narrations");
    let alternative_narrations = generate_alternative_narrations(&client, &transcript).await
        .map_err(|e| format!("Alternative narrations failed: {}", e))?;
    tracing::info!(event = "alternative_narrations_complete", count = alternative_narrations.len(), "Alternative narrations complete");

    let result = AiAnalysisResult {
        transcript,
        personality,
        alternative_narrations,
    };

    tracing::info!(event = "ai_analysis_complete", "AI analysis complete");
    Ok(result)
}

fn extract_audio_from_video(video_path: &PathBuf) -> Result<PathBuf> {
    use std::process::Command;

    // Create temp audio file path
    let temp_dir = std::env::temp_dir();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let audio_filename = format!("clippy_audio_{}.m4a", timestamp);
    let audio_path = temp_dir.join(audio_filename);

    tracing::info!(
        event = "audio_extraction_start",
        video_path = ?video_path,
        audio_path = ?audio_path,
        "Extracting audio from video"
    );

    // Use FFmpeg to extract audio
    let output = Command::new("ffmpeg")
        .args(&[
            "-i", video_path.to_str().unwrap(),
            "-vn", // No video
            "-acodec", "aac", // AAC codec
            "-y", // Overwrite output file
            audio_path.to_str().unwrap(),
        ])
        .output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("FFmpeg failed: {}", stderr));
    }

    tracing::info!(event = "audio_extraction_complete", audio_path = ?audio_path, "Audio extracted successfully");
    Ok(audio_path)
}

async fn transcribe_audio(client: &Client<OpenAIConfig>, audio_path: &PathBuf) -> Result<String> {
    // Read audio file
    let audio_data = fs::read(audio_path)?;
    let audio_bytes = Bytes::from(audio_data);

    let request = CreateTranscriptionRequestArgs::default()
        .file(AudioInput::from_bytes("audio.m4a".to_string(), audio_bytes))
        .model("whisper-1")
        .build()?;

    let response = client.audio().transcribe(request).await?;
    Ok(response.text)
}

async fn analyze_personality(client: &Client<OpenAIConfig>, transcript: &str) -> Result<PersonalityAnalysis> {
    let prompt = format!(
        r#"Analyze this video transcript and generate a fun, engaging personality report about the presenter's style.

Transcript:
{}

Generate a JSON response with this structure:
{{
  "style": "A catchy 2-3 word presenter style name (e.g., 'Caffeinated Professor', 'Zen Explainer', 'Chaotic Genius')",
  "energy_description": "A fun 1-sentence description of their energy and pacing",
  "fun_stats": [
    "3-5 funny or interesting statistics about their presentation style",
    "Examples: 'Tab switches per minute: 23', 'Used the word basically 47 times', 'Mouse cursor traveled 2.3 miles'"
  ],
  "motivational_feedback": "A funny motivational message in the style of a sports coach"
}}

Be creative, funny, and engaging. Make the user smile!"#,
        transcript
    );

    let request = CreateChatCompletionRequestArgs::default()
        .model("gpt-4")
        .messages(vec![
            ChatCompletionRequestMessage::User(
                ChatCompletionRequestUserMessageArgs::default()
                    .content(prompt)
                    .build()?
            )
        ])
        .temperature(0.9)
        .build()?;

    let response = client.chat().create(request).await?;

    let content = response.choices[0]
        .message
        .content
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("No content in response"))?;

    let personality: PersonalityAnalysis = serde_json::from_str(content)?;
    Ok(personality)
}

async fn generate_alternative_narrations(client: &Client<OpenAIConfig>, transcript: &str) -> Result<Vec<AlternativeNarration>> {
    let prompt = format!(
        r#"Take this video transcript and rewrite it in 4 completely different, hilarious styles.

Original transcript:
{}

Generate a JSON array with 4 alternative narrations using these styles:
1. Movie Trailer Voice (dramatic, epic)
2. Pirate Narrator (arr matey!)
3. Shakespearean (to click or not to click)
4. Robot Overlord (commands and declarations)

Format:
[
  {{
    "style_name": "Movie Trailer Voice",
    "emoji": "🎬",
    "text": "The rewritten transcript in this style (keep it concise, max 2-3 sentences)"
  }},
  ...
]

Make it funny and memorable!"#,
        transcript
    );

    let request = CreateChatCompletionRequestArgs::default()
        .model("gpt-4")
        .messages(vec![
            ChatCompletionRequestMessage::User(
                ChatCompletionRequestUserMessageArgs::default()
                    .content(prompt)
                    .build()?
            )
        ])
        .temperature(1.0)
        .build()?;

    let response = client.chat().create(request).await?;

    let content = response.choices[0]
        .message
        .content
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("No content in response"))?;

    let narrations: Vec<AlternativeNarration> = serde_json::from_str(content)?;
    Ok(narrations)
}
