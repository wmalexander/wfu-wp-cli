import {
  ALB_FIXED_RESPONSE_LIMIT,
  detectUatPage,
  uatAsleepBody,
  uatWakingBody,
  DEACON_GIF_URL,
} from '../../src/utils/uat-pages';
import { classifyPhase, AsgState } from '../../src/commands/uat';

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

  it('shows the walking deacon only while waking', () => {
    expect(uatWakingBody()).toContain(DEACON_GIF_URL);
    expect(uatAsleepBody()).not.toContain(DEACON_GIF_URL);
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

  it('reports mixed for the nightly scale-in with the worker still running', () => {
    expect(classifyPhase(null, asg(0, 0), asg(1, 1), 0)).toBe('mixed');
  });
});
