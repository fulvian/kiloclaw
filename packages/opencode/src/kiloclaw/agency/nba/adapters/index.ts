// NBA Adapters Index
// Re-exports all adapters from a single entry point

export {
  type AdapterConfig,
  type AdapterResult,
  type AdapterError,
  type FetchOptions,
  type PaginatedResult,
  type NbaAdapter,
  type OddsAdapter,
  ADAPTER_PRIORITY,
} from "./base"

export { BallDontLieAdapter, createBallDontLieAdapter } from "./balldontlie"
export { OddsApiAdapter, createOddsApiAdapter } from "./odds-api"
export { createOddsBet365Adapter } from "./odds-bet365"
export { createParlayApiAdapter } from "./parlay-api"
export { EspnAdapter, createEspnAdapter } from "./espn"
export { createNbaApiAdapter } from "./nba-api"
export { createPolymarketAdapter } from "./polymarket"
