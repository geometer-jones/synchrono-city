const adminCapabilities = [
  "Review reports, notes, room activity, and call activity",
  "Manage local owners and moderators",
  "Assign room-level publish and subscribe permissions",
  "Inspect an audit trail for privileged changes"
];

export function SettingsRoute() {
  return (
    <section className="panel">
      <p className="section-label">Settings</p>
      <h2>Relay Admin</h2>
      <ul className="capability-list">
        {adminCapabilities.map((capability) => (
          <li key={capability}>{capability}</li>
        ))}
      </ul>
    </section>
  );
}
