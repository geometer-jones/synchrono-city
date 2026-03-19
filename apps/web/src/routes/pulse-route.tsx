const feedSegments = [
  { name: "Following", description: "Explainable projection of followed authors." },
  { name: "Local", description: "Public events carried by the active relay." },
  { name: "For You", description: "Concierge-produced merge across relays and follows." }
];

export function PulseRoute() {
  return (
    <section className="panel">
      <p className="section-label">Pulse</p>
      <h2>Relay feed projection</h2>
      <div className="tile-list">
        {feedSegments.map((segment) => (
          <article key={segment.name} className="tile-card">
            <header>
              <strong>{segment.name}</strong>
            </header>
            <p>{segment.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
