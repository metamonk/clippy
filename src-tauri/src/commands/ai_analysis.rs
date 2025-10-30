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

IMPORTANT: Return ONLY valid JSON with no additional text, explanations, or markdown formatting.

Generate a JSON response with this EXACT structure (use camelCase for field names):
{{
  "style": "A catchy 2-3 word presenter style name (e.g., 'Caffeinated Professor', 'Zen Explainer', 'Chaotic Genius')",
  "energyDescription": "A fun 1-sentence description of their energy and pacing",
  "funStats": [
    "3-5 funny or interesting statistics about their presentation style",
    "Examples: 'Tab switches per minute: 23', 'Used the word basically 47 times', 'Mouse cursor traveled 2.3 miles'"
  ],
  "motivationalFeedback": "A funny motivational message in the style of a sports coach"
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

    // Extract JSON from markdown code blocks if present
    let json_content = extract_json_from_response(content);

    tracing::debug!(event = "personality_json_parse", json = ?json_content, "Parsing personality JSON");

    let personality: PersonalityAnalysis = serde_json::from_str(&json_content)
        .map_err(|e| anyhow::anyhow!("Failed to parse personality JSON: {}. Content: {}", e, json_content))?;
    Ok(personality)
}

async fn generate_alternative_narrations(client: &Client<OpenAIConfig>, transcript: &str) -> Result<Vec<AlternativeNarration>> {
    let prompt = format!(
        r#"Take this video transcript and rewrite it in 4 completely different, hilarious styles.

Original transcript:
{}

IMPORTANT: Return ONLY valid JSON with no additional text, explanations, or markdown formatting.

Generate a JSON object with 4 alternative narrations using these styles:
1. Movie Trailer Voice (dramatic, epic)
2. Pirate Narrator (arr matey!)
3. Shakespearean (to click or not to click)
4. Robot Overlord (commands and declarations)

Format (use camelCase for field names):
{{
  "narrations": [
    {{
      "styleName": "Movie Trailer Voice",
      "emoji": "🎬",
      "text": "The rewritten transcript in this style (keep it concise, max 2-3 sentences)"
    }},
    {{
      "styleName": "Pirate Narrator",
      "emoji": "🏴‍☠️",
      "text": "The rewritten transcript in pirate style"
    }},
    {{
      "styleName": "Shakespearean",
      "emoji": "📚",
      "text": "The rewritten transcript in Shakespearean style"
    }},
    {{
      "styleName": "Robot Overlord",
      "emoji": "🤖",
      "text": "The rewritten transcript in robot style"
    }}
  ]
}}

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

    // Extract JSON from markdown code blocks if present
    let json_content = extract_json_from_response(content);

    tracing::debug!(event = "narrations_json_parse", json = ?json_content, "Parsing narrations JSON");

    // Parse the wrapper object and extract the narrations array
    #[derive(serde::Deserialize)]
    struct NarrationsWrapper {
        narrations: Vec<AlternativeNarration>,
    }

    let wrapper: NarrationsWrapper = serde_json::from_str(&json_content)
        .map_err(|e| anyhow::anyhow!("Failed to parse narrations JSON: {}. Content: {}", e, json_content))?;
    Ok(wrapper.narrations)
}

/// Extract JSON from GPT response, handling markdown code blocks and extra text
fn extract_json_from_response(content: &str) -> String {
    let trimmed = content.trim();

    // Check if wrapped in markdown code block
    if trimmed.starts_with("```") {
        // Find the actual JSON content between ```json and ```
        let lines: Vec<&str> = trimmed.lines().collect();
        let json_lines: Vec<&str> = lines.iter()
            .skip(1) // Skip first ```json line
            .take_while(|line| !line.starts_with("```")) // Take until closing ```
            .copied()
            .collect();
        json_lines.join("\n")
    } else {
        // Return as-is if not in code block
        trimmed.to_string()
    }
}
