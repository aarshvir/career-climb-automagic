export const PILOT_CONTACT = "contact@jobvance.io";
export type PilotAudience = "professional" | "coach";
export type PilotRequestInput = {
  name: string;
  audience: PilotAudience;
  directions: string;
  availability: string;
};

export function preparePilotRequest(input: PilotRequestInput) {
  const clean = (value: string, limit: number) => value.split("\u0000").join("").trim().slice(0, limit);
  const directions = clean(input.directions, 500);
  if (!directions) throw new Error("Tell us which role directions or client preparation task you want to explore.");
  const name = clean(input.name, 80);
  const availability = clean(input.availability, 160);
  const subject = `Jobvance free pilot discussion — ${input.audience === "coach" ? "career coach" : "professional"}`;
  const body = [
    "Hello Jobvance,",
    "",
    "I would like to discuss the free, guided research pilot.",
    `I am a ${input.audience === "coach" ? "career coach" : "professional considering a career move"}.`,
    name ? `Name: ${name}` : "",
    `Role directions or preparation task: ${directions}`,
    availability ? `Possible discussion times (with timezone): ${availability}` : "",
    "",
    "I understand this is an early pilot, participation is by mutual agreement, and no payment or job outcome is promised.",
  ].filter((line, index, lines) => line || (index > 0 && lines[index - 1])).join("\n");
  return {
    subject,
    body,
    text: `To: ${PILOT_CONTACT}\nSubject: ${subject}\n\n${body}`,
    href: `mailto:${PILOT_CONTACT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}
