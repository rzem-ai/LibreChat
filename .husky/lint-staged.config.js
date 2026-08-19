module.exports = {
  '*.{js,jsx,ts,tsx}': [
    'node scripts/sort-imports.mts',
    'prettier --write',
    'eslint --fix',
    'eslint',
  ],
  '*.{py,pyi}': ['uvx black --quiet'],
  '*.json': ['prettier --write'],
};
