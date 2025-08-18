export interface EnvironmentMapping {
  urlReplacements: Array<{ from: string; to: string }>;
  s3Replacements: Array<{ from: string; to: string }>;
}

export class EnvironmentMappingService {
  private static mappings: Record<string, EnvironmentMapping> = {
    'prod->pprd': {
      urlReplacements: [
        { from: 'www.wfu.edu', to: 'pprd.wfu.edu' },
        { from: '.wfu.edu', to: '.pprd.wfu.edu' },
        { from: 'https://www.wfu.edu', to: 'https://pprd.wfu.edu' },
        { from: 'http://www.wfu.edu', to: 'http://pprd.wfu.edu' },
        { from: 'https://wfu.edu', to: 'https://pprd.wfu.edu' },
        { from: 'http://wfu.edu', to: 'http://pprd.wfu.edu' },
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
        { from: 'pprd.wfu.edu', to: 'www.wfu.edu' },
        { from: '.pprd.wfu.edu', to: '.wfu.edu' },
        { from: 'https://pprd.wfu.edu', to: 'https://www.wfu.edu' },
        { from: 'http://pprd.wfu.edu', to: 'http://www.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-pprd-us', to: 'wordpress-prod-us' },
        { from: 'pprd.wp.cdn.aws.wfu.edu', to: 'prod.wp.cdn.aws.wfu.edu' },
      ],
    },
    'uat->dev': {
      urlReplacements: [
        { from: 'uat.wfu.edu', to: 'dev.wfu.edu' },
        { from: '.uat.wfu.edu', to: '.dev.wfu.edu' },
        { from: 'https://uat.wfu.edu', to: 'https://dev.wfu.edu' },
        { from: 'http://uat.wfu.edu', to: 'http://dev.wfu.edu' },
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
        { from: 'dev.wfu.edu', to: 'uat.wfu.edu' },
        { from: '.dev.wfu.edu', to: '.uat.wfu.edu' },
        { from: 'https://dev.wfu.edu', to: 'https://uat.wfu.edu' },
        { from: 'http://dev.wfu.edu', to: 'http://uat.wfu.edu' },
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
    'prod->dev': {
      urlReplacements: [
        { from: 'www.wfu.edu', to: 'dev.wfu.edu' },
        { from: '.wfu.edu', to: '.dev.wfu.edu' },
        { from: 'https://www.wfu.edu', to: 'https://dev.wfu.edu' },
        { from: 'http://www.wfu.edu', to: 'http://dev.wfu.edu' },
        { from: 'https://wfu.edu', to: 'https://dev.wfu.edu' },
        { from: 'http://wfu.edu', to: 'http://dev.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-prod-us', to: 'wordpress-dev-us' },
        { from: 'prod.wp.cdn.aws.wfu.edu', to: 'dev.wp.cdn.aws.wfu.edu' },
      ],
    },
    'dev->prod': {
      urlReplacements: [
        { from: 'dev.wfu.edu', to: 'www.wfu.edu' },
        { from: '.dev.wfu.edu', to: '.wfu.edu' },
        { from: 'https://dev.wfu.edu', to: 'https://www.wfu.edu' },
        { from: 'http://dev.wfu.edu', to: 'http://www.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-dev-us', to: 'wordpress-prod-us' },
        { from: 'dev.wp.cdn.aws.wfu.edu', to: 'prod.wp.cdn.aws.wfu.edu' },
        {
          from: 'wfu-cer-wordpress-dev-us-east-1.s3.amazonaws.com',
          to: 'wfu-cer-wordpress-prod-us-east-1.s3.amazonaws.com',
        },
      ],
    },
    'prod->uat': {
      urlReplacements: [
        { from: 'www.wfu.edu', to: 'uat.wfu.edu' },
        { from: '.wfu.edu', to: '.uat.wfu.edu' },
        { from: 'https://www.wfu.edu', to: 'https://uat.wfu.edu' },
        { from: 'http://www.wfu.edu', to: 'http://uat.wfu.edu' },
        { from: 'https://wfu.edu', to: 'https://uat.wfu.edu' },
        { from: 'http://wfu.edu', to: 'http://uat.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-prod-us', to: 'wordpress-uat-us' },
        { from: 'prod.wp.cdn.aws.wfu.edu', to: 'uat.wp.cdn.aws.wfu.edu' },
      ],
    },
    'uat->prod': {
      urlReplacements: [
        { from: 'uat.wfu.edu', to: 'www.wfu.edu' },
        { from: '.uat.wfu.edu', to: '.wfu.edu' },
        { from: 'https://uat.wfu.edu', to: 'https://www.wfu.edu' },
        { from: 'http://uat.wfu.edu', to: 'http://www.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-uat-us', to: 'wordpress-prod-us' },
        { from: 'uat.wp.cdn.aws.wfu.edu', to: 'prod.wp.cdn.aws.wfu.edu' },
        {
          from: 'wfu-cer-wordpress-uat-us-east-1.s3.amazonaws.com',
          to: 'wfu-cer-wordpress-prod-us-east-1.s3.amazonaws.com',
        },
      ],
    },
    'pprd->dev': {
      urlReplacements: [
        { from: 'pprd.wfu.edu', to: 'dev.wfu.edu' },
        { from: '.pprd.wfu.edu', to: '.dev.wfu.edu' },
        { from: 'https://pprd.wfu.edu', to: 'https://dev.wfu.edu' },
        { from: 'http://pprd.wfu.edu', to: 'http://dev.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-pprd-us', to: 'wordpress-dev-us' },
        { from: 'pprd.wp.cdn.aws.wfu.edu', to: 'dev.wp.cdn.aws.wfu.edu' },
      ],
    },
    'dev->pprd': {
      urlReplacements: [
        { from: 'dev.wfu.edu', to: 'pprd.wfu.edu' },
        { from: '.dev.wfu.edu', to: '.pprd.wfu.edu' },
        { from: 'https://dev.wfu.edu', to: 'https://pprd.wfu.edu' },
        { from: 'http://dev.wfu.edu', to: 'http://pprd.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-dev-us', to: 'wordpress-pprd-us' },
        { from: 'dev.wp.cdn.aws.wfu.edu', to: 'pprd.wp.cdn.aws.wfu.edu' },
        {
          from: 'wfu-cer-wordpress-dev-us-east-1.s3.amazonaws.com',
          to: 'wfu-cer-wordpress-pprd-us-east-1.s3.amazonaws.com',
        },
      ],
    },
    'pprd->uat': {
      urlReplacements: [
        { from: 'pprd.wfu.edu', to: 'uat.wfu.edu' },
        { from: '.pprd.wfu.edu', to: '.uat.wfu.edu' },
        { from: 'https://pprd.wfu.edu', to: 'https://uat.wfu.edu' },
        { from: 'http://pprd.wfu.edu', to: 'http://uat.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-pprd-us', to: 'wordpress-uat-us' },
        { from: 'pprd.wp.cdn.aws.wfu.edu', to: 'uat.wp.cdn.aws.wfu.edu' },
      ],
    },
    'uat->pprd': {
      urlReplacements: [
        { from: 'uat.wfu.edu', to: 'pprd.wfu.edu' },
        { from: '.uat.wfu.edu', to: '.pprd.wfu.edu' },
        { from: 'https://uat.wfu.edu', to: 'https://pprd.wfu.edu' },
        { from: 'http://uat.wfu.edu', to: 'http://pprd.wfu.edu' },
      ],
      s3Replacements: [
        { from: 'wordpress-uat-us', to: 'wordpress-pprd-us' },
        { from: 'uat.wp.cdn.aws.wfu.edu', to: 'pprd.wp.cdn.aws.wfu.edu' },
        {
          from: 'wfu-cer-wordpress-uat-us-east-1.s3.amazonaws.com',
          to: 'wfu-cer-wordpress-pprd-us-east-1.s3.amazonaws.com',
        },
      ],
    },
    'prod->local': {
      urlReplacements: [
        { from: 'www.wfu.edu', to: 'wfu.local' },
        { from: '.wfu.edu', to: '.wfu.local' },
        { from: 'https://www.wfu.edu', to: 'https://wfu.local' },
        { from: 'http://www.wfu.edu', to: 'http://wfu.local' },
        { from: 'https://wfu.edu', to: 'https://wfu.local' },
        { from: 'http://wfu.edu', to: 'http://wfu.local' },
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
