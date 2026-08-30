export type TicketSearchExpression =
  | { type: "term"; value: string }
  | { type: "and"; children: TicketSearchExpression[] }
  | { type: "or"; children: TicketSearchExpression[] };

type SearchToken =
  | { type: "term"; value: string }
  | { type: "and" | "or" | "open" | "close" };

function tokenize(search: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  let index = 0;

  while (index < search.length) {
    if (/\s/.test(search[index])) {
      index += 1;
      continue;
    }
    if (search[index] === "(") {
      tokens.push({ type: "open" });
      index += 1;
      continue;
    }
    if (search[index] === ")") {
      tokens.push({ type: "close" });
      index += 1;
      continue;
    }

    let value = "";
    if (search[index] === '"') {
      index += 1;
      while (index < search.length && search[index] !== '"') {
        if (search[index] === "\\" && search[index + 1] === '"') index += 1;
        value += search[index];
        index += 1;
      }
      if (search[index] === '"') index += 1;
    } else {
      while (index < search.length && !/\s|\(|\)/.test(search[index])) {
        value += search[index];
        index += 1;
      }
    }

    const normalized = value.trim();
    if (!normalized) continue;
    const keyword = normalized.toUpperCase();
    if (keyword === "AND") tokens.push({ type: "and" });
    else if (keyword === "OR") tokens.push({ type: "or" });
    else tokens.push({ type: "term", value: normalized });
  }

  return tokens;
}

function combine(
  type: "and" | "or",
  left: TicketSearchExpression,
  right: TicketSearchExpression,
): TicketSearchExpression {
  const children = [
    ...(left.type === type ? left.children : [left]),
    ...(right.type === type ? right.children : [right]),
  ];
  return { type, children };
}

/**
 * Parses the AMR search bar's standard text syntax. Adjacent terms imply AND;
 * quoted text stays together as a phrase; AND binds more tightly than OR.
 * Parentheses are accepted for grouping, while a stray operator is treated as
 * plain text so a user's search never becomes invalid.
 */
export function parseTicketSearchExpression(raw: unknown): TicketSearchExpression | null {
  const tokens = tokenize(String(raw ?? "").trim());
  if (tokens.length === 0) return null;
  let cursor = 0;

  const parsePrimary = (): TicketSearchExpression | null => {
    const token = tokens[cursor];
    if (!token) return null;
    if (token.type === "term") {
      cursor += 1;
      return { type: "term", value: token.value };
    }
    if (token.type === "open") {
      cursor += 1;
      const expression = parseOr();
      if (tokens[cursor]?.type === "close") cursor += 1;
      return expression;
    }
    // Preserve an unmatched operator or closing parenthesis as a searchable
    // word rather than silently dropping it.
    cursor += 1;
    return { type: "term", value: token.type.toUpperCase() };
  };

  const parseAnd = (): TicketSearchExpression | null => {
    let expression = parsePrimary();
    while (expression) {
      const token = tokens[cursor];
      if (token?.type === "and") {
        cursor += 1;
        const right = parsePrimary();
        if (right) expression = combine("and", expression, right);
        continue;
      }
      // Adjacent terms / a parenthesized group are an implicit AND.
      if (token?.type === "term" || token?.type === "open") {
        const right = parsePrimary();
        if (right) expression = combine("and", expression, right);
        continue;
      }
      break;
    }
    return expression;
  };

  const parseOr = (): TicketSearchExpression | null => {
    let expression = parseAnd();
    while (expression && tokens[cursor]?.type === "or") {
      cursor += 1;
      const right = parseAnd();
      if (right) expression = combine("or", expression, right);
    }
    return expression;
  };

  const expression = parseOr();
  // A closing parenthesis at the top level is normally a typo. Continue using
  // the remaining searchable terms rather than returning an incomplete query.
  while (cursor < tokens.length) {
    const next = parseOr();
    if (!next) break;
    if (expression) return combine("and", expression, next);
  }
  return expression;
}