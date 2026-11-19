import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JobNotFoundError, jobFileSchema, type JobFile, type JobStore } from './jobModel';

/** Jobs are plain JSON files in one directory, which is all the coordination the demo's agents need. */
export function createJobStore(jobDirectory: string): JobStore {
  mkdirSync(jobDirectory, { recursive: true });

  function pathFor(caseId: string): string {
    return resolve(jobDirectory, `${caseId}.json`);
  }

  function load(caseId: string): JobFile {
    let fileContents: string;
    try {
      fileContents = readFileSync(pathFor(caseId), 'utf-8');
    } catch {
      throw new JobNotFoundError(caseId);
    }
    return jobFileSchema.parse(JSON.parse(fileContents));
  }

  function save(job: JobFile): void {
    writeFileSync(pathFor(job.caseId), JSON.stringify(jobFileSchema.parse(job), null, 2));
  }

  function list(): JobFile[] {
    return readdirSync(jobDirectory)
      .filter(function isJobFile(fileName) {
        return fileName.endsWith('.json');
      })
      .map(function loadJob(fileName) {
        return load(fileName.replace(/\.json$/, ''));
      });
  }

  return { save, load, list };
}
