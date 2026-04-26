function LoginCard({ onLogin }) {
  const [mode, setMode] = React.useState('login');
  return (
    <div className="login-card">
      <div className="login-tabs">
        <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Prijava</button>
        <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Registracija</button>
      </div>
      <h2 className="ms-h2" style={{ margin: '8px 0 4px' }}>
        {mode === 'login' ? 'Dobro došli nazad' : 'Napravi nalog'}
      </h2>
      <p style={{ color: 'var(--fg-2)', margin: '0 0 18px' }}>
        {mode === 'login'
          ? 'Prijavi se da vidiš svoje termine i razgovore sa Marijom.'
          : 'Registracija traje manje od 30 sekundi.'}
      </p>
      {mode === 'register' && (
        <label className="ms-field"><span>Ime</span><input type="text" placeholder="Marija Petrović" /></label>
      )}
      <label className="ms-field"><span>Email</span><input type="email" placeholder="ti@primer.rs" /></label>
      <label className="ms-field"><span>Lozinka</span><input type="password" placeholder="••••••••" /></label>
      <button className="ms-btn ms-btn-primary ms-btn-md" onClick={onLogin} style={{ width: '100%', marginTop: 14 }}>
        {mode === 'login' ? 'Prijavi se' : 'Napravi nalog'}
      </button>
      {mode === 'login' && (
        <a href="#" className="forgot">Zaboravljena lozinka?</a>
      )}
    </div>
  );
}
window.LoginCard = LoginCard;
