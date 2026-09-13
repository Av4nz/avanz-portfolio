/**
 * SINGLE SOURCE OF TRUTH for personal data.
 * Edit this file to update the whole site. Nothing else hardcodes your details.
 *
 * Anything marked TODO is placeholder content you should replace.
 */

export const site = {
  // --- Identity -------------------------------------------------------------
  name: "Affan Arfani Arifin",
  alias: "AvanZ",
  role: "Front-End Developer",

  /** One-line value proposition. Shown in the hero and as the meta description. */
  tagline:
    "I build fast, accessible web interfaces with a focus on clean architecture and considered detail.",

  /** Short bio for the About section. 3-4 sentences is the sweet spot. */
  bio: [
    "I'm a final-year Informatics student and front-end developer currently interning, where I ship production UI against real deadlines and real feedback.",
    "My focus is the part of the front end that users feel but rarely notice: fast page loads, interfaces that work with a keyboard and a screen reader, and component APIs that the next developer can actually read.",
    "I care about the boring parts being correct. Semantic markup, sensible state, no unnecessary JavaScript.",
  ],

  location: "Indonesia",
  availability: "Open to internships, full-time and freelance work",

  // --- Deployment -----------------------------------------------------------
  // TODO: replace with your real domain once you buy one. Used for canonical
  // URLs, sitemap and social share images.
  url: "https://avanz.dev",

  // --- Contact --------------------------------------------------------------
  // TODO: replace all placeholders below with your real handles.
  email: "hello@avanz.dev",
  socials: [
    { label: "GitHub", href: "https://github.com/your-username", handle: "@your-username" },
    { label: "LinkedIn", href: "https://linkedin.com/in/your-username", handle: "in/your-username" },
    { label: "Email", href: "mailto:hello@avanz.dev", handle: "hello@avanz.dev" },
  ],

  /** Put your real CV at /public/cv.pdf to activate this link. */
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
    items: ["HTML5", "CSS3", "JavaScript (ES2023+)", "TypeScript", "Responsive Design", "Web Accessibility"],
  },
  {
    title: "Frameworks & Libraries",
    items: ["React", "Astro", "Next.js", "Tailwind CSS", "Vite"],
  },
  {
    title: "Tooling & Workflow",
    items: ["Git & GitHub", "Figma to Code", "REST APIs", "Vercel", "Lighthouse & Web Vitals"],
  },
] as const;

/**
 * Experience timeline. Newest first.
 * TODO: replace with your real internship details.
 */
export const experience = [
  {
    role: "Front-End Developer Intern",
    company: "TODO: Company Name",
    period: "2026 — Present",
    description:
      "TODO: One or two sentences. What do you actually build, and what changed because you were there? Lead with a number if you have one.",
  },
  {
    role: "Freelance Web Developer",
    company: "Self-employed",
    period: "2025 — 2026",
    description:
      "TODO: Who were the clients, what did you deliver, and what was the outcome for them?",
  },
  {
    role: "B.Sc. Informatics",
    company: "TODO: University Name",
    period: "2022 — 2026",
    description: "TODO: Thesis topic, relevant coursework, or an organisation you were active in.",
  },
] as const;
