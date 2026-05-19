import { NetworkTableOperations } from '../../src/utils/network-tables';
import { Config } from '../../src/utils/config';

jest.mock('../../src/utils/config');

const mockConfig = Config as jest.Mocked<typeof Config>;

describe('NetworkTableOperations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('getNetworkTables', () => {
    it('returns the full network table catalog with shape', () => {
      const tables = NetworkTableOperations.getNetworkTables();
      expect(tables.length).toBeGreaterThan(0);
      const blogs = tables.find((t) => t.name === 'wp_blogs');
      expect(blogs).toMatchObject({
        name: 'wp_blogs',
        type: 'core',
        migrateable: true,
      });
      const users = tables.find((t) => t.name === 'wp_users');
      expect(users).toMatchObject({ name: 'wp_users', migrateable: false });
    });
  });

  describe('getMigrateableNetworkTables', () => {
    it('returns only the migrateable table names', () => {
      const names = NetworkTableOperations.getMigrateableNetworkTables();
      expect(names).toEqual(
        expect.arrayContaining([
          'wp_blogs',
          'wp_site',
          'wp_sitemeta',
          'wp_blogmeta',
        ])
      );
      expect(names).not.toContain('wp_users');
      expect(names).not.toContain('wp_signups');
    });
  });

  describe('getExistingNetworkTables', () => {
    it('throws for an unconfigured environment', () => {
      mockConfig.hasRequiredEnvironmentConfig.mockReturnValue(false);
      mockConfig.getEnvironmentConfig.mockReturnValue({} as any);
      expect(() =>
        NetworkTableOperations.getExistingNetworkTables('bogus')
      ).toThrow("Environment 'bogus' is not configured");
    });
  });

  describe('validateNetworkTablesForMigration', () => {
    it('throws when the source has no migrateable network tables', () => {
      jest
        .spyOn(NetworkTableOperations, 'getExistingNetworkTables')
        .mockImplementation((env: string) =>
          env === 'prod' ? ['wp_users'] : ['wp_blogs']
        );
      expect(() =>
        NetworkTableOperations.validateNetworkTablesForMigration('prod', 'uat')
      ).toThrow(/No migrateable network tables found/);
    });

    it('passes when source has migrateable tables present', () => {
      jest
        .spyOn(NetworkTableOperations, 'getExistingNetworkTables')
        .mockReturnValue([
          'wp_blogs',
          'wp_site',
          'wp_sitemeta',
          'wp_blogmeta',
        ]);
      expect(() =>
        NetworkTableOperations.validateNetworkTablesForMigration('prod', 'uat')
      ).not.toThrow();
    });
  });
});
