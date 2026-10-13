import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

// Export the actual product help narration, without rewriting the words.
const root = path.resolve(import.meta.dirname, '../../..');
const sourcePath = path.join(root, 'src/lib/walkthroughs.ts');
const source = await fs.readFile(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { walkthroughs } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const outputDir = path.join(import.meta.dirname, 'scripts');
await fs.mkdir(outputDir, { recursive: true });
for (const tutorial of walkthroughs) {
  await fs.writeFile(path.join(outputDir, `${tutorial.id}.json`), JSON.stringify({
    source: 'src/lib/walkthroughs.ts',
    sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    exportedAt: new Date().toISOString(),
    timingStatus: 'planned; not measured render timings',
    ...tutorial,
  }, null, 2) + '\n');
  await fs.writeFile(path.join(outputDir, `${tutorial.id}.txt`), tutorial.scenes.map(s => s.narration).join('\n\n') + '\n');
}
const first = walkthroughs.find(t => t.id === 'first-check');
for (let part = 0; part < 3; part++) {
  const scenes = first.scenes.slice(part * 2, part * 2 + 2);
  await fs.writeFile(path.join(outputDir, `first-check-part-${part + 1}.txt`), scenes.map(s => s.narration).join(' ') + '\n');
  await fs.writeFile(path.join(outputDir, `first-check-part-${part + 1}.json`), JSON.stringify({
    tutorialId: first.id, part: part + 1, totalParts: 3,
    title: `Your first CV check · Part ${part + 1} of 3`,
    sceneIds: scenes.map(s => s.id),
    stageIds: scenes.map(s => s.stageId),
    narration: scenes.map(s => s.narration).join(' '),
    captions: scenes.map(s => s.caption),
    timingStatus: 'planned; final caption timing requires actual rendered audio',
    screenshotPolicy: 'Only actual reviewed Jobvance UI with clearly fictional career data; no synthetic UI or private account data.',
  }, null, 2) + '\n');
}
console.log(`Exported ${walkthroughs.length} exact tutorial scripts and three first-check parts.`);
