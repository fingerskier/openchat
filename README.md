# openchat
AI chat app that uses OpenRouter API

## Features
* webapp
* store API key locally
* choose a set of models
* chat responses are a structured format
* can switch model mid-chat

## Responses
```json
{
  response: "must be brief: 1-2 paragraphs",
  flow_prompts: [
    "potential next prompt 1",
    "potential next prompt 2",
    "potential next prompt 3",
  ]
}
```

## Getting started

```sh
npm install
npm run dev        # http://localhost:5173
```

1. Open **Settings**, paste an [OpenRouter API key](https://openrouter.ai/keys) and hit **Save**. The key is verified against OpenRouter.
2. Pick a few models from the catalog. The first one you pick is the default.
3. Go to **Chat**. Click a flow prompt to send it, or use the model picker next to **Send** to switch models between turns.

Other scripts: `npm test` (unit tests), `npm run typecheck`, `npm run build` (static site in `dist/`, deployable to any static host; routing is hash-based and asset paths are relative).

## How it works

* **No backend.** The browser calls `https://openrouter.ai/api/v1` directly. The API key, model set, active model and current chat are stored in `localStorage` under `openchat.*`. **Settings → Forget everything** wipes them.
* **Structured replies.** Every request carries a system prompt that describes the reply shape above. How hard the shape is enforced depends on what the model advertises in the catalog:

  | Catalog badge | Model supports | Request sends |
  | --- | --- | --- |
  | `schema` | `structured_outputs` | strict `json_schema` response format + `provider.require_parameters` |
  | `json` | `response_format` only | `json_object` response format + `provider.require_parameters` |
  | `prompt-only` | neither | system prompt only |

  Settings lists only `schema` models by default. Untick *Structured output only* to see everything.
  Replies are parsed tolerantly (code fences and surrounding prose are handled). A reply that still isn't valid JSON is shown as raw text and tagged *unstructured*.
* **Switching models mid-chat.** Each reply records the model that produced it. Prior replies are replayed to the next model as JSON, so a new model picks up the format from the history.

## Layout

```
src/
  App.tsx              shell + hash routing (#/chat, #/settings)
  pages/ChatPage.tsx   thread, flow prompts, composer, model switcher
  pages/SettingsPage.tsx  API key, model catalog picker, local data
  lib/openrouter.ts    API client + tolerant catalog parser
  lib/structured.ts    reply schema, system prompt, reply parser
  lib/chat.ts          message types, request builder
  lib/storage.ts       localStorage-backed React hooks (syncs across tabs)
```
