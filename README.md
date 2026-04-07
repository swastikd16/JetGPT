# JetGPT (Chrome Extension)

Make your ChatGPT as fast as a jet.

A lightweight Chrome extension that keeps only the most recent ChatGPT messages visible in long conversations.

## Features

- Limits visible messages to a user-defined count.
- Preset buttons for `5`, `10`, `15`, plus `Custom` input mode.
- Live `% Memory Saved` indicator based on hidden messages vs total messages.
- `Show all messages` quick action.
- Auto-disables limiting for chats with `<= 8` messages unless your selected limit is lower.
- Optional `Aggressive mode` that removes older hidden messages from the DOM for stronger performance.
- Shows a guided `Open ChatGPT` prompt when used outside ChatGPT websites.
- Live updates without reloading the page.
- Works on `chatgpt.com` and `chat.openai.com`.
- Minimal, modern popup UI.

## Install (Developer Mode)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `jetgpt`.

## Usage

1. Open any ChatGPT conversation.
2. Click the extension icon.
3. Enable **message limit** and set the number of recent messages to keep visible.

## Notes

- Older messages are hidden in the page view (not deleted from your account).
