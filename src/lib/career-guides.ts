/** Original practical editorial guidance. Sources support the limited claims beside which they appear. */
export type GuideAudience = "Students" | "MBA candidates" | "Working professionals" | "All applicants";
export type GuideCategory = "CV evidence" | "Career direction" | "Application workflow" | "UAE job search" | "Privacy & troubleshooting";
export type GuideSource = { id: string; title: string; url: string };
export type GuideSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  example?: { label: string; text: string };
  sourceIds?: string[];
};
export type CareerGuide = {
  slug: string;
  title: string;
  description: string;
  audience: GuideAudience;
  category: GuideCategory;
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
  summary: string;
  takeaways: string[];
  sections: GuideSection[];
  sources: GuideSource[];
  relatedSlugs: string[];
};

export const editorialPolicy = {
  publisher: "Jobvance Editorial",
  disclosure: "These Jobvance guides bring together practical checklists, worked examples and published sources. They provide general application guidance, rather than individual career or legal advice.",
  approach: "We separate published source facts from our practical suggestions. Worked examples illustrate the advice; they are not customer case studies. Product instructions describe the available review workflow, and connected features depend on setup. You review documents and submit applications yourself.",
  researchedAt: "2026-10-13",
};

const SOURCES = {
  harvard: { id: "harvard-resume", title: "Harvard MCS: Create a strong resume", url: "https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/" },
  mitProjects: { id: "mit-projects", title: "MIT CAPD: Crafting an effective resume", url: "https://capd.mit.edu/resources/career-toolkit-crafting-an-effective-resume/" },
  mitBullets: { id: "mit-bullets", title: "MIT CAPD: Writing about your skills", url: "https://capd.mit.edu/resources/resumes-writing-about-your-skills/" },
  yale: { id: "yale-transition", title: "Yale OCS: Converting a CV to a professional resume", url: "https://ocs.yale.edu/stem-ppg-module-5-converting-your-cv-to-a-professional-resume/" },
  linkedin: { id: "linkedin-privacy", title: "LinkedIn Help: Let recruiters know you are Open to Work", url: "https://www.linkedin.com/help/linkedin/answer/a507508" },
  fraud: { id: "uae-fraud", title: "UAE Government: Tips to avoid labour and visa fraud", url: "https://u.ae/en/information-and-services/visa-and-emirates-id/tips-to-avoid-labour-and-visa-fraud" },
  jobs: { id: "uae-jobs", title: "UAE Government: Searching for a job", url: "https://u.ae/en/information-and-services/jobs/searching-for-a-job" },
  federal: { id: "federal-jobs", title: "UAE Federal Government Job Portal", url: "https://www.federalerp.gov.ae/OA_HTML/IrcVisitor.jsp?L=EN" },
  qualifications: { id: "uae-qualifications", title: "UAE Government: Preparing to work", url: "https://u.ae/en/information-and-services/jobs/employment-in-the-private-sector/preparing-to-work" },
  greenhouseFormats: { id: "greenhouse-formats", title: "Greenhouse: Supported candidate upload formats", url: "https://support.greenhouse.io/hc/en-us/articles/360052218132-Supported-formats-for-resumes-cover-letters-and-other-candidate-uploads" },
  greenhouseParse: { id: "greenhouse-parsing", title: "Greenhouse: Unsuccessful resume parse", url: "https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse" },
  microsoft: { id: "microsoft-inspector", title: "Microsoft Support: Inspect documents for hidden information", url: "https://support.microsoft.com/en-gb/office/collab-files/remove-hidden-data-and-personal-information-by-inspecting-documents-presentations-or-workbooks?nochrome=true" },
  interview: { id: "harvard-interview", title: "Harvard MCS: Interviewing", url: "https://careerservices.fas.harvard.edu/resources/interviewing/" },
  workflow: { id: "jobvance-workflow", title: "Jobvance: How the application workflow works", url: "https://jobvance.io/how-it-works" },
  privacy: { id: "jobvance-privacy", title: "Jobvance: Privacy information", url: "https://jobvance.io/privacy" },
} satisfies Record<string, GuideSource>;

type GuideDraft = Omit<CareerGuide, "publishedAt" | "updatedAt" | "readingMinutes">;
export function careerGuideWordCount(guide: Pick<CareerGuide, "summary" | "sections">): number {
  return [guide.summary, ...guide.sections.flatMap(section => [
    ...section.paragraphs, ...(section.bullets ?? []), section.example?.text ?? "",
  ])].join(" ").trim().split(/\s+/).filter(Boolean).length;
}
function publish(guide: GuideDraft): CareerGuide {
  return { ...guide, publishedAt: "2026-10-13", updatedAt: "2026-10-14", readingMinutes: Math.max(1, Math.ceil(careerGuideWordCount(guide) / 200)) };
}

