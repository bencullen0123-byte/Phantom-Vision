export default function ObsidianSkeleton() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-200 font-sans">
      <nav className="border-b border-white/10 bg-[#0A0A0A] h-16">
        <div className="max-w-6xl mx-auto px-8 h-full">
          <div className="flex items-center justify-between gap-4 h-full">
            <div className="flex items-center gap-8">
              <div className="h-6 w-28 bg-slate-800 rounded animate-slow-pulse" />
              
              <div className="flex items-center gap-2">
                <div className="h-9 w-24 bg-slate-800/50 rounded-md animate-slow-pulse" />
                <div className="h-9 w-24 bg-slate-800/50 rounded-md animate-slow-pulse" />
                <div className="h-9 w-20 bg-slate-800/50 rounded-md animate-slow-pulse" />
                <div className="h-9 w-20 bg-slate-800/50 rounded-md animate-slow-pulse" />
              </div>
            </div>

            <div className="h-4 w-12 bg-slate-800/50 rounded animate-slow-pulse" />
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-8 py-8">
        <div className="space-y-8">
          <div className="space-y-2">
            <div className="h-9 w-64 bg-slate-800 rounded animate-slow-pulse" />
            <div className="h-5 w-40 bg-slate-800/50 rounded animate-slow-pulse" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900 border border-white/10 rounded-md p-6 space-y-3">
              <div className="h-4 w-32 bg-slate-800/50 rounded animate-slow-pulse" />
              <div className="h-10 w-36 bg-slate-800 rounded animate-slow-pulse" />
            </div>

            <div className="bg-slate-900 border border-white/10 rounded-md p-6 space-y-3">
              <div className="h-4 w-40 bg-slate-800/50 rounded animate-slow-pulse" />
              <div className="h-10 w-32 bg-slate-800 rounded animate-slow-pulse" />
            </div>

            <div className="bg-slate-900 border border-white/10 rounded-md p-6 space-y-3">
              <div className="h-4 w-36 bg-slate-800/50 rounded animate-slow-pulse" />
              <div className="h-10 w-16 bg-slate-800 rounded animate-slow-pulse" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
