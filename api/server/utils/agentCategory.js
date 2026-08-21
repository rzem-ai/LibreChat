const { logger } = require('@librechat/data-schemas');

/** Deloitte Custom Change: mirrors the hardcoded agent fallback in `data-schemas` (agent schema
 * default and `createAgent`). It must never be deactivated, or agents created without a category
 * become unreachable from every marketplace tab except "All". */
const FALLBACK_CATEGORY = 'general';

// Deloitte Custom Change: normalizes a category value for case/whitespace-insensitive comparisons.
function normalizeValue(raw) {
  return (raw ?? '').toString().trim().toLowerCase();
}

// Deloitte Custom Change: trims a config string field, treating non-string input as absent.
function optionalString(raw) {
  return typeof raw === 'string' ? raw.trim() : undefined;
}

/**
 * Deloitte Custom Change: Synchronizes agent categories with the database.
 * @param {Array|undefined} customCategoriesList - Custom categories from config. When `undefined`, custom categories are left untouched (only defaults are toggled). An explicit empty array opts in to deactivating all existing custom categories.
 * @param {boolean} enableDefaultCategories - Whether default categories should be active.
 */
async function syncCategories(customCategoriesList, enableDefaultCategories) {
  // Deloitte Custom Change: load current categories once up front so defaults and custom
  // categories can both be reconciled against a single consistent snapshot.
  const { getAllCategories, createCategory, updateCategory } = require('~/models');
  logger.info('Syncing custom agent categories...');

  const dbCategories = await getAllCategories();
  logger.info(`Found ${dbCategories.length} categories in the database.`);

  logger.info(
    `${enableDefaultCategories ? 'Enabling' : 'Disabling'} default agent categories as per configuration.`,
  );
  if (!enableDefaultCategories) {
    logger.warn(
      `Keeping the '${FALLBACK_CATEGORY}' category active: it is the fallback assigned to agents created without a category. Declare it in the categories list to change its label or description.`,
    );
  }
  // Deloitte Custom Change: skip the write when `isActive` already matches the desired state,
  // avoiding an unnecessary DB write (and log line) for every default category on every config load.
  for (const cat of dbCategories.filter((c) => !c.custom)) {
    const isActive = cat.value === FALLBACK_CATEGORY ? true : enableDefaultCategories;
    if (cat.isActive === isActive) {
      continue;
    }
    logger.info(`${isActive ? 'Enabling' : 'Disabling'} category: ${cat.value}`);
    await updateCategory(cat.value, { isActive });
  }

  if (!Array.isArray(customCategoriesList)) {
    logger.info(
      'No custom categories list provided; leaving existing custom categories untouched.',
    );
    return;
  }

  // Deloitte Custom Change: new custom categories are ordered after all default categories, so
  // they always render as a contiguous block following the built-in tabs.
  const defaultCategoriesInDb = dbCategories.filter((cat) => !cat.custom);
  const initialOrder =
    defaultCategoriesInDb.reduce((max, cat) => Math.max(max, cat.order || 0), 0) + 1;
  logger.info(`Current order for new custom categories starts at ${initialOrder}.`);

  // Deloitte Custom Change: de-duplicate by normalized value while preparing the list.
  // `dbCategories` is never refreshed inside this function, so a second occurrence of the same
  // value would otherwise see no `existing` match and attempt a second `createCategory`, failing
  // startup with a duplicate-key error.
  const seenValues = new Set();
  const preparedCategories = customCategoriesList.reduce((acc, cat, index) => {
    const normalizedValue = normalizeValue(cat?.value);
    if (!normalizedValue) {
      logger.warn(
        `Skipping invalid custom category entry at index ${index}: missing or empty value.`,
      );
      return acc;
    }
    if (seenValues.has(normalizedValue)) {
      logger.warn(
        `Skipping duplicate custom category entry at index ${index}: '${normalizedValue}' is already configured.`,
      );
      return acc;
    }
    seenValues.add(normalizedValue);
    acc.push({
      normalizedValue,
      rawValue: cat.value.toString().trim(),
      label: optionalString(cat.label) || undefined,
      description: optionalString(cat.description),
      order: initialOrder + acc.length,
    });
    return acc;
  }, []);

  const configuredValues = new Set(preparedCategories.map((c) => c.normalizedValue));
  const categoriesToDelete = dbCategories.filter(
    (cat) => cat.custom && !configuredValues.has(normalizeValue(cat.value)),
  );
  // Deloitte Custom Change: deactivate rather than delete categories removed from config, so
  // agents still referencing them remain resolvable instead of being silently orphaned.
  for (const cat of categoriesToDelete) {
    logger.info(`Deactivating custom category not in config: ${cat.value}`);
    await updateCategory(cat.value, { isActive: false });
  }

  // Deloitte Custom Change: reconcile each configured category against the DB — override the
  // matching default row in place, or create/update the corresponding custom row.
  for (const prepared of preparedCategories) {
    const existing = dbCategories.find(
      (cat) => normalizeValue(cat.value) === prepared.normalizedValue,
    );

    /* Default categories keep `custom: false` when overridden, so the deletion pass above (which
     * only targets custom rows) can never remove them, and `ensureDefaultCategories` keeps
     * managing their localization keys. Only explicitly provided fields are applied — otherwise
     * re-declaring a default purely to reactivate it would clobber its `com_` label. */
    if (existing && !existing.custom) {
      const overrides = { isActive: true };
      if (prepared.label) {
        overrides.label = prepared.label;
      }
      if (prepared.description !== undefined) {
        overrides.description = prepared.description;
      }
      logger.info(`Overriding default category: ${existing.value}`);
      await updateCategory(existing.value, overrides);
      continue;
    }

    const formattedCategory = {
      value: prepared.normalizedValue,
      label: prepared.label || prepared.rawValue,
      description: prepared.description ?? '',
      isActive: true,
      custom: true,
      order: prepared.order,
    };

    if (existing) {
      // Deloitte Custom Change: preserve the existing DB casing for `value` on update.
      // `updateCategory` matches by exact value, so overwriting it with `normalizedValue` here
      // would silently rename the category and orphan any agent still referencing the old casing.
      logger.info(`Updating category: ${existing.value}`);
      await updateCategory(existing.value, { ...formattedCategory, value: existing.value });
    } else {
      logger.info(`Creating category: ${formattedCategory.value}`);
      await createCategory(formattedCategory);
    }
  }

  logger.info('Custom categories synchronized successfully.');
}

module.exports = {
  syncCategories,
};
