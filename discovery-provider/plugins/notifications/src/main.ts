import { Knex } from 'knex'
import moment from 'moment-timezone'
import { config } from './config'
import { Listener } from './listener'
import { logger } from './logger'
import { setupTriggers } from './setup'
import { getDB } from './conn'
import { program } from 'commander'
import { AppNotificationsProcessor } from './processNotifications/indexAppNotifications'
import { sendDMNotifications } from './tasks/dmNotifications'
import { processEmailNotifications } from './email/notifications/index'
import { sendAppNotifications } from './tasks/appNotifications'
import { getRedisConnection } from './utils/redisConnection'

export class Processor {

  discoveryDB: Knex
  identityDB: Knex
  appNotificationsProcessor: AppNotificationsProcessor
  isRunning: boolean
  listener: Listener
  lastDailyEmailSent: moment.Moment | null

  constructor() {
    this.isRunning = false
    this.lastDailyEmailSent = null
  }

  init = async ({
    discoveryDBUrl,
    identityDBUrl,
  }: {
    discoveryDBUrl?: string
    identityDBUrl?: string
  } = {}) => {
    logger.info('starting!')
    // setup postgres listener
    await this.setupDB({ discoveryDBUrl, identityDBUrl })

    // NOTE: Temp to stop listener for app notifiations
    // await setupTriggers(this.discoveryDB)
    //  this.listener = new Listener()
    // await this.listener.start(this.discoveryDB)

    this.appNotificationsProcessor = new AppNotificationsProcessor(this.discoveryDB, this.identityDB)
  }

  setupDB = async ({
    discoveryDBUrl,
    identityDBUrl,
  }: {
    discoveryDBUrl?: string
    identityDBUrl?: string
  } = {}) => {
    const discoveryDBConnection = discoveryDBUrl || process.env.DN_DB_URL
    const identityDBConnection = identityDBUrl || process.env.IDENTITY_DB_URL
    this.discoveryDB = await getDB(discoveryDBConnection)
    this.identityDB = await getDB(identityDBConnection)
  }

  start = async () => {
    // process events
    logger.info('processing events')
    this.isRunning = true
    // NOTE: Temp for testing
    // TODO remove
    const redis = await getRedisConnection()
    await redis.set(config.lastIndexedMessageRedisKey, new Date(Date.now()).toISOString())
    await redis.set(config.lastIndexedReactionRedisKey, new Date(Date.now()).toISOString())
    while (this.isRunning) {
      // NOTE: Temp to stop app notifiations
      // await sendAppNotifications(this.listener, this.appNotificationsProcessor)
      await sendDMNotifications(this.discoveryDB, this.identityDB)

      // NOTE: Temp to test DM email notifs in staging
      // TODO run job for all email frequencies
      if (!this.lastDailyEmailSent || this.lastDailyEmailSent < moment.utc().subtract(1, 'days')) {
        await processEmailNotifications(this.discoveryDB, this.identityDB, 'daily')
        this.lastDailyEmailSent = moment.utc()
      }

      // free up event loop + batch queries to postgres
      await new Promise((r) => setTimeout(r, config.pollInterval))
    }
  }

  stop = () => {
    logger.info('stopping notification processor')
    this.isRunning = false
  }

  close = async () => {
    await this.listener?.close()
    await this.discoveryDB?.destroy()
    await this.identityDB?.destroy()
  }
}

async function main() {
  try {
    const processor = new Processor()
    await processor.init()
    await processor.start()
  } catch (e) {
    logger.fatal(e, 'save me pm2')
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

process
  .on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, 'unhandledRejection')
  })
  .on('uncaughtException', (err) => {
    logger.fatal(err, 'uncaughtException')
    process.exit(1)
  })