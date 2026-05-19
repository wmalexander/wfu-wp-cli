import { execSync } from 'child_process';
import { S3Operations } from '../../src/utils/s3';
import { Config } from '../../src/utils/config';

jest.mock('child_process');
jest.mock('../../src/utils/config');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockConfig = Config as jest.Mocked<typeof Config>;

describe('S3Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkAwsCliAvailability', () => {
    it('does not throw when the AWS CLI is available', () => {
      mockExecSync.mockReturnValue('' as any);
      expect(() => S3Operations.checkAwsCliAvailability()).not.toThrow();
      expect(mockExecSync).toHaveBeenCalledWith(
        'aws --version',
        expect.any(Object)
      );
    });

    it('throws a helpful error when the AWS CLI is missing', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('command not found');
      });
      expect(() => S3Operations.checkAwsCliAvailability()).toThrow(
        /AWS CLI is not installed/
      );
    });
  });

  describe('archiveToS3', () => {
    it('throws when the S3 configuration is incomplete', async () => {
      mockConfig.getS3Config.mockReturnValue({} as any);
      mockConfig.hasRequiredS3Config.mockReturnValue(false);
      await expect(
        S3Operations.archiveToS3(['/tmp/x.sql'], {} as any)
      ).rejects.toThrow(/S3 configuration is incomplete/);
    });
  });
});
