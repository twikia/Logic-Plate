export const metadata = {
  title: 'Delete Account — Logic Plate',
  description: 'Request deletion of your Logic Plate account and associated data.',
};

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-lg w-full space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Delete your account</h1>
          <p className="text-zinc-400">
            Logic Plate (Platebound) lets you delete your account and remove associated profile data from our
            servers.
          </p>
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-zinc-100">In the app (recommended)</h2>
          <ol className="list-decimal list-inside text-zinc-300 space-y-2 text-sm leading-relaxed">
            <li>Open Logic Plate on your phone.</li>
            <li>Tap your profile icon → General Settings.</li>
            <li>Under Account, tap Delete account and confirm.</li>
          </ol>
          <p className="text-zinc-500 text-sm">
            This permanently deletes your Supabase auth account and profile (username). Local caches on your device
            are cleared when you delete.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-zinc-100">What we delete</h2>
          <ul className="list-disc list-inside text-zinc-300 space-y-1 text-sm">
            <li>Your authentication account</li>
            <li>Your profile and username</li>
          </ul>
          <p className="text-zinc-500 text-sm">
            Anonymous guest sessions can also be deleted the same way. Group vote sessions you created may remain
            until they expire; they are not linked to personal contact info.
          </p>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-zinc-100">Need help?</h2>
          <p className="text-zinc-300 text-sm">
            If you cannot access the app, email us with the User ID shown in General Settings → About and we will
            process your deletion request within 30 days.
          </p>
        </section>
      </div>
    </div>
  );
}
