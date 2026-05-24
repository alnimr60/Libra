import { BookSearchResult } from "./types";

/**
 * Normalizes a string by lowercasing, removing punctuation, and trimming whitespace.
 */
function normalize(str: any): string {
  if (typeof str !== "string") return "";
  return str
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // Remove Arabic diacritics
    .replace(/[أإآ]/g, "ا") // Normalize Alef
    .replace(/ة/g, "ه") // Normalize Teh Marbuta to Heh
    .replace(/ى/g, "ي") // Normalize Alef Maksura to Yeh
    .replace(/ـ+/g, "") // Remove Tatweel (Kashida)
    .replace(/[^\w\s\u0600-\u06FF]|_/g, "") // Remove punctuation but keep Arabic and word chars
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Scores a single book result based on its relevance to the query.
 */
export function calculateRelevanceScore(query: string, book: BookSearchResult): number {
  const normQuery = normalize(query);
  const normTitle = normalize(book.title);
  const normAuthor = normalize(book.author || "");
  
  if (!normQuery) return 0;

  let score = 0;

  // Exact title match
  if (normTitle === normQuery) {
    score += 100;
  }
  // Title starts with query
  else if (normTitle.startsWith(normQuery)) {
    score += 50;
  }
  // Title contains query
  else if (normTitle.includes(normQuery)) {
    score += 25;
  }

  // Author match
  if (normAuthor.includes(normQuery)) {
    score += 10;
  }

  // Specific "bad" match triggers (e.g. OCR noise often present in descriptions)
  // If the query is completely absent from title and author, it's a very low score
  if (!normTitle.includes(normQuery) && !normAuthor.includes(normQuery)) {
    // Check description as last resort, but penalize heavily
    const normDesc = normalize(book.description || "");
    if (normDesc.includes(normQuery)) {
      score += 2;
    } else {
      score = 0; // No match found in title, author, or description
    }
  }

  return score;
}

/**
 * Filters and ranks results based on relevance score.
 */
export function filterAndRankResults(query: string, results: BookSearchResult[], threshold: number = 8): BookSearchResult[] {
  console.log(`[SEARCH_RAW_RESULTS] total_before_filter=${results.length}`);
  
  const scoredResults = results.map(book => {
    const score = calculateRelevanceScore(query, book);
    return { book, score };
  });

  const filtered = scoredResults.filter(item => {
    if (item.score < threshold) {
      console.log(`[SEARCH_RESULT_DISCARDED] score=${item.score} title="${item.book.title}" author="${item.book.author}" reason="Below threshold"`);
      return false;
    }
    return true;
  });

  // Sort by score descending
  filtered.sort((a, b) => b.score - a.score);

  filtered.forEach(item => {
    console.log(`[SEARCH_RELEVANCE_SCORE] score=${item.score} provider=${item.book.source} title="${item.book.title}" author="${item.book.author}"`);
  });

  console.log(`[SEARCH_FILTERED_RESULTS] total_after_filter=${filtered.length}`);

  return filtered.map(item => item.book);
}
