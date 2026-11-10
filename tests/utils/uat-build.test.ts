import {
  describeRequest,
  isDefaultRequest,
  isUatBase,
  packageAlias,
  parseWith,
} from '../../src/utils/uat-build';

describe('parseWith', () => {
  it('reads package:branch pairs and adds the wfu vendor when missing', () => {
    expect(
      parseWith(['wfu-golinks:feature-wp-1-x', 'wfu/wfu-helpers:dev'])
    ).toEqual({
      'wfu/wfu-golinks': 'feature-wp-1-x',
      'wfu/wfu-helpers': 'dev',
    });
  });

  it('rejects malformed values and shell characters', () => {
    expect(() => parseWith(['wfu-golinks'])).toThrow('package:branch');
    expect(() => parseWith(['wfu-golinks:x;rm'])).toThrow('Invalid');
    expect(() => parseWith(['Bad Name:dev'])).toThrow('Invalid');
  });
});

describe('packageAlias', () => {
  it('returns the alias composer-dev.json gives a package', () => {
    const dev = { 'require-dev': { 'wfu/wfu-golinks': 'dev-dev as 3.x-dev' } };
    expect(packageAlias(dev, 'wfu/wfu-golinks')).toBe('3.x-dev');
    expect(packageAlias(dev, 'wfu/missing')).toBeNull();
  });
});

describe('requests', () => {
  it('knows the three bases', () => {
    expect(isUatBase('main')).toBe(true);
    expect(isUatBase('prod')).toBe(false);
  });

  it('treats uat with no pins as the default', () => {
    expect(isDefaultRequest({ base: 'uat', with: {} })).toBe(true);
    expect(isDefaultRequest({ base: 'dev', with: {} })).toBe(false);
    expect(
      isDefaultRequest({ base: 'uat', with: { 'wfu/wfu-golinks': 'x' } })
    ).toBe(false);
  });

  it('describes a request in plain words', () => {
    expect(
      describeRequest({
        base: 'main',
        with: { 'wfu/wfu-golinks': 'feature-x' },
      })
    ).toBe('main (released versions) with wfu/wfu-golinks at feature-x');
  });
});
