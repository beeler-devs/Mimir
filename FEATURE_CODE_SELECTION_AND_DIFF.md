# Code Selection and AI Diff Feature

## Overview

This feature adds Cursor-style code editing capabilities to the Mimir code editor:

1. **Code Selection Popup**: When users select code, a popup appears with options to add it to chat or ask the AI for suggestions
2. **AI-Powered Diff Editor**: The AI can suggest code improvements shown in a side-by-side diff view
3. **Accept/Reject Changes**: Users can accept or reject AI suggestions with a single click

## Components

### 1. CodeSelectionPopup (`frontend/components/code/CodeSelectionPopup.tsx`)

A floating popup that appears when code is selected in the Monaco editor.

**Features:**
- Appears at the cursor position when text is selected
- "Add to chat" button - injects selected code into chat input with markdown formatting
- "Ask AI" button - requests AI code improvement suggestions

**Props:**
- `position: { top: number; left: number } | null` - Position to render the popup
- `onAddToChat: () => void` - Callback when user clicks "Add to chat"
- `onAskAI: () => void` - Callback when user clicks "Ask AI"

### 2. DiffEditor (`frontend/components/code/DiffEditor.tsx`)

A Monaco-based diff editor that shows original vs. suggested code side-by-side.

**Features:**
- Side-by-side diff view with syntax highlighting
- Visual indicators for additions/deletions/modifications
- Accept/Reject buttons in the header
- Automatically switches themes with the app (light/dark)

**Props:**
- `originalCode: string` - Original code before AI suggestion
- `modifiedCode: string` - AI-suggested code
- `language: string` - Programming language for syntax highlighting
- `onAccept: () => void` - Callback when user accepts changes
- `onReject: () => void` - Callback when user rejects changes
- `theme?: 'vs' | 'vs-dark'` - Monaco theme

### 3. CodeEditorEnhanced (`frontend/components/tabs/CodeEditorEnhanced.tsx`)

Enhanced version of the code editor with selection tracking and AI integration.

**Features:**
- All features of the original CodeEditor
- Tracks text selection and shows CodeSelectionPopup
- Requests AI code suggestions via backend API
- Shows DiffEditor when AI suggests changes
- Integrates with chat system to add code context

**Props:**
- `language: CodeLanguage` - Programming language
- `code: string` - Current code content
- `onCodeChange: (value: string) => void` - Callback when code changes
- `onLanguageChange: (language: CodeLanguage) => void` - Callback when language changes
- `onAddToChat?: (code: string) => void` - Callback to add code to chat

**State Management:**
- `selectedCode` - Currently selected code text
- `selectionPosition` - Position of the selection popup
- `showDiff` - Whether to show the diff editor
- `codeSuggestion` - Current AI suggestion (original + suggested)
- `isLoadingAI` - Loading state while waiting for AI response

### 4. Chat Integration

#### ChatInput Updates (`frontend/components/ai/ChatInput.tsx`)

**New features:**
- Exposes `ChatInputRef` with `setMessage()` and `focus()` methods
- Supports `initialMessage` prop for pre-populating the input
- `onMessageSet` callback when message is set externally

#### AISidePanel Updates (`frontend/components/ai/AISidePanel.tsx`)

**New features:**
- Exposes `AISidePanelRef` with `addToChat(message: string)` method
- Uses ref to ChatInput for programmatic control
- Automatically switches to chat view when code is added

## User Flow

### Add Code to Chat

1. User selects code in the editor
2. Popup appears with "Add to chat" button
3. User clicks "Add to chat"
4. Selected code is injected into chat input with markdown formatting
5. Chat input is focused, user can add their question
6. User sends message with code context

Example injected message:
```
Here's a code snippet I'm working with:
```python
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n-1) + fibonacci(n-2)
```

[User can type their question here]
```

### AI Code Suggestion

