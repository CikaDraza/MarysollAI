const ITEMS = [
  "Slobodni termini u realnom vremenu",
  "Rezervacija bez poziva",
  "Više salona na jednom mestu",
  "Gotovo za 30 sekundi",
];

export default function TrustRow() {
  return (
    <>
      <style>{`
        .trust-grid {
          list-style: none;
          padding: 0;
          margin: 22px auto 0;
          display: grid;
          grid-template-columns: repeat(4, auto);
          gap: 10px 28px;
          justify-content: center;
          max-width: 720px;
        }
        @media (max-width: 720px) {
          .trust-grid {
            grid-template-columns: repeat(2, auto);
            justify-content: start;
            max-width: 360px;
          }
        }
        @media (max-width: 400px) {
          .trust-grid {
            grid-template-columns: 1fr;
            max-width: 100%;
          }
        }
      `}</style>
      <ul className="trust-grid">
        {ITEMS.map((item) => (
          <li
            key={item}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--main-font)",
              fontWeight: 500,
              fontSize: 14,
              color: "var(--fg-2)",
            }}
          >
            <span style={{ color: "var(--secondary-color)", fontWeight: 700, fontSize: 16 }}>
              ✔
            </span>
            {item}
          </li>
        ))}
      </ul>
    </>
  );
}
