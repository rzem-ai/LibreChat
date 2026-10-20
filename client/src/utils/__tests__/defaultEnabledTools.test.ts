import { ArtifactModes } from 'librechat-data-provider';
import { getDefaultEnabledToolValues } from '../endpoints';

describe('getDefaultEnabledToolValues', () => {
  it('returns nothing without flags', () => {
    expect(getDefaultEnabledToolValues(undefined)).toEqual({});
  });

  it('seeds only the listed tools', () => {
    expect(
      getDefaultEnabledToolValues({ defaultEnabledTools: ['skills', 'execute_code'] }),
    ).toEqual({ skills: true, execute_code: true });
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
