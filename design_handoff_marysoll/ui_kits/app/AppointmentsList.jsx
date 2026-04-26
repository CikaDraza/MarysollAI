function AppointmentsList({ appointments, onCancel }) {
  const upcoming = appointments.filter((a) => !a.past);
  const past = appointments.filter((a) => a.past);
  return (
    <div className="appts">
      <div className="appts-head">
        <span className="ms-eyebrow">Moji termini</span>
        <h2 className="ms-h2">Predstojeći termini</h2>
      </div>
      {upcoming.length === 0 ? (
        <div className="empty">Nemaš zakazanih termina. <a href="#book">Zakaži sada →</a></div>
      ) : (
        <div className="appts-grid">
          {upcoming.map((a) => (
            <div key={a.id} className="appt-card">
              <div className="appt-when">
                <Icon.Calendar width="18" height="18" />
                <strong>{a.date}</strong> · {a.time}
              </div>
              <div className="appt-service">{a.service}</div>
              <div className="appt-salon"><Icon.MapPin width="14" height="14" /> {a.salon}</div>
              <div className="appt-foot">
                <span className="ms-tag" style={{ background: '#E9F8EE', color: '#1F9D55' }}>✔ Potvrđeno</span>
                <button className="ms-btn ms-btn-secondary ms-btn-sm" onClick={() => onCancel(a.id)}>Otkaži</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="ms-h3" style={{ marginTop: 36 }}>Istorija</h3>
      <div className="appts-grid muted">
        {past.map((a) => (
          <div key={a.id} className="appt-card past">
            <div className="appt-when">{a.date} · {a.time}</div>
            <div className="appt-service">{a.service}</div>
            <div className="appt-salon">{a.salon}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
window.AppointmentsList = AppointmentsList;
