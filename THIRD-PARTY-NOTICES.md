# Third-party notices

## StatiCrypt

Exhibit depends on StatiCrypt 3.5.4. Its adapter invokes the upstream Node
codec directly and embeds the upstream `lib/cryptoEngine.js` and `lib/codec.js`
into protected HTML. The cryptographic implementation is not rewritten.

The following license is also embedded in protected HTML so the attribution
travels with each generated artifact:

```text
MIT License

Copyright (c) 2017 Robin Moisson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Source: https://github.com/robinmoisson/staticrypt

## Hushdrop

Hushdrop inspired the publish/render/encrypt/share workflow. Exhibit is an
independent implementation, not a port of Hushdrop's hosted service or CLI.
No Hushdrop source files are redistributed here.

Source: https://github.com/maxtechera/hushdrop

## Installed dependencies

Dependency packages retain their own licenses in the package-manager installation.
AWS SDK v3 is Apache-2.0; Marked, sanitize-html, Zod, and StatiCrypt use MIT
licenses. Preserve package license files when redistributing a bundled application.
