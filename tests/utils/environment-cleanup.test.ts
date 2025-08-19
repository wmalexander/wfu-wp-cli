import { EnvironmentCleanupService } from '../../src/utils/environment-cleanup';
import { Config } from '../../src/utils/config';
import { DatabaseOperations } from '../../src/utils/database';
import { SiteEnumerator } from '../../src/utils/site-enumerator';

jest.mock('../../src/utils/config');
jest.mock('../../src/utils/database');
jest.mock('../../src/utils/site-enumerator');
jest.mock('../../src/utils/backup-recovery');

const mockConfig = Config as jest.Mocked<typeof Config>;
const mockDatabaseOperations = DatabaseOperations as jest.Mocked<typeof DatabaseOperations>;
const mockSiteEnumerator = SiteEnumerator as jest.Mocked<typeof SiteEnumerator>;

describe('EnvironmentCleanupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfig.hasRequiredEnvironmentConfig.mockReturnValue(true);
    mockConfig.getEnvironmentConfig.mockReturnValue({
      host: 'test-host',
      user: 'test-user',
      password: 'test-password',
      database: 'test-db',
    });
  });

  describe('compareEnvironments', () => {
    it('should identify orphaned sites correctly', async () => {
      mockSiteEnumerator.enumerateSites
        .mockResolvedValueOnce({
          sites: [
            { blogId: 1, domain: 'main.test', path: '/', registeredDate: '', lastUpdated: '', isPublic: true, isArchived: false, isMature: false, isSpam: false, isDeleted: false },
            { blogId: 43, domain: 'site43.test', path: '/site43/', registeredDate: '', lastUpdated: '', isPublic: true, isArchived: false, isMature: false, isSpam: false, isDeleted: false },
          ],
          totalCount: 2,
          filteredCount: 2,
          environment: 'prod',
        })
        .mockResolvedValueOnce({
          sites: [
            { blogId: 1, domain: 'main.test', path: '/', registeredDate: '', lastUpdated: '', isPublic: true, isArchived: false, isMature: false, isSpam: false, isDeleted: false },
            { blogId: 43, domain: 'site43.test', path: '/site43/', registeredDate: '', lastUpdated: '', isPublic: true, isArchived: false, isMature: false, isSpam: false, isDeleted: false },
            { blogId: 99, domain: 'orphaned.test', path: '/orphaned/', registeredDate: '', lastUpdated: '', isPublic: true, isArchived: false, isMature: false, isSpam: false, isDeleted: false },
          ],
          totalCount: 3,
          filteredCount: 3,
          environment: 'dev',
        });

      mockDatabaseOperations.getSiteTables
        .mockReturnValueOnce(['wp_99_posts', 'wp_99_options', 'wp_99_postmeta'])
        .mockReturnValueOnce(['wp_posts', 'wp_options'])
        .mockReturnValueOnce(['wp_43_posts', 'wp_43_options', 'wp_43_postmeta'])
        .mockReturnValueOnce(['wp_43_posts', 'wp_43_options'])
        .mockReturnValueOnce(['wp_43_posts', 'wp_43_options', 'wp_43_postmeta']);

      const result = await EnvironmentCleanupService.compareEnvironments('prod', ['dev']);

      expect(result).toHaveLength(1);
      expect(result[0].environment).toBe('dev');
      expect(result[0].orphanedSites).toHaveLength(1);
      expect(result[0].orphanedSites[0].siteId).toBe(99);
      expect(result[0].orphanedSites[0].tables).toEqual(['wp_99_posts', 'wp_99_options', 'wp_99_postmeta']);
    });

    it('should identify orphaned tables correctly', async () => {
      mockSiteEnumerator.enumerateSites
        .mockResolvedValueOnce({
          sites: [
            { blogId: 43, domain: 'site43.test', path: '/site43/', registeredDate: '', lastUpdated: '', isPublic: true, isArchived: false, isMature: false, isSpam: false, isDeleted: false },
          ],
          totalCount: 1,
          filteredCount: 1,
          environment: 'prod',
        })
        .mockResolvedValueOnce({
          sites: [
            { blogId: 43, domain: 'site43.test', path: '/site43/', registeredDate: '', lastUpdated: '', isPublic: true, isArchived: false, isMature: false, isSpam: false, isDeleted: false },
          ],
          totalCount: 1,
          filteredCount: 1,
          environment: 'dev',
        });

      mockDatabaseOperations.getSiteTables
        .mockReturnValueOnce(['wp_43_posts', 'wp_43_options'])
        .mockReturnValueOnce(['wp_43_posts', 'wp_43_options', 'wp_43_custom_table']);

      const result = await EnvironmentCleanupService.compareEnvironments('prod', ['dev']);

      expect(result[0].orphanedTables).toHaveLength(1);
      expect(result[0].orphanedTables[0].tableName).toBe('wp_43_custom_table');
      expect(result[0].orphanedTables[0].siteId).toBe(43);
    });

    it('should prevent operations on production environment', async () => {
      await expect(
        EnvironmentCleanupService.compareEnvironments('prod', ['prod'])
      ).rejects.toThrow('Cannot perform cleanup operations on production environment');
    });
  });

  describe('deleteSiteFromEnvironment', () => {
    it('should delete site and tables successfully', async () => {
      mockSiteEnumerator.validateSiteExists.mockResolvedValue(true);
      mockDatabaseOperations.getSiteTables.mockReturnValue(['wp_43_posts', 'wp_43_options']);
      
      // Mock the private static methods used by deleteSiteFromEnvironment
      const deleteSiteFromBlogsTableSpy = jest.spyOn(EnvironmentCleanupService as any, 'deleteSiteFromBlogsTable').mockResolvedValue(undefined);
      const dropTablesSpy = jest.spyOn(EnvironmentCleanupService as any, 'dropTables').mockResolvedValue(undefined);

      const result = await EnvironmentCleanupService.deleteSiteFromEnvironment(43, 'dev', {
        dryRun: false,
        createBackup: false,
      });

      expect(result.deletedSites).toEqual([43]);
      expect(result.droppedTables).toEqual(['wp_43_posts', 'wp_43_options']);
      expect(result.errors).toHaveLength(0);
      
      expect(deleteSiteFromBlogsTableSpy).toHaveBeenCalledWith(43, 'dev');
      expect(dropTablesSpy).toHaveBeenCalledWith(['wp_43_posts', 'wp_43_options'], 'dev');
      
      deleteSiteFromBlogsTableSpy.mockRestore();
      dropTablesSpy.mockRestore();
    });

    it('should handle non-existent site', async () => {
      mockSiteEnumerator.validateSiteExists.mockResolvedValue(false);

      const result = await EnvironmentCleanupService.deleteSiteFromEnvironment(999, 'dev');

      expect(result.deletedSites).toHaveLength(0);
      expect(result.errors).toContain('Site 999 does not exist in dev environment');
    });

    it('should prevent deletion from production', async () => {
      await expect(
        EnvironmentCleanupService.deleteSiteFromEnvironment(43, 'prod')
      ).rejects.toThrow('Cannot delete sites from production environment');
    });

    it('should handle dry run mode', async () => {
      mockSiteEnumerator.validateSiteExists.mockResolvedValue(true);
      mockDatabaseOperations.getSiteTables.mockReturnValue(['wp_43_posts']);

      const result = await EnvironmentCleanupService.deleteSiteFromEnvironment(43, 'dev', {
        dryRun: true,
      });

      expect(result.deletedSites).toHaveLength(0);
      expect(result.droppedTables).toEqual(['wp_43_posts']);
    });
  });

  describe('cleanupOrphanedTables', () => {
    it('should cleanup orphaned tables', async () => {
      const orphanedTables = [
        { tableName: 'wp_43_old_table', siteId: 43 },
        { tableName: 'wp_99_custom_table', siteId: 99 },
      ];

      const dropTablesSpy = jest.spyOn(EnvironmentCleanupService as any, 'dropTables').mockResolvedValue(undefined);

      const result = await EnvironmentCleanupService.cleanupOrphanedTables(
        orphanedTables,
        'dev',
        { dryRun: false }
      );

      expect(result.droppedTables).toEqual(['wp_43_old_table', 'wp_99_custom_table']);
      expect(result.errors).toHaveLength(0);
      
      expect(dropTablesSpy).toHaveBeenCalledWith(['wp_43_old_table', 'wp_99_custom_table'], 'dev');
      dropTablesSpy.mockRestore();
    });

    it('should prevent cleanup in production', async () => {
      const orphanedTables = [{ tableName: 'wp_43_table', siteId: 43 }];

      await expect(
        EnvironmentCleanupService.cleanupOrphanedTables(orphanedTables, 'prod')
      ).rejects.toThrow('Cannot cleanup tables in production environment');
    });
  });

  describe('performEnvironmentCleanup', () => {
    it('should perform complete environment cleanup', async () => {
      // Mock the private methods
      const deleteSiteFromBlogsTableSpy = jest.spyOn(EnvironmentCleanupService as any, 'deleteSiteFromBlogsTable').mockResolvedValue(undefined);
      const dropTablesSpy = jest.spyOn(EnvironmentCleanupService as any, 'dropTables').mockResolvedValue(undefined);

      mockSiteEnumerator.enumerateSites
        .mockResolvedValueOnce({
          sites: [{ blogId: 43, domain: 'site43.test', path: '/site43/', registeredDate: '', lastUpdated: '', isPublic: true, isArchived: false, isMature: false, isSpam: false, isDeleted: false }],
          totalCount: 1,
          filteredCount: 1,
          environment: 'prod',
        })
        .mockResolvedValueOnce({
          sites: [
            { blogId: 43, domain: 'site43.test', path: '/site43/', registeredDate: '', lastUpdated: '', isPublic: true, isArchived: false, isMature: false, isSpam: false, isDeleted: false },
            { blogId: 99, domain: 'orphaned.test', path: '/orphaned/', registeredDate: '', lastUpdated: '', isPublic: true, isArchived: false, isMature: false, isSpam: false, isDeleted: false },
          ],
          totalCount: 2,
          filteredCount: 2,
          environment: 'dev',
        });

      mockSiteEnumerator.validateSiteExists.mockResolvedValue(true);
      mockDatabaseOperations.getSiteTables
        .mockReturnValueOnce(['wp_99_posts'])
        .mockReturnValueOnce(['wp_43_posts'])
        .mockReturnValueOnce(['wp_43_posts', 'wp_43_custom']);

      const results = await EnvironmentCleanupService.performEnvironmentCleanup(
        'prod',
        ['dev'],
        { dryRun: false, createBackup: false }
      );

      expect(results).toHaveLength(1);
      expect(results[0].environment).toBe('dev');
      expect(results[0].deletedSites).toEqual([99]);
      expect(results[0].droppedTables).toContain('wp_99_posts');
      expect(results[0].droppedTables).toContain('wp_43_custom');
      
      deleteSiteFromBlogsTableSpy.mockRestore();
      dropTablesSpy.mockRestore();
    });
  });

  describe('generateCleanupReport', () => {
    it('should generate comprehensive report', async () => {
      const comparisons = [{
        environment: 'dev',
        orphanedSites: [{
          siteId: 99,
          domain: 'orphaned.test',
          path: '/orphaned/',
          tables: ['wp_99_posts'],
        }],
        orphanedTables: [{
          tableName: 'wp_43_custom',
          siteId: 43,
        }],
        totalOrphanedTables: 2,
      }];

      const results = [{
        environment: 'dev',
        deletedSites: [99],
        droppedTables: ['wp_99_posts', 'wp_43_custom'],
        errors: [],
        duration: 1000,
      }];

      const report = await EnvironmentCleanupService.generateCleanupReport(comparisons, results);

      expect(report).toContain('Environment Cleanup Report');
      expect(report).toContain('Environment: DEV');
      expect(report).toContain('Orphaned Sites: 1');
      expect(report).toContain('Orphaned Tables: 1');
      expect(report).toContain('Sites Deleted: 1');
      expect(report).toContain('Tables Dropped: 2');
    });
  });
});