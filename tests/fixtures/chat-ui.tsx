import { createRoot } from 'react-dom/client';
import { Chat } from '../../src/app/room/chat/chat';
import { CallControls } from '../../src/app/room/chat/call-controls';
import { I18nProvider } from '../../src/i18n/client';
const params = new URLSearchParams(location.search);
const locale = params.get('lang') === 'ko' ? 'ko' : 'en';
const popup = params.get('surface') !== 'window';
document.documentElement.lang = locale;
document.documentElement.dataset.compact = popup ? 'popup' : 'window';
const initial = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, sender: i % 2 ? 'me' : 'partner', body: `Message ${i + 1}`, created_at: new Date().toISOString() }));
createRoot(document.getElementById('root')!).render(<I18nProvider locale={locale}>
  <main className="wrap room-wrap"><header className="top"><a className="brand">Duri</a><button>Sign out</button></header>
    <div className="room" data-mood="night"><nav className="room-tabs">{['🏡 Home','🎮 Games','🎨 Draw','🍿 Watch','📸 Album','💌 Chat','⚙️ Settings'].map(x => <a key={x} href="#">{x}</a>)}</nav>
      <section className="chat-wrap"><Chat roomId="test" me="me" zone="America/Toronto" initial={initial} prompt={params.get('prompt') || ''} partnerName="Love" initialPartnerRead={{upto:0,atMs:null}} initialMyRead={40} /></section>
    </div>
  </main>
  <div className="call-dock" data-mood="night"><CallControls session={null} view={{ phase: 'idle', mode: 'audio', note: 'hint' }} ready /></div>
</I18nProvider>);
// Mirror the persistent dock's actual ResizeObserver contract.
const dockObserver = new MutationObserver(() => {
  const dock = document.querySelector<HTMLElement>('.call-dock');
  if (!dock) return;
  new ResizeObserver(() => document.documentElement.style.setProperty('--call-dock-height', `${dock.offsetHeight + 12}px`)).observe(dock);
  dockObserver.disconnect();
});
dockObserver.observe(document.body, { childList: true, subtree: true });
