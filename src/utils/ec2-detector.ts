import { execSync } from 'child_process';
import chalk from 'chalk';

export class EC2Detector {
  private static isEC2Cache: boolean | null = null;

  static isRunningOnEC2(): boolean {
    if (this.isEC2Cache !== null) {
      return this.isEC2Cache;
    }
    this.isEC2Cache = this.detectEC2Environment();
    return this.isEC2Cache;
  }

  private static detectEC2Environment(): boolean {
    try {
      if (this.checkEC2MetadataService()) {
        return true;
      }
      if (this.checkEC2EnvironmentVariables()) {
        return true;
      }
      if (this.checkEC2SystemInfo()) {
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  private static checkEC2MetadataService(): boolean {
    try {
      const timeout = 2;
      execSync(
        `curl -s --max-time ${timeout} http://169.254.169.254/latest/meta-data/instance-id`,
        { stdio: 'ignore' }
      );
      return true;
    } catch {
      return false;
    }
  }

  private static checkEC2EnvironmentVariables(): boolean {
    const ec2Indicators = [
      'AWS_EXECUTION_ENV',
      'AWS_REGION',
      'EC2_INSTANCE_ID',
      'AWS_DEFAULT_REGION',
    ];
    return ec2Indicators.some((envVar) => process.env[envVar]);
  }

  private static checkEC2SystemInfo(): boolean {
    try {
      if (process.platform === 'linux') {
        const dmidecode = execSync(
          'sudo dmidecode -s system-version 2>/dev/null || echo ""',
          {
            encoding: 'utf8',
            stdio: 'pipe',
          }
        );
        if (dmidecode.toLowerCase().includes('amazon')) {
          return true;
        }
        const hypervisor = execSync(
          'cat /sys/hypervisor/uuid 2>/dev/null || echo ""',
          {
            encoding: 'utf8',
            stdio: 'pipe',
          }
        );
        if (hypervisor.toLowerCase().startsWith('ec2')) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  static getEC2InstanceId(): string | null {
    if (!this.isRunningOnEC2()) {
      return null;
    }
    try {
      const instanceId = execSync(
        'curl -s --max-time 2 http://169.254.169.254/latest/meta-data/instance-id',
        { encoding: 'utf8', stdio: 'pipe' }
      ).trim();
      return instanceId;
    } catch {
      return null;
    }
  }

  static getEC2AvailabilityZone(): string | null {
    if (!this.isRunningOnEC2()) {
      return null;
    }
    try {
      const az = execSync(
        'curl -s --max-time 2 http://169.254.169.254/latest/meta-data/placement/availability-zone',
        { encoding: 'utf8', stdio: 'pipe' }
      ).trim();
      return az;
    } catch {
      return null;
    }
  }

  static getEC2Region(): string | null {
    const az = this.getEC2AvailabilityZone();
    if (!az) {
      return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || null;
    }
    return az.slice(0, -1);
  }

  static printEC2Info(verbose = false): void {
    const isEC2 = this.isRunningOnEC2();
    if (verbose) {
      console.log(chalk.cyan('EC2 Environment Detection:'));
      console.log(chalk.white(`  Running on EC2: ${isEC2 ? 'Yes' : 'No'}`));

      if (isEC2) {
        const instanceId = this.getEC2InstanceId();
        const region = this.getEC2Region();
        const az = this.getEC2AvailabilityZone();

        if (instanceId) {
          console.log(chalk.white(`  Instance ID: ${instanceId}`));
        }
        if (region) {
          console.log(chalk.white(`  Region: ${region}`));
        }
        if (az) {
          console.log(chalk.white(`  Availability Zone: ${az}`));
        }
      }
    }
  }

  static clearCache(): void {
    this.isEC2Cache = null;
  }
}
