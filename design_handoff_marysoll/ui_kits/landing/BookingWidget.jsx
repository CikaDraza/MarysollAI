function BookingWidget({ onConfirm, onAskAI }) {
  const [service, setService] = React.useState('Masaža leđa · 30 min');
  const [time, setTime] = React.useState('14:00');
  const slots = ['12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00'];
  return (
    <section className="ms-bw-section">
      <div className="ms-bw-copy">
        <span className="ms-eyebrow">Salon Lavanda · 0.4 km</span>
        <h2 className="ms-h2">Čekamo umesto vas u redu.<br /><span className="ms-script">Zovemo vas</span> za prvi slobodan termin.</h2>
        <p className="ms-bw-sub">Ostavi ime i broj — javljamo se u roku od 15 minuta sa potvrdom.</p>
        <button className="ms-btn ms-btn-ghost ms-btn-md" onClick={onAskAI}>
          <Icon.Sparkles width="16" height="16" /> Pitaj asistenta
        </button>
      </div>

      <div className="ms-bw">
        <div className="ms-bw-head">
          <h3>Zakaži termin</h3>
          <span className="ms-tag">Studio Lavanda</span>
        </div>

        <label className="ms-field">
          <span>Usluga</span>
          <select value={service} onChange={(e) => setService(e.target.value)}>
            <option>Masaža leđa · 30 min</option>
            <option>Masaža celog tela · 60 min</option>
            <option>Tretman lica</option>
            <option>Šišanje</option>
          </select>
        </label>

        <div className="ms-row-2">
          <label className="ms-field">
            <span>Datum</span>
            <input type="text" defaultValue="Sreda, 14. maj" />
          </label>
          <label className="ms-field">
            <span>Telefon</span>
            <input type="tel" placeholder="+381 …" />
          </label>
        </div>

        <label className="ms-field">
          <span>Ime</span>
          <input type="text" placeholder="Marija Petrović" />
        </label>

        <div className="ms-slot-grid">
          {slots.map((t) => (
            <button
              key={t}
              className={`ms-slot ${time === t ? 'ms-slot-active' : ''}`}
              onClick={() => setTime(t)}
            >{t}</button>
          ))}
        </div>

        <div className="ms-bw-foot">
          <div className="ms-price">2 400 RSD</div>
          <button className="ms-btn ms-btn-dark ms-btn-md" onClick={onConfirm}>
            Zakaži termin
          </button>
        </div>
      </div>
    </section>
  );
}
window.BookingWidget = BookingWidget;
