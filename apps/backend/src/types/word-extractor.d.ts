declare module "word-extractor" {
  class ExtractedWordDocument {
    getBody(): string;
  }

  class WordExtractor {
    extract(source: string | Buffer): Promise<ExtractedWordDocument>;
  }

  export = WordExtractor;
}
