// A document the engine will not convert, with the reason a client is told (preflight.ts, streams.ts, poppler.ts).
export class Refused extends Error {
  override name = 'Refused'
}
