/**
 * CivicTrace MOCK DATA — STAGE 2.
 *
 * ⚠️  EVERYTHING IN THIS FILE IS FICTIONAL DEMONSTRATION DATA. ⚠️
 *
 * - Places, people, agencies, publishers, figures, quotes and events are
 *   invented for the 2026 Congressional App Challenge demo build; they
 *   deliberately do not describe real projects, votes, or reporting.
 * - Source URLs all point to example.org placeholders. They are NOT real
 *   links and must be replaced with verified citations later.
 * - Every story has isDemo: true and every source has isDemo: true so the
 *   UI can clearly label this content as demonstration data.
 *
 * When the API + AI pipeline lands, it will produce objects shaped exactly
 * like `Story[]` and this file will be replaced wholesale.
 */
import type { Story, StoryCategory } from '../types'

/** Sidebar filter options, derived from StoryCategory. */
export const STORY_CATEGORIES: StoryCategory[] = [
  'Local Development',
  'Education',
  'Technology',
  'Environment',
  'Community',
]

/** Shown by the app wherever mock content appears. */
export const DEMO_DISCLAIMER =
  'CivicTrace demonstration build: this story, its figures, quotes, publishers and links are fictional sample data created for the 2026 Congressional App Challenge. Nothing here is real reporting.'

