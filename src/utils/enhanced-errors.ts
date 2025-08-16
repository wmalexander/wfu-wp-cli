import chalk from 'chalk';

interface ErrorContext {
  command: string;
  error: Error | string;
  suggestion?: string;
}

const TROUBLESHOOTING_LINKS: Record<string, string> = {
  migrate: 'wfuwp docs troubleshooting --search migrate',
  'env-migrate': 'wfuwp docs troubleshooting --search env-migrate',
  config: 'wfuwp docs troubleshooting --search config',
  syncs3: 'wfuwp docs troubleshooting --search syncs3',
  db: 'wfuwp docs troubleshooting --search database',
  restore: 'wfuwp docs troubleshooting --search restore',
  local: 'wfuwp docs troubleshooting --search local',
  listips: 'wfuwp docs troubleshooting --search aws',
  sshaws: 'wfuwp docs troubleshooting --search ssh',
};

const ERROR_SUGGESTIONS: Record<string, string> = {
  'Docker is installed but not running': `
To fix this:
  • Mac: Start Docker Desktop from Applications
  • Linux: sudo systemctl start docker
  • Windows: Start Docker Desktop
  
Check Docker status: ${chalk.cyan('docker ps')}`,
  'Environment .* is not configured': `
Configure your environments:
  1. Run ${chalk.cyan('wfuwp config wizard')} for guided setup
  2. Or manually: ${chalk.cyan('wfuwp config set env.<env>.<field> <value>')}
  
Check configuration: ${chalk.cyan('wfuwp config verify')}`,
  'AWS CLI is not installed': `
AWS CLI is required for S3/EC2 features.

To install:
  • Mac: ${chalk.cyan('brew install awscli')}
  • Linux: ${chalk.cyan('sudo apt-get install awscli')}
  • All: https://aws.amazon.com/cli/
  
After installation: ${chalk.cyan('aws configure')}`,
  'Database connection failed': `
Troubleshooting database connections:
  1. Verify credentials: ${chalk.cyan('wfuwp config list')}
  2. Test connection: ${chalk.cyan('wfuwp db test <environment>')}
  3. Check network access to database server
  4. Ensure database user has proper permissions`,
  'No tables found for site': `
This error occurs when:
  1. The site ID doesn't exist in the source database
  2. You're using the wrong environment
  
To investigate:
  • List sites: ${chalk.cyan('wfuwp db list-sites <environment>')}
  • For main site (ID 1), use: ${chalk.cyan('--homepage')} flag`,
  'Permission denied': `
Permission issues can be resolved by:
  1. For /etc/hosts: Use ${chalk.cyan('sudo')} before the command
  2. For config files: Check ~/.wfuwp/ permissions
  3. For Docker: Ensure your user is in the docker group`,
  'S3 .* failed': `
S3 operation failed. Check:
  1. AWS credentials: ${chalk.cyan('aws configure list')}
  2. S3 bucket access: ${chalk.cyan('aws s3 ls s3://your-bucket/')}
  3. IAM permissions for S3 operations
  4. Network connectivity to AWS`,
};

export function enhanceError(context: ErrorContext): string {
  const errorMessage =
    typeof context.error === 'string' ? context.error : context.error.message;
  let output = chalk.red.bold('\n❌ Error: ') + errorMessage + '\n';
  // Find matching suggestion based on error patterns
  for (const [pattern, suggestion] of Object.entries(ERROR_SUGGESTIONS)) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(errorMessage)) {
      output += chalk.yellow('\n💡 Suggestion:') + suggestion + '\n';
      break;
    }
  }
  // Add custom suggestion if provided
  if (context.suggestion) {
    output +=
      chalk.yellow('\n💡 Additional help:') + '\n' + context.suggestion + '\n';
  }
  // Add troubleshooting link for the command
  if (TROUBLESHOOTING_LINKS[context.command]) {
    output +=
      chalk.gray('\n📚 For more help: ') +
      chalk.cyan(TROUBLESHOOTING_LINKS[context.command]) +
      '\n';
  }
  // Add general help
  output += chalk.gray('\n🩺 Check system: ') + chalk.cyan('wfuwp doctor');
  output +=
    chalk.gray('\n📖 Documentation: ') + chalk.cyan('wfuwp docs --list') + '\n';
  return output;
}

export function handleError(
  error: Error | string,
  command: string,
  suggestion?: string
): void {
  const enhancedMessage = enhanceError({ command, error, suggestion });
  console.error(enhancedMessage);
  process.exit(1);
}

export function wrapCommand<T extends (...args: any[]) => Promise<any>>(
  command: string,
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error as Error, command);
    }
  }) as T;
}
