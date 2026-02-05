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

// Secret patterns for detection
const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS Secret Key', pattern: /[A-Za-z0-9/+=]{40}/ },
  { name: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36}/ },
  { name: 'GitHub OAuth', pattern: /gho_[a-zA-Z0-9]{36}/ },
  { name: 'Slack Token', pattern: /xox[baprs]-[0-9a-zA-Z-]+/ },
  { name: 'Stripe Key', pattern: /sk_live_[0-9a-zA-Z]{24,}/ },
  { name: 'Stripe Test Key', pattern: /sk_test_[0-9a-zA-Z]{24,}/ },
  { name: 'Private Key', pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/ },
  { name: 'JWT Token', pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/ },
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'Firebase Key', pattern: /AAAA[A-Za-z0-9_-]{7}:[A-Za-z0-9_-]{140}/ },
];

export interface ValidationResult {
  valid: boolean;
  variables: EnvVariable[];
  errors: string[];
}

export interface SecretFinding {
  key: string;
  reason: string;
  line?: number;
}

export interface GitHistoryFinding {
  commit: string;
  file: string;
  line: string;
}

export async function validateEnvFile(
  envFilePath: string,
  schemaPath?: string
): Promise<ValidationResult> {
  const variables = parseEnvFile(envFilePath);
  const errors: string[] = [];

  // Basic validation - check for empty values
  variables.forEach((variable) => {
    if (variable.value === '') {
      errors.push(`${variable.key} is empty (line ${variable.line})`);
    }
  });

  // Schema validation if provided
  if (schemaPath && fs.existsSync(schemaPath)) {
    try {
      // Dynamic import for schema file
      const schema = require(path.resolve(schemaPath));

      // Check for required variables
      if (schema.required && Array.isArray(schema.required)) {
        const varNames = variables.map((v) => v.key);
        schema.required.forEach((reqVar: string) => {
          if (!varNames.includes(reqVar)) {
            errors.push(`Missing required variable: ${reqVar}`);
          }
        });
      }

      // Check for variable types/patterns if defined
      if (schema.variables) {
        for (const [key, rules] of Object.entries(schema.variables as Record<string, any>)) {
          const variable = variables.find((v) => v.key === key);
          if (variable && rules.pattern) {
            const regex = new RegExp(rules.pattern);
            if (!regex.test(variable.value)) {
              errors.push(`${key} does not match expected pattern`);
            }
          }
        }
      }
    } catch (err: any) {
      errors.push(`Failed to load schema: ${err.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    variables,
    errors,
  };
}

export async function checkForSecrets(envFilePath: string): Promise<SecretFinding[]> {
  const variables = parseEnvFile(envFilePath);
  const findings: SecretFinding[] = [];

  variables.forEach((variable) => {
    // Check against known secret patterns
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (pattern.test(variable.value)) {
        findings.push({
          key: variable.key,
          reason: `Looks like a ${name}`,
          line: variable.line,
        });
        return; // Only report first match per variable
      }
    }

    // Check for likely secrets based on key name and value entropy
    if (isLikelySecret(variable.key, variable.value)) {
      findings.push({
        key: variable.key,
        reason: 'Key name suggests sensitive data with high-entropy value',
        line: variable.line,
      });
    }
  });

  return findings;
}

export async function generateEnvExample(
  envFilePath: string,
  outputPath: string
): Promise<void> {
  const variables = parseEnvFile(envFilePath);
  let output = '# Generated by EnvGuard\n';
  output += `# Template from ${path.basename(envFilePath)}\n\n`;

  variables.forEach((variable) => {
    // Add comment if exists
    if (variable.comment) {
      output += `# ${variable.comment}\n`;
    }

    // Generate placeholder value
    let placeholder = variable.value;

    // Check if it looks like a secret
    if (isLikelySecret(variable.key, variable.value)) {
      placeholder = `your-${variable.key.toLowerCase().replace(/_/g, '-')}-here`;
    } else if (variable.value.match(/^\d+$/)) {
      // Keep numeric values as-is (like ports)
      placeholder = variable.value;
    } else if (variable.value === 'true' || variable.value === 'false') {
      // Keep boolean values
      placeholder = variable.value;
    } else if (variable.value.includes('://')) {
      // URL - keep protocol, mask the rest
      const [protocol] = variable.value.split('://');
      placeholder = `${protocol}://your-url-here`;
    }

    output += `${variable.key}=${placeholder}\n`;
  });

  fs.writeFileSync(outputPath, output, 'utf-8');
}

export async function scanGitHistory(depth: number = 100): Promise<GitHistoryFinding[]> {
  const findings: GitHistoryFinding[] = [];

  try {
    const { execSync } = require('child_process');

    // Get git log with file changes
    const gitLog = execSync(
      `git log --all -p --max-count=${depth} -- '*.env*' 2>/dev/null || true`,
      { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
    );

    if (!gitLog.trim()) {
      return findings;
    }

    const lines = gitLog.split('\n');
    let currentCommit = '';
    let currentFile = '';

    lines.forEach((line: string) => {
      // Track current commit
      if (line.startsWith('commit ')) {
        currentCommit = line.split(' ')[1].substring(0, 7);
      }

      // Track current file
      if (line.startsWith('+++ b/')) {
        currentFile = line.substring(6);
      }

      // Look for added lines with potential secrets
      if (line.startsWith('+') && !line.startsWith('+++')) {
        const addedLine = line.substring(1);

        // Check for secret patterns
        for (const { name, pattern } of SECRET_PATTERNS) {
          if (pattern.test(addedLine)) {
            findings.push({
              commit: currentCommit,
              file: currentFile,
              line: `${addedLine.substring(0, 80)}${addedLine.length > 80 ? '...' : ''}`,
            });
            break;
          }
        }
      }
    });
  } catch (err) {
    // Git not available or not a git repo - return empty
  }

  return findings;
}
