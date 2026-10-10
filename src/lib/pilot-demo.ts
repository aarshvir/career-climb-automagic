import { downloadBlob } from "./document-download";

export type PilotRole = "strategy" | "transformation";
export type PilotFactId = "F-01" | "F-02" | "F-03";

/** Entirely fictional, prewritten material. This is not a live claim-checking engine. */
export const pilotCandidate = {
  name: "Alex Morgan",
  employers: "Example Advisory / Example Group",
  disclosure: "Alex Morgan, both employers and every source passage are fictional.",
} as const;

export const pilotFacts: Record<PilotFactId, {
  id: PilotFactId;
  employer: string;
  wording: string;
  sourceId: string;
  sourceTitle: string;
  sourcePassage: string;
  reviewNote: string;
}> = {
  "F-01": {
    id: "F-01",
    employer: "Example Advisory",
    wording: "Helped design a procurement pilot across 5 business units, with 8% projected savings.",
    sourceId: "SRC-01",
    sourceTitle: "Fictional procurement pilot design note",
    sourcePassage: "Alex helped design a procurement pilot across 5 business units. The pilot business case estimated 8% projected savings. It did not establish realized savings or Alex's ownership of delivery.",
    reviewNote: "Keep the contribution as helped design, and keep the savings as projected.",
  },
  "F-02": {
    id: "F-02",
    employer: "Example Group",
    wording: "Created a tracker covering 6 workstreams.",
    sourceId: "SRC-02",
    sourceTitle: "Fictional workstream tracker note",
    sourcePassage: "Alex created a tracker covering 6 workstreams. This note records the tracker, not ownership of the workstreams or delivery of their outcomes.",
    reviewNote: "Creating the tracker does not establish that Alex led the workstreams.",
  },
  "F-03": {
    id: "F-03",
    employer: "Example Advisory",
    wording: "Prepared 12 leadership briefings.",
    sourceId: "SRC-03",
    sourceTitle: "Fictional briefing register",
    sourcePassage: "The register records 12 leadership briefings prepared by Alex. It does not record board presentations, decision ownership or a measured business outcome.",
    reviewNote: "Retain the recorded count and preparation contribution.",
  },
};

export const pilotRoleDirections: Record<PilotRole, {
  label: string;
  emphasis: string;
  factOrder: readonly PilotFactId[];
  roleTitle: string;
  requirements: readonly {
    label: string;
    status: "supported" | "not-established";
    factIds: readonly PilotFactId[];
    explanation: string;
  }[];
  recruiterQuestion: string;
  nextStep: string;
}> = {
  strategy: {
    label: "Strategy",
    emphasis: "Bring the pilot business case and leadership briefings forward. The contribution and projected outcome remain the same.",
    factOrder: ["F-01", "F-03", "F-02"],
    roleTitle: "Strategy Manager at Example Group",
    requirements: [
      { label: "Procurement pilot design contribution", status: "supported", factIds: ["F-01"], explanation: "The record supports helping design the pilot and its projected business case." },
      { label: "Preparation of leadership briefings", status: "supported", factIds: ["F-03"], explanation: "The record supports preparation of 12 briefings." },
      { label: "Ownership of strategy implementation", status: "not-established", factIds: [], explanation: "Design support and briefing preparation do not establish implementation ownership." },
    ],
    recruiterQuestion: "Could you clarify whether the role requires ownership of implementation or a contribution to analysis and pilot design?",
    nextStep: "For a real search, verify the vacancy and clarify implementation responsibility before adapting the draft or deciding to apply.",
  },
  transformation: {
    label: "Transformation",
    emphasis: "Bring workstream tracking forward, followed by the pilot and briefings. Relevance changes; the facts do not.",
    factOrder: ["F-02", "F-01", "F-03"],
    roleTitle: "Transformation Manager at Example Group",
    requirements: [
      { label: "Workstream tracking", status: "supported", factIds: ["F-02"], explanation: "The record supports creating a tracker covering 6 workstreams." },
      { label: "Procurement pilot design support", status: "supported", factIds: ["F-01"], explanation: "The record supports helping design the pilot, with savings remaining projected." },
      { label: "Transformation delivery ownership", status: "not-established", factIds: [], explanation: "Creating a tracker and helping design a pilot do not establish ownership of transformation delivery." },
    ],
    recruiterQuestion: "Could you clarify whether the role requires transformation delivery ownership or support with workstream tracking and pilot design?",
    nextStep: "For a real search, clarify the delivery-ownership requirement. Establish supporting evidence or choose a role centered on tracking and design support before applying.",
  },
};

