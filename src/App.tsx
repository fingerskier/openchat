import { useRoute } from './lib/route'
import ChatPage from './pages/ChatPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  const route = useRoute()

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/chat">
          openchat
        </a>
        <nav>
          <a href="#/chat" aria-current={route === 'chat' ? 'page' : undefined}>
            Chat
          </a>
          <a href="#/settings" aria-current={route === 'settings' ? 'page' : undefined}>
            Settings
          </a>
        </nav>
      </header>
      {/* Chat stays mounted so an in-flight reply and the draft survive a trip to Settings. */}
      <ChatPage hidden={route !== 'chat'} />
      {route === 'settings' && <SettingsPage />}
    </div>
  )
}
