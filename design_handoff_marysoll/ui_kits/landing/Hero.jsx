function Hero({ onPrimary, onAskAI }) {
  return (
    <section className="ms-hero">
      <div className="ms-hero-blob" aria-hidden="true" />
      <div className="ms-hero-blob ms-hero-blob-r" aria-hidden="true" />
      <div className="ms-eyebrow">Marysoll · Novi Sad · Beograd · Niš · Bor</div>
      <h1 className="ms-h1 ms-display">
        Slobodni termini<br />u salonima <span className="ms-script">danas</span>
      </h1>
      <p className="ms-hero-sub">
        Pronađi masažu, tretman ili šišanje u svom gradu i rezerviši odmah — bez poziva, bez čekanja.
      </p>
      <label className="ms-hero-search">
        <Icon.Search width="20" height="20" />
        <input type="text" placeholder="Otkrijte i rezervišite stručnjake za lepotu i velnes u vašoj blizini" />
        <button className="ms-btn ms-btn-primary ms-btn-md ms-hero-search-btn" onClick={onPrimary}>
          Pretraži
        </button>
      </label>
      <div className="ms-hero-cta">
        <button className="ms-btn ms-btn-ghost ms-btn-lg" onClick={onAskAI}>
          <Icon.Sparkles width="18" height="18" /> Pitaj asistenta
        </button>
        <span className="ms-hero-cta-meta">ili izaberi kategoriju ispod</span>
      </div>
    </section>
  );
}
window.Hero = Hero;
