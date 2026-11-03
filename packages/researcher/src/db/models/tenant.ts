import * as dataSchemas from '@librechat/data-schemas';
import type { Schema } from 'mongoose';

type TenantIsolationPlugin = (schema: Schema) => void;

/** The host's tenant-isolation plugin, when its `@librechat/data-schemas` exports one. */
const plugin = Reflect.get(dataSchemas, 'applyTenantIsolation') as
  | TenantIsolationPlugin
  | undefined;

/**
 * Applies tenant isolation when the host provides it. Without it the research models are
 * scoped by user only, which matches a single-tenant deployment.
 */
export function applyTenantIsolation(schema: Schema): void {
  plugin?.(schema);
}
