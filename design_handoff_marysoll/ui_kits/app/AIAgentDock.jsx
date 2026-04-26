function AIAgentDock({ onSubmit, isLoading, thread }) {
  const [input, setInput] = React.useState('');
  const send = () => {
    if (!input.trim()) return;
    onSubmit(input.trim());
    setInput('');
  };
  return (
    <div className="ai-dock">
      <div className="ai-dock-inner">
        <p className="ai-dock-tag">
          {isLoading ? 'Ažuriram predloge komponenti…' : 'Boost your experience. Marysoll Assistant AI.'}
        </p>
        <div className="ai-dock-row">
          <button className="ai-dock-bolt" aria-label="Statistika">
            <Icon.Bolt width="18" height="18" />
          </button>
          <textarea
            rows={1}
            placeholder="Pitaj Mariju…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button className="ms-btn ms-btn-secondary ms-btn-md" onClick={send} disabled={isLoading || !input.trim()}>
            {isLoading ? 'Slanje…' : 'Pošalji'}
          </button>
        </div>
      </div>
    </div>
  );
}
window.AIAgentDock = AIAgentDock;
