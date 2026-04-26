function CalendarBlock({ aiSuggested, onConfirm }) {
  const [service, setService] = React.useState('Masaža leđa · 30 min');
  const [date, setDate] = React.useState('Sreda, 14. maj');
  const [time, setTime] = React.useState(aiSuggested ? '14:00' : null);
  const [variant, setVariant] = React.useState('30 min');
  const slots = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','13:00','13:30','14:00','14:30','15:00'];
  const variants = ['30 min','45 min','60 min','90 min'];

  return (
    <div className="cal-block">
      {aiSuggested && (
        <div className="ai-suggest">
          <div className="ms-avatar sm"><img src="../../assets/avatars/maria.png" alt="" /></div>
          <p>
            <strong>Maria:</strong> Unela sam podatke <strong>{service}</strong> u <strong>{time}</strong>
          </p>
          <button className="ms-btn ms-btn-primary ms-btn-sm" onClick={onConfirm}>Potvrdi</button>
        </div>
      )}

      <select className="cal-select" value={service} onChange={(e) => setService(e.target.value)}>
        <option>Masaža leđa · 30 min</option>
        <option>Masaža celog tela · 60 min</option>
        <option>Tretman lica · klasik</option>
        <option>Šišanje + pranje</option>
      </select>

      <div className="cal-variants">
        {variants.map((v) => (
          <button key={v} className={`cal-variant ${variant === v ? 'active' : ''}`} onClick={() => setVariant(v)}>{v}</button>
        ))}
      </div>

      <input type="text" className="cal-date" value={date} onChange={(e) => setDate(e.target.value)} />

      <div className="cal-slots">
        {slots.map((t) => (
          <button key={t} className={`cal-slot ${time === t ? 'active' : ''}`} onClick={() => setTime(t)}>{t}</button>
        ))}
      </div>

      <div className="cal-foot">
        <div className="cal-price">2 400 RSD</div>
        <button className="ms-btn ms-btn-dark ms-btn-md" disabled={!time} onClick={onConfirm}>
          Zakaži termin
        </button>
      </div>
    </div>
  );
}
window.CalendarBlock = CalendarBlock;
