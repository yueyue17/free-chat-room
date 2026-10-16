import { useEffect, useState, type ReactNode } from 'react';
import { useHash } from './lib/router';
import { loadSettings, subscribeSettings } from './lib/settings';
import { ensureStatusBarPresets, ensureBeautifiers } from './db';
import Home from './pages/Home';
import CharacterEdit from './pages/CharacterEdit';
import Chat from './pages/Chat';
import Worldbooks from './pages/Worldbooks';
import SettingsPage from './pages/SettingsPage';
import PersonaPage from './pages/PersonaPage';
import RegexPage from './pages/RegexPage';

export default function App() {
  const hash = useHash();
  const [, setTick] = useState(0);
  useEffect(() => subscribeSettings(() => setTick((t) => t + 1)), []);

  const s = loadSettings();

  useEffect(() => {
    void ensureStatusBarPresets();
    void ensureBeautifiers();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = s.theme;
  }, [s.theme]);

  useEffect(() => {
    let el = document.getElementById('user-css') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'user-css';
      document.head.appendChild(el);
    }
    el.textContent = s.customCss;
  }, [s.customCss]);

  const seg = hash.split('/').filter(Boolean);
  let page: ReactNode;
  if (seg[0] === 'char') page = <CharacterEdit id={seg[1] && seg[1] !== 'new' ? seg[1] : null} />;
  else if (seg[0] === 'chat' && seg[1]) page = <Chat sessionId={seg[1]} />;
  else if (seg[0] === 'worldbook') page = <Worldbooks selectedId={seg[1] ?? null} />;
  else if (seg[0] === 'settings') page = <SettingsPage />;
  else if (seg[0] === 'persona') page = <PersonaPage />;
  else if (seg[0] === 'regex') page = <RegexPage />;
  else page = <Home tab={seg[0] === 'chats' ? 'chats' : 'chars'} />;

  return <div className="app">{page}</div>;
}
