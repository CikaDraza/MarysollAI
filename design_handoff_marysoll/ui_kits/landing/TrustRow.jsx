function TrustRow() {
  const items = [
    'Slobodni termini u realnom vremenu',
    'Rezervacija bez poziva',
    'Više salona na jednom mestu',
    'Gotovo za 30 sekundi',
  ];
  return (
    <ul className="ms-trust">
      {items.map((t) => (
        <li key={t}><span className="ms-check">✔</span>{t}</li>
      ))}
    </ul>
  );
}
window.TrustRow = TrustRow;
