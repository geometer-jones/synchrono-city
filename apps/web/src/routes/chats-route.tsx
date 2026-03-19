const chatThreads = [
  { geohash: "9q8yyk", summary: "Tenant organizing thread with 14 notes" },
  { geohash: "9q8yym", summary: "Venue logistics and check-in updates" },
  { geohash: "9q8yyt", summary: "Audio room roster and meetup timing" }
];

export function ChatsRoute() {
  return (
    <section className="panel">
      <p className="section-label">Chats</p>
      <h2>Place-scoped note stacks</h2>
      <div className="tile-list">
        {chatThreads.map((thread) => (
          <article key={thread.geohash} className="tile-card">
            <header>
              <strong>{thread.geohash}</strong>
            </header>
            <p>{thread.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
