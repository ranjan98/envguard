import * as fs from 'fs';
import * as path from 'path';
import { EnvVariable } from './types';

export function parseEnvFile(filePath: string): EnvVariable[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const variables: EnvVariable[] = [];
  let currentComment = '';

  lines.forEach((line, index) => {
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) {
      currentComment = '';
      return;
    }

    // Capture comments
    if (trimmedLine.startsWith('#')) {
      currentComment = trimmedLine.substring(1).trim();
      return;
    }

    // Parse key-value pairs
    const match = trimmedLine.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      // Remove quotes if present
      let cleanValue = value.trim();
      if (
        (cleanValue.startsWith('"') && cleanValue.endsWith('"')) ||
        (cleanValue.startsWith("'") && cleanValue.endsWith("'"))
      ) {
        cleanValue = cleanValue.slice(1, -1);
      }

      variables.push({
        key,
        value: cleanValue,
        line: index + 1,
        hasComment: currentComment !== '',
        comment: currentComment || undefined,
      });
      currentComment = '';
    }
  });

  return variables;
}

export function findEnvFiles(dir: string = process.cwd()): string[] {
  const envFiles: string[] = [];
  const commonEnvFiles = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.production',
    '.env.test',
    '.env.staging',
  ];

  commonEnvFiles.forEach((file) => {
    const fullPath = path.join(dir, file);
    if (fs.existsSync(fullPath)) {
      envFiles.push(fullPath);
    }
  });

  return envFiles;
}

export function formatError(message: string): string {
  return `✗ ${message}`;
}

export function formatSuccess(message: string): string {
  return `✓ ${message}`;
}

export function formatWarning(message: string): string {
  return `⚠ ${message}`;
}

export function isLikelySecret(key: string, value: string): boolean {
  const secretKeywords = [
    'password',
    'secret',
    'token',
    'api_key',
    'apikey',
    'auth',
    'private',
    'credential',
    'key',
  ];

  const lowerKey = key.toLowerCase();
  const hasSecretKeyword = secretKeywords.some((keyword) =>
    lowerKey.includes(keyword)
  );

  // Check if value looks like a secret (random string with sufficient entropy)
  const hasEnoughEntropy = value.length > 16 && /[A-Za-z0-9+/=]/.test(value);
  
  return hasSecretKeyword && hasEnoughEntropy;
}

export function maskValue(value: string): string {
  if (value.length <= 4) {
    return '***';
  }
  return value.substring(0, 4) + '*'.repeat(Math.min(value.length - 4, 20));
}
