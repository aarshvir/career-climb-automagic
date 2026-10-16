/** A first CV assembled from the person's answers. No generated career facts. */
export interface LoopCvAnswers {
  name: string;
  contact: string;
  experience: string;
  education: string;
  skills: string;
  summary: string;
}

export function blankLoopCvAnswers(): LoopCvAnswers {
  return { name: '', contact: '', experience: '', education: '', skills: '', summary: '' };
}

const fields = {
  name: { label: 'Your name', max: 200 },
  contact: { label: 'Contact details', max: 600 },
  summary: { label: 'Your introduction', max: 4000 },
  experience: { label: 'Experience and projects', max: 30000 },
  education: { label: 'Education', max: 15000 },
  skills: { label: 'Skills', max: 10000 },
} satisfies Record<keyof LoopCvAnswers, { label: string; max: number }>;

export function buildLoopCvText(answers: LoopCvAnswers): string {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new Error('Add your name and your own experience or education to build a first CV.');
  }
  const clean = blankLoopCvAnswers();
  for (const key of Object.keys(fields) as (keyof LoopCvAnswers)[]) {
    const { label, max } = fields[key];
    if (typeof answers[key] !== 'string') throw new Error(`${label} must be text. Review this answer and try again.`);
    const value = answers[key].trim();
    if (value.length > max) throw new Error(`${label} is too long. Keep it within ${max.toLocaleString('en-US')} characters.`);
    clean[key] = value;
  }
  if (!clean.name) throw new Error('Add your name before building your CV.');
  if (!clean.experience && !clean.education) {
    throw new Error('Describe at least one experience, project or education entry in your own words. Paid work is not required.');
  }
  const sections = [clean.name, clean.contact];
  for (const [key, heading] of [
    ['summary', 'Summary'],
    ['experience', 'Experience and projects'],
    ['education', 'Education'],
    ['skills', 'Skills'],
  ] as const) {
    if (clean[key]) sections.push(`${heading}\n${clean[key]}`);
  }
  const text = sections.filter(Boolean).join('\n\n');
  if (text.length < 80) throw new Error('Add a little more detail about what you studied or did. Your first CV needs at least 80 characters.');
  if (text.length > 60000) throw new Error('Your combined CV is too long. Shorten your answers to keep the CV within 60,000 characters.');
  return text;
}
