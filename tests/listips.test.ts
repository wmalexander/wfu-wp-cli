import { execSync } from 'child_process';

describe('wfuwp listips command', () => {
  const CLI_PATH = './bin/wfuwp';

  it('should display help when --help flag is used', () => {
    const result = execSync(`node ${CLI_PATH} listips --help`, { encoding: 'utf8' });
    expect(result).toContain('List EC2 instance IP addresses for a given environment');
    expect(result).toContain('environment');
    expect(result).toContain('--private');
    expect(result).toContain('--public');
    expect(result).toContain('--json');
  });

  it('should reject invalid environment', () => {
    expect(() => {
      execSync(`node ${CLI_PATH} listips invalid`, { stdio: 'pipe' });
    }).toThrow();
  });

  it('should accept valid environments', () => {
    const validEnvs = ['dev', 'uat', 'pprd', 'prod'];
    validEnvs.forEach(env => {
      const result = execSync(`node ${CLI_PATH} listips --help`, { encoding: 'utf8' });
      expect(result).toContain(env);
    });
  });

  it('should show error when no environment provided', () => {
    expect(() => {
      execSync(`node ${CLI_PATH} listips`, { stdio: 'pipe' });
    }).toThrow();
  });
});