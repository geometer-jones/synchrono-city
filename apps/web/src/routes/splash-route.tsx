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
              Synchrono City is a hostable geo-social stack for communities that
              intend to exist in the world.
            </p>

            <p>
              It begins from a simple fact: the internet did not abolish place. It
              rewired how place is discovered, narrated, contested, and coordinated.
            </p>

            <p>
              People still need rooms, neighborhoods, venues, routes, scenes, and
              publics. They still need somewhere to go, someone to recognize, and
              some durable way to return. The digital layer now mediates more of that
              process than ever, but the point is still convergence in the world.
            </p>

            <p>
              That matters because the old political and technical settlement is
              breaking down at the same time.
            </p>

            <p>
              The platform era taught people to outsource memory, identity, and
              coordination to remote systems they did not own. Now AI is turning
              content into an effectively infinite commodity. At the same time, the
              institutional center that underwrote the platform era looks weaker, less
              trusted, and less able to provide coherent civic ground. In that
              environment, human connection becomes more valuable, not less. Local
              capacity becomes more important, not less. The question is no longer
              whether communities should own their own infrastructure. The question is
              whether they can afford not to.
            </p>

            <p>
              <strong>Synchrono City exists for that world.</strong>
            </p>

            <p>
              It is not built to maximize attention inside someone else's enclosure.
              It is built to help a public find itself, govern itself, remember itself,
              and meet in the world through infrastructure it can actually operate.
            </p>

            <h2>Mission</h2>
            <p>
              Help communities turn online coordination into real-world scenes through
              hostable, map-native, operator-controlled social infrastructure.
            </p>

            <h2>Vision</h2>
            <p>
              A world where publics are not trapped inside platforms; where identity
              is portable, place is a first-class organizing primitive, governance is
              executable, and communities can carry their own memory, venues, and
              records across changing institutions.
            </p>

            <h2>Principles</h2>

            <h3>1. Human connection is the scarce good</h3>
            <p>
              In the AI age, content is abundant by default. What remains scarce is
              trusted encounter: who will meet you, who will vouch for you, what room
              will have you, what venue will still exist next month, what public can
              recognize itself across time.
            </p>

            <h3>2. Place is a first-class social primitive</h3>
            <p>
              Place is not decorative metadata attached to a social graph. It is one
              of the main ways publics become real. Neighborhoods, venues, districts,
              routes, corners, and events structure trust and repeated encounter.
            </p>
            <blockquote>
              "Space is a primary index for collective life; the map brings that index online with more freedom."
            </blockquote>

            <h3>3. Presence should be chosen, not extracted</h3>
            <p>
              Presence should be deliberate, social, and reversible. A person should
              be able to express where they are, where they are headed, or what they
              are oriented toward without consenting to continuous extraction.
            </p>

            <h3>4. Portable identity is the minimum condition of freedom</h3>
            <p>
              Identity should belong to the participant, not the platform. Nostr
              matters here because keys are portable, authorship is signed, and
              records can move across relays. Open systems are only meaningfully open
              when exit is real.
            </p>

            <h3>5. Own your own data because memory is power</h3>
            <p>
              Data ownership is really memory ownership. A public that does not
              control its own memory does not fully control its own future.
            </p>

            <h3>6. The internet is political territory</h3>
            <p>
              Relays, rooms, storage, naming, and governance are not secondary
              technical details. They are roads, ports, archives, and meeting halls.
            </p>

            <h3>7. Self-hosting is political</h3>
            <p>
              Run your own relay. Run your own rooms. Keep your own files. Move when a
              vendor becomes hostile. Autonomy is not branding. It is operational
              capacity.
            </p>

            <h3>8. Governance must be legible and executable</h3>
            <p>
              Communities need rules, roles, moderation powers, and ways to determine
              standing. The answer is legible local governance: rules that can be
              inspected, revised, enforced, and carried across infrastructure.
            </p>

            <h3>9. Operators are civic actors, not just administrators</h3>
            <p>
              Synchrono City treats operators as stewards of local public
              infrastructure, not invisible service staff behind an abstract platform.
            </p>

            <h3>10. AI should live on the network, not above it</h3>
            <p>
              Agents should exist as explicit participants or operator tools inside
              the network, accountable to local policy and subordinate to human
              communities.
            </p>

            <h3>11. Local capacity matters more as institutions fragment</h3>
            <p>
              Synchrono City is built for a world where communities should expect less
              from the center and build more for themselves.
            </p>

            <h3>12. The measure is whether scenes emerge</h3>
            <p>
              The goal is not engagement. The goal is convergence. The stack is
              working if it helps people orient toward the same places, recognize one
              another across time, preserve memory without surrendering control,
              gather with less friction, govern shared spaces with legible rules, and
              sustain enough continuity for a real scene to form.
            </p>

            <p>
              <em>
                If software helps a community become a durable scene in the world, it
                has done its job.
              </em>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
