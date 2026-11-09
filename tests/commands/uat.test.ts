import {
  ALB_FIXED_RESPONSE_LIMIT,
  detectUatPage,
  uatAsleepBody,
  uatWakingBody,
  UAT_ASLEEP_URL,
  UAT_WAKING_URL,
} from '../../src/utils/uat-pages';
import { classifyPhase, workerReady, AsgState } from '../../src/commands/uat';

function asg(desired: number, inService: number): AsgState {
  return { name: 'g', min: desired, max: 2, desired, inService };
}

describe('uat pages', () => {
  it('fit inside the ALB fixed-response limit', () => {
    expect(uatAsleepBody().length).toBeLessThanOrEqual(
      ALB_FIXED_RESPONSE_LIMIT
    );
    expect(uatWakingBody().length).toBeLessThanOrEqual(
      ALB_FIXED_RESPONSE_LIMIT
    );
  });

  it('are recognized by their titles', () => {
    expect(detectUatPage(uatAsleepBody())).toBe('uat-asleep');
    expect(detectUatPage(uatWakingBody())).toBe('uat-waking');
    expect(detectUatPage('<title>Wake Forest University</title>')).toBeNull();
  });

  it('frame the branded page for each state', () => {
    expect(uatAsleepBody()).toContain(`<iframe src="${UAT_ASLEEP_URL}"`);
    expect(uatWakingBody()).toContain(`<iframe src="${UAT_WAKING_URL}"`);
  });

  it('keep the branded sources in the repository', () => {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, '../../uat-pages');
    expect(fs.readFileSync(path.join(dir, 'waking.html'), 'utf8')).toContain(
      'walking_deacon.gif'
    );
    expect(fs.existsSync(path.join(dir, 'asleep.html'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'uat-status.css'))).toBe(true);
  });

  it('poll for a page whose title differs from their own', () => {
    expect(uatAsleepBody()).toContain('<title>UAT is asleep</title>")<0');
    expect(uatWakingBody()).toContain('<title>UAT is waking up</title>")<0');
  });

  it('treat a redirect as WordPress being back', () => {
    expect(uatWakingBody()).toContain('redirect:"manual"');
    expect(uatWakingBody()).toContain('r.type=="opaqueredirect"');
  });
});

describe('classifyPhase', () => {
  it('reports waking whenever the waking page is up', () => {
    expect(classifyPhase('uat-waking', asg(1, 0), asg(1, 0), 0)).toBe('waking');
  });

  it('reports asleep when web and worker are at zero', () => {
    expect(classifyPhase('uat-asleep', asg(0, 0), asg(0, 0), 0)).toBe('asleep');
  });

  it('reports awake only when healthy with no page up', () => {
    expect(classifyPhase(null, asg(1, 1), asg(1, 1), 1)).toBe('awake');
    expect(classifyPhase('uat-asleep', asg(1, 1), asg(1, 1), 1)).toBe('mixed');
  });

  it('does not call UAT asleep when no page is up in front of it', () => {
    expect(classifyPhase(null, asg(0, 0), asg(0, 0), 0)).toBe('mixed');
  });

  it('reports mixed for the nightly scale-in with the worker still running', () => {
    expect(classifyPhase(null, asg(0, 0), asg(1, 1), 0)).toBe('mixed');
  });
});

describe('workerReady', () => {
  it('waits for Elastic Beanstalk to report the worker healthy', () => {
    expect(workerReady('Ready/Grey')).toBe(false);
    expect(workerReady('Launching/Grey')).toBe(false);
    expect(workerReady('Ready/Red')).toBe(false);
    expect(workerReady('Ready/Green')).toBe(true);
    expect(workerReady('Ready/Yellow')).toBe(true);
  });
});

describe('page bodies and the wake button', () => {
  it('reload when the asleep page button posts the wake message', () => {
    expect(uatAsleepBody()).toContain('e.data=="uat-wake"');
  });
});
