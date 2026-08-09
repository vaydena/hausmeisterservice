export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
};

export type PushDispatchResult = {
  attempted: number;
  succeeded: number;
  removed: number;
  failed: number;
};
