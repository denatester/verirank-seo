# VeriRank SEO Studio

**Standalone Dual-Engine (Google + Bing/Copilot) Deterministic SEO & Anti-Hallucination Package**

VeriRank SEO Studio takes any Plain Text, Markdown, or HTML draft, extracts its true subject matter and search intent locally, optimizes it for both **Google** and **Bing/Microsoft Copilot**, and guarantees zero hallucinations using **Fact-Lock™** verification.

## Commercial Deliverables (`dist/`)
- `dist\VeriRankSEO.exe` — Single-file, zero-dependency Windows desktop executable (embeds the entire application UI, runs on `127.0.0.1`, includes optional CORS-free live Google/Bing autocomplete, optional Fact-Locked AI co-writer, and local folder batch processing).
- `dist\VeriRank-Portable.html` — Single-file, offline cross-platform portable web app (works on Windows, macOS, Linux via `file://`).
- `dist\BUYER-GUIDE.md` — Corporate buyer onboarding & deployment documentation.
- `dist\samples\` — Corporate sample drafts (B2B SaaS, Industrial HVAC, Healthcare Billing Compliance).

## Building from Source
Run the build script (requires only built-in Windows PowerShell and `.NET Framework 4.8` `csc.exe`):
```powershell
powershell -ExecutionPolicy Bypass -File scripts\build.ps1
```
