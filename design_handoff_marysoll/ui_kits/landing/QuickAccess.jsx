function QuickAccess({ onPick }) {
  const cats = [
    {
      id: "nokti",
      label: "Nokti",
      meta: "Maникir · Gel · Nail art",
      img: "../../assets/salons/nails-kikikiss.jpg",
    },
    {
      id: "sisanje",
      label: "Frizura",
      meta: "Šišanje · Farbanje · Feniranje",
      img: "../../assets/salons/haircut-shisham.png",
    },
    {
      id: "masaza",
      label: "Masaža",
      meta: "Relaks · Sportska · Aroma",
      img: "../../assets/salons/massage_tretman.png",
    },
    {
      id: "sminka",
      label: "Šminka",
      meta: "Dnevna · Večernja · Mladenačka",
      img: "../../assets/salons/makeup-belisimo.png",
    },
  ];
  return (
    <section className="ms-quick">
      <div className="ms-section-head ms-section-head-center">
        <span className="ms-eyebrow">Brzi pristup</span>
        <h2 className="ms-h2">Šta ti treba danas?</h2>
      </div>
      <div className="ms-quick-grid">
        {cats.map((c) => (
          <button
            key={c.id}
            className="ms-quick-card"
            onClick={() => onPick && onPick(c)}
          >
            <div
              className="ms-quick-img"
              style={{ backgroundImage: `url(${c.img})` }}
              aria-hidden="true"
            />
            <span className="ms-quick-label">{c.label}</span>
            <span className="ms-quick-meta">{c.meta}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
window.QuickAccess = QuickAccess;
