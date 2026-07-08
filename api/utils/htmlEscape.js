/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Converts dangerous characters to their HTML entity equivalents.
 *
 * @param {string} str - The string to escape
 * @returns {string} The escaped string safe for use in HTML
 */
const escapeHtml = (str) => {
  const htmlEscapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  };

  return String(str).replace(/[&<>"']/g, (char) => htmlEscapeMap[char]);
};

module.exports = { escapeHtml };

