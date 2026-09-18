declare module "segmentit" {
  export class Segment {}

  export function useDefault(segment: Segment): {
    doSegment(text: string): Array<{ w: string; p?: number }>;
  };
}
