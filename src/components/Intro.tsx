interface Props {
  imageCount: number
  /** Styles the catalog can actually illustrate — not every style in the taxonomy. */
  styleCount: number
  round1Cards: number
  round2Cards: number
  onStart: () => void
  onResume?: () => void
}

export default function Intro({
  imageCount,
  styleCount,
  round1Cards,
  round2Cards,
  onStart,
  onResume,
}: Props) {
  return (
    <section className="intro">
      <p className="eyebrow">Home Style Chooser</p>
      <h1>
        Swipe through rooms.
        <br />
        Find out what you actually like.
      </h1>
      <p className="intro__lead">
        Two rounds. The first samples every style to see what catches your eye; the second digs
        into your favourites to rank them properly.
      </p>

      <ol className="steps">
        <li>
          <strong>Round 1</strong>
          <span>
            {round1Cards} rooms across {styleCount} styles — react fast, don't overthink it.
          </span>
        </li>
        <li>
          <strong>Round 2</strong>
          <span>
            About {round2Cards} more of whatever you liked, to confirm and break ties.
          </span>
        </li>
        <li>
          <strong>Result</strong>
          <span>
            Your styles ranked, the adjectives you're drawn to, and the rooms that won you
            over.
          </span>
        </li>
      </ol>

      <div className="intro__actions">
        <button type="button" className="btn btn--primary btn--wide" onClick={onStart}>
          Start swiping
        </button>
        {onResume && (
          <button type="button" className="btn btn--ghost btn--wide" onClick={onResume}>
            Resume where I left off
          </button>
        )}
      </div>

      <p className="intro__note">
        {imageCount} photos, CC-licensed via Openverse. Credits are on every card.
      </p>
    </section>
  )
}
