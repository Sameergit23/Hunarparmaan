# RFC 8785 test vectors

Inputs and expected outputs from RFC 8785 (JSON Canonicalization Scheme):

- `values` — section 3.2.2, sample input and its canonical output.
- `sorting` — section 3.2.3, property sorting by UTF-16 code units.

They are kept as files, byte for byte, so no source transform can touch the escapes.
The `*-output.json` files have no trailing newline.