/** A selectable prewritten draft, assembled only from the same fictional public facts. */
export function buildPilotRecruiterDraft(role: PilotRole): string {
  const direction = pilotRoleDirections[role];
  if (!direction) throw new Error("Choose one of the fictional role directions.");
  return [
    "Hello,",
    "",
    `I am exploring the fictional ${direction.roleTitle} role.`,
    "My recorded experience examples are:",
    ...direction.factOrder.map((id) => `• ${pilotFacts[id].wording}`),
    "",
    direction.recruiterQuestion,
    "",
    "Alex Morgan (fictional)",
  ].join("\n");
}

export const pilotRejectedEdit = {
  wording: "Led a procurement transformation across 5 business units and delivered 8% savings.",
  reasons: [
    "“Led” changes the recorded contribution from helped design to ownership.",
    "“Delivered 8% savings” turns a projection into a realized result.",
    "A pilot design does not establish a delivered transformation.",
  ],
  replacement: pilotFacts["F-01"].wording,
} as const;

export const pilotRestrictedNote = {
  sourceId: "SRC-04",
  title: "Fictional confidential internal opportunity estimate",
  value: "$4.2M",
  restriction: "Internal opportunity estimate. Restricted from CVs and recruiter documents, even in this example.",
} as const;

/** Only explicitly approved public facts enter the document; restricted notes are not inputs. */
export function buildPilotDemoText(role: PilotRole): string {
  const direction = pilotRoleDirections[role];
  if (!direction) throw new Error("Choose one of the fictional role directions.");
  return [
    "JOBVANCE — FICTIONAL CONCEPT DEMO",
    "Prewritten example. Not a real candidate CV, live AI result or customer outcome.",
    "",
    `${pilotCandidate.name} (fictional)`,
    `Illustrative role direction: ${direction.label}`,
    `Employers: ${pilotCandidate.employers} (fictional)`,
    "",
    "FICTIONAL ROLE BRIEF — NOT A LIVE VACANCY",
    direction.roleTitle,
    ...direction.requirements.map((requirement) => `${requirement.label}: ${requirement.status === "supported" ? `Supported by ${requirement.factIds.join(", ")}` : "Not established"}. ${requirement.explanation}`),
    "",
    "APPROVED EXPERIENCE EXAMPLES",
    ...direction.factOrder.map((id) => `${pilotFacts[id].employer}: ${pilotFacts[id].wording}`),
    "",
    "SOURCE REFERENCES — FICTIONAL",
    ...direction.factOrder.map((id) => `${id} / ${pilotFacts[id].sourceId}: ${pilotFacts[id].sourceTitle}`),
    "",
    "PREWRITTEN FICTIONAL RECRUITER DRAFT — NOT SENT",
    buildPilotRecruiterDraft(role),
    "",
    "PROPOSED NEXT STEP — FICTIONAL EXAMPLE",
    direction.nextStep,
    "",
    "Reviewed fictional example only. Nothing has been sent to an employer.",
  ].join("\n");
}

export function downloadPilotDemo(role: PilotRole, approved: boolean): void {
  if (!approved) throw new Error("Review and approve the fictional CV before downloading.");
  downloadBlob(
    new Blob([buildPilotDemoText(role)], { type: "text/plain;charset=utf-8" }),
    `jobvance-fictional-demo-${role}.txt`,
  );
}
