# FEPL

FEPL is a small language + CLI that transpiles `.fepl` source files into backend output (currently JavaScript).

## CLI

### Commands

- `fepl init`
  - Creates `fepl.json` (if missing)
  - Ensures `src/`, `backend/`, and `dist/` directories exist
- `fepl build`
  - Reads `fepl.json`
  - Finds `*.fepl` files under `src`
  - Runs tokenizer -> preprocessor -> parser -> backend codegen
  - Writes generated files to both `backend/` and `dist/`

### Options

- `fepl init --cwd <path>`
- `fepl build --cwd <path>`
- `fepl build --target <backend>`

### Config (`fepl.json`)

```json
{
  "target": "js",
  "src": "src",
  "backend": "backend",
  "dist": "dist"
}
```

## Development Setup

```bash
npm install
npm run build
npm test -- --run
```

Local CLI usage:

```bash
npm link
fepl --help
```

## Examples

See `examples/README.md` for runnable sample programs.

## Language Features

### Variables

- `let` and `var` declarations
- Assignment operators: `=`, `+=`, `-=`
- Destructuring declarations and assignments

```fepl
let a = 10
var {x, y: z} = point
[left, right] = pair
```

### Functions

- Function declarations with `func`
- Arrow functions
- `return` with or without a value

```fepl
func add(a, b) {
  return a + b
}

let mul = (a, b) => { a * b }
```

### Control Flow

- `if` / `else`
- `while`
- `for (item in items)`
- Classic for loops: `for (let i = 0; i < 5; i--)`

```fepl
if (ok) {
  print("yes")
} else {
  print("no")
}

for (item in items) {
  print(item)
}
```

### Data + Expressions

- Numbers, strings, template literals
- Lists and dicts
- Member/index access (`obj.x`, `arr[0]`)
- Unary, binary, logical, and ternary expressions
- `delete` unary operator

```fepl
let user = { name: "Ada", age: 42 }
let xs = [1, 2, 3]
delete user.age
```

### Imports

Supports JS-like import forms:

- `import "./side-effect"`
- `import React from "react"`
- `import * as fs from "fs"`
- `import { readFile, writeFile as write } from "fs"`

## Preprocessor

Preprocessor directives are tokenized and can appear anywhere in the file.

### Supported directives

- `$define NAME value`
- `$undefine NAME`
- `$include path/to/header.feph`
- `$if CONDITION ${`
- `$elif CONDITION ${`
- `$else ${`
- `$fi`

### Compile-time branching format

The branch body closes with `}` before the next branch directive.

```fepl
$if MODE == prod ${
let endpoint = "https://api.prod"
}
$elif MODE == stage ${
let endpoint = "https://api.stage"
}
$else ${
let endpoint = "http://localhost:3000"
}
$fi
```

### Include behavior

- Included `.feph` headers are preprocessor-only (no normal FEPL code)
- Include directives execute in place (like a C preprocessor pass)
- Nested includes are supported
- Circular includes are rejected

### Global constants

Build injects global preprocessor constants.

- `__BACKEND__`: current backend id as a string literal (for example `"js"`)

```fepl
let target = __BACKEND__
```

## Current Backend

- `js`
  - Output extension: `.js`

Additional backends can be added via `src/backends` by implementing the backend interface and registering the backend id.
