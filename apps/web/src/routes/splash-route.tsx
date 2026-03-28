import { useNavigate } from "react-router-dom";

const GITHUB_URL = "https://github.com/geometer-jones/synchrono-city";

export function SplashRoute() {
  const navigate = useNavigate();

  return (
    <section className="splash">
      <div className="splash-orb splash-orb-primary" aria-hidden="true" />
      <div className="splash-orb splash-orb-secondary" aria-hidden="true" />
      <div className="splash-content">
        <aside className="splash-intro">
          <p className="eyebrow">Synchrono City</p>
          <h1>Chosen Presence. Sovereign Infrastructure. Portable Community.</h1>

          <div className="cta-group">
            <button className="cta primary" onClick={() => navigate("/app")}>
              Enter the City
            </button>
            <a
              className="cta secondary"
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Host Your Own
            </a>
          </div>

          <p className="splash-footer">
            Map-native coordination • Nostr identity • LiveKit media • Blossom storage
          </p>
        </aside>

        <div className="manifesto-frame">
          <div className="manifesto">
            <p className="manifesto-lead">
              Amid exploding sovereign debt, the relentless advance of AI, fresh
              wars in the Middle East, the lingering fractures of pandemic
              response, and the deep erosion of public trust laid bare by
              institutional scandals, the old centralized systems are visibly
              straining.
            </p>

            <p>
              Platforms that once promised connection now flood us with synthetic
              noise. Institutions that once claimed legitimacy increasingly reveal
              capture and fragility. In this moment of abundance and instability,
              real value shifts back to what cannot be endlessly replicated:
              embodied human connection in physical places, built and governed by
              the people who actually inhabit them.
            </p>

            <p>
              These principles outline a new foundation for social technology: one
              that turns digital signals into durable real-world publics,
              prioritizes sovereignty over surveillance, and equips local stewards
              to endure when distant powers falter.
            </p>

            <h2>Principles</h2>

            <h3>1. Human connection is the scarce good</h3>
            <p>
              In a world of infinite synthetic content, real value comes from
              repeated in-person encounters. The system turns online signals into
              actual meetups, shared rituals, and durable relationships.
            </p>

            <h3>2. Place is a first-class social primitive</h3>
            <p>
              Neighborhoods, venues, routes, and corners are the substrate of
              publics. Beacons make geography an active coordination layer for
              social life.
            </p>

            <h3>3. Presence must be chosen and intentional</h3>
            <p>
              Presence is explicit, reversible, purpose-bound, and
              privacy-preserving. People decide when they are discoverable, never
              extracted through continuous tracking.
            </p>

            <h3>4. Sovereignty begins with ownership of identity, memory, and infrastructure</h3>
            <p>
              Portable keys, portable records, and self-hostable components are
              the basis of continuity when platforms fail.
            </p>

            <h3>5. Governance must be self-sovereign and sustainable</h3>
            <p>
              Communities own the rules and roles they can inspect, enforce, and
              carry with them. Reliable stewardship requires aligned incentives
              that support local operators without extraction or central control.
            </p>

            <h3>6. AI creates leverage, not legitimacy</h3>
            <p>
              AI lowers the cost of matching, organizing, and sustaining
              connection, but never becomes the intermediary or replaces the
              relationships it enables.
            </p>

            <h3>7. Success is measured in real-world publics</h3>
            <p>
              Adoption grows through low friction and visible fruit: durable
              relationships, thriving scenes, and resilient neighborhoods that
              outlast any single point of failure.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
