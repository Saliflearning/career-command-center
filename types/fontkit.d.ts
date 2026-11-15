// fontkit ships no TypeScript declarations. We use only openSync(...).hasGlyphForCodePoint,
// and cast the result at the call site, so an untyped module is sufficient here.
declare module "fontkit";
