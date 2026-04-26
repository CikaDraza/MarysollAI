function AIDrawer({ open, onClose }) {
  const [thread, setThread] = React.useState([
    { from: 'maria', text: 'Zdravo! Ja sam Maria. Mogu da pronađem slobodan termin, popunim formu ili da te prijavim. Šta želiš?' },
  ]);
  const [input, setInput] = React.useState('');
  const send = () => {
    if (!input.trim()) return;
    const msg = input.trim();
    setThread((t) => [...t, { from: 'me', text: msg }]);
    setInput('');
    setTimeout(() => {
      setThread((t) => [...t, {
        from: 'maria',
        kind: 'suggest',
        text: 'Imam slobodan termin za masažu leđa danas u 14:00 u Studio Lavanda. Da popunim formu i potvrdim?',
      }]);
    }, 600);
  };
  return (
    <aside className={`ms-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <header className="ms-drawer-head">
        <div className="ms-drawer-id">
          <div className="ms-avatar"><img src="../../assets/avatars/maria.png" alt="" /></div>
          <div>
            <div className="ms-drawer-name">Maria Deep</div>
            <div className="ms-drawer-status">AI asistent · online</div>
          </div>
        </div>
        <button className="ms-icon-btn" onClick={onClose} aria-label="Zatvori"><Icon.X width="18" height="18" /></button>
      </header>

      <div className="ms-drawer-body scrollbar-custom">
        {thread.map((m, i) => (
          m.from === 'maria' ? (
            <div key={i} className="ms-msg ms-msg-maria">
              <div className="ms-avatar sm"><img src="../../assets/avatars/maria.png" alt="" /></div>
              <div className="ms-bubble">
                {m.text}
                {m.kind === 'suggest' && (
                  <button className="ms-btn ms-btn-secondary ms-btn-sm" style={{ marginTop: 8 }}>
                    <Icon.Check width="14" height="14" /> Potvrdi termin
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div key={i} className="ms-msg ms-msg-me"><div className="ms-bubble">{m.text}</div></div>
          )
        ))}
      </div>

      <div className="ms-drawer-suggest">
        <button className="ms-chip" onClick={() => setInput('Najbliži salon za masažu')}>Najbliži salon</button>
        <button className="ms-chip" onClick={() => setInput('Šta sam zakazala?')}>Moji termini</button>
        <button className="ms-chip" onClick={() => setInput('Otkaži termin sutra')}>Otkaži termin</button>
      </div>

      <div className="ms-drawer-input">
        <textarea
          rows={1}
          placeholder="Pitaj Mariju…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <button className="ms-btn ms-btn-primary ms-btn-sm" onClick={send}>
          <Icon.Send width="14" height="14" />
        </button>
      </div>
    </aside>
  );
}
window.AIDrawer = AIDrawer;
