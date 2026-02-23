# FEPL Examples

This folder contains small FEPL programs showing language and preprocessor features.

## Structure

- `basic/main.fepl` - variables, functions, data structures, imports
- `control-flow/main.fepl` - if/else, while, for-in, classic for
- `preprocessor/main.fepl` - define/undefine/include/if/elif/else/fi
- `preprocessor/flags.feph` - included preprocessor header

## Run in this repo

From project root:

```bash
fepl init
cp -r examples/basic src/
fepl build
```

Or copy any example `.fepl` file into your configured `src/` folder and run:

```bash
fepl build
```
