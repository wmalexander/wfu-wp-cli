import { execSync } from 'child_process';
import { SiteEnumerator } from '../../src/utils/site-enumerator';
import { Config } from '../../src/utils/config';

jest.mock('child_process');
jest.mock('../../src/utils/config');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockConfig = Config as jest.Mocked<typeof Config>;

// blog_id, domain, path, registered, last_updated, public, archived, mature, spam, deleted, lang_id
const ROWS = [
  '1\twfu.edu\t/\t2023-01-01\t2023-12-01\t1\t0\t0\t0\t0\t0',
  '2\tnews.wfu.edu\t/\t2023-02-01\t2023-12-01\t1\t0\t0\t0\t0\t0',
  '3\told.wfu.edu\t/\t2023-03-01\t2023-12-01\t1\t1\t0\t0\t0\t0',
].join('\n');

describe('SiteEnumerator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig.hasRequiredEnvironmentConfig.mockReturnValue(true);
    mockConfig.getEnvironmentConfig.mockReturnValue({
      host: 'localhost',
      user: 'u',
      password: 'p',
      database: 'd',
    } as any);
    mockExecSync.mockReturnValue(ROWS as any);
  });

  describe('enumerateSites', () => {
    it('throws for an unconfigured environment', async () => {
      mockConfig.hasRequiredEnvironmentConfig.mockReturnValue(false);
      await expect(SiteEnumerator.enumerateSites('invalid')).rejects.toThrow(
        "Environment 'invalid' is not configured"
      );
    });

    it('parses rows and excludes the main site by default', async () => {
      const result = await SiteEnumerator.enumerateSites('prod');
      expect(result.totalCount).toBe(3);
      expect(result.filteredCount).toBe(2);
      expect(result.sites.map((s) => s.blogId)).toEqual([2, 3]);
      expect(result.sites[0]).toMatchObject({
        blogId: 2,
        domain: 'news.wfu.edu',
        isPublic: true,
        isArchived: false,
      });
    });

    it('includes the main site when requested', async () => {
      const result = await SiteEnumerator.enumerateSites('prod', {
        includeMainSite: true,
      });
      expect(result.sites.map((s) => s.blogId)).toEqual([1, 2, 3]);
    });

    it('activeOnly drops archived/spam/deleted sites', async () => {
      const result = await SiteEnumerator.enumerateSites('prod', {
        includeMainSite: true,
        activeOnly: true,
      });
      expect(result.sites.map((s) => s.blogId)).toEqual([1, 2]);
    });

    it('honors includeSites', async () => {
      const result = await SiteEnumerator.enumerateSites('prod', {
        includeMainSite: true,
        includeSites: [3],
      });
      expect(result.sites.map((s) => s.blogId)).toEqual([3]);
    });

    it('honors excludeSites', async () => {
      const result = await SiteEnumerator.enumerateSites('prod', {
        includeMainSite: true,
        excludeSites: [2],
      });
      expect(result.sites.map((s) => s.blogId)).toEqual([1, 3]);
    });
  });

  describe('validateSiteExists', () => {
    it('returns true for an existing non-main site', async () => {
      await expect(
        SiteEnumerator.validateSiteExists(2, 'prod')
      ).resolves.toBe(true);
    });

    it('returns false for a missing site', async () => {
      await expect(
        SiteEnumerator.validateSiteExists(999, 'prod')
      ).resolves.toBe(false);
    });

    it('returns false when the environment is unconfigured', async () => {
      mockConfig.hasRequiredEnvironmentConfig.mockReturnValue(false);
      await expect(
        SiteEnumerator.validateSiteExists(2, 'invalid')
      ).resolves.toBe(false);
    });
  });
});