export const careerGuides: CareerGuide[] = [
  publish({
    slug: "cv-job-description-evidence",
    title: "Compare your CV with a job description using evidence",
    description: "Compare a job description with your CV, choose relevant examples and identify the details to add before applying.",
    audience: "All applicants", category: "CV evidence",
    summary: "Put the job description beside your CV and work through the requirements one at a time. This guide shows how to find relevant examples, clarify your contribution and decide what to add or change before preparing the application.",
    takeaways: ["Separate skills, experience and employer conditions.", "Connect each claim to an actual passage.", "Review gaps before rewriting."],
    sections: [
      { heading: "Break the vacancy into decisions", paragraphs: [
        "Read the full vacancy once before editing. Then list its requirements: the work to be done, tools used, experience, qualifications, location, schedule and deadline. A sentence such as 'lead weekly reporting and support budget preparation' describes two responsibilities. Separating them makes it easier to choose a specific example for each.",
        "Mark whether the employer describes a requirement as essential, preferred or unclear. Preserve that wording rather than choosing for them. Visa status, work location and deadlines are decisions to verify; they do not need achievement bullets. Keep the source URL and the date you checked it alongside your notes."
      ] },
      { heading: "Find the passage before changing the phrase", paragraphs: [
        "For every work requirement, copy the closest truthful passage from your CV into a second column. Add a short note explaining the connection. If the vacancy names stakeholder reporting, a passage about preparing monthly reports for department heads may be relevant. A skills list containing 'communication' is weaker evidence because it does not show an action, audience or output.",
        "Use four working labels: clearly supported, related but incomplete, no example found, and needs a human decision. These are editorial notes, not the employer's assessment. Harvard's resume guidance recommends tailoring the emphasis to the position. Our evidence table makes that tailoring traceable without changing what happened."
      ], sourceIds: ["harvard-resume"] },
      { heading: "Resolve ownership and result status", paragraphs: [
        "Ask two questions of every strong-looking match: what did I personally do, and what result actually occurred? Preparing a recommendation is different from approving it. A projected saving is different from a measured saving. A university project is different from paid employment. Those boundaries should remain visible even when you shorten the language.",
        "If the source passage is vague, return to your own records or memory and add a verified detail. Do not let a rewrite fill uncertainty with a confident verb. If you cannot establish the outcome, describe the deliverable and its purpose. You can still show useful work without claiming a result you cannot defend."
      ], example: { label: "Worked example", text: "Vacancy: 'Own monthly forecasting.' Original CV: 'Supported the finance manager by preparing forecast inputs.' Review: related forecasting experience, but ownership is unproven. Truthful revision: 'Prepared forecast inputs and reconciled departmental assumptions for the finance manager's monthly review.' The manager's responsibility has not become the applicant's." } },
      { heading: "Use gaps to make an application choice", paragraphs: [
        "A gap can mean different things. You may have relevant experience that is missing from the CV. You may have related experience that needs a clear explanation. You may genuinely lack an essential qualification. Deal with those cases separately. Adding an example fixes the first case; it cannot fix the third.",
        "When a condition is ambiguous, consider a concise question through the employer's stated channel. When the employer clearly requires a credential you do not hold, record that fact and make a deliberate decision. Do not obscure it with repeated keywords. Save your notes so the same uncertainty does not consume time again next week."
      ] },
      { heading: "Review one role at a time", paragraphs: [
        "Open the original vacancy beside the final CV. Check names, dates, tools, contribution verbs and qualifications. Read the document as a recruiter would: can a person understand the connection without the comparison table? Then review the actual application form, which may ask separate eligibility questions.",
        "You can use Jobvance's free CV check to place vacancy wording beside your CV passages, then review the findings yourself. Matching wording does not verify qualifications or predict an interview. Begin with one vacancy, finish the review, and keep the approved version with that role before moving to another application."
      ], sourceIds: ["jobvance-workflow"] }
    ], sources: [SOURCES.harvard, SOURCES.workflow], relatedSlugs: ["achievements-without-numbers", "cv-check-no-fit-percentage", "first-application-pack"]
  }),
  publish({
    slug: "student-projects-on-cv",
    title: "How to describe student projects on your CV",
    description: "Choose relevant student projects, describe your contribution and turn coursework, internships and activities into clear CV entries.",
    audience: "Students", category: "CV evidence",
    summary: "Projects, internships and activities can show an employer how you work. Start with the tasks you completed and the things you produced, then choose examples that fit the vacancy. This guide helps you write clear entries for coursework, placements, volunteering and student activities.",
    takeaways: ["Name the academic or extracurricular setting.", "Explain your contribution within a team.", "Show outputs and limitations together."],
    sections: [
      { heading: "Inventory work you can explain", paragraphs: [
        "List three to five activities that involved a specific task: a research assignment, society event, coding project, laboratory exercise, internship or part-time job. For each, note when it happened, who was involved, what you did and what you produced. These notes give you material to choose from before polishing the CV.",
        "MIT's career guidance includes projects and unpaid activities among possible resume experiences. Use headings such as 'Academic projects', 'Internship experience' or 'Leadership and activities' to help the reader understand where the work happened. Include the project name, organisation or activity and the dates alongside your contribution."
      ], sourceIds: ["mit-projects"] },
      { heading: "Choose the project for the vacancy", paragraphs: [
        "A relevant project answers a question about the role. For a reporting internship, explain how you cleaned a dataset, checked assumptions and presented findings. For a customer-facing role, a society event may show enquiry handling and coordination. The project title alone rarely explains that connection; the action underneath it does.",
        "Choose the part of the project that matters for this vacancy, then explain it in a few lines. For a data role, the cleaning method or modelling choice may be useful; for an event role, focus on planning and coordination. Include a short context note if you used a synthetic dataset or simulated client brief."
      ] },
      { heading: "Make team contribution visible", paragraphs: [
        "Use 'built', 'tested', 'coordinated' or 'analysed' only for the part you performed. If a teammate built the model and you prepared the presentation, the presentation is your evidence. You can mention the team's broader output while separating it from your action. This gives interviewers an accurate route into the work.",
        "Check whether numbers describe your work, the team or a forecast. A proposed cost reduction in a business case was not achieved by an employer. A mark may demonstrate assessed academic performance, but it does not establish customer impact. Keep each result tied to the setting where it happened."
      ], example: { label: "Worked example", text: "Academic project, retail demand analysis: 'Cleaned a public teaching dataset in Python and compared two forecasting approaches for a four-person coursework team; presented model limitations in the final assessment.' The entry gives the reader a task, a tool, a team context and a contribution to ask about." } },
      { heading: "Keep a small proof folder", paragraphs: [
        "Save a clean project summary, permitted screenshots, your contribution notes and a link to code or a portfolio if useful. Check sharing permissions before adding the link to a CV. A private university folder that requires a student login will not help an external reader, and a public folder may reveal teammates' details.",
        "Do not upload assessment answers or team material you lack permission to share. A short explanation of the task and your method can be enough. Remove personal records from datasets. If you cannot show the original deliverable, prepare a separate, clearly labelled demonstration using invented data rather than exposing private information."
      ] },
      { heading: "Test the entry aloud", paragraphs: [
        "Read each project bullet and explain it without looking at notes. You should be able to describe the task, your choices, a difficulty and the output. If a bullet contains a tool you only watched someone else use, revise the claim. Interview preparation can expose inaccuracies before an application leaves your hands.",
        "Finish with a vacancy check: which requirement does each entry support, and where would another example help? Jobvance's student CV check can help organise that review. Read the wording beside the job description, choose the most relevant entries and approve the CV you want to send. Check any required professional experience separately."
      ] }
    ], sources: [SOURCES.mitProjects], relatedSlugs: ["academic-qualifications-uae-cv", "interview-stories-from-cv", "cv-job-description-evidence"]
  }),
  publish({
    slug: "mba-career-pivot-cv",
    title: "How to adapt your CV for an MBA career pivot",
    description: "Choose a target role, connect your previous work with its responsibilities and show where MBA projects add relevant experience.",
    audience: "MBA candidates", category: "Career direction",
    summary: "Your previous work and MBA projects can give you several ways to explain a career move. Start with the responsibilities of the role you want, then choose the examples that connect your experience to that work. This guide walks through that choice and how to show it on your CV.",
    takeaways: ["Define the next role's actual work.", "Build the bridge from specific past actions.", "Label MBA projects and proposed outcomes."],
    sections: [
      { heading: "Choose a direction before choosing wording", paragraphs: [
        "Write a one-sentence target that names a function and the work you want to do. For example, 'operations analysis focused on process reporting and improvement' gives you more to work with than 'a business role in Dubai'. Use it to compare vacancies and refine the direction as you learn more about the roles.",
        "Compare two or three vacancies in that direction. Identify recurring responsibilities, then separate them from company-specific tools and eligibility conditions. Job titles can cover different work, so read the responsibilities of each role. Use the actual vacancy to decide which examples should lead your CV and which can sit further down."
      ] },
      { heading: "Create a bridge from previous employment", paragraphs: [
        "Map prior actions to the new responsibilities without renaming your old job. A supply-chain coordinator may have evidence of analysis, stakeholder updates and process documentation. Those actions can support an analyst application, while the original title and dates remain accurate. Yale's career guidance describes a professional resume as selectively emphasising relevant experience and transferable skills.",
        "For each connection, name the experience you can bring and the context you would be learning. Preparing internal reports, for example, can show analysis and communication relevant to consulting. Explain the reports, the audience and your part in the work, then consider what you would need to learn about working with external clients."
      ], sourceIds: ["yale-transition"] },
      { heading: "Use MBA evidence for the right claim", paragraphs: [
        "An MBA project can show structured research, financial modelling, synthesis or presentation. Give it a clear setting: a case exercise, independent project, student consulting engagement or employer-sponsored assignment. If an external organisation was involved, check how you may describe it. Use an 'MBA projects' heading and explain your role within the team.",
        "Describe the status of recommendations. A modelled return is a forecast, a pilot is a test, and an accepted presentation is not an implemented transformation. Keep prior workplace outcomes and academic outputs in separate entries. Readers should not have to guess which organisation benefited or whether the proposal ever left the classroom."
      ], example: { label: "Worked example", text: "A former procurement coordinator applies for an operations analyst role. Employment evidence: 'Prepared supplier performance reports for quarterly reviews.' MBA evidence: 'Compared inventory scenarios in a team case project and presented a proposed replenishment policy.' The proposed policy is not described as a delivered cost saving." } },
      { heading: "Write a short pivot explanation", paragraphs: [
        "Use three linked ideas in a cover-letter paragraph: your relevant prior action, what the MBA added, and why this vacancy is a sensible next step. Avoid saying the degree makes you ready for every responsibility. Name the work that interests you and one or two examples supporting it. The reader can then judge the connection.",
        "Check for vague ambition words such as 'dynamic', 'strategic' and 'passionate'. Replace them with an action or decision where possible. If the pivot also changes industry, function and seniority, explain those choices separately in your own planning notes. You may discover that an intermediate role offers a clearer bridge than the first title you imagined."
      ] },
      { heading: "Validate the story across documents", paragraphs: [
        "Read your CV, application answers and recruiter draft together. They should tell the same story about dates, seniority, contribution and project status. A cautious CV loses credibility if a message suddenly claims you led transformations. Keep one approved statement of the pivot that you can adapt without expanding its factual claims.",
        "Prepare one vacancy first. Use Jobvance's MBA workflow to bring prior work and projects into the review, then check every suggested phrase yourself. Keep the unanswered requirements as questions or development needs. Your next action is to complete one defensible packet, not to produce a general CV that promises expertise in every post-MBA direction."
      ] }
    ], sources: [SOURCES.yale], relatedSlugs: ["role-filtering-before-applying", "truthful-recruiter-drafts", "student-projects-on-cv"]
  }),
  publish({
    slug: "confidential-career-switch",
    title: "Plan a confidential job search alongside your current job",
    description: "Plan your contact details, application documents and profile visibility for a job search alongside your current role.",
    audience: "Working professionals", category: "Privacy & troubleshooting",
    summary: "Plan where you will prepare applications, which contact details you will use and what you want recruiters to see. A few decisions made before you start can make a discreet job search easier to manage alongside your current role. Begin with a shareable CV and a way to keep track of who has received it.",
    takeaways: ["Use personal contact details and permitted information.", "Check visibility settings and their limits.", "Confirm references and availability deliberately."],
    sections: [
      { heading: "Separate personal search activity", paragraphs: [
        "Use an email address and phone number you control for applications. Choose a preparation time and device that fit your employer's policies. For your CV, write a shareable description of the work you did, using your own notes rather than moving confidential reports into personal storage.",
        "Make a small list of contact preferences: suitable calling windows, personal email, and whether an initial message is preferable to an unexpected call. Share these where appropriate with a recruiter. Keep the wording practical. A request for discretion explains your preference, but it cannot prevent a recipient from forwarding information or contacting someone else."
      ] },
      { heading: "Review public visibility deliberately", paragraphs: [
        "Check your job-search status, profile changes and publicly visible contact details before updating them. LinkedIn states that its recruiters-only Open to Work setting takes steps to hide the signal from recruiters at your current company, while not guaranteeing complete privacy. Read the current help page and setting descriptions rather than relying on an old screenshot.",
        "Choose visibility based on the exposure you can tolerate. If you are uncomfortable with a public signal, you can still research roles and prepare private applications. Avoid assuming that every connected person will keep your plans confidential. A platform setting and a human discretion request address different parts of the problem."
      ], sourceIds: ["linkedin-privacy"] },
      { heading: "Write evidence without revealing protected details", paragraphs: [
        "Remove customer names, unpublished product plans, security details and sensitive commercial terms unless you have permission to disclose them. Replace them with an accurate general description only when that description is allowed. 'Regional distributor' can explain context, but it should not be a disguise that still identifies a confidential client through several other details.",
        "Focus on your action and deliverable. When a result cannot be shared, describe the workflow or purpose rather than fabricating a safe-looking number. Keep a private note of why the detail was omitted so later rewrites do not reintroduce it. Apply the same review to cover letters, portfolios and interview stories."
      ], example: { label: "Worked example", text: "Original private note: 'Prepared the renewal analysis for Client Delta using unpublished pricing.' Public CV: 'Prepared renewal analysis and scenario summaries for the account team's review.' The candidate checks employer policy before using even the general description and shares no pricing workbook." } },
      { heading: "Handle references and notice questions", paragraphs: [
        "Ask a potential referee before giving their contact details. Explain the stage of your search and the kind of work they can accurately discuss. If an application asks to contact your current employer, read the wording carefully and ask about timing through the employer's channel when needed. Do not provide a colleague's number as a surprise workaround.",
        "State your availability using your actual situation. Avoid promising an immediate start if you have unresolved obligations. Requirements can depend on your contract, jurisdiction and employer arrangements; verify them with an appropriate qualified source before making an employment decision. Application preparation alone is not a reason to resign or change immigration status."
      ] },
      { heading: "Keep the next action small", paragraphs: [
        "For the coming week, choose one verified vacancy, a clean CV copy and one suitable communication window. Store the version under a neutral, understandable filename. Before attaching it, inspect the email recipients and document contents. Small review steps protect against accidental disclosure more effectively than relying on a single privacy setting.",
        "Jobvance can help organise approved career facts and application drafts, but your sharing decisions remain yours. Read the privacy information before uploading material, remove restricted information from the source text and use the public contact page if you need help understanding the workflow. Start with a minimal, shareable record."
      ], sourceIds: ["jobvance-privacy"] }
    ], sources: [SOURCES.linkedin, SOURCES.privacy], relatedSlugs: ["resume-privacy-before-upload", "job-search-time-plan", "achievements-without-numbers"]
  }),
  publish({
    slug: "role-filtering-before-applying",
    title: "Filter roles before spending time on an application",
    description: "Create a manageable job shortlist by checking responsibilities, essential conditions and the time each application needs.",
    audience: "All applicants", category: "Career direction",
    summary: "Before rewriting your CV, decide which vacancies deserve a closer look. Check the work, the practical conditions and the experience you can offer. A short note explaining why you want to apply, ask a question or move on will help you pick the next application.",
    takeaways: ["Check essential conditions before tailoring.", "Separate unknowns from clear mismatches.", "Choose a next action for each saved role."],
    sections: [
      { heading: "Define a small search brief", paragraphs: [
        "Write down the function, likely seniority, preferred locations and work arrangement you are considering. Add practical boundaries such as commuting tolerance, internship dates, study schedule or compensation questions. Keep preferences separate from conditions you cannot change. This distinction lets you explore adjacent roles without forgetting constraints that matter to your life.",
        "Use the brief to select search terms, then inspect actual descriptions. A title is a clue rather than a complete definition. 'Associate' can describe very different levels across organisations. A role called 'analyst' may involve sales, reporting or operational support. Read the responsibilities before deciding the title matches your direction."
      ] },
      { heading: "Run a conditions check first", paragraphs: [
        "Review explicit location, schedule, qualification, language, experience and application-deadline requirements. Record the employer's wording. If a condition is essential and you clearly do not meet it, decide whether the application is still justified or should be excluded. Do not spend an hour polishing a CV before noticing a condition that determines the decision.",
        "Use 'unknown' when the listing does not answer a question. Missing salary information is not evidence of a suitable salary. A UAE location does not explain all work-authorisation arrangements. For questions that materially affect your decision, look for the employer's published guidance or use the stated recruitment channel to request clarification."
      ] },
      { heading: "Identify your strongest and weakest evidence", paragraphs: [
        "Select the three responsibilities most central to the role. For each, note your closest example and the remaining gap. Keep the original context: academic, internship, previous employment or volunteering. This is a quick screening note, not a finished CV. You are deciding whether a deeper review has a useful purpose.",
        "Yale's resume guidance recommends emphasising experience relevant to a prospective employer. Our shortlist adds an earlier decision: whether that relevant evidence is strong enough to justify preparation time. A transferable action may support a pivot while a required licence remains absent. Do not combine those distinct observations into a percentage."
      ], sourceIds: ["yale-transition"], example: { label: "Worked example", text: "A working operations coordinator saves two vacancies. Role A asks for reporting and process documentation, both supported by prior work; an unfamiliar tool needs review. Role B requires a professional licence the candidate does not hold. The shortlist records 'review A' and 'exclude B: required licence absent', rather than giving both a fit score." } },
      { heading: "Assign a next action, not a vague bookmark", paragraphs: [
        "Use a few understandable states: review now, verify a condition, revisit later or exclude. Add one reason and one next action. 'Verify work location with employer before Friday' is actionable; 'interesting' is not. If there is no action worth taking, remove the role from the active list so it does not keep competing for attention.",
        "Consider the application cost. A lengthy task, multiple essays or an approaching deadline changes what can realistically fit in your week. This does not mean lengthy applications are poor opportunities. It means you should allocate time deliberately and avoid beginning more packets than you can review responsibly."
      ] },
      { heading: "Recheck before preparing and before submitting", paragraphs: [
        "Open the original listing when you begin the packet and again before submission. Confirm it is still available and the requirements have not changed. Save the checked date and role reference. A job-board copy may remain accessible after the employer has closed the vacancy, so use the employer's destination where possible.",
        "Choose one role from the active shortlist and compare the CV evidence in Jobvance's free check. If you use the Job Loop, save confirmed career facts and keep each role's packet separate. You decide which roles to apply for and complete submission yourself. A short, deliberate list is a starting point for action, not a hiring forecast."
      ] }
    ], sources: [SOURCES.yale], relatedSlugs: ["verify-job-listing-source", "cv-job-description-evidence", "job-search-time-plan"]
  }),
  publish({
    slug: "verify-job-listing-source",
    title: "Verify a job listing before sharing your CV",
    description: "Find the original vacancy, check the employer and application destination, and save the details you have confirmed.",
    audience: "All applicants", category: "UAE job search",
    summary: "Before sharing your CV, find out who is recruiting, where the application goes and whether the role is still listed. Start with the employer or agency, then check the vacancy details and contact instructions. Keep the original link and any questions you still need answered with your application notes.",
    takeaways: ["Trace the role to an employer or identifiable agency.", "Check the application destination separately.", "Keep unresolved questions visible."],
    sections: [
      { heading: "Start with the originating organisation", paragraphs: [
        "Capture the employer name, job title, reference number, location and source URL. Then find the organisation's website independently rather than following only the link in a message. Look for a careers page, the vacancy reference or a recognised recruitment channel. If an agency is involved, identify the agency and its published contact information.",
        "A copied logo or a familiar employer name does not establish authenticity. Compare the role details across the source and employer destination. Differences may have innocent explanations, but they still need resolving. If you cannot establish who owns the listing, keep it outside your active application queue until you have a useful answer."
      ] },
      { heading: "Inspect the destination before uploading", paragraphs: [
        "Read the actual website address and the requested information. A third-party application system may be legitimate when linked from the employer's site. The important connection is evidence that the employer directs applicants there. A similar-looking domain reached from an unsolicited message deserves a separate check.",
        "Decide whether each requested item is proportionate to the stage. A CV and role questions are different from a bank login, a payment request or an identity document sent through a casual chat. Pause when the process is unclear. Use published organisational contact details to verify the request, rather than the contact details supplied only by the questionable sender."
      ] },
      { heading: "Distinguish a listing from a formal offer", paragraphs: [
        "A job advertisement, interview invitation and formal employment offer are different records. UAE Government fraud guidance explains that a relevant MoHRE job offer can be checked using its reference number through the official enquiry service. Read the official guidance for your situation; the advertisement itself is not that formal offer.",
        "Keep a record of what you actually checked. 'Employer careers page links to this role' is stronger and more precise than 'safe'. No checklist can guarantee that every subsequent interaction is legitimate. Recheck when a new sender, payment request, document request or application destination appears. A source check is part of the process, not a permanent badge."
      ], sourceIds: ["uae-fraud"], example: { label: "Worked example", text: "A candidate finds 'Graduate Operations Associate' on a social post. The employer's careers page contains the same reference and links to an external application system. The candidate records that route and applies there. A later message requesting payment through a personal account is treated as a new, unverified request." } },
      { heading: "Save a compact evidence note", paragraphs: [
        "Use a note with the original link, employer destination, role reference, checked date and any unresolved condition. Save a permitted copy of the description for your own preparation if the platform allows it. This helps you distinguish a changed listing from a misunderstanding when you review the role later.",
        "Avoid collecting more personal data than you need. You do not need to investigate employees' private profiles to check a vacancy. Official careers pages, published organisational contacts and government services are more appropriate starting points. If a source is inaccessible, mark that limitation rather than describing a search result snippet as a full review."
      ] },
      { heading: "Prepare only after the source check", paragraphs: [
        "Once you have a credible application route, read the full requirements and decide whether the role deserves a packet. Source credibility does not establish your eligibility or the attractiveness of the role. Those are separate checks. Keeping them separate prevents a legitimate employer name from overriding an unsuitable requirement or an unrealistic timeline.",
        "In Jobvance, keep the real source link with the vacancy you review. Use the free check for your CV and the Job Loop for a deliberate shortlist when available. You still inspect the employer destination, approve the materials and submit them yourself. If a source cannot be confirmed, the next action is verification, not a stronger cover letter."
      ] }
    ], sources: [SOURCES.fraud], relatedSlugs: ["uae-job-search-sources", "role-filtering-before-applying", "resume-privacy-before-upload"]
  }),
  publish({
    slug: "achievements-without-numbers",
    title: "How to write CV achievements without numbers",
    description: "Write specific CV bullets using the task, your actions, the scope of your work and what you produced.",
    audience: "All applicants", category: "CV evidence",
    summary: "You can write a useful CV bullet without a percentage. Describe the task, what you did and who used the result. This guide shows how to find those details in everyday work and turn them into examples you can explain in an interview.",
    takeaways: ["Describe the action, context and output.", "Use numbers only when their basis is clear.", "Keep estimates and forecasts labelled."],
    sections: [
      { heading: "Recover the task behind the job title", paragraphs: [
        "Choose one recurring task or completed piece of work. Ask what triggered it, what you did and who used the output. 'Responsible for reporting' describes an area of work. 'Prepared monthly stock reports for the operations review' describes an action, timing and audience. The latter gives a reader something concrete to evaluate.",
        "MIT's resume guidance uses project, action and result to structure accomplishment statements. A result can be a completed deliverable or a documented change; it does not have to be a revenue number. Use the framework to recover detail, then decide which detail belongs on a short CV entry."
      ], sourceIds: ["mit-bullets"] },
      { heading: "Use scope that you can verify", paragraphs: [
        "Look for factual dimensions of the task: reporting frequency, type of stakeholders, documents prepared, systems used or stages coordinated. These details can make an entry specific even when the business outcome was not measured. A verified count may help, but do not add one merely to make the sentence look more impressive.",
        "Be careful with approximations. If you can only remember that an event had several speakers, naming the event and your responsibility may be sufficient. If an estimate is necessary and defensible, label it as approximate and keep the basis in your private notes. Avoid turning a memory into an exact figure through repeated rewriting."
      ] },
      { heading: "Separate useful work from causal claims", paragraphs: [
        "Preparing a guide that colleagues used is a concrete contribution. Claiming that the guide increased productivity requires additional evidence. Ask whether you observed the outcome, whether it was measured and whether your work was responsible for it. If you cannot answer, describe the output and use rather than the unproven business effect.",
        "The same rule applies to teamwork. You can write that you contributed analysis to a team decision without claiming the entire decision's impact. If a manager confirmed that a process was adopted, describe adoption accurately. Avoid broad phrases such as 'transformed operations' when the evidence is a small but valuable improvement."
      ], example: { label: "Worked example", text: "Weak: 'Increased efficiency by 30%.' No measurement exists. Truthful: 'Created a handover checklist covering outstanding orders, owners and next actions; the shift team used it during daily handovers.' The revised bullet explains the work and its use without inventing a productivity result." } },
      { heading: "Choose verbs that preserve your role", paragraphs: [
        "Ownership verbs deserve particular attention. 'Led', 'owned' and 'delivered' may imply responsibility beyond the task you performed. 'Prepared', 'tested', 'coordinated' and 'supported' can still describe substantial work. Select the verb based on your action, then make the object specific enough that the contribution does not disappear behind modest wording.",
        "If the work was incomplete, say what stage you reached. A prototype, recommendation or draft is a real output with a defined status. A proposed saving should remain proposed. Do not remove that qualifier to save space. Shorten the surrounding sentence instead, because status changes alter the factual meaning."
      ] },
      { heading: "Create a repeatable evidence note", paragraphs: [
        "For each final bullet, keep a private note with the task, your action, result status and any number's source. This note does not need to contain confidential documents. Its purpose is to help you avoid expanding the claim when a later vacancy asks for more senior responsibilities.",
        "Read the entry aloud and answer an imagined follow-up: 'How do you know?' If the answer is clear, compare the bullet with the target vacancy. Jobvance's free CV check can help identify where an example is relevant or incomplete. Keep the specific evidence and resist adding metrics to satisfy a template. A truthful, useful sentence is the objective."
      ] }
    ], sources: [SOURCES.mitBullets], relatedSlugs: ["cv-job-description-evidence", "interview-stories-from-cv", "truthful-recruiter-drafts"]
  }),
  publish({
    slug: "first-application-pack",
    title: "What to include in your first job application",
    description: "Use the employer’s instructions to prepare your CV, application answers and any other documents the role requires.",
    audience: "All applicants", category: "Application workflow",
    summary: "Start with what the employer asks for: a CV, the application questions and any requested documents. Keep them together for one vacancy, then review the details before submitting. This guide helps you work out what to prepare and what can wait.",
    takeaways: ["Read the employer's requested materials first.", "Prepare one role-specific packet.", "Approve the exact files you will submit."],
    sections: [
      { heading: "Capture the instructions in one place", paragraphs: [
        "Open the employer's application page and note the role reference, deadline, accepted files and required questions. Check whether a cover letter, portfolio or qualification document is mandatory or optional. Use that list as your checklist, so you spend your preparation time on the materials this employer needs.",
        "Write a short completion list for this role. Include practical tasks such as checking a portfolio link or confirming the time zone of a deadline. If a requirement is unclear, resolve it before preparing the wrong document. Keep the employer's instructions beside your working files so they do not get lost between browser tabs."
      ] },
      { heading: "Establish your factual source record", paragraphs: [
        "Use your existing CV and a compact set of career notes as the source. Confirm dates, job titles, qualifications, contribution and result status. A student can include projects and activities with their setting labelled. An MBA candidate can keep prior employment separate from case work. An experienced applicant should remove restricted employer information before using it in a draft.",
        "The source record should save repeated explanation, not become another application form to perfect. Start with facts required for this vacancy. You can improve the reusable record over time. If a fact is uncertain, mark it for review instead of letting a tool choose a confident version that later appears in every document."
      ] },
      { heading: "Prepare only the requested outputs", paragraphs: [
        "Review the CV against the responsibilities and reorder relevant evidence where useful. For a required cover letter, choose a small number of examples explaining the connection. For application questions, answer the question directly and respect its length limit. Harvard's guidance recommends concise, factual letters tailored to the organisation; more pages are not automatically more helpful.",
        "Keep an optional recruiter message separate from the employer's application. The message may open a conversation, but it does not replace submission through a required channel. Avoid attaching several versions of the same CV and asking the recipient to choose. Select and approve the version intended for the role."
      ], sourceIds: ["harvard-resume"], example: { label: "Worked example", text: "A graduate vacancy asks for a PDF CV and two short answers, with no cover letter field. The candidate prepares those three items, checks that academic projects are labelled, and saves the role reference. They do not spend the evening writing an unrequested three-page letter or creating multiple competing CV versions." } },
      { heading: "Review meaning before appearance", paragraphs: [
        "Read every claim across the packet. Check that a message does not exaggerate a careful CV bullet, and that a form answer uses the same dates and degree status. Confirm availability and eligibility answers from your actual situation. An attractive layout cannot compensate for a contradiction about your experience or qualifications.",
        "Then open the exported file and inspect page breaks, missing characters, contact details and links. Check the filename and attachment selection. If the form fills fields from the CV, review those fields separately. A successful upload confirms that a file arrived; it does not confirm that all extracted information is correct."
      ] },
      { heading: "Submit and record the actual event", paragraphs: [
        "Complete submission through the employer's stated route. Keep any confirmation reference or email, the submitted CV version and the date. Mark the application as submitted only after the employer's system or another reliable record confirms it. A prepared pack is not an application, and a downloaded file is not a receipt.",
        "Jobvance's free check helps with the CV review; the Job Loop can organise role-specific CVs and drafts when configured. You approve the materials and send or submit them yourself. Start with one vacancy, complete its packet and keep its record. If you need help, use the public contact page before adding unnecessary information or beginning another run."
      ], sourceIds: ["jobvance-workflow"] }
    ], sources: [SOURCES.harvard, SOURCES.workflow], relatedSlugs: ["reuse-second-application", "cv-pdf-or-docx", "application-tracking-follow-up"]
  }),
  publish({
    slug: "reuse-second-application",
    title: "How to reuse your CV for a second application",
    description: "Use your reviewed experience as a starting point, then adapt the examples, documents and message for another vacancy.",
    audience: "All applicants", category: "Application workflow",
    summary: "Keep the dates, qualifications and experience you have already checked. For the next vacancy, choose the examples that matter most and review the employer’s submission instructions. Reusing that work gives you a starting point while keeping each application specific to the role.",
    takeaways: ["Reuse facts rather than employer-specific assumptions.", "Compare what changed between vacancies.", "Keep separate approved versions and receipts."],
    sections: [
      { heading: "Separate stable facts from role decisions", paragraphs: [
        "Employment dates, qualifications, your contribution and completed work can carry into the next application. The order of your examples, the emphasis and the requested documents may change. Keep a reviewed record of the facts alongside your notes for each vacancy, so you can update the application without checking the same details from scratch.",
        "After the first application, correct the career record if review exposed a missing detail. Preserve important boundaries such as supporting versus leading, academic versus professional work, and projected versus achieved results. Reuse those confirmed facts in the second packet. Do not make the record more senior because the new vacancy has a more senior title."
      ] },
      { heading: "Read the second vacancy from the source", paragraphs: [
        "Verify the new role's source, availability and conditions. Compare its three central responsibilities with the first role. Note where the same example is relevant, where a different example is better and where there is no evidence. This comparison helps you adapt deliberately rather than replacing the employer name in a previous document.",
        "Check the application channel again. The second employer may request a different file format, questions or portfolio. A CV that was accepted by the first portal is not proof that the second accepts it. Treat the employer's current instructions as the guide for this submission."
      ] },
      { heading: "Change emphasis without changing history", paragraphs: [
        "For one role, your strongest example may be reporting; for another, process coordination. You can reorder truthful bullets and add verified context that helps the reader understand the connection. Keep job titles, dates and ownership stable. A different emphasis should still describe the same person and the same work.",
        "Review any generated draft against the career record, not only against the first application's polished CV. The polished version may have omitted useful context. Returning to the source reduces the chance that repeated paraphrasing removes qualifiers or changes an academic recommendation into a business outcome."
      ], example: { label: "Worked example", text: "For an analyst vacancy, a candidate leads with 'Prepared monthly performance reports.' For a coordination vacancy, they lead with 'Maintained action logs and followed up with workstream owners.' Both actions came from the same job. Neither version changes 'supported the programme manager' into 'owned the programme'." } },
      { heading: "Search for leftovers across the packet", paragraphs: [
        "Check employer name, role title, location, reference number and addressee in every document. Inspect filenames and email subject lines as well as body text. Search for the first employer's name in the working files before exporting. It is easy to correct a visible heading while leaving an old reference inside a paragraph.",
        "Then check factual consistency. A cover-letter draft may have been adapted more aggressively than the CV. Form answers may still describe the first role's availability. Review the packet together, because the employer will see its parts as one application even if you prepared them at different times."
      ] },
      { heading: "Keep two applications as two records", paragraphs: [
        "Save the approved second CV under a role-specific filename and keep the submitted version with its application record. Do not overwrite the first employer's packet. When an interview arrives, you need to know what that employer received. Store submission status and follow-up dates separately from preparation status.",
        "Jobvance's Job Loop uses a reusable career record to prepare separate role packets, subject to configured connections. You review and approve each packet. If you are using only the free check, bring the new vacancy and review it independently. Your next action is to approve the second role's exact files, then submit through its required channel yourself."
      ], sourceIds: ["jobvance-workflow"] }
    ], sources: [SOURCES.workflow], relatedSlugs: ["first-application-pack", "cv-job-description-evidence", "application-tracking-follow-up"]
  }),
  publish({
    slug: "cv-pdf-or-docx",
    title: "Should you send your CV as PDF or DOCX?",
    description: "Choose a CV format from the employer’s upload instructions, check the exported file and review any fields filled by the portal.",
    audience: "All applicants", category: "Application workflow",
    summary: "Check the employer’s upload instructions first. If both PDF and DOCX are accepted, open each exported file and choose the one that presents your CV clearly in that application. Then review any form fields filled from the document before you submit.",
    takeaways: ["Follow the current application instructions.", "Inspect the exported file and selectable text.", "Review auto-filled fields after uploading."],
    sections: [
      { heading: "Read the upload rules before exporting", paragraphs: [
        "Look for accepted file types, maximum size and any employer preference, and save those instructions with the role. Export a copy in the requested format. Check whether portfolios or other materials have their own upload fields or link fields, so the CV contains the material intended for it.",
        "Greenhouse documents support for several candidate file formats, including PDF and DOCX. That is information about one system, not a rule for every employer. An organisation may use another platform or configure a different process. The instructions visible in the application you are completing should guide your choice."
      ], sourceIds: ["greenhouse-formats"] },
      { heading: "Check the real exported file", paragraphs: [
        "Open the file you plan to submit, preferably in a viewer separate from the editor. Check every page for clipped text, missing symbols, broken links and unexpected blank pages. Read the contact details and filename. An editor preview is not enough if the export uses different fonts or changes line wrapping.",
        "Try selecting and copying a few passages from the PDF into a plain-text note. This can reveal image-only text or a confusing reading order. It is a useful inspection, not a certification of every employer's parser. For DOCX, check that tracked edits and comments are resolved in the shareable copy."
      ] },
      { heading: "Keep the structure understandable", paragraphs: [
        "Use headings that a person can understand, consistent dates and an orderly reading path. Avoid placing essential information only inside decorative graphics. If a design makes it hard to copy or read the text, simplify it. A readable file helps your own review as well as the employer's process.",
        "Greenhouse's parsing guidance identifies issues including image resumes, complex layouts and contact information in headers or text boxes. This illustrates why file acceptance and field extraction are separate questions. Do not turn those examples into a universal claim that one particular template passes all applicant tracking systems."
      ], sourceIds: ["greenhouse-parsing"], example: { label: "Worked example", text: "An applicant has a two-column PDF that looks clear on screen, but copied text alternates between education and employment. They create a simpler version, export it again and inspect the result. The decision follows an observed reading-order problem, not a promise that a single-column CV guarantees selection." } },
      { heading: "Review the portal's interpretation", paragraphs: [
        "After upload, inspect any fields populated from the CV. Check employer names, titles, dates, education and contact details. Correct mistakes where the form allows it. Do not assume that an upload success message means the extracted record is accurate. Read the remaining questions too; the employer may require information that is not present in the document.",
        "If extraction fails but the attachment is accepted, follow the portal's guidance about manual entry or alternate files. Avoid repeated blind uploads. Change one thing at a time and record the result. If the form is unusable, use the employer's published recruitment support route and describe the specific error."
      ] },
      { heading: "Keep both formats under version control", paragraphs: [
        "You can retain PDF and DOCX copies of the same approved CV for different submission requirements. Give them matching role and version names so you can tell they contain the same reviewed content. When you change a fact, export both again if you need both; otherwise one can silently become stale.",
        "Jobvance's review flow lets you approve your CV before downloading available formats. Open the downloaded file and check it before attaching it. The next step is to satisfy the employer's actual upload instructions and review the form's fields. A successful export is one preparation step, not proof of compatibility with every recruitment system."
      ], sourceIds: ["jobvance-workflow"] }
    ], sources: [SOURCES.greenhouseFormats, SOURCES.greenhouseParse, SOURCES.workflow], relatedSlugs: ["cv-upload-failure-checklist", "resume-privacy-before-upload", "first-application-pack"]
  }),
  publish({
    slug: "cv-check-no-fit-percentage",
    title: "How to review a CV match score",
    description: "Look beyond a CV match percentage to check the examples, missing details and job requirements behind it.",
    audience: "All applicants", category: "CV evidence",
    summary: "If a CV tool gives you a match score, look at the comparison behind the number. Which requirements have a relevant example, and which need more detail? This guide helps you use the underlying text to review your application and understand what a percentage leaves out.",
    takeaways: ["Ask what a result measures.", "Inspect the passage behind each finding.", "Separate document review from hiring decisions."],
    sections: [
      { heading: "Identify the question the check can answer", paragraphs: [
        "Start with the question you need answered: which requirements in this vacancy can I support with my experience? A text comparison can help you find related passages and missing examples. Read those passages before acting on a score, then check the responsibilities and eligibility conditions in the original vacancy.",
        "Jobvance's free check shows findings such as direct wording found, related passage, no passage found and manual review needed. These labels describe a document comparison. Read the method explanation and the passages rather than turning the counts into a percentage of qualification. A direct match remains something you need to verify."
      ], sourceIds: ["jobvance-workflow"] },
      { heading: "Watch for the same words doing different work", paragraphs: [
        "A vacancy might ask for leading a team while your CV describes supporting a team lead. Both contain related words, but the responsibilities differ. A listed tool is different from an example of using that tool. An academic project can show skill without proving a stated requirement for professional experience.",
        "Read the context around every apparent match. Check the verb, setting, time period, result and your contribution. If a tool displays a passage without explaining the connection, supply that explanation yourself. It may be relevant, partial or misleading. Similar wording should begin the review, not end it."
      ] },
      { heading: "Separate document gaps from experience gaps", paragraphs: [
        "No passage found may mean the CV omitted useful experience. It may also mean the check missed a synonym or that the experience is absent. Start by asking whether you have a truthful example. Add one if you do, with enough context for a person to understand it. Do not insert the vacancy's phrase as an unsupported claim.",
        "If the experience is absent, decide what that means for this role. A preferred tool may be a development question; an essential professional licence is a different condition. Preserve the employer's wording. The comparison tool does not decide which requirements the employer will relax or what evidence they will accept."
      ], example: { label: "Worked example", text: "A CV and vacancy both mention 'financial modelling'. The candidate's evidence is a classroom case using teaching data, while the role asks for several years of investment modelling work. The shared phrase is useful to discuss, but it does not establish the required professional background or justify a high hiring-probability score." } },
      { heading: "Review the employer's process independently", paragraphs: [
        "Application systems vary. Greenhouse documents that some layouts and file structures can cause incomplete parsing. That is a reason to inspect extracted fields, not evidence for a universal 'ATS pass' percentage. File readability, relevant experience and employer selection are separate parts of an application.",
        "Do not optimise a document by hiding keywords or repeating requirements without examples. A person still needs to understand your contribution, and form answers may ask for eligibility separately. Keep the document readable and the facts consistent. If a check fails to recognise an accurate passage, consider clearer wording rather than changing the underlying claim."
      ], sourceIds: ["greenhouse-parsing"] },
      { heading: "Make a decision from a short evidence note", paragraphs: [
        "Before applying, write three observations: the strongest relevant example, the most important unresolved requirement and the next action. This produces a decision you can explain. A number alone cannot tell you whether to verify a qualification, add a missing passage, ask a question or leave the role aside.",
        "Use the free CV check as a starting point, review every finding and approve the wording yourself. Keep any remaining gap visible. The useful outcome is a truthful CV and a deliberate application choice. Neither a document check nor a rewrite can guarantee an interview, a job or how an employer will assess your application."
      ] }
    ], sources: [SOURCES.workflow, SOURCES.greenhouseParse], relatedSlugs: ["cv-job-description-evidence", "role-filtering-before-applying", "cv-pdf-or-docx"]
  }),
  publish({
    slug: "application-tracking-follow-up",
    title: "How to track applications and plan follow-ups",
    description: "Record each application, keep its CV version and confirmation, and choose a follow-up date from the employer’s instructions.",
    audience: "All applicants", category: "Application workflow",
    summary: "Keep the vacancy, the CV you sent and the next action together. Record when you submit, add the employer’s reply or portal update, and set a follow-up date when the process calls for one. A useful tracker should let you return to an application without reconstructing what happened.",
    takeaways: ["Record submission only when it is confirmed.", "Keep each employer's version and reference.", "Follow the stated timeline and channel."],
    sections: [
      { heading: "Choose states that describe observable events", paragraphs: [
        "Use a short set of states such as saved, preparing, ready, submitted, interview, closed and withdrawn. Keep a downloaded CV under preparation until you submit it. Then save the portal confirmation or sent application email with the record, along with any next step or uncertainty you want to return to.",
        "Avoid too many states that you cannot consistently distinguish. The tracker is there to reduce repeated checking. For each active application, keep the employer, role, source, reference, submitted date and next action. If a detail is unknown, write that explicitly rather than filling it with an assumption to make the row look complete."
      ] },
      { heading: "Preserve the exact packet", paragraphs: [
        "Save the CV, cover letter and relevant answers that the employer received. Store them under a role-specific name or link them to the record. When an interview arrives, revisit that version. Your latest general CV may contain different examples, and preparation is easier when you know what the interviewer has seen.",
        "Keep confirmation emails or reference numbers where you can find them. A message saying a draft is ready is not a submission receipt. If submission was interrupted, check the employer's portal or confirmation channel before trying again. Record the uncertainty until you have evidence of the outcome."
      ] },
      { heading: "Base reminders on the employer's timeline", paragraphs: [
        "If the employer gives a date for the next stage, record it with the source of that promise. If they ask applicants not to contact them, respect that instruction. If no timeline exists, choose a personal review date to check the application status; a review date does not automatically require sending a message.",
        "After an interview, ask how the next stage will work and when you may expect an update. Harvard's interview guidance recommends clarifying next steps. Use that answer to plan a follow-up. Keep dates in the relevant time zone, especially when interviews or deadlines involve another country."
      ], sourceIds: ["harvard-interview"], example: { label: "Worked example", text: "An interviewer says the team expects an update by Thursday. The candidate records the date and waits through that period. On the next working day, they use the existing email thread for one concise status question. They do not send daily messages or contact unrelated employees." } },
      { heading: "Write a follow-up with a clear purpose", paragraphs: [
        "A useful follow-up identifies the role and reference, states the relevant event and asks one question. Check the addressee and use the channel the employer provided. Do not imply a personal connection you do not have. If you send from an existing thread, confirm the recipients still match the intended conversation.",
        "Avoid adding urgency that is not real or repeating the entire CV. A genuine competing deadline can be stated accurately and politely. If there is no new information or unanswered practical question, another message may not be useful. Choose the next action from the situation rather than a fixed messaging quota."
      ] },
      { heading: "Review the tracker once a week", paragraphs: [
        "Check active deadlines, unresolved submissions and interview preparation needs. Close roles that are explicitly no longer available or that you have chosen to withdraw from. Keep silence separate from rejection. You can archive inactive rows for your own organisation without claiming to know the employer's decision.",
        "Jobvance can help keep preparation and next actions together; connected reply features depend on setup. You still review the status and send messages yourself. If you use a spreadsheet instead, the same event-based method works. Your next step is to correct one uncertain row and assign one real action, not to build a larger dashboard."
      ] }
    ], sources: [SOURCES.interview], relatedSlugs: ["first-application-pack", "truthful-recruiter-drafts", "cancelled-partial-job-loop-runs"]
  }),
  publish({
    slug: "interview-stories-from-cv",
    title: "Turn your CV into clear interview stories",
    description: "Choose examples from your CV and prepare concise interview answers about the situation, your actions and the outcome.",
    audience: "All applicants", category: "CV evidence",
    summary: "Start with a CV bullet and build the story an interviewer may ask you to explain. Set out the situation, what you needed to do, the choices you made and what happened next. A small collection of examples will help you prepare for different questions using experience you already know.",
    takeaways: ["Prepare stories from the submitted CV.", "Make your own action distinct from the team's.", "Practise follow-up questions and limitations."],
    sections: [
      { heading: "Choose a small evidence bank", paragraphs: [
        "Choose four or five experiences that cover different kinds of work: solving a problem, coordinating people, learning something, handling a setback and producing a useful result. Use the CV version you sent to this employer. For each example, note your part, a decision you made and a detail that helps explain the outcome.",
        "Students can use a coursework or activity example when the question permits it, with that context clear. MBA candidates can distinguish prior employment from case work. Professionals can choose an example whose details are permitted to share. Start with work you know well enough to explain the choices, not only the final result."
      ] },
      { heading: "Build a clear sequence", paragraphs: [
        "Write brief notes for the situation, task, action and result. Harvard's interview guidance asks applicants to explain their own actions and outcomes in a specific situation. Use the structure as an organising aid. You do not need to announce its headings or recite a memorised script to the interviewer.",
        "Keep context short enough that the listener reaches your action quickly. Explain the constraint, your responsibility and the choice you made. Then describe the output or result with its actual status. If the work was a pilot or a recommendation, say so. Include what you learned when the result was mixed or incomplete."
      ], sourceIds: ["harvard-interview"] },
      { heading: "Preserve the boundary of your contribution", paragraphs: [
        "Use 'we' to describe the team's setting and 'I' to describe your action. Name who made the final decision when that matters. If you prepared analysis for a manager, say what you prepared and how it was used; do not claim to have approved the decision. Clear boundaries make follow-up questions easier to answer.",
        "Check every number against your evidence note. A team outcome can be mentioned as a team outcome when you can substantiate it. A forecast remains a forecast. If the result cannot be shared, describe a permitted deliverable or process. Do not disclose restricted commercial details to make the story sound more impressive."
      ], example: { label: "Worked example", text: "Situation: a student team had conflicting versions of its analysis. Task: the candidate was responsible for the final presentation. Action: they set a shared assumptions sheet and asked each teammate to confirm their inputs. Result: the team submitted one consistent presentation. The candidate does not claim they rebuilt every teammate's model." } },
      { heading: "Practise the questions beneath the story", paragraphs: [
        "After telling the story, ask yourself: why that approach, what alternatives did you consider, what was difficult, and what would you change? These questions test understanding. If you cannot explain a term in the CV, revise the document or learn the relevant concept before using it in an interview.",
        "Practise with a friend or record a short spoken version for your own review. Listen for long context, vague actions and claims that grew beyond the source. Aim for a clear initial answer, then leave room for the interviewer to ask for detail. Practice is a way to clarify meaning, not to remove every natural pause."
      ] },
      { heading: "Prepare questions that resolve your decision", paragraphs: [
        "The interview also helps you understand the role. Prepare questions about the responsibilities, success measures, team and next stage that the published material does not answer. Avoid asking questions whose answers are already clear in the vacancy. Use the conversation to test your assumptions about the work and its fit with your direction.",
        "Before the interview, review your submitted packet and choose the stories most relevant to its requirements. Jobvance's evidence comparison can help you see which claims need a stronger explanation. Keep a short note of actions and facts, then speak in your own words. The next step is one practice conversation with honest follow-up questions."
      ] }
    ], sources: [SOURCES.interview], relatedSlugs: ["achievements-without-numbers", "student-projects-on-cv", "mba-career-pivot-cv"]
  }),
  publish({
    slug: "job-search-time-plan",
    title: "Make a job-search plan that fits a busy week",
    description: "Make room for finding roles, preparing applications and following up alongside work, classes and other commitments.",
    audience: "Working professionals", category: "Application workflow",
    summary: "Give finding roles, reviewing applications and following up their own place in your week. Start with the time you can reliably spare, then decide how much you can prepare carefully. Use the example plan below as a starting point and adjust it around work, study and what you learn from your search.",
    takeaways: ["Budget time before choosing application volume.", "Separate finding roles from preparing packets.", "Finish review before starting more drafts."],
    sections: [
      { heading: "Find the time you can reliably protect", paragraphs: [
        "Look at the coming week, including work, classes, travel and personal responsibilities. Choose a few blocks you can realistically protect. Leave time to read a CV carefully as well as shorter periods for checking updates. A plan that fits your normal week is easier to return to when an application takes longer than expected.",
        "Treat the first week as a trial. Record approximately how long sourcing, evidence review and submission take. These observations are about your process, not a general benchmark. If an employer requires a lengthy assessment, plan that separately. Do not hide it inside the time you allocated for a simple CV submission."
      ] },
      { heading: "Separate sourcing from preparation", paragraphs: [
        "Use one block to find and verify roles. Save a compact shortlist with the source, essential conditions and next action. Stop before the list becomes an endless collection. Use another block to prepare one selected application without constantly searching for a more appealing vacancy halfway through the task.",
        "Switching between browsing, rewriting and messaging can leave many packets unfinished. A clear boundary helps you notice whether the bottleneck is finding suitable roles or reviewing materials. If the shortlist is weak, improve the search brief. If the packets are stalled, resolve the uncertain facts instead of adding more vacancies."
      ] },
      { heading: "Choose a completion budget", paragraphs: [
        "Set an initial limit based on the time available and the applications' requirements. The useful unit is a reviewed, submitted application, not a generated CV. Count a packet as ready only when its claims, format and answers have been checked. Count it as submitted only when the submission is confirmed.",
        "Do not turn a weekly volume target into permission to skip verification. One unsuitable application can consume time without advancing your direction. Equally, avoid polishing a low-risk phrase indefinitely. Define a stopping point: the requested materials are complete, factual checks pass and the employer's instructions have been followed."
      ], example: { label: "Planning example", text: "A professional with two hours available allocates 30 minutes to source checks, 60 minutes to one application and 30 minutes to submission and tracker review. A complex form takes longer than expected, so they complete that role and move the second to next week. No claim is made that this schedule suits every applicant." } },
      { heading: "Use small waiting tasks carefully", paragraphs: [
        "A short break may be suitable for checking a deadline, confirming a source link or writing a question for later. It is less suitable for approving a complex CV rewrite on a small screen while distracted. Match the task to the attention available. Keep a note of the next step so you can resume without rereading everything.",
        "For a confidential search, consider where notifications and documents appear. Use personal contact channels and settings appropriate to your situation. A reminder that exposes a role title on a shared device may create an unwanted disclosure. Keep the plan practical and consistent with your workplace or university policies."
      ] },
      { heading: "Reset the plan from actual progress", paragraphs: [
        "At the end of the week, review completed packets, unresolved conditions and upcoming deadlines. Ask where time went and which action mattered. Reduce active work if too many drafts remain unfinished. Reuse confirmed career facts next week, while preserving separate versions for each employer.",
        "Jobvance's Job Loop can organise a reusable record, role packets and next actions when configured. It does not remove your review or submit applications for you. You can also use this plan with a simple note. Your next action is to schedule one realistic review block and select the verified role that deserves it."
      ], sourceIds: ["jobvance-workflow"] }
    ], sources: [SOURCES.workflow], relatedSlugs: ["role-filtering-before-applying", "reuse-second-application", "confidential-career-switch"]
  }),
  publish({
    slug: "resume-privacy-before-upload",
    title: "Review resume privacy before you upload or share",
    description: "Create a minimal shareable CV copy, check visible and hidden information, and understand where documents and connected drafts may remain.",
    audience: "All applicants", category: "Privacy & troubleshooting",
    summary: "A CV combines identity, history and contact details in one portable file. Before uploading it, decide what the recipient needs and what you are allowed to share. Review the visible text, the file's hidden information and any portfolio links. Use a clean copy and understand the service's privacy information before sharing.",
    takeaways: ["Share the minimum information needed for the stage.", "Inspect a copy for comments and hidden details.", "Review each service and external draft separately."],
    sections: [
      { heading: "Create a shareable source copy", paragraphs: [
        "Start from a copy of your master CV. Check whether it contains unnecessary identity numbers, a full home address, referees' contact details or personal records. Keep the information the employer actually needs for the current stage. If a later verified process requests additional documents, handle that request separately rather than embedding them in every application.",
        "Remove information you are not authorised to disclose, including client records, internal plans and sensitive employer figures. A general description may be useful only if it is permitted and accurate. Do not upload another person's personal data because it appeared in a project or a team document you used as source material."
      ] },
      { heading: "Inspect more than the visible page", paragraphs: [
        "A document can contain comments, tracked revisions and properties that are not obvious in the final layout. Microsoft documents how its Document Inspector can find several kinds of hidden information, and recommends inspecting a copy because removals may not be reversible. Follow the current instructions for the software and file type you use.",
        "Review the results rather than clicking removal buttons without reading them. Some information may be useful and some may not be detectable by that feature. Export again after making changes, then inspect the exported file. A clean-looking page is not evidence that every hidden field or embedded item has been removed."
      ], sourceIds: ["microsoft-inspector"] },
      { heading: "Check links and attachments as separate disclosures", paragraphs: [
        "Open each portfolio link as an external recipient would. Check access permissions, surrounding files and whether the page reveals teammates' details or private work. A shared folder may expose more than the single project you intended. Link to a suitable page or permitted demonstration rather than a broad repository of unrelated personal material.",
        "Look at the attachment name and the selected file before sending. Similar filenames can cause a private master CV to be attached instead of the cleaned copy. Use an understandable version name and keep draft notes outside the shareable folder. The recipient sees the actual attachment, not your intention to choose the safer version."
      ], example: { label: "Worked example", text: "A student links to a coursework folder containing the presentation, a teammate's phone list and assessment feedback. Before applying, they create a permitted project summary without personal details and link only to that page. They test the link in a signed-out browser to confirm what an external reader can access." } },
      { heading: "Understand the service before sharing", paragraphs: [
        "Read the service's current privacy information and the permissions shown during any connection. Identify what you are uploading, whether it is saved and how to request help or erasure. If the explanation does not answer a material question, use the public support route before supplying more information. Keep product marketing claims separate from the actual privacy terms.",
        "For Jobvance, review the privacy page before uploading a CV or connecting a mailbox. The free check and account workflows have different saving actions. Connected features depend on setup and consent. Do not assume that reading a guide, downloading a CV or cancelling one connection has erased every record you may have created elsewhere."
      ], sourceIds: ["jobvance-privacy"] },
      { heading: "Plan for copies outside the service", paragraphs: [
        "Once a document is downloaded, emailed or submitted to an employer, it may exist outside the preparation service. Keep track of those copies for your own records. A deletion request to one service cannot recall an attachment from an employer or remove a file already saved on your computer. Contact the relevant recipient or service for its own process where needed.",
        "Your next action is to make one clean source copy and review it before beginning a CV check. Keep identity documents and restricted information out unless a verified process specifically requires them. If you need help understanding Jobvance's saving or privacy actions, use its public contact page with a description of the issue and no unnecessary sensitive attachments."
      ] }
    ], sources: [SOURCES.microsoft, SOURCES.privacy], relatedSlugs: ["confidential-career-switch", "cv-pdf-or-docx", "verify-job-listing-source"]
  }),
  publish({
    slug: "uae-job-search-sources",
    title: "Where to look for jobs in the UAE",
    description: "Build a UAE job-source list from employer careers pages, official portals, recruitment agencies and job boards.",
    audience: "All applicants", category: "UAE job search",
    summary: "Build a short list of places to check for roles in the UAE: employer careers pages, relevant public-sector portals, recruitment agencies and job boards. Record where each vacancy came from and where you will apply. This guide helps you organise those sources and check the details of individual roles.",
    takeaways: ["Keep a short list of sources by purpose.", "Verify each role and application destination.", "Separate source coverage from eligibility."],
    sections: [
      { heading: "Separate the kinds of sources", paragraphs: [
        "Organise your sources into employer careers pages, official public-sector portals, recruitment agencies and job boards. Each can play a different role. An employer page can provide a direct application route; a board can surface leads; an agency can represent a recruitment process. Record which source led you to the vacancy and where the application actually takes place.",
        "The UAE Government's job-search guidance provides a starting point for public and other search routes. Use it to find relevant official destinations, then read the destination's current instructions. Do not assume that every listed portal serves the same nationality, seniority or employment category. The individual vacancy and portal rules still need review."
      ], sourceIds: ["uae-jobs"] },
      { heading: "Check public-sector roles at their destination", paragraphs: [
        "The Federal Government Job Portal provides vacancy search and application-related features. If a federal role interests you, read it there and capture the role reference. Check eligibility conditions from the current listing rather than a repost on social media. Public-sector employment routes should not be treated as interchangeable with every private-sector process.",
        "For local government or another authority, locate its official careers destination independently. A portal name alone does not establish that you qualify. Record an explicit nationality or qualification condition when present. If eligibility is unclear, use the portal's published guidance or contact route rather than relying on an informal comment from another applicant."
      ], sourceIds: ["federal-jobs"] },
      { heading: "Use boards as leads and employers as checks", paragraphs: [
        "When a board surfaces an appealing private-sector role, look for the employer's corresponding careers page or a clearly documented agency route. Compare title, location, reference and requirements. A repost may omit a deadline or preserve an older version. Keep the source checked date and the destination you used to prepare the application.",
        "Avoid claiming your search is complete because you checked several popular sources. Coverage can vary by function, employer and posting method. A manageable source plan is more useful than a long list you cannot review. Begin with sources that produce relevant, traceable roles for your direction, then adjust from what you actually find."
      ], example: { label: "Worked example", text: "An MBA candidate searches for operations roles in Dubai and Abu Dhabi. Their list contains several employer pages and one board for discovery. A board listing is missing the work location, so they check the employer page before shortlisting. The list is described as 'sources checked this week', never 'all UAE jobs'." } },
      { heading: "Verify offers and authorisation separately", paragraphs: [
        "A vacancy source check does not verify a formal employment offer or permission to work. UAE Government fraud guidance explains how relevant MoHRE offer references can be checked and states that a visit or tourist visa does not confer the right to work. Follow the current official guidance for your situation before acting on a claim about employment or immigration.",
        "Do not use a job-search article as an individual legal decision. Requirements can depend on the employer, jurisdiction and your circumstances. Keep application preparation separate from resigning, travelling or changing status. If a message requests payment or sensitive documents, verify that new request through an appropriate official or organisational channel."
      ], sourceIds: ["uae-fraud"] },
      { heading: "Keep the search operational", paragraphs: [
        "Review your source list once a week. Remove sources that are no longer useful, record unavailable pages and keep promising roles with a next action. A source that produced no relevant vacancy this week has not necessarily failed; it may simply be a narrower route. Use actual observations instead of a platform's broad coverage claim.",
        "Jobvance can help prepare packets for roles you add and show available connected source coverage. That coverage is bounded and depends on setup. Verify the original listing yourself, approve the materials and submit through the employer's route. Your next action is to select a few sources you can maintain and check one vacancy fully."
      ] }
    ], sources: [SOURCES.jobs, SOURCES.federal, SOURCES.fraud], relatedSlugs: ["verify-job-listing-source", "academic-qualifications-uae-cv", "role-filtering-before-applying"]
  }),
  publish({
    slug: "academic-qualifications-uae-cv",
    title: "How to list qualifications on a UAE CV",
    description: "List completed degrees, expected graduation and short courses clearly, and check any qualification requirements in a UAE vacancy.",
    audience: "Students", category: "UAE job search",
    summary: "Make your education section easy to read by listing the qualification, institution and completion date or expected graduation. Keep short courses and professional credentials clear too. For UAE applications, use the vacancy to identify any additional certification, attestation or registration questions you need to check.",
    takeaways: ["Distinguish awarded and in-progress qualifications.", "Keep short courses separate from degrees and licences.", "Verify attestation requirements through official sources."],
    sections: [
      { heading: "Use the qualification's actual name", paragraphs: [
        "Write the degree and institution as they appear in your records, with a location when useful. If the name is unfamiliar to the reader, add a brief explanation alongside the official name. A translation should preserve the qualification you hold, so the reader can understand it and compare it with the vacancy’s requirements.",
        "Keep joint degrees, specialisations and honours accurate. A concentration is not a separate degree unless it was awarded as one. If you use an abbreviation, consider whether an external reader will understand it. Clear wording helps the employer evaluate the record and reduces inconsistency between the CV and application form."
      ] },
      { heading: "Make completion status explicit", paragraphs: [
        "For a completed degree, state the award or graduation date accurately. For current study, use a clear expected completion date if known. If you have finished coursework but an award is pending, describe that status accurately rather than treating the credential as already conferred. Update the record when the status changes.",
        "Choose the level of detail needed for the vacancy. A student may include relevant coursework or a thesis; an experienced professional may need less academic detail. Those are presentation choices. They should not obscure whether the qualification is completed, pending or discontinued. Keep the same status in recruiter messages and form answers."
      ] },
      { heading: "Separate learning from professional credentials", paragraphs: [
        "A short course, attendance certificate, professional certification and licence can mean different things. Put them under suitable headings and use the issuing body's actual terminology. Completing training in a tool does not automatically prove extensive professional use. Passing an academic module does not necessarily establish a regulated professional entitlement.",
        "If the vacancy requires a current licence or registration, verify your status and any expiry date. Do not bury an expired credential among active ones without explanation. Ask the employer or relevant authority about an ambiguous requirement through its published channel. A wording tool cannot determine recognition or eligibility for you."
      ], example: { label: "Worked example", text: "A student writes 'MBA, expected June 2027' and lists an online analytics course separately under 'Additional training'. They do not use 'MBA graduate' before the degree is awarded or present the short course as a professional analytics certification. Their application answers use the same completion status." } },
      { heading: "Check UAE documentation requirements separately", paragraphs: [
        "UAE Government guidance says certain jobs require attested academic certificates for residency and employment procedures. Use the official preparing-to-work page as a starting point, then confirm what applies to the role and your circumstances. A qualification listed on a CV and an attested document are related but distinct records.",
        "Do not assume every applicant needs the same documentation at the same stage. Ask a verified employer which documents are required, why they are needed and how to provide them through a suitable channel. Confirm attestation or recognition procedures with the relevant official authority. Avoid sending identity and academic records to an unverified contact merely because a job post mentions them."
      ], sourceIds: ["uae-qualifications"] },
      { heading: "Review the final education record", paragraphs: [
        "Compare the CV education entry with your source documents and the application form. Check institution spelling, dates, degree status and any stated grades or scale. If a portal extracts the education fields incorrectly, correct them where possible. Do not let an automatic field choose a completed status when the CV says the degree is in progress.",
        "Bring the clear education text to Jobvance's CV check and review qualification requirements manually. The check can compare wording; it cannot authenticate a certificate, confirm recognition or complete attestation. Your next action is to correct one ambiguous credential entry and verify any required documentation through the appropriate official source."
      ] }
    ], sources: [SOURCES.qualifications], relatedSlugs: ["student-projects-on-cv", "cv-check-no-fit-percentage", "uae-job-search-sources"]
  }),
  publish({
    slug: "cancelled-partial-job-loop-runs",
    title: "What to do when Job Loop preparation stops",
    description: "Find the status of a partial, cancelled or interrupted preparation run and decide whether to review, resume or ask for help.",
    audience: "All applicants", category: "Privacy & troubleshooting",
    summary: "If preparation stops or only some documents are ready, open the run history to see what finished and what needs attention. You may be able to review a completed document, resolve an issue and resume, or cancel the remaining work. Start with the recorded status and the message beside it.",
    takeaways: ["Read the recorded status and messages.", "Review existing outputs independently.", "Distinguish cancelling a run from cancelling a schedule."],
    sections: [
      { heading: "Inspect the current record first", paragraphs: [
        "Open Run history and source coverage in Job Loop and read the status, current step and messages. Check which sources completed and which need attention. If you have just selected an action, refresh the records to see its result before deciding what to do next.",
        "Write down the specific unfinished step. It may concern a source, configuration, a budget stop or preparation. Avoid reducing every interruption to 'the app failed'. A precise observation helps you decide whether there is useful output to review and gives support a clearer description if you need assistance."
      ], sourceIds: ["jobvance-workflow"] },
      { heading: "Separate run completion from packet approval", paragraphs: [
        "A run's status and a packet's approval are different. Existing packets may require review even when a run completed. A partial run may have produced some outputs while leaving another stage unresolved. Open the recorded outputs and inspect their source facts, vacancy connection and status. Do not assume they are ready because they exist.",
        "Check whether the underlying career facts or vacancy have changed since preparation. A previous approval should not justify downloading a document based on stale information. Review the current packet and its available actions. If something is incomplete or unavailable, keep that limitation visible rather than rebuilding a missing section from guesses."
      ] },
      { heading: "Confirm cancellation at the right scope", paragraphs: [
        "Use a run's Cancel run control when you want to stop that preparation request, then check the recorded state. A schedule has its own pause and cancellation controls. Pause schedule stops future scheduling and retains the current run. Cancel schedule also stops its latest queued or running scheduled job. It does not cancel a separate manual run. Refresh both records to confirm what stopped.",
        "Cancellation is also separate from deleting saved data or recalling external copies. Previously downloaded documents or drafts already created in another service need their own review. Do not treat a cancellation confirmation as proof that all source records, outputs and external drafts were erased. Use the relevant privacy or account process for an erasure request."
      ], example: { label: "Worked example", text: "A candidate cancels a weekly schedule while a preparation run is active. The schedule also cancels its latest queued or running scheduled job. They refresh the run history to confirm this and separately inspect any manually started run. One previously prepared packet remains visible, so they review it as an existing output rather than assuming it was submitted or deleted. No application was sent by the run." } },
      { heading: "Resume only after understanding the stop", paragraphs: [
        "If the interface offers Resume run, read the messages first and resolve any indicated prerequisite. Confirm your career record is saved and the current source information is appropriate. Available actions depend on the run state and configured capabilities. Do not repeatedly start new runs because one request has not yet shown a result.",
        "When the same issue persists, stop blind retries and collect a minimal support note. Include the approximate time, run identifier if shown, status, phase and message. Leave raw CV text, private email contents and sensitive documents out unless a secure support process specifically needs them. A precise description is usually more useful than a large attachment."
      ] },
      { heading: "Choose one next action", paragraphs: [
        "There are three useful paths: review a completed output, resume an eligible run after resolving the issue, or request help with the recorded problem. Choose the one supported by the interface. A run being partial does not establish that your application is weak; it describes the preparation process, not an employer decision.",
        "Open your Job Loop to inspect history, or use the public contact page for general help without adding private material. If you simply need to prepare one CV while a connection is unavailable, the free check offers a separate review path. Approve the result yourself and submit through the employer's channel when the packet is ready."
      ] }
    ], sources: [SOURCES.workflow], relatedSlugs: ["first-application-pack", "application-tracking-follow-up", "cv-upload-failure-checklist"]
  }),
  publish({
    slug: "cv-upload-failure-checklist",
    title: "Fix a CV upload failure one step at a time",
    description: "Resolve a CV upload problem by checking the error message, file type, size and readable text.",
    audience: "All applicants", category: "Privacy & troubleshooting",
    summary: "Keep your original CV and read the upload message first. Then check the file type, size and whether its text can be selected or copied. This checklist helps you try a clean copy, paste the text instead, or give support the details needed to investigate.",
    takeaways: ["Read the exact error before retrying.", "Preserve the original and inspect readable text.", "Ask for help with minimal sensitive information."],
    sections: [
      { heading: "Check the limits of the service you are using", paragraphs: [
        "Jobvance's CV upload accepts PDF, DOCX and TXT files up to 5 MB. Legacy DOC is not supported in this check. These are Jobvance's limits, not a general employer-portal rule. If the file exceeds the stated size, save a smaller copy or remove unnecessary embedded images while keeping the text you need.",
        "Check that you selected the intended file and that it is not empty. Changing the filename extension does not convert the document. Use the original editor's save or export function to create the supported format. Keep the original file intact so troubleshooting does not destroy your source record."
      ], sourceIds: ["jobvance-workflow"] },
      { heading: "Determine whether the document contains readable text", paragraphs: [
        "Try selecting and copying text from the PDF in a normal viewer. If each page is only an image, the document may need optical character recognition before text extraction. Jobvance's upload does not turn a scan into verified CV text. Use a text-based export or a carefully checked transcription from your original record.",
        "After extraction, inspect the names, dates and reading order. A file can upload while producing incomplete or scrambled text. Greenhouse also distinguishes accepted files from successful parsing and documents image resumes and complex formatting as possible parsing problems. The exact behaviour varies by service, so diagnose the file in the tool you are actually using."
      ], sourceIds: ["greenhouse-parsing"] },
      { heading: "Check access and encoding", paragraphs: [
        "A damaged or password-protected document may not be readable by the check. If you have permission to use it, open the original and save an unlocked, text-based copy. Do not try to bypass access restrictions on a document you are not authorised to handle. For TXT, use UTF-8 encoding and inspect the text for broken characters.",
        "If you no longer have an editable source, choose a recovery method that preserves accuracy. A plain-text copy may be sufficient for comparing evidence, but it still needs names, headings and context. Review any converted text against the original. Conversion can remove labels that distinguish academic projects or supporting contributions."
      ], example: { label: "Worked example", text: "A candidate uploads a scanned CV and gets a no-readable-text message. They return to the original word-processing document, export a text-based PDF and try again. They inspect the extracted education dates and project labels before checking the vacancy. They do not rename the scanned file from PDF to DOCX." } },
      { heading: "Change one thing and retry deliberately", paragraphs: [
        "Use the error message to choose the next change: reduce size, export a supported format, unlock a permitted copy or correct text encoding. Retry once after that change and record the result. Repeating the same upload without a new observation rarely helps you understand what is wrong.",
        "If extraction succeeds, verify the source text before moving on. If the upload succeeds but saving later fails, treat saving as a separate issue. A local review, an account save and an employer submission are different actions. Check the screen's confirmation rather than assuming that the successful first step confirms every later step."
      ] },
      { heading: "Prepare a useful help request", paragraphs: [
        "Include the file type, approximate size, browser, time and exact error text. Describe the step at which the problem occurred. Do not attach a complete CV or identity documents to a general support message unless a suitable secure process needs them. You can often explain a file issue without sharing its private contents.",
        "Use Jobvance's public contact page for general help, then return to the free check with the cleaned source when ready. If an employer portal is failing instead, use that employer's published support channel and current upload instructions. Your next action is the smallest evidence-based change, followed by a text inspection, rather than another blind retry."
      ] }
    ], sources: [SOURCES.workflow, SOURCES.greenhouseParse], relatedSlugs: ["cv-pdf-or-docx", "resume-privacy-before-upload", "cancelled-partial-job-loop-runs"]
  }),
  publish({
    slug: "truthful-recruiter-drafts",
    title: "How to write a recruiter message about a job",
    description: "Write a short message with the role, a relevant example from your experience and a clear request for a checked contact.",
    audience: "All applicants", category: "Application workflow",
    summary: "Name the role you are writing about, give one relevant example from your experience and make a clear request. Check the contact and the employer’s instructions before sending. This guide walks through a short draft you can adapt for a specific vacancy or recruitment question.",
    takeaways: ["Verify the contact and role before drafting.", "Use one specific, defensible example.", "Review recipients and send deliberately."],
    sections: [
      { heading: "Establish a legitimate reason to write", paragraphs: [
        "Start with the role or recruitment process you want to ask about. Read the listing’s contact instructions and use the stated channel where possible. If a person is named, check their connection with the organisation through an appropriate public source. When you cannot confirm an address, return to the employer’s published contact route.",
        "An existing conversation provides context, but check its current recipients before replying. If you have no named contact, an employer's application route may be the right next step. A message to an unrelated employee is not automatically more useful than a complete application. Choose the channel based on the evidence you have, not a promise of privileged access."
      ] },
      { heading: "State the request and connection briefly", paragraphs: [
        "A compact first draft can include the role title or reference, your relevant current background, one specific example and a question or next-step request. Keep the evidence close to the role's responsibilities. If you are asking about a condition, ask that condition directly instead of adding a long biography.",
        "Harvard's letter guidance recommends concise, factual writing with examples connected to the position. Our recruiter-draft approach applies that limited principle to a shorter message. It is an editorial suggestion, not evidence that a certain message length or formula causes responses. Use the recipient's context and instructions to decide what belongs."
      ], sourceIds: ["harvard-resume"] },
      { heading: "Preserve facts when improving tone", paragraphs: [
        "Check the draft against the CV and career record. A rewrite should not change 'supported' into 'led', a classroom project into employment or an expected degree into a completed one. Avoid unsupported claims such as 'ideal candidate' when a specific example would be more informative. A warm tone can still be precise.",
        "Never add an invented referral, previous conversation or personal interest in the employer's work. If you have researched a public project, mention only what you actually reviewed and why it relates to your experience. Do not fabricate familiarity to make the opening sound personal. Accuracy matters more than a clever hook."
      ], example: { label: "Example outreach draft", text: "Hello, I am interested in the Operations Analyst vacancy, reference OA-21. In my current coordination role, I prepare monthly performance summaries for management review. Could you confirm whether the position is based on-site in Abu Dhabi throughout the week? Thank you. Replace the role title and reference with those from your vacancy. This writing example has not been sent." } },
      { heading: "Review attachments and recipient details", paragraphs: [
        "If an attachment is requested or appropriate, choose the approved CV for that role. Open it and check the filename, employer references and private information. Inspect the To and Cc fields as carefully as the prose. A correct message sent to the wrong person or with the wrong version attached is still a problem.",
        "A draft in an email service is a separate saved object. Creating it is not sending it. Review any generated draft inside that service before taking the send action yourself. Do not assume a document review has approved the recipients, attachment or final wording of the message; those need their own check."
      ] },
      { heading: "Send once for a clear purpose and record it", paragraphs: [
        "If you choose to send, record the date, channel and purpose with the role. Keep it separate from the application submission status. A message asking a question is not an application unless the employer explicitly uses that route. Plan any later follow-up from the instructions or agreed timeline, not an automatic daily cadence.",
        "Jobvance can prepare message drafts from confirmed facts and a source-based contact where available. Mailbox features depend on setup and explicit consent; you review and send yourself. You can also use this checklist for a draft in your own editor. Your next action is to verify one recipient and remove any claim you cannot substantiate before deciding to send."
      ], sourceIds: ["jobvance-workflow"] }
    ], sources: [SOURCES.harvard, SOURCES.workflow], relatedSlugs: ["application-tracking-follow-up", "confidential-career-switch", "achievements-without-numbers"]
  }),
];

export const CAREER_GUIDES = careerGuides;
export function getCareerGuide(slug: string | undefined): CareerGuide | undefined {
  return careerGuides.find(guide => guide.slug === slug);
}
