---
type: Feature
title: Live Voice Conversation
description: Gemini Live voice sessions with optional chat context, read-only Vault tools, File Search, and transcript history.
tags: [live, voice, audio, gemini, rag]
timestamp: 2026-11-09T00:00:00Z
---

# Live voice conversation

Select a microphone and audio output, or keep System default. Use Allow microphone and refresh devices if devices or names are missing; this briefly opens the microphone locally without sending audio. Selections are saved on this device. Stop before changing devices. If output selection is unavailable, choose the output in system sound settings. If a saved device is disconnected, reconnect it or select another device. Check system microphone permission if access is denied.

Save your Google API key in Gemini Helper settings, then click the microphone in the chat header. Choose a Live model and voice independently of the normal chat model, then select Start conversation and allow microphone access. Setup closes and speech appears directly in the existing chat sidebar, with mute, Stop, and End conversation controls below the messages. Gemini Live does not require speech-popup. API charges apply and the voice is AI generated.

Speak naturally, interrupt, or mute. Stop releases the microphone and playback resources while retaining the transcript. Use Call settings while stopped to change the model, voice, devices, and file/RAG access before restarting. End conversation or Return to chat restores the text composer with your draft intact so you can continue by text. Partial speech updates existing chat messages, with history checkpoints during the call and a final save when it ends. Finish the call before starting or loading a different chat. Automatic history and encryption settings apply. Conversations whose automatic saving was disabled by Google Web search keep that restriction. Raw audio is not saved. Disconnects stop the session and require an explicit restart.

Editing notes, hiding the sidebar, or switching to Workflow keeps the call running. Use the Obsidian status bar to return to the call or Stop it. Closing the Gemini Helper view releases the microphone and playback and saves the final transcript.

Choose prior chat context, read-only Vault access, and RAG independently. Prior context includes the last 20 text messages, up to 40,000 characters. File tools honor the configured AI folder access and can read unsaved editor text. No writing, deletion, skills, scripts, MCP, or Web search tools are offered in Live.

RAG uses the selected Gemini File Search setting, including its internal store or external stores and metadata filter. A separate Gemini text request retrieves evidence and returns it to the voice model; this incurs additional API usage. File Search can be used with direct Vault access off. Vault tool folder limits do not filter indexed results. The dialog shows whether retrieval has run, its actual result count, or a search error. A setting without a synced/configured store returns an explicit error.

Live connects directly to Google's official endpoints. A single-use, setup-bound ephemeral token authenticates the audio WebSocket; the saved API key is used to create the token and for optional File Search requests. Microphone access and Web Audio/AudioWorklet support are required in the Obsidian runtime.
