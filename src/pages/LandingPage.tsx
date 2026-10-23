import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import wordmark from '../assets/chronicl-wordmark.svg'
import brandMark from '../assets/chronicl-mark.svg'
import { clearSessionEnded } from '../utils/session'

/**
 * The Bento-style landing page: app icon + wordmark centered, a big
 * two-line headline, a one-line subtitle and ONE big primary CTA —
 * surrounded by floating demo cards showing slices of what the app does
 * (timeline, claim ledger, bias-scored news, live feed).
 *
 * There is no login: the CTA opens the Chronicl app directly, and the
 * session there is time-limited (see utils/session + App's SessionGate).
 */
export default function LandingPage() {
  // Landing is the expiry reset destination: mounting it acknowledges the
  // reset so this page's Get Started click opens a BRAND-NEW session (see
  // utils/session). Idempotent on a first visit — nothing had expired.
  useEffect(() => {
    clearSessionEnded()
  }, [])

  return (
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
          Track the story.
          <br />
          See every side.
        </h1>
        <p className="landing-sub">
          One page for live headlines, grouped storylines and the context
          behind every claim.
        </p>

        <Link to="/app" className="landing-cta">
          Get Started
        </Link>
      </div>
    </div>
  )
}
