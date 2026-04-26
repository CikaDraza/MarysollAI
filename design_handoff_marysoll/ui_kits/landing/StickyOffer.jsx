function StickyOffer({ visible, onDismiss, onBook }) {
  if (!visible) return null;
  return (
    <div className="ms-sticky">
      <div className="ms-sticky-bolt"><Icon.Bolt width="18" height="18" /></div>
      <div className="ms-sticky-text">
        <span className="ms-sticky-eyebrow">Brzo</span>
        <span className="ms-sticky-line">Prvi slobodan termin u 14:00</span>
      </div>
      <button className="ms-btn ms-btn-primary ms-btn-sm" onClick={onBook}>Rezerviši</button>
      <button className="ms-sticky-close" onClick={onDismiss} aria-label="Zatvori"><Icon.X width="14" height="14" /></button>
    </div>
  );
}
window.StickyOffer = StickyOffer;
