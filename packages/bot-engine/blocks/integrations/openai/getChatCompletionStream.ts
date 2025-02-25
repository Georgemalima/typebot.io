import { Connection } from '@planetscale/database'
import { decrypt } from '@typebot.io/lib/api/encryption'
import { isNotEmpty } from '@typebot.io/lib/utils'
import {
  ChatCompletionOpenAIOptions,
  OpenAICredentials,
} from '@typebot.io/schemas/features/blocks/integrations/openai'
import { SessionState } from '@typebot.io/schemas/features/chat/sessionState'
import { OpenAIStream } from 'ai'
import { parseVariableNumber } from '../../../variables/parseVariableNumber'
import { ClientOptions, OpenAI } from 'openai'

export const getChatCompletionStream =
  (conn: Connection) =>
  async (
    state: SessionState,
    options: ChatCompletionOpenAIOptions,
    messages: OpenAI.Chat.ChatCompletionMessageParam[]
  ) => {
    if (!options.credentialsId) return
    const credentials = (
      await conn.execute('select data, iv from Credentials where id=?', [
        options.credentialsId,
      ])
    ).rows.at(0) as { data: string; iv: string } | undefined
    if (!credentials) {
      console.error('Could not find credentials in database')
      return
    }
    const { apiKey } = (await decrypt(
      credentials.data,
      credentials.iv
    )) as OpenAICredentials['data']

    const { typebot } = state.typebotsQueue[0]
    const temperature = parseVariableNumber(typebot.variables)(
      options.advancedSettings?.temperature
    )

    const config = {
      apiKey,
      baseURL: options.baseUrl,
      defaultHeaders: {
        'api-key': apiKey,
      },
      defaultQuery: isNotEmpty(options.apiVersion)
        ? {
            'api-version': options.apiVersion,
          }
        : undefined,
    } satisfies ClientOptions

    const openai = new OpenAI(config)

    const response = await openai.chat.completions.create({
      model: options.model,
      temperature,
      stream: true,
      messages,
    })

    return OpenAIStream(response)
  }
