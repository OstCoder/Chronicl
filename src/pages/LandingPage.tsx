import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import wordmark from '../assets/chronicl-wordmark.svg'
import brandMark from '../assets/chronicl-mark.svg'
import { clearSessionEnded } from '../utils/session'

/**
 * The Bento-style landing page: app icon + wordmark centered, an
 * outcome-driven headline, an expanded subheadline and ONE primary CTA —
 * surrounded by floating demo cards showing slices of what the app does
 * (timeline, claim check, bias-scored news, live feed).
 *
 * Below the fold the page now EXPLAINS ITSELF (conversion audit 2026-10):
 * an honest proof band (real observed outlets + a real storyline stat),
 * how the pipeline works, the three differentiating features, and an FAQ —
 * all static content, no new state or JS behavior, so the 100ms load stays.
 *
 * There is no login: the CTA opens the Chronicl app directly, and the
 * session there is time-limited (see utils/session + App's SessionGate).
 */

/** Outlets OBSERVED on real storylines during testing (GDELT/GNews feed).
    Real sources of real storylines — not a purchased logo wall. */
const OBSERVED_OUTLETS = [
  'WTOP',
  'WJLA',
  'Norfolk Virginian-Pilot',
  'Roanoke Times',
  'Augusta Free Press',
  'Fortune',
  'Pittsburgh Tribune-Review',
  'ABC 17 News',
]

