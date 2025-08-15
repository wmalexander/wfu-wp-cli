import { execSync } from 'child_process';

// Mock dependencies
jest.mock('child_process');
jest.mock('../../src/utils/config');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('SiteEnumerator', () => {
  let SiteEnumerator: any;
  let Config: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset modules to get fresh imports
    jest.resetModules();
    
    // Mock Config module
    Config = {
      getEnvironmentConfig: jest.fn(),
      hasRequiredEnvironmentConfig: jest.fn(),
    };
    
    require('../../src/utils/config').Config = Config;
  });

  describe('SiteInfo interface', () => {
    it('should have correct interface structure', async () => {
      const { SiteEnumerator } = await import('../../src/utils/site-enumerator');
      
      // Test that interfaces are properly typed (compile-time test)
      const sampleSite = {
        blogId: 1,
        domain: 'example.com',
        path: '/',
        registeredDate: '2023-01-01',
        lastUpdated: '2023-12-01',
        isPublic: true,
        isArchived: false,
        isMature: false,
        isSpam: false,
        isDeleted: false,
        lang: 'en_US'
      };
      
      expect(typeof sampleSite.blogId).toBe('number');
      expect(typeof sampleSite.domain).toBe('string');
      expect(typeof sampleSite.path).toBe('string');
      expect(typeof sampleSite.isPublic).toBe('boolean');
    });
  });

  describe('enumerateSites', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/site-enumerator');
      SiteEnumerator = module.SiteEnumerator;
    });

    it('should throw error for unconfigured environment', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(false);
      
      await expect(
        SiteEnumerator.enumerateSites('invalid')
      ).rejects.toThrow("Environment 'invalid' is not configured");
    });

    it('should enumerate sites successfully', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      // Mock MySQL query result
      const mockSqlOutput = `1	example.com	/	2023-01-01 00:00:00	2023-12-01 00:00:00	1	0	0	0	0
2	sub.example.com	/blog/	2023-02-01 00:00:00	2023-12-01 00:00:00	1	0	0	0	0`;
      
      mockExecSync.mockReturnValue(mockSqlOutput);

      const result = await SiteEnumerator.enumerateSites('prod');
      
      expect(result).toEqual({
        sites: expect.arrayContaining([
          expect.objectContaining({
            blogId: 1,
            domain: 'example.com',
            path: '/',
            isPublic: true
          }),
          expect.objectContaining({
            blogId: 2,
            domain: 'sub.example.com',
            path: '/blog/',
            isPublic: true
          })
        ]),
        totalCount: 2,
        filteredCount: 2,
        environment: 'prod'
      });
    });

    it('should filter active sites only', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      // Mock sites with mixed active/inactive status
      const mockSqlOutput = `1	example.com	/	2023-01-01 00:00:00	2023-12-01 00:00:00	1	0	0	0	0
2	inactive.com	/	2023-02-01 00:00:00	2023-12-01 00:00:00	0	1	0	0	0
3	active.com	/	2023-03-01 00:00:00	2023-12-01 00:00:00	1	0	0	0	0`;
      
      mockExecSync.mockReturnValue(mockSqlOutput);

      const result = await SiteEnumerator.enumerateSites('prod', { activeOnly: true });
      
      expect(result.sites).toHaveLength(2); // Only active sites
      expect(result.sites.every((site: any) => site.isPublic && !site.isArchived && !site.isDeleted)).toBe(true);
    });

    it('should include specific sites', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      const mockSqlOutput = `1	example.com	/	2023-01-01 00:00:00	2023-12-01 00:00:00	1	0	0	0	0
2	sub.example.com	/blog/	2023-02-01 00:00:00	2023-12-01 00:00:00	1	0	0	0	0
3	another.com	/	2023-03-01 00:00:00	2023-12-01 00:00:00	1	0	0	0	0`;
      
      mockExecSync.mockReturnValue(mockSqlOutput);

      const result = await SiteEnumerator.enumerateSites('prod', { includeSites: [1, 3] });
      
      expect(result.sites).toHaveLength(2);
      expect(result.sites.map((site: any) => site.blogId)).toEqual([1, 3]);
    });

    it('should exclude specific sites', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      const mockSqlOutput = `1	example.com	/	2023-01-01 00:00:00	2023-12-01 00:00:00	1	0	0	0	0
2	sub.example.com	/blog/	2023-02-01 00:00:00	2023-12-01 00:00:00	1	0	0	0	0
3	another.com	/	2023-03-01 00:00:00	2023-12-01 00:00:00	1	0	0	0	0`;
      
      mockExecSync.mockReturnValue(mockSqlOutput);

      const result = await SiteEnumerator.enumerateSites('prod', { excludeSites: [2] });
      
      expect(result.sites).toHaveLength(2);
      expect(result.sites.map((site: any) => site.blogId)).toEqual([1, 3]);
    });

    it('should handle main site inclusion/exclusion', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      const mockSqlOutput = `1	example.com	/	2023-01-01 00:00:00	2023-12-01 00:00:00	1	0	0	0	0
2	sub.example.com	/blog/	2023-02-01 00:00:00	2023-12-01 00:00:00	1	0	0	0	0`;
      
      mockExecSync.mockReturnValue(mockSqlOutput);

      // Test excluding main site
      const resultExcludeMain = await SiteEnumerator.enumerateSites('prod', { includeMainSite: false });
      expect(resultExcludeMain.sites.every((site: any) => site.blogId !== 1)).toBe(true);

      // Test including main site (default)
      const resultIncludeMain = await SiteEnumerator.enumerateSites('prod', { includeMainSite: true });
      expect(resultIncludeMain.sites.some((site: any) => site.blogId === 1)).toBe(true);
    });
  });

  describe('validateSiteExists', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/site-enumerator');
      SiteEnumerator = module.SiteEnumerator;
    });

    it('should validate existing site', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      mockExecSync.mockReturnValue('1'); // Site exists

      const result = await SiteEnumerator.validateSiteExists(1, 'prod');
      expect(result).toBe(true);
    });

    it('should detect non-existing site', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      mockExecSync.mockReturnValue('0'); // Site doesn't exist

      const result = await SiteEnumerator.validateSiteExists(999, 'prod');
      expect(result).toBe(false);
    });

    it('should throw error for unconfigured environment', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(false);
      
      await expect(
        SiteEnumerator.validateSiteExists(1, 'invalid')
      ).rejects.toThrow("Environment 'invalid' is not configured");
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      const module = await import('../../src/utils/site-enumerator');
      SiteEnumerator = module.SiteEnumerator;
    });

    it('should handle MySQL connection errors', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      mockExecSync.mockImplementation(() => {
        throw new Error('MySQL connection failed');
      });

      await expect(
        SiteEnumerator.enumerateSites('prod')
      ).rejects.toThrow('MySQL connection failed');
    });

    it('should handle malformed MySQL output', async () => {
      Config.hasRequiredEnvironmentConfig.mockReturnValue(true);
      Config.getEnvironmentConfig.mockReturnValue({
        host: 'localhost',
        user: 'testuser',
        password: 'testpass',
        database: 'testdb'
      });

      mockExecSync.mockReturnValue('invalid\toutput\tformat');

      const result = await SiteEnumerator.enumerateSites('prod');
      
      // Should handle gracefully and return empty or filtered results
      expect(result.sites).toBeDefined();
      expect(Array.isArray(result.sites)).toBe(true);
    });
  });
});