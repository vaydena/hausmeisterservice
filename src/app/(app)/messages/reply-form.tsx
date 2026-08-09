'use client';

import { useRef, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { postMessageAction } from './actions';

export function ReplyForm({ threadId }: { threadId: string }) {
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(fd) => {
        start(async () => {
          await postMessageAction(fd);
          formRef.current?.reset();
        });
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="thread_id" value={threadId} />
      <Textarea
        name="body"
        required
        rows={3}
        placeholder="Antworten …"
        disabled={pending}
      />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Sende …' : 'Antworten'}
        </Button>
      </div>
    </form>
  );
}
