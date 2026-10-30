/**
 * Stand-in for optional jsPDF dependencies that Jobvance never calls (jsPDF's HTML-to-PDF path). Aliased in vite.config.ts so
 * their code is not shipped; the CV export draws text directly and does not use this path.
 */
export default function unusedModule(): never {
  throw new Error('This export path is not available.');
}
