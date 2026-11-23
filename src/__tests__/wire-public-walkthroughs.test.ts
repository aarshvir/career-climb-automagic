import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPublicWalkthroughMediaUrl, validateWalkthroughVideoManifest } from '@/lib/walkthroughs';

/**
 * scripts/wire-public-walkthroughs.mjs used to build commit-pinned media URLs on a personal GitHub account and write them into
 * src/lib/walkthroughs.ts. It now refuses unless it is given a first-party media base, and it never lists the retired recordings.
 */
const root = resolve(__dirname, '../..');
const script = resolve(root, 'scripts/wire-public-walkthroughs.mjs');
const target = resolve(root, 'src/lib/walkthroughs.ts');
const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
const base = 'https://jobvance.io/walkthroughs/media';

describe('the walkthrough manifest generator is first-party only', () => {
  it('refuses to write anything without a first-party media base, and never touches the public source', () => {
    const before = readFileSync(target, 'utf8');
    const attempts = [
      [],
      ['--asset-commit', 'fb3782a224759a8e0f4cb97b19845cac8dab3ef3'],
      ['--media-base', 'https://raw-files.example.test/some-owner/repo/main', '--tutorials', 'job-loop-start'],
      ['--media-base', 'http://jobvance.io/walkthroughs/media', '--tutorials', 'job-loop-start'],
      ['--media-base', 'https://jobvance.io.example.test/walkthroughs/media', '--tutorials', 'job-loop-start'],
      ['--media-base', 'https://jobvance.io/elsewhere', '--tutorials', 'job-loop-start'],
    ];
    for (const args of attempts) {
      const result = run(...args);
      expect(result.status, args.join(' ')).not.toBe(0);
      expect(result.stderr, args.join(' ')).toMatch(/Refusing to write the public walkthrough manifest/);
    }
    expect(readFileSync(target, 'utf8')).toBe(before);
  });

  it('refuses without named recordings, and never lists the retired six-step recordings', () => {
    const before = readFileSync(target, 'utf8');
    for (const tutorials of [[], ['--tutorials', ''], ['--tutorials', 'first-check'], ['--tutorials', 'another-application,job-loop-start'], ['--tutorials', 'controls-and-recovery'], ['--tutorials', 'no-such-recording'], ['--tutorials', 'job-loop-start,job-loop-start']]) {
      const result = run('--media-base', base, ...tutorials, '--dry-run');
      expect(result.status, tutorials.join(' ')).not.toBe(0);
    }
    expect(readFileSync(target, 'utf8')).toBe(before);
  });

  it('with a first-party base it produces first-party URLs that the validator accepts, and a dry run writes nothing', () => {
    const before = readFileSync(target, 'utf8');
    const result = run('--media-base', `${base}/`, '--tutorials', 'job-loop-start,source-review', '--dry-run');
    expect(result.status, result.stderr).toBe(0);
    const manifest = JSON.parse(result.stdout.slice(result.stdout.indexOf('= ') + 2).replace(/;\s*$/, ''));
    expect(manifest.videos.map((video: { tutorialId: string }) => video.tutorialId)).toEqual(['job-loop-start', 'source-review']);
    for (const video of manifest.videos) {
      expect(isPublicWalkthroughMediaUrl(video.videoUrl, 'video')).toBe(true);
      expect(isPublicWalkthroughMediaUrl(video.captionUrl, 'captions')).toBe(true);
      expect(isPublicWalkthroughMediaUrl(video.posterUrl, 'poster')).toBe(true);
      expect(video.videoUrl.startsWith(`${base}/`)).toBe(true);
    }
    expect(validateWalkthroughVideoManifest(manifest).videos).toHaveLength(2);
    expect(readFileSync(target, 'utf8')).toBe(before);
  });
});
