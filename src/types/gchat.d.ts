export interface GChatMessage {
  text: string;
  cardsV2?: any[];
}

export interface GChatInteractionEvent {
  type: string;
  message: any;
  user: {
    name: string;
    displayName: string;
    avatarUrl: string;
    email: string;
  };
  action?: {
    actionMethodName: string;
    parameters: Array<{
      key: string;
      value: string;
    }>;
  };
}
