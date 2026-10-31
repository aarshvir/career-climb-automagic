// Crawlable paths from the home page into the guides. Titles, categories and reading minutes
// match src/lib/career-guides.ts (too large to import into the home bundle);
// src/__tests__/home-guides-sync.test.ts keeps the two in step.
export const homeGuides: [slug: string, title: string, meta: string][] = [
  ["cv-job-description-evidence", "Compare your CV with a job description using evidence", "CV evidence · 3 min"],
  ["achievements-without-numbers", "How to write CV achievements without numbers", "CV evidence · 3 min"],
  ["cv-pdf-or-docx", "Should you send your CV as PDF or DOCX?", "Application workflow · 3 min"],
  ["role-filtering-before-applying", "Filter roles before spending time on an application", "Career direction · 4 min"],
  ["application-tracking-follow-up", "How to track applications and plan follow-ups", "Application workflow · 3 min"],
  ["interview-stories-from-cv", "Turn your CV into clear interview stories", "CV evidence · 4 min"],
  ["cv-check-no-fit-percentage", "How to review a CV match score", "CV evidence · 4 min"],
  ["resume-privacy-before-upload", "Review resume privacy before you upload or share", "Privacy & troubleshooting · 4 min"],
  ["verify-job-listing-source", "Verify a job listing before sharing your CV", "UAE job search · 4 min"],
  ["academic-qualifications-uae-cv", "How to list qualifications on a UAE CV", "UAE job search · 4 min"],
];
