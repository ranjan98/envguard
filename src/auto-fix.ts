import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export interface Fix {
  line: number;
  original: string;
  fixed: string;
  reason: string;
}

export function autoFixEnvFile(envFilePath: string): Fix[] {
  const content = fs.readFileSync(envFilePath, 'utf-8');
  const lines = content.split('\n');
  const fixes: Fix[] = [];

  const fixedLines = lines.map((line, index) => {
    const lineNum = index + 1;
    let fixedLine = line;
    let hasChanged = false;

    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) {
      return line;
    }

    // Check if line has = sign
    if (!line.includes('=')) {
      return line;
    }

    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=');

    // Fix 1: Remove trailing comments from values
    if (value.includes('#') && !value.trim().startsWith('"') && !value.trim().startsWith("'")) {
      const cleanValue = value.split('#')[0].trim();
      fixedLine = `${key}=${cleanValue}`;
      if (fixedLine !== line) {
        fixes.push({
          line: lineNum,
          original: line,
          fixed: fixedLine,
          reason: 'Removed inline comment from value',
        });
        hasChanged = true;
      }
    }

    // Fix 2: Add quotes to values with spaces (if not already quoted)
    if (!hasChanged && value.includes(' ') &&
        !value.trim().startsWith('"') &&
        !value.trim().startsWith("'")) {
      fixedLine = `${key}="${value.trim()}"`;
      fixes.push({
        line: lineNum,
        original: line,
        fixed: fixedLine,
        reason: 'Added quotes around value with spaces',
      });
      hasChanged = true;
    }

    // Fix 3: Remove extra spaces around equals sign
    if (!hasChanged && (key.includes(' ') || value.startsWith(' '))) {
      fixedLine = `${key.trim()}=${value.trimStart()}`;
      if (fixedLine !== line) {
        fixes.push({
          line: lineNum,
          original: line,
          fixed: fixedLine,
          reason: 'Removed extra spaces around equals sign',
        });
        hasChanged = true;
      }
    }

    // Fix 4: Remove quotes from numeric values
    if (!hasChanged &&
        (value.trim().startsWith('"') || value.trim().startsWith("'"))) {
      const unquoted = value.trim().slice(1, -1);
      if (/^\d+$/.test(unquoted) && !unquoted.startsWith('0')) {
        fixedLine = `${key}=${unquoted}`;
        fixes.push({
          line: lineNum,
          original: line,
          fixed: fixedLine,
          reason: 'Removed unnecessary quotes from numeric value',
        });
        hasChanged = true;
      }
    }

    return hasChanged ? fixedLine : line;
  });

  if (fixes.length > 0) {
    // Create backup
    const backupPath = `${envFilePath}.backup`;
    fs.writeFileSync(backupPath, content, 'utf-8');

    // Write fixed content
    fs.writeFileSync(envFilePath, fixedLines.join('\n'), 'utf-8');
  }

  return fixes;
}

export function displayFixes(fixes: Fix[]): void {
  if (fixes.length === 0) {
    console.log(chalk.green('\n✓ No issues found to auto-fix'));
    return;
  }

  console.log(chalk.yellow(`\n🔧 Applied ${fixes.length} automatic fix(es):\n`));
  fixes.forEach((fix) => {
    console.log(chalk.gray(`  Line ${fix.line}:`));
    console.log(chalk.red(`  - ${fix.original}`));
    console.log(chalk.green(`  + ${fix.fixed}`));
    console.log(chalk.blue(`    → ${fix.reason}\n`));
  });

  console.log(chalk.gray('  Backup saved to .env.backup'));
}
