import { execSync } from 'child_process';

// These tests assert the stable CLI surface of `wfuwp local` (subcommands,
// usage lines, key option flags, exit code) rather than exact help prose,
// which drifts on every wording change. Output is captured from the real
// built CLI so assertions track actual behavior.

const CLI = './bin/wfuwp';

function help(args: string): string {
  return execSync(`node ${CLI} ${args} --help`, { encoding: 'utf8' });
}

describe('wfuwp local command surface', () => {
  describe('main command', () => {
    it('exits 0 and shows its usage', () => {
      const out = help('local');
      expect(out).toContain('Usage: wfuwp local');
      expect(out).toContain(
        'Manage local development environment for WFU WordPress sites'
      );
    });

    it('lists every expected subcommand', () => {
      const out = help('local');
      for (const sub of [
        'status',
        'domain',
        'install',
        'start',
        'stop',
        'restart',
        'delete',
        'refresh',
        'reset',
        'config',
      ]) {
        expect(out).toContain(sub);
      }
    });
  });

  describe('leaf subcommands route their own help', () => {
    it.each([
      ['status', 'Usage: wfuwp local status'],
      ['install', 'Usage: wfuwp local install'],
      ['start', 'Usage: wfuwp local start'],
      ['stop', 'Usage: wfuwp local stop'],
      ['restart', 'Usage: wfuwp local restart'],
      ['delete', 'Usage: wfuwp local delete'],
      ['reset', 'Usage: wfuwp local reset'],
    ])('local %s --help shows its own usage', (sub, usage) => {
      expect(help(`local ${sub}`)).toContain(usage);
    });
  });

  describe('domain group', () => {
    it('shows the domain usage and its children', () => {
      const out = help('local domain');
      expect(out).toContain('Usage: wfuwp local domain');
      for (const child of ['add', 'remove', 'list', 'reset']) {
        expect(out).toContain(child);
      }
    });
  });

  describe('config group', () => {
    it('shows the config usage and its children', () => {
      const out = help('local config');
      expect(out).toContain('Usage: wfuwp local config');
      for (const child of ['wizard', 'show', 'set', 'get', 'reset']) {
        expect(out).toContain(child);
      }
    });
  });

  describe('refresh subcommand', () => {
    it('accepts a site-id argument and key options', () => {
      const out = help('local refresh');
      expect(out).toContain('Usage: wfuwp local refresh');
      expect(out).toContain('[site-id]');
      expect(out).toContain('--force');
      expect(out).toContain('--from');
    });
  });
});
