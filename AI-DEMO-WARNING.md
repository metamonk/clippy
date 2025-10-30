# ⚠️ AI DEMO WARNING - EMBEDDED API KEY

## 🚨 SECURITY NOTICE

This build contains an **embedded OpenAI API key** for demonstration purposes only.

### What This Means:
- ✅ **For you:** Instructors can test AI features without setup
- ⚠️ **Security risk:** Anyone with this app can extract and misuse your API key
- 💰 **Cost risk:** Extracted keys could lead to unauthorized charges on your OpenAI account

---

## 🛡️ Protection Measures Applied

### 1. Set OpenAI Usage Limits
**CRITICAL - Do this immediately:**

1. Go to https://platform.openai.com/settings/organization/limits
2. Set **Monthly budget cap**: $10 (or your preferred limit)
3. Set **Email notifications** for 50%, 75%, 90% usage
4. This prevents runaway costs if key is compromised

### 2. Monitor Usage Daily
- Check usage at: https://platform.openai.com/usage
- Expected cost per analysis: ~$0.02-0.05
- If you see unexpected spikes, regenerate your key immediately

### 3. Demo Period Expiration
- **Start date:** [FILL IN]
- **End date:** [FILL IN - recommend 2-4 weeks max]
- After this period, regenerate your API key

### 4. After Demo
**Choose one:**
- **Option A:** Delete all distributed builds and regenerate API key
- **Option B:** Have adopters use their own API keys (see docs/stories/ai-video-personality-testing.md)
- **Option C:** Build a backend proxy (recommended for production)

---

## 📊 Expected Costs

| Activity | Cost | Notes |
|----------|------|-------|
| Per AI analysis | $0.02-0.05 | Whisper + GPT-4 |
| 10 instructors × 5 demos each | ~$2.50 | Reasonable demo usage |
| Worst case (key stolen) | Up to your budget cap | Set this NOW! |

---

## 🔧 Where the Key Lives

### In Development:
- `.env` file (gitignored, not in version control)
- Read by frontend via `import.meta.env.VITE_OPENAI_API_KEY`
- Passed to Rust backend at runtime

### In Production Build:
- Compiled into the JavaScript bundle
- **Can be extracted** by anyone with the `.app` file
- Use browser DevTools or decompile to see it

---

## 🎯 Who Should Use This Build

### ✅ Safe For:
- Controlled instructor evaluations (2-4 weeks)
- Demos on your own machine
- Internal testing

### ❌ Not Safe For:
- Public distribution
- App Store submission
- Long-term production use
- Untrusted users

---

## 🚀 Distribution Checklist

Before sharing the build:
- [ ] Set OpenAI monthly budget cap
- [ ] Enable email notifications for usage alerts
- [ ] Document demo start/end dates above
- [ ] Set calendar reminder to regenerate key after demo period
- [ ] Save list of who received the build
- [ ] Include this warning file with distribution

After demo period:
- [ ] Regenerate OpenAI API key
- [ ] Request return/deletion of all distributed builds
- [ ] Verify no unexpected charges occurred

---

## 🆘 If Key is Compromised

**Immediate actions:**
1. Go to https://platform.openai.com/api-keys
2. Click "Revoke" on the compromised key
3. Generate new key
4. Update `.env` file
5. Rebuild application
6. Redistribute to legitimate users only

---

## 📞 Questions?

If you're unsure about security implications, consider:
- Using the "Settings Panel" approach (requires users to input their own keys)
- Building a backend proxy to hide the key
- Limiting demo to live screen sharing only (don't distribute builds)

See `docs/stories/ai-video-personality-testing.md` for alternative approaches.