1. User selects code in the editor
2. Popup appears with "Ask AI" button
3. User clicks "Ask AI"
4. Loading overlay shows "Getting AI suggestion..."
5. Backend calls Claude Sonnet 4.5 API
6. AI returns improved code
7. Diff editor appears showing original vs. suggested code
8. User can:
   - **Accept**: Replaces selected code with AI suggestion
   - **Reject**: Discards suggestion and returns to normal editor

## Backend Integration

### API Endpoint

The feature uses the existing `/chat` endpoint:

```typescript
POST http://localhost:8001/chat
{
  "messages": [
    {
      "role": "user",
      "content": "Please improve this python code and suggest a better version. Respond ONLY with the improved code, no explanations:\n```python\n[CODE HERE]\n```"
    }
  ],
  "branchPath": []
}
```

### Model

Uses Claude Sonnet 4.5 (`claude-sonnet-4-5`) by default, as configured in `backend/main.py:526`.

### Response Processing

The response is parsed to extract code from markdown code blocks:
```typescript
const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/;
```

## Installation

1. **Frontend dependencies** (already installed):
   - `@monaco-editor/react` - Monaco editor wrapper for React
   - `monaco-editor` - Monaco editor types

2. **Backend dependencies** (already installed):
   - `anthropic` - Claude API client
   - `python-dotenv` - Environment variable loading

3. **Environment variables**:
   - `CLAUDE_API_KEY` - Anthropic Claude API key (in `backend/.env`)
   - `NEXT_PUBLIC_MANIM_WORKER_URL` - Backend URL (default: `http://localhost:8001`)

## Development

### Running the Application

1. **Start backend**:
   ```bash
   cd backend
   uvicorn main:app --reload --port 8001
   ```

2. **Start frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

3. **Configure API key**:
   Create `backend/.env`:
   ```
   CLAUDE_API_KEY=your_api_key_here
   ```

### Testing

1. Open a Code instance in the workspace
2. Select some code
3. Click "Add to chat" - verify code appears in chat input
4. Select code again and click "Ask AI" - verify diff editor appears
5. Test Accept button - verify code is replaced
6. Test Reject button - verify diff view closes

## Implementation Details

### Monaco Selection Tracking

The editor listens for `onDidChangeCursorSelection` events:

```typescript
editor.onDidChangeCursorSelection((e) => {
  const selection = editor.getSelection();
  if (selection && !selection.isEmpty()) {
    const selectedText = editor.getModel()?.getValueInRange(selection);
    // Show popup...
  }
});
```

### Popup Positioning

The popup position is calculated from Monaco's `getScrolledVisiblePosition`:

```typescript
const position = editor.getScrolledVisiblePosition(selection.getStartPosition());
const rect = editorDom.getBoundingClientRect();
setSelectionPosition({
  top: rect.top + position.top - 50,
  left: rect.left + position.left,
});
```

### Code Replacement

When accepting changes, the original code is replaced in the full document:

```typescript
const newCode = code.replace(codeSuggestion.originalCode, codeSuggestion.suggestedCode);
onCodeChange(newCode);
```

## Future Enhancements

1. **Per-hunk acceptance**: Allow users to accept/reject individual changes instead of all-or-nothing
2. **Streaming diff**: Show diff as the AI generates suggestions
3. **Multiple suggestions**: Let AI provide multiple alternatives
4. **Inline diff**: Add inline diff mode (like GitHub) in addition to side-by-side
5. **Diff history**: Track previous suggestions and allow reverting
6. **Custom prompts**: Let users customize the AI improvement prompt
7. **Language-specific improvements**: Tailored suggestions based on programming language best practices
8. **Code review mode**: AI can explain what changed and why

## Credits

Inspired by [Cursor](https://cursor.sh/) and powered by:
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - VS Code's editor
- [Claude Sonnet 4.5](https://www.anthropic.com/claude) - Anthropic's AI model
- [Next.js](https://nextjs.org/) - React framework
- [FastAPI](https://fastapi.tiangolo.com/) - Python backend framework