export const stories: Story[] = [
  /* ---------------------------------------------------------------------
   * STORY 1 — Data center development (Local Development)
   * ------------------------------------------------------------------- */
  {
    id: 'story-data-center',
    slug: 'data-center-development',
    title: "Powell's Run Data Center Campus: What's Proposed and What's Still Unclear",
    category: 'Local Development',
    summary:
      'A commercial developer has asked fictional Bramble County to rezone land near Powell\'s Run for a two-building data center campus. County staff and public comments broadly agree on what is being proposed, but disagree openly on fiscal projections, while water use, backup power and transmission costs remain unanswered.',
    homepageDescription:
      'A 1.8-million-square-foot campus proposed near Powell\'s Run has split fiscal projections — and left water, power and traffic questions open.',
    keywords: [
      'data center',
      'rezoning',
      "Powell's Run",
      'Bramble County',
      'supervisors',
      'electricity',
      'water use',
    ],
    latestUpdateDate: '2026-10-05',
    claimLedger: {
      thesis:
        'Available records consistently show that Meridian Vertex Group (fictional) has petitioned Bramble County to rezone the Powell\'s Run site for two data center buildings totaling roughly 1.8 million square feet, and that the Board of Supervisors is now scheduled to vote on that request in November 2026 — both points appear in the county\'s own agenda documents and in every outlet\'s reporting. Where sources conflict: projections of the project\'s net tax revenue diverge sharply, with the developer\'s estimate of $9–12 million per year and an opposition-commissioned consultant\'s estimate of $3–5 million reaching opposite conclusions about whether the project pays for its service costs; neither projection has been independently reviewed, so neither should be treated as established. What remains uncertain: annual water consumption (the revised water-impact study requested by the planning commission has not been released), the scale and cost of transmission upgrades needed to serve the site, and construction-period traffic volumes. In short, the request itself is well documented; its fiscal and environmental consequences are claimed, contested, and largely unverified as of the latest update.',
      claims: [
        {
          id: 'dc-claim-1',
          status: 'supported',
          statement:
            'The developer filed rezoning application PZ-2026-114 in April 2026 proposing two buildings totaling roughly 1.8 million square feet on the Powell\'s Run site.',
          sourceRefs: [
            { sourceId: 'dc-source-1', note: 'The application document itself.' },
            { sourceId: 'dc-source-2', note: 'Same figure in early coverage.' },
          ],
        },
        {
          id: 'dc-claim-2',
          status: 'supported',
          statement:
            'On October 5, 2026 the Board of Supervisors set the rezoning vote for its November session.',
          sourceRefs: [{ sourceId: 'dc-source-6' }],
        },
        {
          id: 'dc-claim-3',
          status: 'conflicting',
          statement:
            'Projected annual net tax revenue: the developer estimates $9–12 million, while a consultant hired by an opposition coalition estimates $3–5 million after modeled incentives.',
          sourceRefs: [
            { sourceId: 'dc-source-5', note: 'Reporter summarised both estimates.' },
            { sourceId: 'dc-source-3', note: 'Developer projection cited at town hall.' },
          ],
        },
        {
          id: 'dc-claim-4',
          status: 'conflicting',
          statement:
            'Water strategy: the developer says the campus will be air-cooled with "minimal" water use, while an August planning-commission memo says no revised water-impact figures had been provided to verify that claim.',
          sourceRefs: [
            { sourceId: 'dc-source-4' },
            { sourceId: 'dc-source-1' },
          ],
        },
        {
          id: 'dc-claim-5',
          status: 'uncertain',
          statement:
            'Which regional transmission upgrades would be needed to serve the campus — and who would pay for them — has not been established in any public filing.',
          sourceRefs: [{ sourceId: 'dc-source-4', note: 'Memo flags the gap without answering it.' }],
        },
      ],
    },
    timeline: [
      {
        id: 'dc-event-1',
        date: '2026-04-14',
        title: 'Rezoning application filed',
        description:
          'Meridian Vertex Group submits application PZ-2026-114 to rezone ~95 acres near Powell\'s Run for a two-building data center campus.',
        sourceRefs: [
          { sourceId: 'dc-source-1' },
          { sourceId: 'dc-source-2' },
        ],
      },
      {
        id: 'dc-event-2',
        date: '2026-05-28',
        title: 'Standing-room town hall',
        description:
          'Residents press the developer on water, power and traffic at a county-hosted town hall; the developer projects $9–12M in annual tax revenue.',
        sourceRefs: [{ sourceId: 'dc-source-3' }],
      },
      {
        id: 'dc-event-3',
        date: '2026-07-09',
        title: 'County staff report backs rezoning, urges water study',
        description:
          'County planning staff find the request consistent with the comprehensive plan but call for a revised water-impact study before a vote.',
        sourceRefs: [{ sourceId: 'dc-source-4' }],
      },
      {
        id: 'dc-event-4',
        date: '2026-08-22',
        title: 'Planning commission defers',
        description:
          'The commission postpones its recommendation, citing missing water figures and dueling fiscal projections.',
        sourceRefs: [
          { sourceId: 'dc-source-4' },
          { sourceId: 'dc-source-5' },
        ],
      },
      {
        id: 'dc-event-5',
        date: '2026-10-05',
        title: 'November vote scheduled',
        description:
          'The Board of Supervisors schedules final action on PZ-2026-114 for its November 3 session.',
        sourceRefs: [{ sourceId: 'dc-source-6' }],
      },
    ],
    evidenceGaps: [
      {
        id: 'dc-gap-1',
        question: 'How much water would the campus consume annually?',
        context:
          'The developer asserts the design is air-cooled with minimal use, but the revised water-impact study the planning commission requested has not been released.',
      },
      {
        id: 'dc-gap-2',
        question: 'What backup generation would be on site, and what fuel would it use?',
        context:
          'Public filings do not specify generator technology or emissions limits for outage conditions.',
      },
      {
        id: 'dc-gap-3',
        question: 'Who pays for transmission upgrades — the utility rate base or the developer?',
        context: 'No public filing allocates costs for the grid changes the campus would require.',
      },
      {
        id: 'dc-gap-4',
        question: 'How long would heavy construction traffic use residential roads?',
        context:
          'Town-hall comments raised the concern; no published cut-sheet truck-routing plan exists yet.',
      },
    ],
    sources: [
      {
        id: 'dc-source-1',
        title: 'Rezoning application PZ-2026-114: Powell\'s Run Corporate Campus',
        publisher: 'Bramble County Planning Office (fictional record)',
        publicationDate: '2026-04-14',
        shortDescription:
          'The rezoning petition, site plan summary and the application as filed — the primary document behind this story.',
        url: 'https://example.org/demo/pz-2026-114',
        isDemo: true,
      },
      {
        id: 'dc-source-2',
        title: 'Data center developer proposes 1.8M sq ft Bramble County campus',
        publisher: 'NoVA Wire (fictional outlet)',
        publicationDate: '2026-04-15',
        shortDescription: 'Day-after coverage of the filing with the building-scale figures.',
        url: 'https://example.org/demo/novawire-powells-run',
        biasRating: 'Not rated (sample)',
        isDemo: true,
      },
      {
        id: 'dc-source-3',
        title: 'Standing-room crowd presses developers at Powell\'s Run town hall',
        publisher: "Powell's Run Gazette (fictional outlet)",
        publicationDate: '2026-05-29',
        shortDescription: 'Report of resident questions and the developer\'s revenue projection.',
        url: 'https://example.org/demo/gazette-town-hall',
        biasRating: 'Local daily (sample)',
        isDemo: true,
      },
      {
        id: 'dc-source-4',
        title: 'County staff report finds rezoning consistent, urges water study',
        publisher: 'Bramble County Planning Office (fictional record)',
        publicationDate: '2026-07-10',
        shortDescription:
          'Staff recommendation in full, including the request for a revised water-impact study.',
        url: 'https://example.org/demo/staff-report-07-09',
        isDemo: true,
      },
      {
        id: 'dc-source-5',
        title: 'Fiscal consultants clash over data center tax projections',
        publisher: 'NoVA Wire (fictional outlet)',
        publicationDate: '2026-08-23',
        shortDescription:
          'Side-by-side look at the $9–12M developer estimate and the $3–5M opposition-side study.',
        url: 'https://example.org/demo/fiscal-clash',
        biasRating: 'Center-left (sample)',
        isDemo: true,
      },
      {
        id: 'dc-source-6',
        title: 'Supervisors set November vote on Powell\'s Run rezoning',
        publisher: 'Bramble Ledger (fictional outlet)',
        publicationDate: '2026-10-06',
        shortDescription: 'Coverage of the vote schedule and what final action the board can take.',
        url: 'https://example.org/demo/november-vote',
        biasRating: 'Center-right (sample)',
        isDemo: true,
      },
    ],
    isDemo: true,
  },

  /* ---------------------------------------------------------------------
   * STORY 2 — School policy change (Education)
   * ------------------------------------------------------------------- */
  {
    id: 'story-school-policy',
    slug: 'school-cell-phone-policy',
    title: 'Bramble County Public Schools Weighs Phone-Free School Days',
    category: 'Education',
    summary:
      'The fictional Bramble County school district is considering a bell-to-bell phone ban for grades 6–12, piloting the rule at two middle schools. The policy\'s existence and mechanics are well documented in board agendas; the cost, enforcement workload and effect on family communication are contested or unmeasured.',
    homepageDescription:
      'A proposed bell-to-bell phone ban for grades 6–12 is in district-wide pilot — with dueling cost estimates and no measured results yet.',
    keywords: [
      'school policy',
      'phones',
      'cell phones',
      'Bramble County Public Schools',
      'school board',
      'pilot program',
      'students',
    ],
    latestUpdateDate: '2026-09-18',
    claimLedger: {
      thesis:
        'District records and local reporting agree on the core proposal: starting with the 2026 fall term, Bramble County Public Schools (fictional) is piloting a rule that students in grades 6–12 store phones in locked pouches from the first bell to the last at two named middle schools, with a full district-wide decision tied to pilot results. Where sources conflict: the estimated pilot cost ranges from an $85,000 figure attributed to the superintendent\'s office to a $240,000 figure from parent-group requests for vendor quotes — the gap appears to hinge on whether hardware years two and three are counted, but no reconciliation has been published. What remains uncertain: whether the rule will measurably change classroom outcomes (the pilot tracks compliance incidents rather than academic measures), how urgent family communication will be handled day to day (the district points families to voicemail and office phones; families describe real-world delays), and how consistently substitutes can enforce the rule. The policy exists; its cost, manageability and effects are claimed, disputed, or simply not yet measured.',
      claims: [
        {
          id: 'sch-claim-1',
          status: 'supported',
          statement:
            'Two middle schools — Ashwick Landing and Millcreek, both fictional — began piloting locked phone pouches in fall 2026 under a board-approved pilot.',
          sourceRefs: [
            { sourceId: 'sch-source-1', note: 'Board agenda item 7-c.' },
            { sourceId: 'sch-source-3' },
          ],
        },
        {
          id: 'sch-claim-2',
          status: 'conflicting',
          statement:
            'Pilot cost: the superintendent\'s office attributes $85,000 to existing facilities budget; a parent coalition\'s vendor-quote survey totals about $240,000.',
          sourceRefs: [
            { sourceId: 'sch-source-3' },
            { sourceId: 'sch-source-4' },
          ],
        },
        {
          id: 'sch-claim-3',
          status: 'conflicting',
          statement:
            'A district news release said a "majority" of surveyed parents supported phone restrictions; the published survey footnotes show 58% support among parents who responded — of a response rate the release does not state.',
          sourceRefs: [
            { sourceId: 'sch-source-2' },
            { sourceId: 'sch-source-4' },
          ],
        },
        {
          id: 'sch-claim-4',
          status: 'uncertain',
          statement:
            'Any effect of the pilot on grades, attendance or discipline data is unknown — the pilot\'s published metric list covers compliance incidents only.',
          sourceRefs: [{ sourceId: 'sch-source-1', note: 'Pilot evaluation plan, appendix B.' }],
        },
      ],
    },
    timeline: [
      {
        id: 'sch-event-1',
        date: '2026-06-03',
        title: 'Community survey closes',
        description:
          'The district closes its spring survey of families and staff on phone use during school hours; results are summarized in a news release without response-rate detail.',
        sourceRefs: [
          { sourceId: 'sch-source-2' },
          { sourceId: 'sch-source-4' },
        ],
      },
      {
        id: 'sch-event-2',
        date: '2026-07-22',
        title: 'Superintendent proposes bell-to-bell ban',
        description:
          'The superintendent presents a grades 6–12 phone-free proposal with locked pouches to the Board of Education.',
        sourceRefs: [{ sourceId: 'sch-source-1' }],
      },
      {
        id: 'sch-event-3',
        date: '2026-08-30',
        title: 'Two pilot schools named',
        description:
          'Ashwick Landing and Millcreek middle schools are designated pilot sites for the fall term.',
        sourceRefs: [{ sourceId: 'sch-source-3' }],
      },
      {
        id: 'sch-event-4',
        date: '2026-09-18',
        title: 'Board hears first reading; vote set for November',
        description:
          'The board schedules a formal vote after pilot review, prompting dueling cost estimates in public comment.',
        sourceRefs: [
          { sourceId: 'sch-source-3' },
          { sourceId: 'sch-source-4' },
        ],
      },
    ],
    evidenceGaps: [
      {
        id: 'sch-gap-1',
        question: 'How quickly can a parent reach a student during a genuine emergency?',
        context:
          'The district describes office-phone relay; families testing it during the first weeks describe delays of more than one class period — neither has collected systematic data.',
      },
      {
        id: 'sch-gap-2',
        question: 'Does the pilot measure academic outcomes, or only compliance?',
        context:
          'The evaluation plan lists pouch violations and nurse-pass logs, not grades or attendance.',
      },
      {
        id: 'sch-gap-3',
        question: 'What does enforcement cost substitutes and unfunded coaches?',
        context: 'Teacher-liaison minutes flag substitutes as the least-trained category; no workload count exists.',
      },
      {
        id: 'sch-gap-4',
        question: 'Which dollar figure is real, and over how many years?',
        context: '$85,000 vs. ~$240,000 hinge on multi-year hardware assumptions no document reconciles.',
      },
    ],
    sources: [
      {
        id: 'sch-source-1',
        title: 'Board of Education agenda, July 22, 2026 (item 7-c) and pilot evaluation appendix',
        publisher: 'Bramble County Public Schools (fictional record)',
        publicationDate: '2026-07-22',
        shortDescription: 'The formal proposal and the pilot\'s evaluation metrics.',
        url: 'https://example.org/demo/bcps-agenda-0722',
        isDemo: true,
      },
      {
        id: 'sch-source-2',
        title: 'Survey results: majority of parents back phone restrictions',
        publisher: 'BCPS Newsroom (fictional outlet)',
        publicationDate: '2026-06-10',
        shortDescription: 'District press release summarizing spring survey results.',
        url: 'https://example.org/demo/bcps-survey-release',
        isDemo: true,
      },
      {
        id: 'sch-source-3',
        title: 'District names two phone-ban pilot schools',
        publisher: 'Bramble Ledger (fictional outlet)',
        publicationDate: '2026-08-31',
        shortDescription: 'Which schools, which rules, and how pouches work day to day.',
        url: 'https://example.org/demo/pilot-schools',
        biasRating: 'Center-right (sample)',
        isDemo: true,
      },
      {
        id: 'sch-source-4',
        title: 'Parents question phone-ban cost and survey framing',
        publisher: 'Ashwick Education Weekly (fictional outlet)',
        publicationDate: '2026-09-20',
        shortDescription: 'The opposition-side view: $240K vendor quotes and the missing response rate.',
        url: 'https://example.org/demo/cost-questions',
        biasRating: 'Left-leaning (sample)',
        isDemo: true,
      },
    ],
    isDemo: true,
  },

  /* ---------------------------------------------------------------------
   * STORY 3 — Community infrastructure (Community)
   * ------------------------------------------------------------------- */
  {
    id: 'story-greenway',
    slug: 'middlebrook-greenway-extension',
    title: 'Middlebrook Greenway Phase 2: Design Done, Funding Unresolved',
    category: 'Community',
    summary:
      'Fictional Bramble County has approved an engineering design extending the Middlebrook Greenway 2.4 miles to the county line, with a federal Active Transportation grant application pending. The project\'s scope is documented; its true cost has been revised upward once, and its funding plan is unconfirmed.',
    homepageDescription:
      'A 2.4-mile trail extension is fully designed but paused — its cost grew 21% since design approval, and the grant that would pay half is still pending.',
    keywords: [
      'greenway',
      'trail',
      'Middlebrook',
      'infrastructure',
      'grant',
      'construction',
      'parks',
    ],
    latestUpdateDate: '2026-08-12',
    claimLedger: {
      thesis:
        'Public documents put the scope of Middlebrook Greenway Phase 2 (fictional) beyond reasonable dispute: a 2.4-mile, 12-foot asphalt multi-use path from Middlebrook Park to the Bramble County line, with engineering design approved in February 2026. Where sources conflict: the project\'s cost — the county\'s original memo listed $6.1 million, while an updated engineering estimate puts it at $7.4 million after a footbridge over Laurel Creek turned out to need structural repair rather than cosmetic work; both figures circulate in official and press materials without a reconciled explanation. What remains uncertain: whether the $3.9 million federal Active Transportation grant the construction plan depends on will be awarded (or when), what local funding source would replace it if it is not, and how much a longer construction window would inconvenience Middlebrook Park visitors. The trail\'s design is settled; its price and its money are contested and unresolved.',
      claims: [
        {
          id: 'gw-claim-1',
          status: 'supported',
          statement:
            'County Council approved the Phase 2 design — a 2.4-mile, 12-foot asphalt path to the county line — in February 2026.',
          sourceRefs: [{ sourceId: 'gw-source-1' }, { sourceId: 'gw-source-2' }],
        },
        {
          id: 'gw-claim-2',
          status: 'supported',
          statement:
            'A $3.9M federal Active Transportation Program application was submitted in April 2026 and remains pending.',
          sourceRefs: [{ sourceId: 'gw-source-3' }],
        },
        {
          id: 'gw-claim-3',
          status: 'conflicting',
          statement:
            'Total cost: $6.1M (county memo, spring 2026) versus $7.4M (engineering update, June 2026) after Laurel Creek bridge repair needs were reclassified from cosmetic to structural.',
          sourceRefs: [
            { sourceId: 'gw-source-4', note: 'Engineering update, page 14.' },
            { sourceId: 'gw-source-1' },
          ],
        },
        {
          id: 'gw-claim-4',
          status: 'uncertain',
          statement:
            'The county has not identified a replacement funding source if the federal grant is not awarded.',
          sourceRefs: [{ sourceId: 'gw-source-5' }],
        },
      ],
    },
    timeline: [
      {
        id: 'gw-event-1',
        date: '2026-02-20',
        title: 'Council approves Phase 2 design',
        description:
          'Design includes the extension alignment, the Laurel Creek crossing, and trailhead lighting.',
        sourceRefs: [{ sourceId: 'gw-source-1' }],
      },
      {
        id: 'gw-event-2',
        date: '2026-04-30',
        title: 'Federal grant application submitted',
        description:
          'A $3.9M Active Transportation Program request covering roughly half the anticipated construction cost.',
        sourceRefs: [{ sourceId: 'gw-source-2' }],
      },
      {
        id: 'gw-event-3',
        date: '2026-06-25',
        title: 'Engineers revise estimate upward',
        description:
          'Bridge inspection reclassifies Laurel Creek repairs as structural, lifting the estimate to $7.4M.',
        sourceRefs: [{ sourceId: 'gw-source-4' }],
      },
      {
        id: 'gw-event-4',
        date: '2026-08-12',
        title: 'Council holds project until grant decision',
        description:
          'Construction funding is tabled without a local fallback plan identified.',
        sourceRefs: [{ sourceId: 'gw-source-5' }],
      },
    ],
    evidenceGaps: [
      {
        id: 'gw-gap-1',
        question: 'When will the federal grant decision be announced?',
        context: 'Program guidance gives a window, not a date; the county has not published an expected decision month.',
      },
      {
        id: 'gw-gap-2',
        question: 'If the grant is denied, what replaces $3.9M?',
        context: 'Council records show no identified local funding source and no alternate phasing plan.',
      },
      {
        id: 'gw-gap-3',
        question: 'Which $6.1M/$7.4M figure is the operative budget?',
        context: 'No published reconciliation explains what the 21% increase includes or excludes.',
      },
      {
        id: 'gw-gap-4',
        question: 'How would construction affect the Middlebrook Park parking lot?',
        context: 'The staging plan is referenced in the engineering document but not published.',
      },
    ],
    sources: [
      {
        id: 'gw-source-1',
        title: 'County Council minutes, February 20, 2026 (design approval, item 5)',
        publisher: 'Bramble County Council (fictional record)',
        publicationDate: '2026-02-20',
        shortDescription: 'The vote record and adopted design basis.',
        url: 'https://example.org/demo/council-0220',
        isDemo: true,
      },
      {
        id: 'gw-source-2',
        title: 'Greenway extension grant application submitted to federal program',
        publisher: 'Middlebrook News (fictional outlet)',
        publicationDate: '2026-05-01',
        shortDescription: 'Local coverage of the $3.9M application.',
        url: 'https://example.org/demo/grant-submitted',
        biasRating: 'Local weekly (sample)',
        isDemo: true,
      },
      {
        id: 'gw-source-3',
        title: 'Active Transportation Program application AT-2026-0417 (pending)',
        publisher: 'Federal award program (fictional record)',
        publicationDate: '2026-04-30',
        shortDescription: 'The submitted application summary.',
        url: 'https://example.org/demo/atp-application',
        isDemo: true,
      },
      {
        id: 'gw-source-4',
        title: 'Phase 2 engineering estimate update: Laurel Creek bridge repairs',
        publisher: 'Bramble County Dept. of Public Works (fictional record)',
        publicationDate: '2026-06-26',
        shortDescription: 'The document behind the revised $7.4M figure.',
        url: 'https://example.org/demo/engineering-update',
        isDemo: true,
      },
      {
        id: 'gw-source-5',
        title: 'Greenway funding tabled pending grant decision',
        publisher: 'Middlebrook News (fictional outlet)',
        publicationDate: '2026-08-13',
        shortDescription: 'Report from the August council session.',
        url: 'https://example.org/demo/funding-tabled',
        biasRating: 'Center-left (sample)',
        isDemo: true,
      },
    ],
    isDemo: true,
  },
]
