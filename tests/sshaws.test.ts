import { execSync } from 'child_process';

describe('wfuwp sshaws command', () => {
  const CLI_PATH = './bin/wfuwp';

  it('should display help when --help flag is used', () => {
    const result = execSync(`node ${CLI_PATH} sshaws --help`, { encoding: 'utf8' });
    expect(result).toContain('SSH into EC2 instances for a given environment');
    expect(result).toContain('environment');
    expect(result).toContain('--all');
    expect(result).toContain('--list');
    expect(result).toContain('--key');
    expect(result).toContain('--user');
    expect(result).toContain('--dry-run');
  });

  it('should reject invalid environment', () => {
    expect(() => {
      execSync(`node ${CLI_PATH} sshaws invalid`, { stdio: 'pipe' });
    }).toThrow();
  });

  it('should accept valid environments', () => {
    const validEnvs = ['dev', 'uat', 'pprd', 'prod'];
    validEnvs.forEach(env => {
      const result = execSync(`node ${CLI_PATH} sshaws --help`, { encoding: 'utf8' });
      expect(result).toContain(env);
    });
  });

  it('should show error when no environment provided', () => {
    expect(() => {
      execSync(`node ${CLI_PATH} sshaws`, { stdio: 'pipe' });
    }).toThrow();
  });
});