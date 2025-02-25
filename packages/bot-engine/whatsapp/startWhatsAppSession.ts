import prisma from '@typebot.io/lib/prisma'
import {
  ChatReply,
  ComparisonOperators,
  LogicalOperator,
  PublicTypebot,
  SessionState,
  Settings,
  Typebot,
} from '@typebot.io/schemas'
import {
  WhatsAppCredentials,
  defaultSessionExpiryTimeout,
} from '@typebot.io/schemas/features/whatsapp'
import { isNotDefined } from '@typebot.io/lib/utils'
import { startSession } from '../startSession'

type Props = {
  incomingMessage?: string
  workspaceId?: string
  credentials: WhatsAppCredentials['data'] & Pick<WhatsAppCredentials, 'id'>
  contact: NonNullable<SessionState['whatsApp']>['contact']
}

export const startWhatsAppSession = async ({
  incomingMessage,
  workspaceId,
  credentials,
  contact,
}: Props): Promise<
  | (ChatReply & {
      newSessionState: SessionState
    })
  | undefined
> => {
  const publicTypebotsWithWhatsAppEnabled =
    (await prisma.publicTypebot.findMany({
      where: {
        typebot: { workspaceId, whatsAppCredentialsId: credentials.id },
      },
      select: {
        settings: true,
        typebot: {
          select: {
            publicId: true,
          },
        },
      },
    })) as (Pick<PublicTypebot, 'settings'> & {
      typebot: Pick<Typebot, 'publicId'>
    })[]

  const botsWithWhatsAppEnabled = publicTypebotsWithWhatsAppEnabled.filter(
    (publicTypebot) =>
      publicTypebot.typebot.publicId &&
      publicTypebot.settings.whatsApp?.isEnabled
  )

  const publicTypebotWithMatchedCondition = botsWithWhatsAppEnabled.find(
    (publicTypebot) =>
      publicTypebot.settings.whatsApp?.startCondition &&
      messageMatchStartCondition(
        incomingMessage ?? '',
        publicTypebot.settings.whatsApp?.startCondition
      )
  )

  const publicTypebot =
    publicTypebotWithMatchedCondition ??
    botsWithWhatsAppEnabled.find(
      (publicTypebot) => !publicTypebot.settings.whatsApp?.startCondition
    )

  if (isNotDefined(publicTypebot)) return

  const sessionExpiryTimeoutHours =
    publicTypebot.settings.whatsApp?.sessionExpiryTimeout ??
    defaultSessionExpiryTimeout

  return startSession({
    version: 2,
    message: incomingMessage,
    startParams: {
      typebot: publicTypebot.typebot.publicId as string,
    },
    userId: undefined,
    initialSessionState: {
      whatsApp: {
        contact,
      },
      expiryTimeout: sessionExpiryTimeoutHours * 60 * 60 * 1000,
    },
  })
}

export const messageMatchStartCondition = (
  message: string,
  startCondition: NonNullable<Settings['whatsApp']>['startCondition']
) => {
  if (!startCondition) return true
  return startCondition.logicalOperator === LogicalOperator.AND
    ? startCondition.comparisons.every((comparison) =>
        matchComparison(
          message,
          comparison.comparisonOperator,
          comparison.value
        )
      )
    : startCondition.comparisons.some((comparison) =>
        matchComparison(
          message,
          comparison.comparisonOperator,
          comparison.value
        )
      )
}

const matchComparison = (
  inputValue: string,
  comparisonOperator?: ComparisonOperators,
  value?: string
): boolean | undefined => {
  if (!comparisonOperator) return false
  switch (comparisonOperator) {
    case ComparisonOperators.CONTAINS: {
      if (!value) return false
      return inputValue
        .trim()
        .toLowerCase()
        .includes(value.trim().toLowerCase())
    }
    case ComparisonOperators.EQUAL: {
      return inputValue === value
    }
    case ComparisonOperators.NOT_EQUAL: {
      return inputValue !== value
    }
    case ComparisonOperators.GREATER: {
      if (!value) return false
      return parseFloat(inputValue) > parseFloat(value)
    }
    case ComparisonOperators.LESS: {
      if (!value) return false
      return parseFloat(inputValue) < parseFloat(value)
    }
    case ComparisonOperators.IS_SET: {
      return inputValue.length > 0
    }
    case ComparisonOperators.IS_EMPTY: {
      return inputValue.length === 0
    }
    case ComparisonOperators.STARTS_WITH: {
      if (!value) return false
      return inputValue.toLowerCase().startsWith(value.toLowerCase())
    }
    case ComparisonOperators.ENDS_WITH: {
      if (!value) return false
      return inputValue.toLowerCase().endsWith(value.toLowerCase())
    }
    case ComparisonOperators.NOT_CONTAINS: {
      if (!value) return false
      return !inputValue
        .trim()
        .toLowerCase()
        .includes(value.trim().toLowerCase())
    }
  }
}
