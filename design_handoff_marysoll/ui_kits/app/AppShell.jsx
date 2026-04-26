function AppShell({ user, screen, onScreen, children, onLogout }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="app-logo"><img src="../../assets/logo.svg" alt="Marysoll" /></a>
        <nav className="app-nav">
          <button className={screen === 'dashboard' ? 'active' : ''} onClick={() => onScreen('dashboard')}>Moji termini</button>
          <button className={screen === 'book' ? 'active' : ''} onClick={() => onScreen('book')}>Zakaži novi</button>
          <button className={screen === 'salons' ? 'active' : ''} onClick={() => onScreen('salons')}>Saloni</button>
        </nav>
        <div className="app-spacer" />
        {user ? (
          <div className="app-user">
            <div className="ms-avatar"><img src="../../assets/avatars/claudia.png" alt="" /></div>
            <span>{user.name}</span>
            <button className="ms-icon-btn" onClick={onLogout} aria-label="Logout"><Icon.X width="14" height="14" /></button>
          </div>
        ) : null}
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
window.AppShell = AppShell;
