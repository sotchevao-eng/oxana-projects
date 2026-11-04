export class OxanaDbUnavailableError extends Error {
  readonly code = 'oxana_db_unavailable'

  constructor(message = 'OXANA database is unavailable') {
    super(message)
    this.name = 'OxanaDbUnavailableError'
  }
}

export class OxanaNotFoundError extends Error {
  readonly code = 'oxana_not_found'

  constructor(message = 'Not found') {
    super(message)
    this.name = 'OxanaNotFoundError'
  }
}

export class OxanaAiNotConfiguredError extends Error {
  readonly code = 'ai_not_configured'

  constructor(message = 'Russian AI provider is not connected yet') {
    super(message)
    this.name = 'OxanaAiNotConfiguredError'
  }
}
