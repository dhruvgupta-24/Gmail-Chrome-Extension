# Gmail AI Assistant (Chrome Extension)

A privacy-preserving, local-first AI assistant built directly into Gmail (`mail.google.com`) as a Manifest V3 Chrome Extension. Designed specifically for university students and professionals, it automatically extracts actionable deadlines, tests, quizzes, assignments, interviews, coding rounds, and placement notices with 1-click source traceability and direct action links.

---

## 🌟 Key Features

- **Direct In-Gmail Assistant**: Injected via Shadow DOM with zero layout interference or styling conflicts with Gmail's native UI.
- **Actionable Daily Briefing**:
  - **TODAY**: Urgent items due today with alert badges, tests, and registration closing dates.
  - **TOMORROW**: Everything scheduled or due tomorrow.
  - **UPCOMING**: Future exams, assessments, and interviews sorted chronologically.
- **1-Click Quick Actions**:
  - `[Today's Briefing]`
  - `[Due Today]`
  - `[Due Tomorrow]`
  - `[Upcoming Tests]`
  - `[Action Required]`
  - `[Placements & Jobs]`
- **Hybrid Extraction Pipeline**:
  - **Deterministic**: Email timestamps, relative date resolution (resolving "tomorrow" relative to when the email was sent in your local timezone), test portal URLs (HackerRank, Unstop, Moodle, Google Forms, Zoom, Meet), and sender/organization tagging.
  - **Local LLM (Ollama)**: Contextual reasoning, natural language question answering, multi-turn follow-ups (e.g. *"Give me the link for the first test"*), and priority ranking.
- **Source Traceability**: Every event card and chat response provides:
  - Direct Action Button (e.g. `[Open HackerRank Test]`, `[Open Google Form]`, `[Join Zoom]`)
  - `[Open Email]` button that deep-links directly to the original Gmail message or thread.
- **Zero-Backend Privacy**: 100% client-side. Uses official read-only Gmail API (`gmail.readonly`) and local Ollama inference. No emails are ever sent to any third-party server.

---

## 🏗️ Architecture

```text
Gmail Web App (mail.google.com)
  └── Content Script (src/content/gmail-injector.tsx)
        └── Shadow DOM Root (zero CSS pollution)
              └── React Assistant Panel (Floating Trigger + Slide-Over Panel)
                    ├── Briefing Feed (Today / Tomorrow / Upcoming)
                    ├── Quick Action Buttons
                    ├── Conversational AI Chat with Source Traceability
                    └── Settings Modal (Ollama Config, OAuth Client, Context)
                          │ (Typed Chrome Runtime Messaging)
                          ▼
        Service Worker (src/background/service-worker.ts)
              ├── Google OAuth Manager (chrome.identity.launchWebAuthFlow)
              ├── Gmail API REST Client (messages.list, messages.get, threads)
              ├── MIME Base64URL Decoder & Plain Text / HTML Parser
              ├── Deterministic Date & Action Link Extractor
              ├── Local Storage & IndexedDB (Events, Cache, Chat History)
              └── AI Provider Engine (Ollama REST Client + Gemini/OpenAI hooks)
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18+ (tested on Node v22.18)
- **Ollama**: Installed and running locally ([Download Ollama](https://ollama.com))
- **Google Chrome**: Version 100+

---

### 2. Install & Build Extension

```bash
# Clone or navigate to the directory
cd Gmail-Chrome-Extension

# Install dependencies
npm install

# Run automated tests
npm test

# Build production bundle
npm run build
```

This compiles all assets into the `dist/` directory.

---

### 3. Load Extension in Google Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top right corner.
3. Click **Load unpacked**.
4. Select the `dist/` folder inside this project directory.
5. Note your **Extension ID** displayed on the extension card (e.g. `abcdefghijklmnop...`).

---

### 4. Setup Google OAuth 2.0 (Step-by-Step)

Because this is a personal extension running locally, you connect it to your own Google Cloud project:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g. `My-Gmail-Assistant`).
3. Enable the **Gmail API**:
   - Go to **APIs & Services** > **Library**.
   - Search for `Gmail API` and click **Enable**.
4. Configure the **OAuth Consent Screen**:
   - Go to **APIs & Services** > **OAuth consent screen**.
   - Select User Type: **External** and click **Create**.
   - Fill in App name (e.g. `Gmail Assistant`) and your email.
   - In **Test users**, click **Add Users** and add your own Google email address.
5. Create OAuth 2.0 Credentials:
   - Go to **APIs & Services** > **Credentials**.
   - Click **Create Credentials** > **OAuth client ID**.
   - Select Application type: **Web application**.
   - Under **Authorized redirect URIs**, click **Add URI** and enter your extension redirect URL:
     ```text
     https://<YOUR-EXTENSION-ID>.chromiumapp.org/
     ```
     *(You can copy this directly from the extension Settings modal).*
   - Click **Create** and copy your **Client ID** (e.g. `1234567890-xxx.apps.googleusercontent.com`).
6. Paste the Client ID into the extension:
   - Click the extension icon in Chrome or open Gmail.
   - Open **Settings** > **Google OAuth**.
   - Paste your Client ID and click **Sign In**.

---

### 5. Setup Local Ollama AI

1. Start the Ollama server:
   ```bash
   ollama serve
   ```
2. Pull your preferred model (e.g. `llama3.2` or `mistral`):
   ```bash
   ollama pull llama3.2
   ```
3. In the extension **Settings** > **AI Provider**:
   - Set Ollama Base URL: `http://localhost:11434`
   - Set Model: `llama3.2`
   - Click **Test Ollama Connection** (shows green checkmark when connected).

---

## 📖 Using the Assistant inside Gmail

1. Open [mail.google.com](https://mail.google.com).
2. Look for the floating **AI Assistant** button in the bottom right corner (shows a red badge if you have deadlines due today).
3. Click the button to slide open the assistant panel.
4. **Briefing Feed**: Click **Sync** to automatically scan recent academic/career notices and organize them into **TODAY**, **TOMORROW**, and **UPCOMING**.
5. **Ask Assistant**:
   - Ask: *"What do I have due tomorrow?"*
   - Ask: *"Find all my upcoming assessments and give me their test links."*
   - Ask: *"What placement or internship interviews do I have this week?"*
   - Follow up: *"Give me the link for the first one."*
6. **Open Email & Links**: Click `[Open Email]` on any card to jump directly to the source email in Gmail, or click direct portal buttons (`[Open HackerRank Test]`, `[Open Google Form]`).

---

## 🔒 Security & Privacy

- **Read-Only Gmail Scope**: Requests only `https://www.googleapis.com/auth/gmail.readonly`. The extension cannot send, delete, or modify any emails.
- **Local In-Memory / IndexedDB**: Tokens and cached event metadata stay on your device.
- **No Remote Servers**: Zero telemetry, tracking, or proxy backends.

---

## 🧪 Testing

The codebase includes unit tests covering MIME decoding, email date resolution, hyperlink parsing, search query intent generation, and event merging:

```bash
npm test
```
