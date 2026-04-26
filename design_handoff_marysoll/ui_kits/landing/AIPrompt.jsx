function AIPrompt({ onAskAI }) {
  return (
    <section className="ms-ai-prompt">
      <div className="ms-ai-prompt-inner">
        <div className="ms-ai-avatar"><img src="../../assets/avatars/maria.png" alt="" /></div>
        <div>
          <h2 className="ms-h3">Ne znaš šta ti treba?</h2>
          <p className="ms-ai-prompt-sub">
            Maria može da rezerviše, prikaže slobodne termine i ispuni kalendar umesto tebe — uz jedan klik za potvrdu.
          </p>
        </div>
        <button className="ms-btn ms-btn-secondary ms-btn-md" onClick={onAskAI}>
          <Icon.Sparkles width="16" height="16" /> Pitaj asistenta
        </button>
      </div>
    </section>
  );
}
window.AIPrompt = AIPrompt;
