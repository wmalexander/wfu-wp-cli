export interface EnvironmentMapping {
  urlReplacements: Array<{ from: string; to: string }>;
  s3Replacements: Array<{ from: string; to: string }>;
}

export class EnvironmentMappingService {
  private static mappings: Record<string, EnvironmentMapping> = {
    'prod->pprd': {
      urlReplacements: [
        { from: '.wfu.edu', to: '.pprd.wfu.edu' },
        { from: '.pprd.pprd.wfu.edu', to: '.pprd.wfu.edu' },
        { from: 'www.pprd.wfu.edu', to: 'pprd.wfu.edu' },
        { from: 'aws.pprd.wfu.edu', to: 'aws.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-prod-us', to: 'wordpress-pprd-us' },
        { from: 'prod.wp.cdn.aws.wfu.edu', to: 'pprd.wp.cdn.aws.wfu.edu' },
      ],
    },
    'pprd->prod': {
      urlReplacements: [
        { from: '.pprd.wfu.edu', to: '.wfu.edu' },
        { from: 'pprd.wfu.edu', to: 'www.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-pprd-us', to: 'wordpress-prod-us' },
        { from: 'pprd.wp.cdn.aws.wfu.edu', to: 'prod.wp.cdn.aws.wfu.edu' },
      ],
    },
    'uat->dev': {
      urlReplacements: [
        { from: '.uat.wfu.edu', to: '.dev.wfu.edu' },
        { from: 'uat.wfu.edu', to: 'dev.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-uat-us', to: 'wordpress-dev-us' },
        { from: 'uat.wp.cdn.aws.wfu.edu', to: 'dev.wp.cdn.aws.wfu.edu' },
        {
          from: 'wfu-cer-wordpress-uat-us-east-1.s3.amazonaws.com',
          to: 'wfu-cer-wordpress-dev-us-east-1.s3.amazonaws.com',
        },
      ],
    },
    'dev->uat': {
      urlReplacements: [
        { from: '.dev.wfu.edu', to: '.uat.wfu.edu' },
        { from: 'dev.wfu.edu', to: 'uat.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-dev-us', to: 'wordpress-uat-us' },
        { from: 'dev.wp.cdn.aws.wfu.edu', to: 'uat.wp.cdn.aws.wfu.edu' },
        {
          from: 'wfu-cer-wordpress-dev-us-east-1.s3.amazonaws.com',
          to: 'wfu-cer-wordpress-uat-us-east-1.s3.amazonaws.com',
        },
      ],
    },
    'prod->local': {
      urlReplacements: [
        { from: '.wfu.edu', to: '.wfu.local' },
        { from: 'www.wfu.local', to: 'wfu.local' },
      ],
      s3Replacements: [
        { from: 'wordpress-prod-us', to: 'wordpress-dev-us' },
        { from: 'prod.wp.cdn.aws.wfu.edu', to: 'dev.wp.cdn.aws.wfu.edu' },
      ],
    },
  };

  static getEnvironmentMapping(from: string, to: string): EnvironmentMapping {
    const key = `${from}->${to}`;
    if (!this.mappings[key]) {
      throw new Error(`Migration path ${from} -> ${to} is not supported`);
    }
    return this.mappings[key];
  }

  static getSupportedMigrationPaths(): string[] {
    return Object.keys(this.mappings);
  }

  static isMigrationPathSupported(from: string, to: string): boolean {
    const key = `${from}->${to}`;
    return key in this.mappings;
  }
}
