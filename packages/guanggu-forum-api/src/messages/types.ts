export interface MessagePeer {
  uid: number;
  display_name: string;
  username: string;
  avatar: string;
}

export interface MessageSource {
  id: number;
  title: string;
  url: string;
}

export interface MessageSummary {
  uid: number;
  username: string;
  role: number;
  unread: number;
  requests: number;
  policy: number;
  restriction_reason: string;
  revision: number;
}

export interface MessageConversation {
  id: number;
  peer: MessagePeer;
  unread: number;
  state: string;
  updated: string;
  preview: string;
}

export interface MessageConversationPage {
  items: MessageConversation[];
  next_cursor: string | null;
}

export interface PrivateMessage {
  id: number;
  seq: number;
  mine: boolean;
  text: string;
  state: string;
  created: string;
}

export interface MessageThread {
  id: number;
  peer: MessagePeer;
  state: string;
  incoming_request: boolean;
  can_reopen: boolean;
  blocked: boolean;
  source: MessageSource | null;
  messages: PrivateMessage[];
  has_more: boolean;
}

export interface MessageCompose {
  peer: MessagePeer;
  /** Zero (including normalized upstream null) means a new request; otherwise open the existing conversation. */
  conversation_id: number;
  source: MessageSource | null;
  can_initiate: boolean;
  qualification_message: string;
}

export interface GetMessageConversationsParams {
  bucket?: 0 | 1;
  cursor?: string;
}

export interface GetMessageThreadParams {
  conversationId: number;
  before?: number;
}

export interface GetMessageComposeParams {
  recipientId: number;
  sourceId?: number;
}

export type SendPrivateMessagePayload = (
  | { conversationId: number; recipientId?: never; sourceId?: never }
  | { recipientId: number; sourceId?: number; conversationId?: never }
) & {
  text: string;
  /** 32 lowercase hex characters. Keep the same key for an unchanged failed submission. */
  clientKey: string;
};

export interface SendPrivateMessageResult {
  /** Submission is accepted for processing, not confirmation of delivery. */
  conversation_id: number;
}

export type MessageApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'ACCOUNT_CHANGED'
  | 'INVALID_ARGUMENT'
  | 'CONTENT_REJECTED'
  | 'NETWORK'
  | 'HTTP'
  | 'SERVER'
  | 'INVALID_RESPONSE';

export class MessageApiError extends Error {
  constructor(
    public readonly code: MessageApiErrorCode,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'MessageApiError';
  }
}
