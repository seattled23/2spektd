# Spec2 API Setup — Multi-Provider Configuration

Spec2 supports **3 LLM providers** with automatic failover and intelligent rate limit handling.

**Production-grade by default.** No artificial token limits unless you enable testing mode.

## Quick Start

**Option 1: Groq (Recommended for Speed)**
```bash
# Get free API key: https://console.groq.com/
export GROQ_API_KEY="gsk_..."
```

**Option 2: OpenRouter (Recommended for Reliability)**
```bash
# Get free API key: https://openrouter.ai/
export OPENROUTER_API_KEY="sk-or-v1-..."
```

**Option 3: Both (Best)**
```bash
export GROQ_API_KEY="gsk_..."           # Primary (fastest)
export OPENROUTER_API_KEY="sk-or-v1-..." # Fallback
```

Then reload your shell:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

---

## Provider Details

### 1. Groq (Primary — Fastest)

**Free Tier Limits (April 2026):**
- ✅ 14,400 requests/day
- ✅ 6,000 tokens/minute
- ✅ 500,000 tokens/day
- ⚡ **300-1,000 tokens/sec** (4-12x faster than GPT-5)

**Model:** `llama-3.1-8b-instant`

**Get API key:** https://console.groq.com/

**Cost:** **$0.00**

**Sources:**
- [Groq Free Tier Limits 2026](https://www.grizzlypeaksoftware.com/articles/p/groq-api-free-tier-limits-in-2026-what-you-actually-get-uwysd6mb)
- [Official Rate Limits](https://console.groq.com/docs/rate-limits)

---

### 2. OpenRouter (Secondary — Most Reliable)

**Free Tier Limits (April 2026):**
- ✅ 50 requests/day (default)
- ✅ **1,000 requests/day** (after $10+ credit purchase, one-time)
- ✅ 20 requests/minute
- ✅ No TPM limit

**Model:** `openrouter/free` (auto-selects best free model)

**Get API key:** https://openrouter.ai/

**Cost:** **$0.00** (optional $10 credit unlocks higher limits)

**Sources:**
- [OpenRouter Free Models (April 2026)](https://costgoat.com/pricing/openrouter-free-models)
- [OpenRouter Free Tier 2026](https://pricepertoken.com/endpoints/openrouter/free)
- [Official Rate Limits](https://openrouter.ai/docs/api/reference/limits)

---

### 3. Anthropic (Fallback — Paid)

**Tier 1 Limits:**
- 50 requests/minute
- 40,000 tokens/minute

**Model:** `claude-sonnet-4-5`

**Get API key:** https://console.anthropic.com/

**Cost:** **$3/MTok input, $15/MTok output**

---

## Failover Strategy

Spec2 tries providers in order with automatic retry:

```
Request → Groq (3 retries with backoff)
          ↓ Rate limit / fail
          OpenRouter (3 retries with backoff)
          ↓ Rate limit / fail
          Anthropic (3 retries with backoff)
          ↓ Fail
          Error
```

**Rate limit handling:**
- Extracts wait time from error message
- Waits exact time + retries
- Falls back to exponential backoff if no wait time provided (1s → 2s → 4s)

---

## Configuration

### Production vs Testing Mode

**Production Mode (Default):**
```bash
# No artificial limits - full production capacity
# Providers handle their own rate limits
# Default max_tokens: 16K
```

**Testing Mode (Free Tier):**
```bash
# Enable conservative limits for free tier testing
export SPEC2_TESTING_MODE=true

# Groq: 3.6K max_tokens (60% of 6K TPM)
# OpenRouter: 8K max_tokens (no TPM limit)
# Anthropic: 8K max_tokens
```

**Testing mode is for cost control during development only.** Production mode has no artificial constraints.

### Enable/Disable Providers

```bash
# Disable Groq (use OpenRouter/Anthropic only)
export DISABLE_GROQ=true

# Disable OpenRouter (use Groq/Anthropic only)
export DISABLE_OPENROUTER=true

# Disable Anthropic (use free tiers only)
export DISABLE_ANTHROPIC=true
```

### Advanced: Retry Configuration

Edit `/home/swarm/spec2/skills/spec2/utils/llm-config.ts`:

```typescript
groq: {
  retry: {
    maxAttempts: 3,           // ← Adjust retries
    backoffMultiplier: 1000,  // ← Adjust backoff (ms)
  },
}
```

---

## Testing

**Free tier testing (cost control):**

```bash
cd ~/.claude/skills/spec2
export SPEC2_TESTING_MODE=true  # Enable conservative limits
export GROQ_API_KEY="your-key-here"
export OPENROUTER_API_KEY="your-key-here"  # Optional
node dist/test-mvp.js
```

**Production testing (full capacity):**

```bash
cd ~/.claude/skills/spec2
# SPEC2_TESTING_MODE not set = production mode
export GROQ_API_KEY="your-key-here"
export OPENROUTER_API_KEY="your-key-here"  # Optional
node dist/test-mvp.js
```

Expected output:
```
📝 Generating Tier 1: System Specification...
  ✓ Tier 1 spec generated (3467 chars) [groq/llama-3.1-8b-instant]
```

If you see `[groq/llama-3.1-8b-instant]`, Groq is working! 🎉
If you see `[openrouter/openrouter/free]`, OpenRouter is working! 🎉

---

## Troubleshooting

### "All LLM providers failed"
- Check API keys are set: `echo $GROQ_API_KEY`
- Check keys are valid (no typos)
- Try disabling providers: `export DISABLE_GROQ=true` to test others

### "Rate limit exceeded"
- Groq: 6K TPM limit (waits automatically, retries 3x)
- OpenRouter: 20 RPM limit (waits automatically, retries 3x)
- **Solution:** Add multiple providers for automatic failover

### "Request too large" (Testing Mode Only)
- Only happens in `SPEC2_TESTING_MODE=true`
- Prompt + max_tokens exceeded free tier TPM limit
- **Solution 1:** Disable testing mode (production has no artificial limits)
- **Solution 2:** Reduce `testingLimits` in `llm-config.ts`

---

## Future: CompanyOS Integration

Later we can wire this to use CompanyOS's full AI rotator with additional providers:
- GitHub Models (free)
- Together AI (free credit)
- Gemini (paid)

For now, Groq + OpenRouter gives excellent free-tier coverage.
