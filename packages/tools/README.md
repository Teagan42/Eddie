# @eddie/tools

## Built-in tools

### `file_read`
- Reads from the workspace using UTF-8 encoding.
- When `maxBytes` is provided, the tool opens the file with `fs.open` and reads only `maxBytes + 4` bytes (the extra four bytes cover the longest UTF-8 code point). This prevents loading the full file into memory while still allowing the implementation to trim safely on code-point boundaries.
- The response reports how many bytes were returned after trimming to valid UTF-8 and whether the content was truncated. If `maxBytes` is omitted the tool falls back to reading the whole file.
- Partial reads may drop the final, incomplete multi-byte sequence so the returned content length can be slightly less than `maxBytes` even when additional bytes exist on disk.
