# 🚀 Quick Start - AI Demo

## ✅ Setup Checklist (5 minutes)

### 1. Verify `.env` File
```bash
# Make sure this file exists with your key:
cat .env
```

Should contain:
```
VITE_OPENAI_API_KEY=sk-proj-...your-key-here...
```

### 2. Set OpenAI Budget Limits (**CRITICAL**)
🔗 https://platform.openai.com/settings/organization/limits

- Set monthly cap: **$10**
- Enable email alerts at 50%, 75%, 90%
- This prevents runaway costs if key is extracted

### 3. Build & Test
```bash
# Development build (for testing)
npm run tauri dev

# Production build (for distribution)
npm run tauri build
```

### 4. Demo Flow
1. Open the app
2. Click "Record" → Choose any mode
3. **Enable microphone** in settings
4. Record 30-60 seconds while talking
5. Click "Stop Recording"
6. Click **"Analyze with AI ✨"** button
7. Wait 15-30 seconds
8. Show off the results! 🎉

---

## 📊 What Instructors Will See

### Personality Analysis
- Presenter style: "Caffeinated Professor", "Zen Explainer", etc.
- Energy description
- Fun stats: "Said 'um' 47 times", "Mouse traveled 2.3 miles"
- Coach's motivational feedback

### Alternative Narrations (The Show-Stopper!)
- 🎬 **Movie Trailer Voice**: "In a world where databases need migrating..."
- 🏴‍☠️ **Pirate Narrator**: "Arrr, ye be needin' to click that button, matey!"
- 📚 **Shakespearean**: "To click, or not to click..."
- 🤖 **Robot Overlord**: "HUMAN. EXECUTE. COMMAND."

### Full Transcript
- Complete searchable text
- Expandable/collapsible

---

## 💰 Cost Expectations

| Scenario | Cost |
|----------|------|
| Single analysis | $0.02-0.05 |
| 10 instructors × 5 demos each | ~$2.50 |
| Your budget cap (set above) | Max $10 |

---

## 🎯 Demo Tips

1. **Keep recordings short**: 30-60 seconds is perfect
2. **Be expressive**: More energy = funnier AI results
3. **Speak clearly**: Better transcription = better analysis
4. **Show the alternative narrations**: This is what makes them laugh
5. **Re-analyze if needed**: Button lets you try again

---

## ⚠️ Before Distribution

### Checklist:
- [ ] Budget cap set on OpenAI dashboard
- [ ] Email alerts enabled
- [ ] Demo period documented (2-4 weeks recommended)
- [ ] Calendar reminder to regenerate key after demo
- [ ] Included `AI-DEMO-WARNING.md` with distribution
- [ ] Saved list of recipients

### Build for Distribution:
```bash
npm run tauri build

# Output will be in:
# src-tauri/target/release/bundle/macos/
```

---

## 🆘 Emergency: Key Compromised

1. **Revoke immediately**: https://platform.openai.com/api-keys
2. Generate new key
3. Update `.env` file
4. Rebuild: `npm run tauri build`
5. Notify all recipients

---

## 📁 Important Files

- `AI-DEMO-WARNING.md` - Security considerations (READ THIS!)
- `docs/stories/ai-video-personality-testing.md` - Full testing guide
- `.env` - API key storage (NEVER commit this!)
- `.gitignore` - Ensures `.env` is not tracked

---

## 🎬 Ready to Demo!

Your build is now ready with embedded AI capabilities. Instructors can use it immediately without any setup.

**Remember**: This is a demo build. Monitor costs and regenerate the key after the evaluation period!
