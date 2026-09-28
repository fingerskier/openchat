import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { appendReply, buildChatRequest, newId, type AssistantMessage, type ChatMessage } from '../lib/chat'
import { createChatCompletion } from '../lib/openrouter'
import { useActiveModelId, useApiKey, useMessages, useSelectedModels } from '../lib/storage'
import { parseReply } from '../lib/structured'

export default function ChatPage({ hidden }: { hidden: boolean }) {
  const [apiKey] = useApiKey()
  const [models] = useSelectedModels()
  const [activeId, setActiveId] = useActiveModelId()
  const [messages, setMessages] = useMessages()
  const [draft, setDraft] = useState('')
  const [pendingModel, setPendingModel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inflightRef = useRef<{ controller: AbortController; answering?: string } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const activeModel = models.find((m) => m.id === activeId) ?? models[0]
  const ready = Boolean(apiKey && activeModel)
  const pending = pendingModel !== null
  const last = messages.at(-1)
  const modelName = (id: string) => models.find((m) => m.id === id)?.name ?? id

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [messages.length, pending, error])

  // Drop an in-flight request once the message it answers is gone
  // (New chat, "Forget everything", or a clear from another tab).
  useEffect(() => {
    const answering = inflightRef.current?.answering
    if (answering && !messages.some((m) => m.id === answering)) inflightRef.current?.controller.abort()
  }, [messages])

  async function requestReply(history: ChatMessage[]) {
    if (!activeModel) return
    const controller = new AbortController()
    const answering = history.at(-1)?.id
    inflightRef.current = { controller, answering }
    setPendingModel(activeModel.id)
    setError(null)
    try {
      const raw = await createChatCompletion(
        apiKey,
        buildChatRequest(activeModel, history),
        controller.signal,
      )
      if (controller.signal.aborted) return
      const reply: AssistantMessage = {
        id: newId(),
        role: 'assistant',
        model: activeModel.id,
        ...parseReply(raw),
      }
      setMessages((prev) => appendReply(prev, answering, reply))
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (inflightRef.current?.controller === controller) {
        inflightRef.current = null
        setPendingModel(null)
      }
    }
  }

  function send(text: string) {
    const content = text.trim()
    if (!content || pending || !ready) return
    const history: ChatMessage[] = [...messages, { id: newId(), role: 'user', content }]
    setMessages(history)
    setDraft('')
    void requestReply(history)
  }

  function stop() {
    inflightRef.current?.controller.abort()
  }

  function newChat() {
    stop()
    setMessages([])
    setError(null)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    send(draft)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      send(draft)
    }
  }

  return (
    <main className="page chat" hidden={hidden}>
      <div className="thread">
        {!apiKey ? (
          <Notice>
            Add your OpenRouter API key in <a href="#/settings">Settings</a> to start chatting.
          </Notice>
        ) : !activeModel ? (
          <Notice>
            Choose at least one model in <a href="#/settings">Settings</a>.
          </Notice>
        ) : messages.length === 0 && !pending ? (
          <div className="empty">
            <h1>Ask anything.</h1>
            <p>Replies stay brief and come with follow-up prompts. Switch models whenever you like.</p>
          </div>
        ) : null}

        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="msg user">
              <p>{m.content}</p>
            </div>
          ) : (
            <div key={m.id} className="msg assistant">
              <div className="msg-meta">
                <span className="model-tag" title={m.model}>
                  {modelName(m.model)}
                </span>
                {!m.wellFormed && (
                  <span className="warn" title="The model ignored the reply format; showing its raw text.">
                    unstructured
                  </span>
                )}
              </div>
              <p>{m.response}</p>
            </div>
          ),
        )}

        {pendingModel !== null && (
          <div className="msg assistant pending" aria-live="polite">
            <div className="msg-meta">
              <span className="model-tag">{modelName(pendingModel)}</span>
            </div>
            <p className="typing" aria-label="Waiting for reply">
              <span />
              <span />
              <span />
            </p>
          </div>
        )}

        {error && (
          <div className="msg error" role="alert">
            <p>{error}</p>
            <button type="button" className="link" onClick={() => void requestReply(messages)}>
              Retry{activeModel ? ` with ${activeModel.name}` : ''}
            </button>
          </div>
        )}

        {last?.role === 'assistant' && !pending && last.flowPrompts.length > 0 && (
          <div className="flow-prompts" aria-label="Suggested next prompts">
            {last.flowPrompts.map((prompt) => (
              <button key={prompt} type="button" className="chip" onClick={() => send(prompt)} disabled={!ready}>
                {prompt}
              </button>
            ))}
          </div>
        )}

        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={onSubmit}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={ready ? 'Message…' : 'Finish setup in Settings to chat'}
          rows={1}
          disabled={!ready}
          aria-label="Message"
        />
        <div className="composer-bar">
          <select
            value={activeModel?.id ?? ''}
            onChange={(e) => setActiveId(e.target.value)}
            disabled={models.length === 0}
            aria-label="Model"
            title="Model for the next reply"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="spacer" />
          <button type="button" className="ghost" onClick={newChat} disabled={messages.length === 0 && !pending}>
            New chat
          </button>
          {pending ? (
            <button type="button" onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="submit" className="primary" disabled={!ready || !draft.trim()}>
              Send
            </button>
          )}
        </div>
      </form>
    </main>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return <div className="notice">{children}</div>
}
