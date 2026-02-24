import { TokenKind, Token, tokenKindToString } from "./tokens";

export type RegexHandler = (tokenizer: Tokenizer, match: RegExpMatchArray) => void;

export type RegexPattern = {
    regex: RegExp;
    handler: RegexHandler;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const staticHandler = (kind: TokenKind): RegexHandler =>
    (tokenizer, match) => tokenizer.push({ kind, value: match[0] });

const valueHandler = (kind: TokenKind): RegexHandler =>
    (tokenizer, match) => tokenizer.push({ kind, value: match[0] });

// ─── Keywords ─────────────────────────────────────────────────────────────────

const KEYWORDS: Record<string, TokenKind> = {
    enum:   TokenKind.Enum,
    import: TokenKind.Import,
    from:   TokenKind.From,
    as:     TokenKind.As,
    var:    TokenKind.Var,
    delete: TokenKind.Delete,
    let:    TokenKind.Let,
    func:   TokenKind.Func,
    return: TokenKind.Return,
    if:     TokenKind.If,
    else:   TokenKind.Else,
    for:    TokenKind.For,
    while:  TokenKind.While,
    in:     TokenKind.In,
};

// ─── Newline / ASI helper ─────────────────────────────────────────────────────
//
// Newlines act as implicit statement terminators (like JS's ASI), but only
// when the previous token is one that can end a statement.  We emit a
// synthetic Newline token and let the parser decide whether to treat it as a
// separator.  Consecutive newlines collapse into one.

const STMT_ENDERS = new Set<TokenKind>([
    TokenKind.Number,
    TokenKind.String,
    TokenKind.TemplateLiteral,
    TokenKind.Identifier,
    TokenKind.CloseParen,
    TokenKind.CloseBracket,
    TokenKind.CloseCurly,
    TokenKind.PlusPlus,
    TokenKind.MinusMinus,
    TokenKind.Return,
]);

const COMMENT_TOKENS = new Set<TokenKind>([
    TokenKind.LineComment,
    TokenKind.BlockComment,
]);

// ─── Default patterns ─────────────────────────────────────────────────────────

export const DEFAULT_PATTERNS: RegexPattern[] = [
    // Horizontal whitespace — skip (spaces / tabs only, NOT newlines)
    { regex: /^[^\S\n]+/, handler: () => {} },

    // Newlines — emit a Newline token only when the previous token can end a
    // statement; collapse multiple blank lines into one token.
    {
        regex: /^\n+/,
        handler: (tokenizer) => {
            const prev = tokenizer.lastNonCommentToken();
            if (prev && STMT_ENDERS.has(prev.kind)) {
                tokenizer.push({ kind: TokenKind.Newline, value: "\n" });
            }
        },
    },

    // Line comments
    { regex: /^\/\/[^\n]*/, handler: valueHandler(TokenKind.LineComment) },

    // Block comments
    { regex: /^\/\*[\s\S]*?\*\//, handler: valueHandler(TokenKind.BlockComment) },

    // Preprocessor directives (line-based): $thing arg
    { regex: /^\$[^\n]*/, handler: valueHandler(TokenKind.Preprocessor) },

    // Template literals  `...${...}...`
    // We store the raw value (including backticks) so the parser can split out
    // the interpolated segments.
    {
        regex: /^`(?:[^`\\$]|\\.|\$(?!\{)|\$\{(?:[^}])*\})*`/,
        handler: valueHandler(TokenKind.TemplateLiteral),
    },

    // String literals
    { regex: /^"(?:[^"\\]|\\.)*"/, handler: valueHandler(TokenKind.String) },
    { regex: /^'(?:[^'\\]|\\.)*'/, handler: valueHandler(TokenKind.String) },

    // Numbers (int or float)
    { regex: /^\d+(\.\d+)?/, handler: valueHandler(TokenKind.Number) },

    // Multiple character operators — must come before single-char variants
    { regex: /^=>/,   handler: staticHandler(TokenKind.Arrow) },
    { regex: /^\+\+/, handler: staticHandler(TokenKind.PlusPlus) },
    { regex: /^--/,   handler: staticHandler(TokenKind.MinusMinus) },
    { regex: /^\+=/,  handler: staticHandler(TokenKind.PlusEquals) },
    { regex: /^-=/,   handler: staticHandler(TokenKind.MinusEquals) },
    { regex: /^==/,   handler: staticHandler(TokenKind.Equals) },
    { regex: /^!=/,   handler: staticHandler(TokenKind.NotEquals) },
    { regex: /^<=/,   handler: staticHandler(TokenKind.LessEquals) },
    { regex: /^>=/,   handler: staticHandler(TokenKind.GreaterEquals) },
    { regex: /^\|\|/, handler: staticHandler(TokenKind.LogicalOr) },
    { regex: /^&&/,   handler: staticHandler(TokenKind.LogicalAnd) },
    { regex: /^<<=/,  handler: staticHandler(TokenKind.LeftShiftEquals) },
    { regex: /^>>=/,  handler: staticHandler(TokenKind.RightShiftEquals) },
    { regex: /^>>>=/, handler: staticHandler(TokenKind.UnsignedRightShiftEquals) },
    { regex: /^&=/,   handler: staticHandler(TokenKind.AmpersandEquals) },
    { regex: /^\|=/,  handler: staticHandler(TokenKind.PipeEquals) },
    { regex: /^\^=/,  handler: staticHandler(TokenKind.CaretEquals) },
    { regex: /^>>>/,  handler: staticHandler(TokenKind.UnsignedRightShift) },
    { regex: /^<</,   handler: staticHandler(TokenKind.LeftShift) },
    { regex: /^>>/,   handler: staticHandler(TokenKind.RightShift) },

    // Single-character operators
    { regex: /^=/,  handler: staticHandler(TokenKind.Assignment) },
    { regex: /^!/,  handler: staticHandler(TokenKind.Not) },
    { regex: /^</,  handler: staticHandler(TokenKind.Less) },
    { regex: /^>/,  handler: staticHandler(TokenKind.Greater) },
    { regex: /^\+/, handler: staticHandler(TokenKind.Plus) },
    { regex: /^-/,  handler: staticHandler(TokenKind.Minus) },
    { regex: /^\//,  handler: staticHandler(TokenKind.Slash) },
    { regex: /^\*/, handler: staticHandler(TokenKind.Star) },
    { regex: /^%/,  handler: staticHandler(TokenKind.Percent) },
    { regex: /^&/,  handler: staticHandler(TokenKind.Ampersand) },
    { regex: /^\|/, handler: staticHandler(TokenKind.Pipe) },
    { regex: /^\^/, handler: staticHandler(TokenKind.Caret) },
    { regex: /^~/,  handler: staticHandler(TokenKind.Tilde) },

    // Delimiters
    { regex: /^\[/, handler: staticHandler(TokenKind.OpenBracket) },
    { regex: /^]/,  handler: staticHandler(TokenKind.CloseBracket) },
    { regex: /^\{/, handler: staticHandler(TokenKind.OpenCurly) },
    { regex: /^}/,  handler: staticHandler(TokenKind.CloseCurly) },
    { regex: /^\(/, handler: staticHandler(TokenKind.OpenParen) },
    { regex: /^\)/, handler: staticHandler(TokenKind.CloseParen) },

    // Punctuation
    { regex: /^\./, handler: staticHandler(TokenKind.Dot) },
    { regex: /^;/,  handler: staticHandler(TokenKind.Semicolon) },
    { regex: /^:/,  handler: staticHandler(TokenKind.Colon) },
    { regex: /^\?/, handler: staticHandler(TokenKind.Question) },
    { regex: /^,/,  handler: staticHandler(TokenKind.Comma) },

    // Identifiers & keywords
    {
        regex: /^[a-zA-Z_][a-zA-Z0-9_]*/,
        handler: (tokenizer, match) => {
            const word = match[0];
            const kind = KEYWORDS[word] ?? TokenKind.Identifier;
            tokenizer.push({ kind, value: word });
        },
    },
];

// ─── Tokenizer ────────────────────────────────────────────────────────────────

export class Tokenizer {
    tokens: Token[];
    source: string;
    pos: number;

    private patterns: RegexPattern[];

    constructor(source: string, patterns: RegexPattern[] = DEFAULT_PATTERNS) {
        this.source = source;
        this.patterns = patterns;
        this.tokens = [];
        this.pos = 0;
    }

    push(token: Token): void {
        this.tokens.push(token);
    }

    /** The most recently emitted token, or null if nothing emitted yet. */
    lastToken(): Token | null {
        return this.tokens.length > 0 ? this.tokens[this.tokens.length - 1] : null;
    }

    /** Last emitted token that is not a comment token. */
    lastNonCommentToken(): Token | null {
        for (let i = this.tokens.length - 1; i >= 0; i--) {
            const token = this.tokens[i];
            if (!COMMENT_TOKENS.has(token.kind)) {
                return token;
            }
        }
        return null;
    }

    remainder(): string {
        return this.source.slice(this.pos);
    }

    advance(n: number): void {
        this.pos += n;
    }

    tokenize(): Token[] {
        while (this.pos < this.source.length) {
            const remaining = this.remainder();
            let matched = false;

            for (const { regex, handler } of this.patterns) {
                const match = remaining.match(regex);
                if (match) {
                    this.advance(match[0].length);
                    handler(this, match);
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                throw new Error(
                    `Unexpected character '${remaining[0]}' at position ${this.pos}`
                );
            }
        }

        this.tokens.push({ kind: TokenKind.EOF, value: "" });
        return this.tokens;
    }
}
