import { ArtifactModes } from 'librechat-data-provider';
import { getDefaultEnabledToolValues } from '../endpoints';

describe('getDefaultEnabledToolValues', () => {
  it('returns nothing without flags', () => {
    expect(getDefaultEnabledToolValues(undefined)).toEqual({});
  });

  // Deloitte Custom Change: memory participates in the same default-enabled tool list.
  it('seeds only the listed tools', () => {
    expect(
      getDefaultEnabledToolValues({ defaultEnabledTools: ['skills', 'execute_code', 'memory'] }),
    ).toEqual({ skills: true, execute_code: true, memory: true });
  });

  it('uses the shadcn artifacts mode when configured', () => {
    expect(
      getDefaultEnabledToolValues({
        defaultEnabledTools: ['artifacts'],
        artifactsShadcnOnly: true,
      }),
    ).toEqual({ artifacts: ArtifactModes.SHADCNUI });
  });
});
