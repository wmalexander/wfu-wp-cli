import { execSync } from 'child_process';

describe('wfuwp removehostkey command', () => {
  const CLI_PATH = './bin/wfuwp';

  it('should display help when --help flag is used', () => {
    const result = execSync(`node ${CLI_PATH} removehostkey --help`, { encoding: 'utf8' });
    expect(result).toContain('Remove SSH host keys for EC2 instances in a given environment');
    expect(result).toContain('environment');
    expect(result).toContain('--dry-run');
    expect(result).toContain('--all');
    expect(result).toContain('--known-hosts');
    expect(result).toContain('--yes');
    expect(result).toContain('Examples:');
  });

  it('should reject invalid environment', () => {
    expect(() => {
      execSync(`node ${CLI_PATH} removehostkey invalid`, { stdio: 'pipe' });
    }).toThrow();
  });

  it('should accept valid environments with dry-run', () => {
    const validEnvs = ['dev', 'uat', 'pprd', 'prod'];
    
    validEnvs.forEach(env => {
      expect(() => {
        execSync(`node ${CLI_PATH} removehostkey ${env} --dry-run --help`, { stdio: 'pipe' });
      }).not.toThrow();
    });
  });
});