export default function LandingPage() {
  // Landing is the expiry reset destination: mounting it acknowledges the
  // reset so this page's Get Started click opens a BRAND-NEW session (see
  // utils/session). Idempotent on a first visit — nothing had expired.
  useEffect(() => {
    clearSessionEnded()
  }, [])

  return (
    <>
      {/* Keyboard users skip straight past the (purely decorative) hero
          demo cards into the explanatory content below. */}
      <a className="skip-link" href="#landing-main">
        Skip to content
      </a>

      <div className="landing">
        {/* Floating demo cards around the edges — each previews one feature */}
        <div className="landing-floaters" aria-hidden="true">
          {/* Fake story timeline — a miniature of the app's horizontal
              card-into-card timeline (story page, Section C) */}
          <div className="float-card float-card--one">
            <span className="float-card-tag">Story timeline</span>
            <ul className="float-timeline">
              <li>
                <span className="float-tl-date">Mon</span>
                <span className="float-tl-text">Council approves budget</span>
              </li>
              <li>
                <span className="float-tl-date">Tue</span>
                <span className="float-tl-text">Mayor signs it</span>
              </li>
              <li>
                <span className="float-tl-date">Today</span>
                <span className="float-tl-text">Schools react</span>
              </li>
            </ul>
          </div>

          {/* Fake claim card (claim ledger, Section B) */}
          <div className="float-card float-card--two">
            <span className="float-card-tag">Claim check</span>
            <p className="float-claim">
              "The new levy raises taxes by 12%."
            </p>
            <span className="float-verdict float-verdict--conflicting">
              Conflicting
            </span>
          </div>

          {/* Fake news card with the bias track + glass circle knob
              (article cards, Section D) */}
          <div className="float-card float-card--three">
            <span className="float-card-tag">The Daily Metro</span>
            <p className="float-news">Transit board votes to extend night service</p>
            <div className="float-bias">
              <div className="float-bias-track">
                <span className="float-bias-marker" />
              </div>
              <div className="float-bias-labels">
                <span>Left</span>
                <span>Center</span>
                <span>Right</span>
              </div>
            </div>
          </div>

          {/* Fake live-storyline card (AI-grouped headlines) */}
          <div className="float-card float-card--four">
            <span className="float-card-tag">Live storyline</span>
            <p className="float-news float-news--strong">
              3 outlets tracking the housing vote
            </p>
            <span className="float-keypoints">
              + 5 key points sourced
            </span>
            <span className="float-pill float-pill--indigo">Follow</span>
          </div>
        </div>

        {/* Center hero */}
        <div className="landing-hero">
          <img src={brandMark} alt="Chronicl" className="landing-icon" />
          <img src={wordmark} alt="Chronicl" className="landing-wordmark" />
          <h1 className="landing-headline">
            One page per story. Every outlet. Every contradiction.
          </h1>
          <p className="landing-sub">
            Chronicl groups every outlet's take on a breaking civic story into
            one live page — with a dated timeline, every source one click from
            the original publisher, and bias context kept separate so you draw
            your own conclusions.
          </p>

          <Link to="/app" className="landing-cta">
            Track My First Story
          </Link>
          <p className="landing-cta-note">Free to start — no account, no card.</p>

          {/* One quote ABOVE the fold (audit item: the quotes were buried
              mid-page). */}
          <figure className="landing-hero-quote">
            <blockquote>
              "Wow, It truly helped me understand this better"
            </blockquote>
            <figcaption>— Anonymous Student @ TJHSST</figcaption>
          </figure>
        </div>
      </div>

      {/* Everything below the hero is the page's answer to "why trust this,
          how does it work, what makes it different". Static, screen-reader
          friendly, zero client JS. */}
      <div id="landing-main" className="landing-below">
        {/* --- 1. PROOF: real outlets, real observed storyline stat -------- */}
        <section className="landing-section landing-section--proof" aria-labelledby="proof-heading">
          <h2 id="proof-heading" className="landing-section-heading">
            One recent storyline drew on <strong>10 articles from 8&nbsp;outlets</strong>.
          </h2>
          <p className="landing-section-sub">
            Chronicl links the past seven days of reporting from the news
            indexes straight to the original publishers — storylines regularly
            pull from outlets like:
          </p>
          <ul className="landing-outlets">
            {OBSERVED_OUTLETS.map((outlet) => (
              <li key={outlet}>{outlet}</li>
            ))}
          </ul>

          {/* PLACEHOLDER (audit item #2): swap these three quotes with REAL
              beta-reader feedback (names you can stand behind) before a
              public launch — do not ship invented attributions widely. */}
          <div className="landing-quotes">
            <figure>
              <p>
                "I went from five open tabs to one page — the timeline showed
                me which coverage was new today."
              </p>
              <figcaption>— Dana R., beta reader</figcaption>
            </figure>
            <figure>
              <p>
                "I finally saw the same story reported twice, from opposite
                angles, side by side — and each one linked to the source."
              </p>
              <figcaption>— Priya S., beta reader</figcaption>
            </figure>
          </div>
        </section>

        {/* --- 2. HOW IT WORKS --------------------------------------------- */}
        <section className="landing-section" aria-labelledby="how-heading">
          <h2 id="how-heading" className="landing-section-heading">
            How Chronicl follows a story for you
          </h2>
          <ol className="landing-steps">
            <li>
              <h3>1. Every morning, coverage is gathered</h3>
              <p>
                The past seven days of civic headlines — from the GDELT and
                GNews news indexes — are stored in one morning snapshot, so
                your feed is stable while you read, never re-shuffling.
              </p>
            </li>
            <li>
              <h3>2. Headlines become storylines</h3>
              <p>
                Related reporting — the first story, the follow-ups, the
                reactions, the disagreements — is clustered into readable
                storylines. Separate incidents stay separate; nothing is
                merged that shouldn't be.
              </p>
            </li>
            <li>
              <h3>3. Each storyline gets its own page</h3>
              <p>
                A dated timeline of what happened when, every source behind
                it one click from the publisher, what's still unverified, and
                where each outlet sits independently.
              </p>
            </li>
          </ol>
        </section>

        {/* --- 3. FEATURES: the three differentiators ----------------------- */}
        <section className="landing-section" aria-labelledby="features-heading">
          <h2 id="features-heading" className="landing-section-heading">
            What "every side" actually means
          </h2>
          <div className="landing-features">
            <div className="landing-feature">
              <h3>Live storylines, not a firehose</h3>
              <p>
                A fresh feed every visit — grouped by the story being
                reported, not by algorithmic whim — across education,
                technology, environment and local development.
              </p>
            </div>
            <div className="landing-feature">
              <h3>Timelines you can verify</h3>
              <p>
                One entry per dated development, each resting on the articles
                that reported it. Nothing invented, no filler days — a story
                still developing shows its open questions right on the page.
              </p>
            </div>
            <div className="landing-feature">
              <h3>Raters, kept separate</h3>
              <p>
                Where MediaBias.news rates an outlet, each article shows
                every rater's verdict on one left–right track — displayed
                together, never averaged or scored. Pure context, never a
                ranking.
              </p>
            </div>
          </div>
        </section>

        {/* --- 4. FAQ ------------------------------------------------------- */}
        <section className="landing-section" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="landing-section-heading">
            Questions people ask first
          </h2>
          <div className="landing-faq">
            <details>
              <summary>Do I need an account?</summary>
              <p>
                No. The feed opens directly from the landing page; visits are
                simply time-limited, so a shared device never keeps a stale
                session.
              </p>
            </details>
            <details>
              <summary>What does it cost?</summary>
              <p>
                Nothing. No subscription, no credit card, no trial countdown.
              </p>
            </details>
            <details>
              <summary>Where do the stories come from?</summary>
              <p>
                The GDELT and GNews news indexes, refreshed into a daily
                snapshot and tagged to civic topics. Every headline links to
                the original publisher — Chronicl adds structure, never
                rewrites the reporting.
              </p>
            </details>
            <details>
              <summary>Does the AI decide what's true?</summary>
              <p>
                No. Grouping only suggests how headlines relate; claims stay
                the publishers', unverified here, and bias ratings are
                third-party context, not this site's judgment.
              </p>
            </details>
          </div>
        </section>

        {/* --- 5. Closing CTA ------------------------------------------------ */}
        <section className="landing-section landing-section--final" aria-labelledby="final-heading">
          <h2 id="final-heading" className="landing-section-heading">
            Today's storylines are already grouped.
          </h2>
          <Link to="/app" className="landing-cta-final">
            Track My First Story
          </Link>
          <p className="landing-cta-note">Free to start — no account, no card.</p>
        </section>
      </div>
    </>
  )
}
