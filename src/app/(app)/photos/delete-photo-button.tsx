'use client';

import { useTransition, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { deletePhotoAction } from './actions';

export function DeletePhotoButton({ photoId }: { photoId: string }) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!confirm('Dieses Foto endgültig löschen?')) return;
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await deletePhotoAction(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="absolute right-2 top-2">
      <input type="hidden" name="photo_id" value={photoId} />
      <button
        type="submit"
        disabled={pending}
        aria-label="Foto löschen"
        title="Foto löschen"
        className="inline-flex size-8 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100 hover:bg-[var(--color-destructive)] focus:opacity-100 disabled:opacity-60"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </form>
  );
}
