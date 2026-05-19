import { execSync } from 'child_process';
import { S3Sync } from '../../src/utils/s3sync';

jest.mock('child_process');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('S3Sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAwsCli', () => {
    it('returns true when the AWS CLI responds', () => {
      mockExecSync.mockReturnValue('' as any);
      expect(S3Sync.checkAwsCli()).toBe(true);
    });

    it('returns false when the AWS CLI is unavailable', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not found');
      });
      expect(S3Sync.checkAwsCli()).toBe(false);
    });
  });

  describe('checkAwsCredentials', () => {
    it('returns true when STS identity resolves', () => {
      mockExecSync.mockReturnValue('' as any);
      expect(S3Sync.checkAwsCredentials()).toBe(true);
    });

    it('returns false when STS identity fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('expired token');
      });
      expect(S3Sync.checkAwsCredentials()).toBe(false);
    });
  });

  describe('validateEnvironment', () => {
    it.each(['dev', 'uat', 'pprd', 'prod', 'local', 'PROD'])(
      'accepts %s',
      (env) => {
        expect(S3Sync.validateEnvironment(env)).toBe(true);
      }
    );

    it('rejects an unknown environment', () => {
      expect(S3Sync.validateEnvironment('staging')).toBe(false);
    });
  });

  describe('validateSiteId', () => {
    it('accepts a positive integer string', () => {
      expect(S3Sync.validateSiteId('43')).toBe(true);
    });

    it.each(['0', '-3', 'abc', '1.5', ''])('rejects %s', (id) => {
      expect(S3Sync.validateSiteId(id)).toBe(false);
    });
  });
});
