import type { MemoryMethods } from '@librechat/data-schemas';

export interface MemoryWriteAdmission {
  /** Wait until the owning agent run decides whether automatic writes may persist. */
  wait: () => Promise<boolean>;
  /** Resolve the admission once the owning agent run has completed or paused.
   * @param allowed - Whether the automatic memory processor may persist writes.
   */
  resolve: (allowed: boolean) => void;
}

/** [Deloitte Custom Change] Create a one-shot gate for automatic memory writes during agent runs.
 * @returns A gate that holds set/delete operations until the agent run outcome is known.
 */
export function createMemoryWriteAdmission(): MemoryWriteAdmission {
  let resolveDecision!: (allowed: boolean) => void;
  let isResolved = false;
  const decision = new Promise<boolean>((resolve) => {
    resolveDecision = resolve;
  });

  return {
    wait: () => decision,
    resolve(allowed) {
      if (isResolved) {
        return;
      }
      isResolved = true;
      resolveDecision(allowed);
    },
  };
}

/** [Deloitte Custom Change] Hold automatic memory mutations until a run has passed approval review.
 * @param methods - The persistence methods used by the automatic memory processor.
 * @param admission - The run-scoped decision gate for writes.
 * @returns Memory mutation methods that wait for admission and become no-ops when denied.
 */
export function gateMemoryWrites(
  methods: Pick<MemoryMethods, 'setMemory' | 'deleteMemory'>,
  admission: MemoryWriteAdmission,
): Pick<MemoryMethods, 'setMemory' | 'deleteMemory'> {
  return {
    async setMemory(params) {
      if (!(await admission.wait())) {
        return { ok: false };
      }
      return methods.setMemory(params);
    },
    async deleteMemory(params) {
      if (!(await admission.wait())) {
        return { ok: false };
      }
      return methods.deleteMemory(params);
    },
  };
}
