/**
 * SINGLE SOURCE OF TRUTH for personal data.
 * Edit this file to update the whole site. Nothing else hardcodes your details.
 */

export const site = {
  // --- Identity -------------------------------------------------------------
  name: "Affan Arfani Arifin",
  alias: "AvanZ",
  role: "Front-End Developer",

  /** One-line value proposition. Shown in the hero and as the meta description. */
  tagline:
    "I build web interfaces that make complex data understandable, and I care about the parts users feel but rarely notice.",

  /** Short bio for the About section. */
  bio: [
    "I'm a final-year Informatics student in Yogyakarta and a front-end developer, currently interning while I finish my thesis.",
    "My work sits where the interface meets real complexity. My thesis, RicePredict, forecasts rice prices for my region and taught me that shipping a model is the easy half: the hard part is presenting a prediction honestly enough that someone can decide how much to trust it.",
    "I care about the boring things being correct. Semantic markup, fast loads on mid-range phones, interfaces that work with a keyboard, and handovers where the next person can actually take over.",
  ],

  location: "Yogyakarta, Indonesia",
  availability: "Open to internships, full-time and freelance work",

  // --- Deployment -----------------------------------------------------------
  // TODO: replace with your real domain once you buy one. Everything else
  // (robots.txt, sitemap, canonical URLs, OG image) derives from this value.
  url: "https://avanz.dev",

  // --- Contact --------------------------------------------------------------
  email: "affanarfani4@gmail.com",
  socials: [
    { label: "GitHub", href: "https://github.com/Av4nz", handle: "@Av4nz" },
    {
      label: "LinkedIn",
      href: "https://www.linkedin.com/in/affan-arfani-arifin-930652282",
      handle: "in/affan-arfani-arifin",
    },
    { label: "Email", href: "mailto:affanarfani4@gmail.com", handle: "affanarfani4@gmail.com" },
  ],

  /** Put your CV at /public/cv.pdf to activate the CV links automatically. */
  cv: "/cv.pdf",
} as const;

export const nav = [
  { label: "Work", href: "/#work" },
  { label: "About", href: "/#about" },
  { label: "Contact", href: "/#contact" },
] as const;

/**
 * Skills grouped by role rather than rated by percentage.
 * Progress bars ("React 87%") are meaningless to a reviewer, so they are
 * deliberately not used here.
 */
export const skillGroups = [
  {
    title: "Core",
    items: [
      "HTML5",
      "CSS3",
      "JavaScript (ES2023+)",
      "TypeScript",
      "Responsive Design",
      "Web Accessibility",
    ],
  },
  {
    title: "Frameworks & Libraries",
    items: ["React", "Next.js", "Vue", "Astro", "Tailwind CSS", "Recharts"],
  },
  {
    title: "Back-End & Data",
    items: ["FastAPI", "Python", "PostgreSQL", "REST APIs", "pandas", "scikit-learn"],
  },
  {
    title: "Tooling & Workflow",
    items: ["Git & GitHub", "Figma to Code", "Vercel & Netlify", "Headless CMS", "Lighthouse"],
  },
] as const;

/**
 * Experience timeline. Newest first.
 */
export const experience = [
  {
    role: "Website Administrator",
    company: "Gelanggang Inovasi dan Kreativitas (GIK) UGM",
    period: "Jul 2026 — Dec 2026",
    description:
      "Maintaining and updating the web presence for UGM's innovation and creativity hub, keeping content current for a venue that runs a continuous programme of public events.",
  },
  {
    role: "Front-End Developer Intern",
    company: "PT Vortex Buana Edumedia",
    period: "Nov 2025 — Feb 2026",
    description:
      "Built and maintained production UI for an education technology product, working to real deadlines and review cycles rather than coursework ones.",
  },
  {
    role: "B.Sc. Informatics",
    company: "TODO: your university name",
    period: "2022 — 2026",
    description:
      "Thesis: RicePredict, a hybrid Prophet and XGBoost system forecasting medium-grade rice prices for the Special Region of Yogyakarta.",
  },
] as const;
