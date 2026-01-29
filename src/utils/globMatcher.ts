/**
 * Glob pattern matching for file paths.
 * Supports: * (any characters except /), ** (any characters including /), ? (single char),
 * {a,b,c} (brace expansion), [abc] (character class), [a-z] (character range), [!abc] (negated class)
 */
export function matchFilePattern(pattern: string, filePath: string): boolean {
  // Handle brace expansion first: {a,b,c} -> (a|b|c)
  // This needs to be done before regex escaping
  const expandBraces = (p: string): string => {
    const braceRegex = /\{([^{}]+)\}/g;
    return p.replace(braceRegex, (_, content: string) => {
      const alternatives = content.split(",").map((alt: string) => alt.trim());
      return `(${alternatives.join("|")})`;
    });
  };

  let regexPattern = expandBraces(pattern);

  // Handle character classes [abc], [a-z], [!abc] before escaping
  // Replace [!...] with [^...] for negation
  regexPattern = regexPattern.replace(/\[!/g, "[^");

  // Now escape regex special characters except *, ?, and character class brackets
  // We need to be careful not to escape brackets that are part of character classes
  const escapeRegexChars = (p: string): string => {
    let result = "";
    let inCharClass = false;
    for (let i = 0; i < p.length; i++) {
      const char = p[i];
      if (char === "[" && !inCharClass) {
        inCharClass = true;
        result += char;
      } else if (char === "]" && inCharClass) {
        inCharClass = false;
        result += char;
      } else if (!inCharClass && ".+^${}()|\\".includes(char)) {
        // Escape special regex chars (except * and ? which we handle separately)
        // Note: {} are already processed by brace expansion, but we keep them in case of nested/unmatched
        result += "\\" + char;
      } else {
        result += char;
      }
    }
    return result;
  };

  regexPattern = escapeRegexChars(regexPattern);

  // Convert ** to a placeholder first (before handling single *)
  regexPattern = regexPattern.replace(/\*\*/g, "<<<DOUBLESTAR>>>");
  // Convert * to match anything except /
  regexPattern = regexPattern.replace(/\*/g, "[^/]*");
  // Convert ? to match any single character (except /)
  regexPattern = regexPattern.replace(/\?/g, "[^/]");
  // Convert ** placeholder to match anything including /
  regexPattern = regexPattern.replace(/<<<DOUBLESTAR>>>/g, ".*");

  // Ensure the pattern matches the whole path
  try {
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  } catch {
    // Invalid regex pattern, return false
    return false;
  }
}
