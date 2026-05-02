import * as fs from 'node:fs';
import * as path from 'node:path';
import { getTailwindClasses } from 'tailwindcss-iso';

const TAILWIND_CACHE_FILE = '.tailwind-classes.json';

function readFileContent(file: string): string | null {
  if (!fs.existsSync(file)) {
    return null;
  }
  return fs.readFileSync(file, 'utf-8');
}

function writeFileContent(file: string, content: string): boolean {
  const dirname = path.dirname(file);

  if (!fs.existsSync(dirname)) {
    fs.mkdirSync(dirname, { recursive: true });
  }

  const current = readFileContent(file);
  if (current === null || content !== current) {
    fs.writeFileSync(file, content, 'utf8');
    return true;
  }

  return false;
}

function removeFile(file: string): boolean {
  if (!fs.existsSync(file)) {
    return false;
  }
  fs.rmSync(file);
  return true;
}

function getTailwindCacheFile(root: string): string {
  return path.resolve(root, TAILWIND_CACHE_FILE);
}

export function readTailwindCache(root: string): string[] | null {
  const content = readFileContent(getTailwindCacheFile(root));
  if (!content) {
    return null;
  }
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function writeTailwindCache(root: string, classes: string[]): { updated: boolean; content: string } {
  const file = getTailwindCacheFile(root);
  const content = JSON.stringify(classes, null, 2);
  const updated = writeFileContent(file, content);
  return { updated, content };
}

export function clearTailwindCache(root: string): void {
  writeTailwindCache(root, []);
}

export function removeTailwindCache(root: string): void {
  removeFile(getTailwindCacheFile(root));
}

export async function updateTailwindCache(root: string, content: string): Promise<void> {
  const classes = (await getTailwindClasses({
    content,
  })) as string[];

  writeTailwindCache(root, [...new Set([...(readTailwindCache(root) ?? []), ...classes])]);
}
