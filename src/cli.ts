#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { validateEnvFile, checkForSecrets, generateEnvExample, scanGitHistory } from './utils';

const program = new Command();

program
  .name('envguard')
  .description('Validate .env files, detect secrets, and manage environment configurations')
  .version('1.0.0');

program
  .command('validate [envFile]')
  .description('Validate .env file against a schema')
  .option('-s, --schema <file>', 'Path to validation schema (JSON or JS)', './env.schema.js')
  .action(async (envFile = '.env', options) => {
    try {
      console.log(chalk.blue.bold('\n🛡️  EnvGuard - Validation\n'));

      if (!fs.existsSync(envFile)) {
        console.error(chalk.red(`Error: ${envFile} not found`));
        process.exit(1);
      }

      const result = await validateEnvFile(envFile, options.schema);

      if (result.valid) {
        console.log(chalk.green('✓ Validation passed!'));
        console.log(chalk.gray(`\n  Found ${result.variables.length} environment variables`));
      } else {
        console.log(chalk.red('✗ Validation failed!\n'));
        result.errors.forEach(error => {
          console.log(chalk.red(`  • ${error}`));
        });
        process.exit(1);
      }
    } catch (error: any) {
      console.error(chalk.red('\nError:'), error.message);
      process.exit(1);
    }
  });

program
  .command('check-secrets [envFile]')
  .description('Scan .env file for exposed secrets')
  .action(async (envFile = '.env') => {
    try {
      console.log(chalk.blue.bold('\n🔍 EnvGuard - Secret Scanner\n'));

      if (!fs.existsSync(envFile)) {
        console.error(chalk.red(`Error: ${envFile} not found`));
        process.exit(1);
      }

      const secrets = await checkForSecrets(envFile);

      if (secrets.length === 0) {
        console.log(chalk.green('✓ No exposed secrets detected'));
      } else {
        console.log(chalk.yellow(`⚠️  Found ${secrets.length} potential secret(s):\n`));
        secrets.forEach(secret => {
          console.log(chalk.yellow(`  • ${secret.key}: ${secret.reason}`));
        });
        console.log(chalk.gray('\n  Tip: Add these to .gitignore and use a secrets manager'));
      }
    } catch (error: any) {
      console.error(chalk.red('\nError:'), error.message);
      process.exit(1);
    }
  });

program
  .command('generate-example [envFile]')
  .description('Generate .env.example from .env file')
  .option('-o, --output <file>', 'Output file', '.env.example')
  .action(async (envFile = '.env', options) => {
    try {
      console.log(chalk.blue.bold('\n📝 EnvGuard - Example Generator\n'));

      if (!fs.existsSync(envFile)) {
        console.error(chalk.red(`Error: ${envFile} not found`));
        process.exit(1);
      }

      await generateEnvExample(envFile, options.output);
      console.log(chalk.green(`✓ Generated ${options.output}`));
    } catch (error: any) {
      console.error(chalk.red('\nError:'), error.message);
      process.exit(1);
    }
  });

program
  .command('scan-history')
  .description('Scan git history for accidentally committed secrets')
  .option('-d, --depth <number>', 'Number of commits to scan', '100')
  .action(async (options) => {
    try {
      console.log(chalk.blue.bold('\n🔎 EnvGuard - Git History Scanner\n'));
      console.log(chalk.gray(`Scanning last ${options.depth} commits...\n`));

      const findings = await scanGitHistory(parseInt(options.depth));

      if (findings.length === 0) {
        console.log(chalk.green('✓ No secrets found in git history'));
      } else {
        console.log(chalk.red(`⚠️  Found ${findings.length} potential secret(s) in history:\n`));
        findings.forEach(finding => {
          console.log(chalk.red(`  Commit: ${finding.commit}`));
          console.log(chalk.yellow(`  File: ${finding.file}`));
          console.log(chalk.gray(`  ${finding.line}\n`));
        });
        console.log(chalk.yellow('  ⚠️  These secrets may be compromised. Rotate them immediately!'));
      }
    } catch (error: any) {
      console.error(chalk.red('\nError:'), error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
