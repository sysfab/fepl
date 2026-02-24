export enum TokenKind {
    EOF,
    Newline,

    Number,
    String,
    TemplateLiteral,    // raw backtick string, e.g. `hello ${x}`
    LineComment,
    BlockComment,
    Preprocessor,
    Identifier,

    OpenBracket,
    CloseBracket,
    OpenCurly,
    CloseCurly,
    OpenParen,
    CloseParen,

    Assignment,
    Equals,
    Not,
    NotEquals,
    Less,
    LessEquals,
    Greater,
    GreaterEquals,

    LogicalOr,
    LogicalAnd,

    Arrow,          // =>

    Dot,
    Semicolon,
    Colon,
    Question,
    Comma,

    PlusPlus,
    MinusMinus,
    PlusEquals,
    MinusEquals,
    AmpersandEquals,
    PipeEquals,
    CaretEquals,
    LeftShiftEquals,
    RightShiftEquals,
    UnsignedRightShiftEquals,

    Plus,
    Minus,
    Slash,
    Star,
    Percent,
    Ampersand,
    Pipe,
    Caret,
    Tilde,
    LeftShift,
    RightShift,
    UnsignedRightShift,

    // Keywords
    Enum,
    Import,
    From,
    As,
    Var,
    Delete,
    Let,
    Func,
    Return,
    If,
    Else,
    For,
    While,
    In,
}

export type Token = {
    kind: TokenKind;
    value: string;
};

export const isOneOfMany = (
    token: Token,
    expected: ReadonlyArray<TokenKind>
): boolean => expected.includes(token.kind);

export const tokenKindToString = (kind: TokenKind): string =>
    TokenKind[kind] ?? `Unknown(${kind})`;

export const debugToken = (token: Token): void => {
    if (isOneOfMany(token, [
        TokenKind.Identifier,
        TokenKind.Number,
        TokenKind.String,
        TokenKind.TemplateLiteral,
        TokenKind.LineComment,
        TokenKind.BlockComment,
        TokenKind.Preprocessor,
    ])) {
        console.log(`${TokenKind[token.kind]} (${token.value})`);
    } else {
        console.log(`${TokenKind[token.kind]} ()`);
    }
};
