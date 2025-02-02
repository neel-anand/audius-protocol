import { Knex } from 'knex'
import { BaseNotification } from './base'
import { UserRow } from '../../types/dn'
import { DMReactionNotification } from '../../types/notifications'
import { sendPushNotification } from '../../sns'
import {
  buildUserNotificationSettings,
  Device
} from './userNotificationSettings'

export class MessageReaction extends BaseNotification<DMReactionNotification> {
  receiverUserId: number
  senderUserId: number

  constructor(
    dnDB: Knex,
    identityDB: Knex,
    notification: DMReactionNotification
  ) {
    super(dnDB, identityDB, notification)
    this.receiverUserId = this.notification.receiver_user_id
    this.senderUserId = this.notification.sender_user_id
  }

  async pushNotification({
    isLiveEmailEnabled
  }: {
    isLiveEmailEnabled: boolean
  }) {
    const res: Array<{
      user_id: number
      name: string
      is_deactivated: boolean
    }> = await this.dnDB
      .select('user_id', 'name', 'is_deactivated')
      .from<UserRow>('users')
      .where('is_current', true)
      .whereIn('user_id', [this.receiverUserId, this.senderUserId])
    const users = res.reduce((acc, user) => {
      acc[user.user_id] = {
        name: user.name,
        isDeactivated: user.is_deactivated
      }
      return acc
    }, {} as Record<number, { name: string; isDeactivated: boolean }>)

    if (users?.[this.receiverUserId]?.isDeactivated) {
      return
    }

    // Get the user's notification setting from identity service
    const userNotificationSettings = await buildUserNotificationSettings(
      this.identityDB,
      [this.receiverUserId, this.senderUserId]
    )

    // If the user has devices to the notification to, proceed
    if (
      userNotificationSettings.shouldSendPushNotification({
        initiatorUserId: this.senderUserId,
        receiverUserId: this.receiverUserId
      }) &&
      userNotificationSettings.isNotificationTypeEnabled(
        this.receiverUserId,
        'messages'
      )
    ) {
      const devices: Device[] = userNotificationSettings.getDevices(
        this.receiverUserId
      )
      await Promise.all(
        devices.map((device) => {
          return sendPushNotification(
            {
              type: device.type,
              badgeCount:
                userNotificationSettings.getBadgeCount(this.receiverUserId) + 1,
              targetARN: device.awsARN
            },
            {
              title: 'Reaction',
              body: `${users[this.senderUserId].name} reacted ${
                this.notification.reaction
              } to your message`,
              data: {}
            }
          )
        })
      )
      await this.incrementBadgeCount(this.receiverUserId)
    }

    if (
      isLiveEmailEnabled &&
      userNotificationSettings.shouldSendEmail({
        initiatorUserId: this.senderUserId,
        receiverUserId: this.receiverUserId
      })
    ) {
      // TODO: Send out email
    }
  }
}
