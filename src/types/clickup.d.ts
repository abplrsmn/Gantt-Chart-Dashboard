export interface ClickUpTask {
  id: string;
  name: string;
  department?: string;
  status: {
    status: string;
    color: string;
    type: string;
  };
  creator?: {
    id: number;
    username: string;
    color: string;
    email: string;
    profilePicture?: string;
  };
  assignees: Array<{
    id: number;
    username: string;
    color: string;
    initials: string;
    email: string;
  }>;
  date_created: string;
  date_updated?: string;
  due_date?: string;
  date_closed?: string;
  url: string;
  list?: {
    id?: string;
    name: string;
  };
  team?: string;
}

export interface ClickUpWebhookPayload {
  event: string;
  history_items: any[];
  task_id: string;
  webhook_id: string;
}
