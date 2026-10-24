/**
 * Title Cleaning Utility for Broadcast DJ & RadioBOSS Metadata.
 * Automatically strips unwanted suffixes such as (2008 Remastered), (Official Video), etc.
 */

export function cleanBroadcastTitle(rawTitle: string): string {
  if (!rawTitle) return "";
  let title = rawTitle;

  // Remove bracketed or parenthesized tags like (2008 Remastered), [Remastered], (Deluxe Edition), etc.
  title = title.replace(
    /\s*[\(\[](?:(?:\d{4}\s*)?remaster(?:ed)?|remaster(?:ed)?(?:\s*\d{4})?|deluxe(?: edition)?|anniversary edition|bonus track|official (?:audio|video|music video)|lyric video|live(?: at [^\)\]]+)?|original mix|extended mix|radio edit)[\)\]]/gi,
    ""
  );

  // Remove trailing dash patterns like " - 2008 Remastered", " - Official Audio", etc.
  title = title.replace(
    /\s*-\s*(?:(?:\d{4}\s*)?remaster(?:ed)?|remaster(?:ed)?(?:\s*\d{4})?|official (?:audio|video)|deluxe edition).*$/gi,
    ""
  );

  // Clean trailing punctuation or odd artifacts
  title = title.replace(/\s+-\s*$/, "").trim();

  // Collapse multiple spaces
  return title.replace(/\s{2,}/g, " ").trim();
}
