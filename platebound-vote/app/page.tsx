export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-bold">Platebound Vote</h1>
        <p className="text-zinc-400 text-lg">
          Scan the QR code from your group session or open the link your host shared to answer a few
          questions and vote on tonight&apos;s picks.
        </p>
        <p className="text-zinc-500 text-sm">
          Links look like{' '}
          <span className="text-zinc-300 font-mono">platebound.vercel.app/vote/ABC123</span>
        </p>
      </div>
    </div>
  );
}
