function Header({ onOpenAI, theme, onToggleTheme }) {
  return (
    <header className="ms-header">
      <a className="ms-logo" href="#"><img src="../../assets/logo.svg" alt="Marysoll" /></a>
      <div className="ms-spacer" />
      <button className="ms-icon-btn" onClick={onToggleTheme} aria-label="Toggle theme">
        {theme === 'dark' ? <Icon.Sun width="18" height="18" /> : <Icon.Moon width="18" height="18" />}
      </button>
      <button className="ms-pill">SR <Icon.ChevronDown width="12" height="12" /></button>
      <button className="ms-pill"><Icon.MapPin width="14" height="14" /> Novi Sad <Icon.ChevronDown width="12" height="12" /></button>
      <button className="ms-btn ms-btn-primary ms-btn-sm">Login</button>
      <button className="ms-ai-trigger" onClick={onOpenAI}>
        <Icon.Sparkles width="16" height="16" /> Pitaj Mariju
      </button>
    </header>
  );
}
window.Header = Header;
